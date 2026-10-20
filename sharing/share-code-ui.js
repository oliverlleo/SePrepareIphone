import {encodeShareCode,decodeShareCode,MAX_CODE_LENGTH} from './share-code.js';
import {clone,newSpeech,validState,copyDocumentVersions,uid,isPart,plain,words} from './core.js';

export function createShareCodeUI(c){
 const {$,rt,btn,option,esc,closeModal,toast}=c;
 const openModal=(...args)=>{c.openModal(...args);$('.modal')?.classList.add('share-code-dialog');};
 let generated='',source=null,received=null,generation=0,previewId='',identities={};
 const errorText=error=>error?.message||'Não foi possível concluir. Tente novamente.';
 const sameCategory=(a,b)=>a&&b&&a.name===b.name&&a.icon===b.icon&&a.color.toLowerCase()===b.color.toLowerCase();
 function addShareOption(){
  const list=$('.sheet-options'),speech=c.getState().speeches.find(item=>item.id===rt.shareSpeechId);if(!list||!speech)return;
  const item=document.createElement('div');item.innerHTML=option('share-code','Copy','Gerar código','Inclui todas as versões e preserva qual está ativa. Funciona no Android, iPhone e web.');list.append(item.firstElementChild);
  const notice=list.previousElementSibling;if(notice?.classList.contains('notice'))notice.innerHTML=`Texto e arquivo: versão <strong>${esc(speech.versions.find(version=>version.id===speech.activeVersionId)?.name||'Versão original')}</strong>.`;
 }
 function openImport(){
  openModal('Importar compartilhamento',`<p class="help">Recebeu uma preparação? Escolha como deseja abrir.</p><div class="sheet-options">${option('import-file','FileUp','Usar arquivo','Abra um arquivo, texto ou backup, como antes.')}${option('import-code','Copy','Usar código','Cole o código recebido pelo WhatsApp ou outro aplicativo.')}</div>`);rt.modal='import-choice';
 }
 function openInput(){
  received=null;
  openModal('Importar compartilhamento',`<p class="help">Cole o código inteiro. Você poderá conferir a preparação antes de salvar.</p><div class="field"><label for="receivedShareCode">Código recebido</label><textarea id="receivedShareCode" class="share-code-text" rows="5" maxlength="${MAX_CODE_LENGTH}" spellcheck="false" autocapitalize="off" autocorrect="off" placeholder="SEPREPARE:1:…" aria-describedby="shareCodeError"></textarea></div>${btn('paste-share-code','Colar código copiado','ClipboardPaste','small secondary')}<p id="shareCodeError" class="share-code-error" role="alert" hidden></p>`,btn('close-modal','Cancelar','','secondary')+btn('preview-share-code','Conferir preparação','ArrowRight','','disabled'));
  rt.modal='import-code';$('#receivedShareCode').addEventListener('input',()=>{$('#shareCodeError').hidden=true;$('#receivedShareCode').removeAttribute('aria-invalid');$('[data-action="preview-share-code"]').disabled=!$('#receivedShareCode').value.trim();});
 }
 async function paste(){
  const field=$('#receivedShareCode');if(!field)return;
  try{
   const text=c.native?.clipboard?JSON.parse(c.native.clipboard()).text:await navigator.clipboard.readText();
   if(!field.isConnected)return;if(!text){toast('Nenhum código copiado. Cole o código no campo.');return;}
   if(text.length>MAX_CODE_LENGTH)throw Error('O texto copiado é muito grande. Use um arquivo.');
   field.value=text;field.dispatchEvent(new Event('input',{bubbles:true}));
  }catch(error){field.focus();toast(error?.message?.includes('grande')?error.message:'Toque e segure no campo e escolha Colar.');}
 }
 function generate(){
  c.syncCurrent();const speech=c.getState().speeches.find(item=>item.id===rt.shareSpeechId&&!item.deleted);if(!speech)return;
  source=clone(speech);generated='';const notes=source.versions.some(version=>version.presenterNotes?.length),active=source.versions.find(version=>version.id===source.activeVersionId);
  openModal('Código de compartilhamento',`<p class="help">${esc(source.title)}</p><div class="row wrap"><span class="badge">${source.versions.length} ${source.versions.length===1?'versão':'versões'}</span><span class="badge">Ativa: ${esc(active.name)}</span></div><p class="notice share-code-description">Leva texto, formatação, participantes, versões, categoria e ajustes de leitura. Inclui também agendamento e fixação. Conta Google, ensaios e histórico pessoal ficam no seu aparelho.</p>${notes?'<label class="check-label share-code-notes"><input type="checkbox" id="includeCodeNotes">Incluir minhas anotações privadas</label>':''}<div class="field"><label for="generatedShareCode">Seu código</label><textarea id="generatedShareCode" class="share-code-text" rows="4" readonly spellcheck="false" aria-describedby="shareCodeSize"></textarea><small id="shareCodeSize" role="status">Preparando código…</small></div><p class="notice">Quem receber abre o SePrepare, toca no ícone de importar e escolhe <strong>Usar código</strong>. Funciona no Android, iPhone e web.</p>`,btn('copy-share-code','Copiar código','Copy','','disabled')+btn('send-share-code','Compartilhar','Share2','secondary','disabled'));
  rt.modal='share-code';$('#includeCodeNotes')?.addEventListener('change',refreshCode);refreshCode();
 }
 function refreshCode(){
  const token=++generation,field=$('#generatedShareCode'),label=$('#shareCodeSize'),includeNotes=$('#includeCodeNotes')?.checked===true;
  generated='';field.value='';label.textContent='Preparando código…';for(const action of ['copy-share-code','send-share-code'])$(`[data-action="${action}"]`).disabled=true;
  setTimeout(()=>{
   if(token!==generation||!field.isConnected)return;
   try{
    const category=c.getState().categories.find(item=>item.id===source.categoryId);generated=encodeShareCode(source,{category,includeNotes});field.value=generated;
    label.textContent=generated.length.toLocaleString('pt-BR')+' caracteres · '+(generated.length>60000?'Código extenso: copie inteiro ou prefira enviar como arquivo.':'Copie ou envie o código inteiro.');
    $('[data-action="copy-share-code"]').disabled=false;$('[data-action="send-share-code"]').disabled=generated.length>60000;
   }catch(error){label.textContent=errorText(error);}
  },0);
 }
 async function copy(){
  if(!generated||!$('#generatedShareCode'))return;
  try{
   if(c.native?.copy)c.native.copy(generated,'');else if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(generated);else throw Error('clipboard');
   toast('Código copiado. Envie o código inteiro para a outra pessoa.');
  }catch{
   const field=$('#generatedShareCode');if(!field)return;field.focus();field.select();field.setSelectionRange(0,field.value.length);
   toast(document.execCommand?.('copy')?'Código copiado.':'Código selecionado. Toque em Copiar.');
  }
 }
 async function send(){
  if(!generated||generated.length>60000)return;
  try{if(c.native?.shareText)c.native.shareText(source.title,generated);else if(navigator.share)await navigator.share({title:source.title,text:generated});else await copy();}
  catch(error){if(error.name!=='AbortError')toast('Não foi possível compartilhar. Use Copiar código.');}
 }
 function preview(){
  const field=$('#receivedShareCode');if(!field)return;
  try{received=decodeShareCode(field.value);}catch(error){const label=$('#shareCodeError');label.hidden=false;label.textContent=errorText(error);field.setAttribute('aria-invalid','true');return;}
  previewId=received.speech.activeVersionId;identities={};
  const speech=received.speech,state=c.getState(),matching=state.categories.find(category=>sameCategory(category,received.category));
  openModal(isPart(speech)?'Parte recebida':'Discurso recebido',`<p class="help">Confira antes de salvar. Será uma <strong>nova preparação</strong>; seus conteúdos atuais serão preservados.</p><div class="incoming-heading"><h3>${esc(speech.title)}</h3>${speech.subtitle?`<p>${esc(speech.subtitle)}</p>`:''}<div class="row wrap"><span class="badge">${speech.versions.length} ${speech.versions.length===1?'versão':'versões'}</span><span class="badge">Ativa: ${esc(speech.versions.find(version=>version.id===speech.activeVersionId).name)}</span>${received.includesNotes?'<span class="badge">Com anotações</span>':''}</div></div><div class="field incoming-version"><label for="codePreviewVersion">Versão para conferir</label><select id="codePreviewVersion">${speech.versions.map(version=>`<option value="${esc(version.id)}" ${version.id===previewId?'selected':''}>${esc(version.name)}${version.id===speech.activeVersionId?' · ativa':''}</option>`).join('')}</select><small>Conferir outra versão mantém a escolha ativa de quem enviou.</small></div><div class="row wrap" id="codePreviewDetails"></div><div class="field incoming-identity" id="codePreviewIdentity"></div><div class="incoming-paper"><article class="reader-text incoming-document" id="codePreviewDocument"></article></div>${speech.scheduledAt?`<label class="check-label share-code-notes"><input type="checkbox" id="codeKeepSchedule" checked>Manter agendamento: ${esc(new Date(speech.scheduledAt).toLocaleString('pt-BR'))}</label>`:''}<div class="field share-code-category"><label for="codeIncomingCategory">Salvar na categoria</label><select id="codeIncomingCategory"><option value="">Sem categoria</option>${state.categories.map(category=>`<option value="${esc(category.id)}">${esc(category.name)}</option>`).join('')}${received.category&&!matching?`<option value="__received_category__">Nova categoria: ${esc(received.category.name)}</option>`:''}</select></div>`,btn('discard-incoming','Cancelar','','secondary')+btn('save-share-code','Salvar no aparelho','Download'),true);
  rt.modal='incoming';rt.incomingSpeech={content:speech,source:'code'};$('#codeIncomingCategory').value=matching?.id||(received.category?'__received_category__':'');
  $('#codePreviewVersion').addEventListener('change',event=>{previewId=event.target.value;renderPreview();});renderPreview();
 }
 function renderPreview(){
  const content=received.speech,version=content.versions.find(item=>item.id===previewId),speech={...content,...version};
  $('#codePreviewDetails').innerHTML=`<span class="badge">${words(plain(speech.delta))} palavras</span><span class="badge">${speech.targetMinutes} minutos</span>${isPart(speech)?`<span class="badge">${speech.participants.length} participantes</span>`:''}`;
  const identity=$('#codePreviewIdentity');identity.hidden=!isPart(speech);identity.innerHTML=isPart(speech)?`<label for="codeIncomingParticipant">Qual participante é você?</label><select id="codeIncomingParticipant"><option value="">Só acompanhar</option>${speech.participants.map(person=>`<option value="${esc(person.id)}">${esc(person.name)}</option>`).join('')}</select><small>Essa identificação fica apenas neste aparelho.</small>`:'';
  const select=$('#codeIncomingParticipant');if(select)select.value=identities[previewId]||'';
  const render=()=>{$('#codePreviewDocument').innerHTML=c.documentHTML(speech,select?.value||'');c.refreshContrast();};
  select?.addEventListener('change',()=>{identities[previewId]=select.value;render();});render();
 }
 function save(){
  if(!received||rt.incomingSpeech?.source!=='code')return;const state=c.getState();
  if(state.speeches.length>=2000){toast('Seu caderno atingiu o limite de preparações.');return;}
  const selected=$('#codeIncomingCategory')?.value||'',category=selected==='__received_category__'?received.category:null;
  if(category&&state.categories.length>=300){toast('Escolha uma categoria existente. O limite é de 300 categorias.');return;}
  const createdCategory=category?{id:uid(),...clone(category)}:null,categoryId=createdCategory?.id||(state.categories.some(item=>item.id===selected)?selected:'');
  try{
   const speech={...newSpeech(categoryId),...clone(received.speech)};validState({schema:1,speeches:[speech],categories:[]});
   for(const version of speech.versions){version.createdAt=speech.createdAt;version.updatedAt=speech.updatedAt;if(isPart(speech))version.myParticipantId=version.participants.some(person=>person.id===identities[version.id])?identities[version.id]:'';}
   if($('#codeKeepSchedule')&&!$('#codeKeepSchedule').checked){speech.scheduledAt=0;speech.reminders=[];}
   copyDocumentVersions(speech);if(createdCategory)state.categories.push(createdCategory);state.speeches.unshift(speech);
   if(c.persist(true)===false){state.speeches=state.speeches.filter(item=>item.id!==speech.id);if(createdCategory)state.categories=state.categories.filter(item=>item.id!==createdCategory.id);return;}
   c.onImported?.(speech);received=null;closeModal();rt.returnTo='home';c.go('reader',speech.id);toast(isPart(speech)?'Parte importada com todas as versões.':'Discurso importado com todas as versões.');
  }catch(error){toast(errorText(error));}
 }
 function handle(action){
  switch(action){case 'import-code':openInput();break;case 'import-file':closeModal();c.importFile();break;case 'paste-share-code':void paste();break;case 'preview-share-code':preview();break;case 'share-code':generate();break;case 'copy-share-code':void copy();break;case 'send-share-code':void send();break;case 'save-share-code':save();break;default:return false;}return true;
 }
 return {openImport,addShareOption,handle};
}
