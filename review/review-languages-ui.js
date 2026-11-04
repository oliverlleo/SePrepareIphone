import {canSelectReviewMatch,initialReviewSelection,selectReviewMatches,reviewSettingsTitle} from './review-selection.js';
import {reviewTranslations} from './review-translations.js';
import {REVIEW_PACKS} from './review-packs-manifest.js';
import {createReviewPackStore,reviewLanguage,reviewLabel} from './review-pack-store.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const size=bytes=>(bytes/1000000).toFixed(1)+' MB';
export function createReviewLanguages(host){
 const t=value=>reviewTranslations[host.getState().settings.language]?.[value]??(host.t||String)(value),known=new Map([['pt-BR',true]]),states=new Map(),looking=new Set();let worker=null,rejectJob=null,jobTimer=0,sequence=0,paintTimer=0,lastPaint=0;
 const baseURL=host.native?'https://app.seprepareapp.com.br/':new URL('./',document.baseURI).href;
 const store=createReviewPackStore({baseURL,notify:event=>{states.set(event.code,event);if(event.status==='installed')known.set(event.code,true);if(event.status==='missing')known.set(event.code,false);schedulePaint();}});
 function language(){try{const saved=localStorage.getItem('seprepare-review-language-v1');if(['pt-BR','en','es','ja'].includes(saved))return saved;}catch{}return reviewLanguage(host.getState().settings.language);}
 function setLanguage(code){code=reviewLanguage(code);try{localStorage.setItem('seprepare-review-language-v1',code);}catch{}refreshSettingsLabels();window.dispatchEvent(new Event('seprepare-review-language-change'));return code;}
 function statusHtml(code){const pack=REVIEW_PACKS[code];return `<div class="review-pack-state" data-review-pack="${code}"><span class="review-pack-summary">${esc(t(code==='pt-BR'?'Português já incluído no aplicativo.':'Verificando o pacote…'))}</span><span class="review-pack-detail">${code==='ja'?esc(t('Revisão de escrita japonesa com regras e análise de palavras.')):''}</span><progress class="review-pack-progress" max="100" value="0" hidden></progress><div class="review-pack-buttons"><button type="button" class="btn small secondary" data-action="review-pack-install" data-language="${code}" hidden>${esc(t('Baixar pacote'))}${pack?' · '+size(pack.bytes):''}</button><button type="button" class="btn small link" data-action="review-pack-cancel" data-language="${code}" hidden>${esc(t('Cancelar download'))}</button><button type="button" class="btn small link" data-action="review-pack-remove" data-language="${code}" hidden>${esc(t('Remover pacote'))}</button></div></div>`;}
 function selector(id,code){return `<label class="review-language-field" for="${id}"><span>${esc(t('Idioma do texto'))}</span><select id="${id}">${['pt-BR','en','es','ja'].map(value=>`<option value="${value}" ${value===code?'selected':''}>${reviewLabel(value)}</option>`).join('')}</select></label>`;}
 function controls(review){const code=review.language||'pt-BR';return `<section class="review-language-controls">${selector('reviewTextLanguage',code)}${statusHtml(code)}</section>`;}
 function settingsTitle(){return reviewSettingsTitle(language(),host.getState().settings.language);}
 function refreshSettingsLabels(){
  const online=document.querySelector('#onlineReview'),card=online?.closest('.setting-card');if(!card)return;
  const code=language(),title=card.querySelector('h3'),summary=card.querySelector(':scope > p');
  if(title){const image=title.querySelector('svg');title.replaceChildren(...(image?[image]:[]),document.createTextNode(settingsTitle()));}
  if(summary){if(!summary.dataset.portugueseReviewSummary)summary.dataset.portugueseReviewSummary=summary.textContent;summary.textContent=code==='pt-BR'?summary.dataset.portugueseReviewSummary:t(code==='ja'?'Revisão de escrita japonesa com regras e análise de palavras.':'Revisão ortográfica offline no idioma escolhido para o texto.');}
  for(const item of [online?.closest('label'),card.querySelector('#reviewEndpoint')?.closest('.field'),card.querySelector('[data-action="save-review-settings"]')])if(item)item.hidden=code!=='pt-BR';
  const field=card.querySelector('#reviewSettingsLanguage');if(field&&field.value!==code){field.value=code;const current=card.querySelector('[data-review-pack]'),container=document.createElement('div');container.innerHTML=statusHtml(code);current?.replaceWith(container.firstElementChild);}
  const modal=card.closest('.modal');if(modal?.dataset.settingsPanel==='review'){const heading=modal.querySelector('h2');if(heading)heading.textContent=settingsTitle();}
 }
 function bulkControls(review){
  const selectable=review.matches.some(match=>canSelectReviewMatch(review,match)),safe=review.matches.some(match=>match.safe&&canSelectReviewMatch(review,match)),selected=review.matches.some(match=>match.selected);
  return `<div class="review-selection-controls" role="group" aria-label="${esc(t('Selecionar sugestões'))}"><div class="review-selection-primary"><button type="button" class="btn small secondary" data-action="review-select-all" ${selectable?'':'disabled'}>${esc(t('Selecionar todas'))}</button><button type="button" class="btn small secondary" data-action="review-deselect-all" ${selected?'':'disabled'}>${esc(t('Desmarcar todas'))}</button></div><button type="button" class="btn link small" data-action="review-select-safe" ${safe?'':'disabled'}>${esc(t('Selecionar correções seguras'))}</button></div>`;
 }
 function updateSelectionControls(review){
  const group=document.querySelector('.review-selection-controls');if(!group)return;
  group.querySelector('[data-action="review-deselect-all"]').disabled=!review.matches.some(match=>match.selected);
 }
 function inspect(code){if(known.has(code)||looking.has(code))return;looking.add(code);store.installed(code).then(value=>known.set(code,value)).catch(error=>{known.set(code,false);states.set(code,{status:'error',message:error.message});}).finally(()=>{looking.delete(code);schedulePaint();});}
 function schedulePaint(){if(paintTimer)return;paintTimer=setTimeout(()=>{paintTimer=0;paint();},Math.max(0,90-(performance.now()-lastPaint)));}
 function paint(){lastPaint=performance.now();for(const root of document.querySelectorAll('[data-review-pack]')){
  const code=reviewLanguage(root.dataset.reviewPack),pack=REVIEW_PACKS[code],progress=store.progress(code),state=states.get(code),ready=known.get(code),summary=root.querySelector('.review-pack-summary'),bar=root.querySelector('progress'),install=root.querySelector('[data-action="review-pack-install"]'),remove=root.querySelector('[data-action="review-pack-remove"]'),cancel=root.querySelector('[data-action="review-pack-cancel"]');inspect(code);
  if(progress){const percent=Math.min(100,Math.floor(progress.loaded/progress.total*100));summary.textContent=t('Baixando pacote…')+' '+percent+'%';bar.hidden=false;bar.value=percent;install.hidden=true;remove.hidden=true;cancel.hidden=false;}
  else{bar.hidden=true;cancel.hidden=true;install.hidden=code==='pt-BR'||ready===true;remove.hidden=code==='pt-BR'||ready!==true;install.textContent=t(state?.status==='cancelled'?'Continuar download':state?.status==='error'?'Tentar novamente':'Baixar pacote')+(pack?' · '+size(pack.bytes):'');summary.textContent=t(code==='pt-BR'?'Português já incluído no aplicativo.':ready===true?'Disponível offline.':ready===undefined?'Verificando o pacote…':state?.status==='error'?state.message:state?.status==='cancelled'?'Download cancelado. Você pode continuar depois.':'Baixe uma vez para revisar sem internet, sem cadastro ou chave.');}
 }}
 function mountReview(review){const field=document.getElementById('reviewTextLanguage');field?.addEventListener('change',()=>{setLanguage(field.value);host.startReview();});schedulePaint();}
 function mountSettings(){
  const languageCard=document.querySelector('.language-card');if(languageCard&&!languageCard.querySelector('[data-review-interface-pack]')){const node=document.createElement('section'),code=reviewLanguage(host.getState().settings.language);node.className='review-settings-pack';node.dataset.reviewInterfacePack='true';node.innerHTML=`<h4>${esc(t('Pacote de revisão'))} · ${reviewLabel(code)}</h4>${statusHtml(code)}`;languageCard.append(node);}
  const online=document.querySelector('#onlineReview'),card=online?.closest('section');if(card&&!card.querySelector('#reviewSettingsLanguage')){const node=document.createElement('section');node.className='review-settings-pack';node.innerHTML=`<h4>${esc(t('Revisão offline'))}</h4><p class="help">${esc(t('O idioma do texto pode ser diferente do idioma dos menus. Baixe somente o pacote que deseja usar.'))}</p>${selector('reviewSettingsLanguage',language())}${statusHtml(language())}`;card.append(node);const field=node.querySelector('select');field.addEventListener('change',()=>{setLanguage(field.value);const current=node.querySelector('[data-review-pack]'),container=document.createElement('div');container.innerHTML=statusHtml(language());current.replaceWith(container.firstElementChild);schedulePaint();});}refreshSettingsLabels();schedulePaint();
 }
 function cancel(){sequence++;clearTimeout(jobTimer);jobTimer=0;worker?.terminate();worker=null;if(rejectJob){rejectJob(new DOMException('Revisão cancelada.','AbortError'));rejectJob=null;}}
 async function begin(){
  const code=language();if(code==='pt-BR'){host.beginPortuguese();return;}cancel();host.cancelPortuguese?.();const job=++sequence,q=host.getEditor();if(!q)return;const range=host.scope(),text=host.plain(q.getContents(range.index,range.length));if(!text.trim()){host.toast(t('Escreva ou cole seu discurso antes de revisar.'));return;}
  const token=globalThis.crypto?.randomUUID?.()||'review-'+Date.now()+'-'+Math.random().toString(36).slice(2),review={token,language:code,range,text,baseline:JSON.stringify(q.getContents()),matches:[],loading:true,remote:false,remoteDone:true,engine:t('Preparando o pacote local…'),quotes:host.quoteRanges(text,range),protect:true,highlight:false};host.rt.review=review;host.renderReview();q.blur();
  const current=()=>sequence===job&&host.rt.review===review&&host.getEditor()===q;
  try{
   const available=await store.installed(code);known.set(code,available);if(!current())return;
   if(!available){review.loading=false;review.needsPack=true;review.engine=t('Pacote ainda não baixado.');host.renderReview();return;}
   const files=await store.read(code);if(!current())return;
   worker=new Worker(new URL('review-international-worker.js'+(host.assetVersion?'?v='+host.assetVersion:''),document.baseURI));
   const response=await new Promise((resolve,reject)=>{rejectJob=reject;const ownWorker=worker;const timeout=jobTimer=setTimeout(()=>{ownWorker.terminate();if(worker===ownWorker)worker=null;reject(Error(t('A revisão demorou mais que o esperado. Tente revisar um trecho menor.')));},120000);worker.onmessage=event=>{if(event.data.token!==token)return;clearTimeout(timeout);jobTimer=0;rejectJob=null;resolve(event.data);};worker.onerror=event=>{clearTimeout(timeout);jobTimer=0;rejectJob=null;reject(Error(event.message||t('Não foi possível iniciar a revisão local.')));};worker.postMessage({token,text,code,files,vocabulary:host.getState().vocabulary},[...new Set(Object.values(files))]);});
   if(!current())return;worker?.terminate();worker=null;if(response.error)throw Error(response.error);review.loading=false;review.engine=response.engine;review.local=(response.matches||[]).filter(row=>Number.isInteger(row.offset)&&Number.isInteger(row.length)&&row.length>0&&row.offset>=0&&row.offset+row.length<=text.length&&text.slice(row.offset,row.offset+row.length)===row.word);host.mergeReview();if(host.rt.modal==='review')host.renderReview();
  }catch(error){if(!current())return;clearTimeout(jobTimer);jobTimer=0;worker?.terminate();worker=null;if(error.name==='AbortError')return;review.loading=false;review.engine=t('Não foi possível concluir a revisão local.');review.remoteError=error.message;review.needsPack=!known.get(code);if(host.rt.modal==='review')host.renderReview();}
 }
 function handle(action,el){
  const modes={'review-select-all':'all','review-deselect-all':'none','review-select-safe':'safe'};if(modes[action]){if(host.rt.review){selectReviewMatches(host.rt.review,modes[action]);host.renderReview();}return true;}
  if(action==='review'){if(language()==='pt-BR')return false;void begin();return true;}
  if(!action.startsWith('review-pack-'))return false;const code=reviewLanguage(el?.dataset.language);
  if(action==='review-pack-install'){void store.install(code).then(()=>{if(host.rt.modal==='review'&&host.rt.review?.language===code&&host.rt.review.needsPack)void begin();}).catch(()=>{});}
  else if(action==='review-pack-cancel')store.cancel(code);
  else if(action==='review-pack-remove'){if(host.rt.review?.language===code)cancel();void store.remove(code).then(()=>{known.set(code,false);if(host.rt.modal==='review'&&host.rt.review?.language===code){host.rt.review.loading=false;host.rt.review.needsPack=true;host.rt.review.engine=t('Pacote ainda não baixado.');host.renderReview();}schedulePaint();}).catch(error=>host.toast(error.message));}
  return true;
 }
 return {language,setLanguage,settingsTitle,bulkControls,updateSelectionControls,initialSelection:initialReviewSelection,controls,mountReview,mountSettings,handle,begin,cancel,store,label:reviewLabel};
}
