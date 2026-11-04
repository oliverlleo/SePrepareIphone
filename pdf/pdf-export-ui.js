import {PDF_DEFAULTS,pdfFilename} from './pdf-export-core.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createPdfExportUI(host){
 let state=null,serial=0;
 const t=host.t||String,$=s=>document.querySelector(s);
 function dispose(){const old=state;state=null;if(!old)return;clearTimeout(old.timer);clearTimeout(old.timeout);clearTimeout(old.resizeTimer);old.worker?.terminate();old.observer?.disconnect();try{old.renderTask?.cancel();void old.doc?.destroy?.()?.catch(()=>{});}catch{}old.bytes=null;}
 function status(message,error=false){const el=$('#pdfStatus');if(el){el.textContent=t(message);el.classList.toggle('pdf-error',error);el.setAttribute('role',error?'alert':'status');}}
 function saveEnabled(){const button=$('[data-action="pdf-save"]');if(button)button.disabled=!state?.bytes||state.busy||state.pending;}
 async function open(){
  dispose();let source;try{source=host.getSource();if(!source)throw Error();source=JSON.parse(JSON.stringify(source));}catch{host.toast(t('Não foi possível preparar este documento.'));return;}
  const options={...PDF_DEFAULTS};
  host.openModal(t('Exportar PDF'),`<div class="pdf-export-layout"><aside class="pdf-export-settings"><div class="pdf-document-name">${host.icon('FileText')}<span>${esc(source.title)}</span></div><p class="help">${t('Folha A4 · texto selecionável')}</p><div class="field"><label for="pdfFontSize">${t('Tamanho da letra')}</label><select id="pdfFontSize">${[10,11,12,14,16,18].map(n=>`<option value="${n}" ${n===12?'selected':''}>${n} pt</option>`).join('')}</select></div><fieldset class="pdf-export-options"><legend>${t('Incluir no PDF')}</legend><label class="check-label"><input id="pdfRhythms" type="checkbox">${t('Ritmos de apresentação')}</label><label class="check-label"><input id="pdfTimes" type="checkbox">${t('Marcações de tempo')}</label><label class="check-label"><input id="pdfNotes" type="checkbox">${t('Anotações privadas')}</label></fieldset><p class="notice pdf-brand-note">${host.icon('ShieldCheck')}<span>${t('Apenas este documento será exportado. Anotações privadas só entram quando selecionadas.')}</span></p><p class="pdf-brand-caption">${t('Marca SePrepare e páginas no rodapé.')}</p></aside><section class="pdf-preview-area" aria-label="${t('Prévia do PDF')}"><div class="pdf-preview-toolbar"><strong>${t('Prévia')}</strong><div class="pdf-page-controls"><button type="button" class="icon-btn" data-action="pdf-prev" aria-label="${t('Página anterior')}" disabled>${host.icon('ArrowLeft')}</button><span id="pdfPageCount" aria-live="polite">—</span><button type="button" class="icon-btn" data-action="pdf-next" aria-label="${t('Próxima página')}" disabled>${host.icon('ChevronRight')}</button><button type="button" class="icon-btn" data-action="pdf-expand" aria-label="${t('Ampliar prévia')}">${host.icon('Maximize')}</button></div></div><div id="pdfStatus" class="pdf-export-status" role="status" aria-live="polite">${t('Preparando o PDF…')}</div><div class="pdf-preview-scroll"><canvas id="pdfCanvas" role="img" aria-label="${t('Prévia da página do PDF')}" hidden></canvas><div id="pdfPlaceholder">${host.icon('FileText')}<span>${t('Preparando suas páginas…')}</span></div></div></section></div>`,`<button type="button" class="btn secondary" data-action="close-modal">${t('Voltar')}</button><button type="button" class="btn" data-action="pdf-save" disabled>${host.icon('Download')}<span>${t('Salvar PDF')}</span></button>`,true);
  const modal=$('.modal');modal.classList.add('pdf-export-dialog');host.mark?.();
  state={source,options,id:++serial,worker:null,bytes:null,doc:null,page:1,busy:false,pending:false,generation:0,render:0};
  const update=()=>{const s=state;if(!s)return;s.options={fontSize:Number($('#pdfFontSize').value),showRhythms:$('#pdfRhythms').checked,showTime:$('#pdfTimes').checked,includeNotes:$('#pdfNotes').checked};s.pending=true;s.bytes=null;saveEnabled();clearTimeout(s.timer);s.timer=setTimeout(generate,180);};
  for(const id of ['pdfFontSize','pdfRhythms','pdfTimes','pdfNotes'])$('#'+id).addEventListener('change',update);
  const observer=new ResizeObserver(()=>{const s=state;if(s){clearTimeout(s.resizeTimer);s.resizeTimer=setTimeout(()=>void draw(),120);}});state.observer=observer;observer.observe($('.pdf-preview-scroll'));
  generate();
 }
 function generate(){
  const s=state;if(!s)return;if(s.busy){s.pending=true;return;}s.busy=true;s.pending=false;s.bytes=null;saveEnabled();status('Preparando o PDF…');
  try{
   if(!s.worker){s.worker=new Worker(new URL('pdf/export-worker.js'+(host.assetVersion?'?v='+host.assetVersion:''),document.baseURI));s.worker.onmessage=event=>{if(state!==s)return;clearTimeout(s.timeout);s.busy=false;const data=event.data;if(data.id!==s.generation)return;if(s.pending){generate();return;}if(data.error){failed(data.error);return;}s.bytes=data.bytes;saveEnabled();void preview(s);};s.worker.onerror=()=>{if(state===s)failed(t('Não foi possível carregar o gerador de PDF. Tente novamente com o aplicativo atualizado.'));};}
   s.generation++;s.worker.postMessage({id:s.generation,source:s.source,options:s.options});s.timeout=setTimeout(()=>{if(state===s)failed(t('A geração demorou mais que o esperado. Feche e tente novamente.'));},90000);
  }catch(error){failed(error.message);}
 }
 function failed(message){if(!state)return;clearTimeout(state.timeout);state.busy=false;state.worker?.terminate();state.worker=null;saveEnabled();status(message,true);const placeholder=$('#pdfPlaceholder');if(placeholder){placeholder.hidden=false;placeholder.textContent=t('Não foi possível preparar a prévia.');}}
 async function preview(s){
  const id=s.generation;try{const module=await import(new URL('pdf/preview.js'+(host.assetVersion?'?v='+host.assetVersion:''),document.baseURI).href);if(state!==s||s.pending||id!==s.generation)return;const doc=await module.openPreview(s.bytes.slice(0));if(state!==s||s.pending||id!==s.generation){void doc.destroy();return;}s.renderTask?.cancel();await s.doc?.destroy();if(state!==s){void doc.destroy();return;}s.doc=doc;s.previewGeneration=id;s.page=Math.min(s.page,doc.numPages);await draw();}
  catch(error){if(state===s&&!s.pending){status('PDF pronto. A prévia não pôde ser exibida; você ainda pode salvar o arquivo.',true);$('#pdfPlaceholder').hidden=false;$('#pdfPlaceholder').textContent=t('Prévia indisponível neste aparelho.');}}
 }
 async function draw(){
  const s=state;if(!s?.doc||!$('#pdfCanvas'))return;const generation=s.generation,render=++s.render;
  try{
   if(s.renderTask){s.renderTask.cancel();await s.renderTask.promise.catch(()=>{});}if(state!==s||render!==s.render)return;
   const page=await s.doc.getPage(s.page);if(state!==s||render!==s.render)return;const area=$('.pdf-preview-scroll'),canvas=$('#pdfCanvas'),natural=page.getViewport({scale:1}),width=Math.max(160,Math.min(area.clientWidth-32,800)),scale=width/natural.width,ratio=Math.min(devicePixelRatio||1,2),viewport=page.getViewport({scale:scale*ratio});canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);canvas.style.width=width+'px';canvas.style.height=Math.ceil(natural.height*scale)+'px';canvas.hidden=false;$('#pdfPlaceholder').hidden=true;canvas.setAttribute('aria-label',t('Prévia do PDF')+' — '+s.page+' / '+s.doc.numPages);
   s.renderTask=page.render({canvasContext:canvas.getContext('2d'),viewport,background:'#ffffff'});await s.renderTask.promise;if(state!==s||render!==s.render||generation!==s.generation)return;
   $('#pdfPageCount').textContent=s.page+' / '+s.doc.numPages;$('[data-action="pdf-prev"]').disabled=s.page<=1;$('[data-action="pdf-next"]').disabled=s.page>=s.doc.numPages;if(s.previewGeneration===s.generation&&!s.busy&&!s.pending){canvas.dataset.generation=String(s.generation);status('PDF pronto para salvar.');}
  }catch(error){if(error.name!=='RenderingCancelledException'&&state===s)status('A prévia não pôde ser exibida.',true);}
 }
 function base64(bytes){let result='';const data=new Uint8Array(bytes);for(let i=0;i<data.length;i+=24576)result+=String.fromCharCode(...data.subarray(i,i+24576));return btoa(result);}
 async function save(){
  const s=state;if(!s?.bytes||s.busy||s.pending)return;const name=pdfFilename(s.source.title),blob=new Blob([s.bytes],{type:'application/pdf'});
  try{
   if(typeof host.native?.exportPdf==='function'){const result=host.native.exportPdf(name,base64(s.bytes));if(result===false)throw Error(t('Não foi possível preparar o arquivo.'));host.toast(t('Escolha onde salvar o PDF.'));return;}
   const file=new File([blob],name,{type:'application/pdf'});
   if(host.preferShare&&navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:s.source.title});return;}
   const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.rel='noopener';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);host.toast(t('PDF preparado para salvar.'));
  }catch(error){if(error.name!=='AbortError')host.toast(error.message||t('Não foi possível salvar o PDF.'));}
 }
 function handle(action){if(action==='export-pdf'){void open();return true;}if(!action.startsWith('pdf-'))return false;if(action==='pdf-save'){void save();return true;}const s=state;if(!s)return true;if(action==='pdf-expand'){$('.pdf-export-dialog').classList.toggle('pdf-expanded');void draw();}else if(action==='pdf-prev'&&s.doc&&s.page>1){s.page--;void draw();}else if(action==='pdf-next'&&s.doc&&s.page<s.doc.numPages){s.page++;void draw();}return true;}
 return {open,handle,dispose};
}
