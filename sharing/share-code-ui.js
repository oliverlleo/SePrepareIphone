import {withChangeOrigin} from '../protection/change-origin.js';
import {t as translateUI,tr as formatUI,h as markupUI,html as htmlUI,uiLocale,setLanguage,normalizeLanguage,systemMessage} from '../localization/shared.js';
import {encodeShareCode,decodeShareMessage,MAX_SHARED_MESSAGE_LENGTH} from './share-code.js';
import {SPEECH_MIME,encodeSpeechVersions,shareFilename} from './sharing.js';
import {textShareMessage,fileShareMessage,codeShareMessage,APP_DOWNLOAD_URL} from './share-message.js';
import {clone,newSpeech,validState,copyDocumentVersions,uid,isPart,plain,words} from './core.js';

export function createShareCodeUI(c){
 const {$,rt,btn,option,esc,closeModal,toast}=c;
 const openModal=(...args)=>{c.openModal(...args);$('.modal')?.classList.add('share-code-dialog');};
 let generated='',message='',source=null,received=null,generation=0,previewId='',identities={},selectedVersionIds=[];
 const errorText=error=>systemMessage(error?.message)||translateUI('Não foi possível concluir. Tente novamente.');
 const sameCategory=(a,b)=>a&&b&&a.name===b.name&&a.icon===b.icon&&a.color.toLowerCase()===b.color.toLowerCase();
 function addShareOption(){
  const list=$('.sheet-options'),speech=c.getState().speeches.find(item=>item.id===rt.shareSpeechId);if(!list||!speech)return;
  const item=document.createElement('div');item.innerHTML=option('share-code','Copy',translateUI('Gerar código'),translateUI('Escolha as versões e envie com instruções para importar no Android, iPhone ou web.'));list.append(item.firstElementChild);
  const notice=list.previousElementSibling;if(notice?.classList.contains('notice'))notice.innerHTML=markupUI`Texto e arquivo: versão <strong>${esc(speech.versions.find(version=>version.id===speech.activeVersionId)?.name||translateUI('Versão original'))}</strong>.`;
 }
 function openImport(){
  openModal(translateUI('Importar compartilhamento'),markupUI`<p class="help">Recebeu uma preparação? Escolha como deseja abrir.</p><div class="sheet-options">${option('import-file','FileUp',translateUI('Usar arquivo'),translateUI('Abra um arquivo, texto ou backup, como antes.'))}${option('import-code','Copy',translateUI('Usar código'),translateUI('Cole o código recebido pelo WhatsApp ou outro aplicativo.'))}</div>`);rt.modal='import-choice';
 }
 function openInput(){
  received=null;
  openModal(translateUI('Importar compartilhamento'),markupUI`<p class="help">Cole o código ou a mensagem inteira do WhatsApp, com as instruções e os links. O SePrepare reconhece apenas o código. Você poderá conferir antes de salvar.</p><div class="field"><label for="receivedShareCode">Código ou mensagem recebida</label><textarea id="receivedShareCode" class="share-code-text" rows="5" maxlength="${MAX_SHARED_MESSAGE_LENGTH}" spellcheck="false" autocapitalize="off" autocorrect="off" placeholder="Cole a mensagem ou o código SEPREPARE:1:…" aria-describedby="shareCodeError"></textarea></div>${btn('paste-share-code',translateUI('Colar código copiado'),'ClipboardPaste','small secondary')}<p id="shareCodeError" class="share-code-error" role="alert" hidden></p>`,btn('close-modal',translateUI('Cancelar'),'','secondary')+btn('preview-share-code',translateUI('Conferir preparação'),'ArrowRight','','disabled'));
  rt.modal='import-code';$('#receivedShareCode').addEventListener('input',()=>{$('#shareCodeError').hidden=true;$('#receivedShareCode').removeAttribute('aria-invalid');$('[data-action="preview-share-code"]').disabled=!$('#receivedShareCode').value.trim();});
 }
 async function paste(){
  const field=$('#receivedShareCode');if(!field)return;
  try{
   const text=c.native?.clipboard?JSON.parse(c.native.clipboard()).text:await navigator.clipboard.readText();
   if(!field.isConnected)return;if(!text){toast(translateUI('Nenhum código copiado. Cole o código no campo.'));return;}
   if(text.length>MAX_SHARED_MESSAGE_LENGTH)throw Error(translateUI('O texto copiado é muito grande. Use um arquivo.'));
   field.value=text;field.dispatchEvent(new Event('input',{bubbles:true}));
  }catch(error){field.focus();toast(error?.message?.includes('grande')?error.message:translateUI('Toque e segure no campo e escolha Colar.'));}
 }
 function chosenIds(speech){return rt.shareVersions?[...document.querySelectorAll('input[name="shareVersion"]:checked')].map(input=>input.value):[speech.activeVersionId];}
 function versionChoices(speech,name,ids){return speech.versions.map(version=>markupUI`<label class="sheet-option version-choice share-version-choice ${ids.includes(version.id)?'selected':''}"><input type="checkbox" name="${name}" value="${esc(version.id)}" ${ids.includes(version.id)?'checked':''}><span><strong>${esc(version.name)}</strong><small>${version.id===speech.activeVersionId?translateUI('Versão ativa · '):''}${words(plain(version.id===speech.activeVersionId?speech.delta:version.delta))} palavras</small></span></label>`).join('');}
 function chooseVersions(){
  c.syncCurrent();const speech=c.getState().speeches.find(item=>item.id===rt.shareSpeechId&&!item.deleted);if(!speech)return;rt.shareVersions=true;
  openModal(translateUI('Compartilhar versões'),markupUI`<p class="help">Marque só as versões de <strong>${esc(speech.title)}</strong> que deseja enviar. Depois escolha texto, arquivo ou código.</p><div class="sheet-options">${versionChoices(speech,'shareVersion',[speech.activeVersionId])}</div><p class="notice" id="shareVersionCount" style="margin-top:15px"></p>`,btn('share-text',translateUI('Texto'),'FileText','secondary share-format-action')+btn('share-file',translateUI('Arquivo'),'BookOpen','secondary share-format-action')+btn('share-code',translateUI('Código'),'Copy','share-format-action'));rt.modal='share';
  const update=()=>{const count=document.querySelectorAll('input[name="shareVersion"]:checked').length;$('#shareVersionCount').textContent=count===1?translateUI('1 versão selecionada'):formatUI`${count} versões selecionadas`;document.querySelectorAll('.modal-footer button').forEach(button=>button.disabled=!count);document.querySelectorAll('input[name="shareVersion"]').forEach(input=>input.closest('label').classList.toggle('selected',input.checked));};
  document.querySelectorAll('input[name="shareVersion"]').forEach(input=>input.addEventListener('change',update));update();
 }
 function generate(){
  c.syncCurrent();const speech=c.getState().speeches.find(item=>item.id===rt.shareSpeechId&&!item.deleted);if(!speech)return;
  selectedVersionIds=chosenIds(speech);if(!selectedVersionIds.length){toast(translateUI('Selecione pelo menos uma versão.'));return;}
  source=clone(speech);generated='';message='';const notes=source.versions.some(version=>version.presenterNotes?.length);
  openModal(translateUI('Código de compartilhamento'),markupUI`<p class="help">${esc(source.title)}</p>${source.versions.length>1?markupUI`<div class="field"><label>Versões para enviar</label><div class="sheet-options share-code-versions">${versionChoices(source,'codeVersion',selectedVersionIds)}</div></div>`:''}<div class="row wrap"><span class="badge" id="codeVersionSummary"></span><span class="badge" id="codeActiveName"></span></div><p class="notice share-code-description">Leva só as versões marcadas, com texto, formatação, participantes, categoria e ajustes de leitura. Inclui agendamento e fixação. Conta Google, ensaios e histórico pessoal ficam no seu aparelho.</p>${notes?htmlUI('<label class="check-label share-code-notes"><input type="checkbox" id="includeCodeNotes">Incluir minhas anotações privadas</label>'):''}<div class="field"><label for="generatedShareCode">Mensagem com código</label><textarea id="generatedShareCode" class="share-code-text" rows="5" readonly spellcheck="false" aria-describedby="shareCodeSize"></textarea><small id="shareCodeSize" role="status">Preparando mensagem…</small></div><p class="notice">A mensagem já inclui instruções para importar e o <a href="${APP_DOWNLOAD_URL}" target="_blank" rel="noopener">link para baixar ou acessar o SePrepare</a>. Quem receber pode copiar tudo e colar no aplicativo.</p>`,btn('copy-share-code',translateUI('Copiar mensagem'),'Copy','','disabled')+btn('send-share-code',translateUI('Compartilhar'),'Share2','secondary','disabled'));
  rt.modal='share-code';$('#includeCodeNotes')?.addEventListener('change',refreshCode);
  document.querySelectorAll('input[name="codeVersion"]').forEach(input=>input.addEventListener('change',()=>{selectedVersionIds=[...document.querySelectorAll('input[name="codeVersion"]:checked')].map(item=>item.value);document.querySelectorAll('input[name="codeVersion"]').forEach(item=>item.closest('label').classList.toggle('selected',item.checked));refreshCode();}));refreshCode();
 }
 function refreshCode(){
  const token=++generation,field=$('#generatedShareCode'),label=$('#shareCodeSize'),includeNotes=$('#includeCodeNotes')?.checked===true,ids=[...selectedVersionIds];
  generated='';message='';field.value='';label.textContent=translateUI('Preparando mensagem…');for(const action of ['copy-share-code','send-share-code'])$(`[data-action="${action}"]`).disabled=true;
  const selected=source.versions.filter(version=>ids.includes(version.id)),active=selected.find(version=>version.id===source.activeVersionId)||selected[0];
  $('#codeVersionSummary').textContent=selected.length+' '+(selected.length===1?translateUI('versão selecionada'):translateUI('versões selecionadas'));$('#codeActiveName').textContent=active?translateUI('Ativa no envio: ')+active.name:translateUI('Nenhuma versão selecionada');
  if(!selected.length){label.textContent=translateUI('Selecione pelo menos uma versão para gerar o código.');return;}
  setTimeout(()=>{
   if(token!==generation||!field.isConnected)return;
   try{
    const category=c.getState().categories.find(item=>item.id===source.categoryId);generated=encodeShareCode(source,{category,includeNotes,versionIds:ids});message=codeShareMessage(source,generated,selected.length);field.value=message;
    label.textContent=message.length.toLocaleString(uiLocale())+' '+translateUI('caracteres')+' · '+(message.length>60000?translateUI('Mensagem extensa: copie inteira ou prefira enviar como arquivo.'):translateUI('Código, instruções e link prontos para enviar.'));
    $('[data-action="copy-share-code"]').disabled=false;$('[data-action="send-share-code"]').disabled=message.length>60000;
   }catch(error){label.textContent=errorText(error);}
  },0);
 }
 async function copy(){
  if(!message||!$('#generatedShareCode'))return;
  try{
   if(c.native?.copy)c.native.copy(message,'');else if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(message);else throw Error('clipboard');
   toast(translateUI('Mensagem copiada com código, instruções e link do SePrepare.'));
  }catch{
   const field=$('#generatedShareCode');if(!field)return;field.focus();field.select();field.setSelectionRange(0,field.value.length);
   toast(document.execCommand?.('copy')?translateUI('Mensagem copiada.'):translateUI('Mensagem selecionada. Toque em Copiar.'));
  }
 }
 async function send(){
  if(!message||message.length>60000)return;
  try{if(c.native?.shareText)c.native.shareText(source.title,message);else if(navigator.share)await navigator.share({title:source.title,text:message});else await copy();}
  catch(error){if(error.name!=='AbortError')toast(translateUI('Não foi possível compartilhar. Use Copiar mensagem.'));}
 }
 async function copyFileMessage(){
  const field=$('#sharedFileMessage');if(!field)return;
  try{if(c.native?.copy)c.native.copy(field.value,'');else await navigator.clipboard.writeText(field.value);toast(translateUI('Instruções e link copiados. Envie junto com o arquivo.'));}
  catch{field.focus();field.select();field.setSelectionRange(0,field.value.length);toast(document.execCommand?.('copy')?translateUI('Mensagem copiada.'):translateUI('Selecione Copiar e envie a mensagem junto com o arquivo.'));}
 }
 async function sendPreparation(asFile){
  c.syncCurrent();const speech=c.getState().speeches.find(item=>item.id===rt.shareSpeechId&&!item.deleted);if(!speech)return;
  const ids=chosenIds(speech);if(!ids.length){toast(translateUI('Selecione pelo menos uma versão.'));return;}
  try{
   if(asFile){
    const name=shareFilename(speech.title),json=encodeSpeechVersions(speech,ids),text=fileShareMessage();
    if(c.native?.shareSpeechFileWithMessage){c.native.shareSpeechFileWithMessage(name,json,text);closeModal();return;}
    const file=new File([json],name,{type:SPEECH_MIME});
    if(navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({title:speech.title,text,files:[file]});closeModal();return;}
    if(c.native?.shareSpeechFile)c.native.shareSpeechFile(name,json);else c.exportFile(name,SPEECH_MIME,json);
    openModal(translateUI('Arquivo pronto para enviar'),markupUI`<p class="help">Envie o arquivo <strong>${esc(name)}</strong> junto com esta mensagem. Ela explica como importar e onde encontrar o SePrepare.</p><div class="field"><label for="sharedFileMessage">Mensagem para acompanhar o arquivo</label><textarea id="sharedFileMessage" rows="5" readonly>${esc(text)}</textarea></div>`,btn('copy-file-share-message',translateUI('Copiar mensagem'),'Copy')+btn('close-modal',translateUI('Concluir'),'Check','secondary'));rt.modal='share-file-message';
   }else{
    const text=textShareMessage(speech,ids);if(text.length>100000)throw Error(translateUI('O texto selecionado é muito longo para mensagem. Compartilhe como arquivo.'));
    if(c.native?.shareText){c.native.shareText(speech.title,text);closeModal();return;}
    if(navigator.share){await navigator.share({title:speech.title,text});closeModal();}
    else if(navigator.clipboard){await navigator.clipboard.writeText(text);closeModal();toast(translateUI('Texto e link copiados. Cole na conversa.'));}
    else toast(translateUI('Use o compartilhamento do dispositivo para enviar esta preparação.'));
   }
  }catch(error){if(error.name!=='AbortError')toast(translateUI('Não foi possível compartilhar: ')+errorText(error));}
 }
 function preview(){
  const field=$('#receivedShareCode');if(!field)return;
  try{received=decodeShareMessage(field.value);}catch(error){const label=$('#shareCodeError');label.hidden=false;label.textContent=errorText(error);field.setAttribute('aria-invalid','true');return;}
  previewId=received.speech.activeVersionId;identities={};
  const speech=received.speech,state=c.getState(),matching=state.categories.find(category=>sameCategory(category,received.category));
  openModal(isPart(speech)?translateUI('Parte recebida'):translateUI('Discurso recebido'),markupUI`<p class="help">Confira antes de salvar. Será uma <strong>nova preparação</strong>; seus conteúdos atuais serão preservados.</p><div class="incoming-heading"><h3>${esc(speech.title)}</h3>${speech.subtitle?markupUI`<p>${esc(speech.subtitle)}</p>`:''}<div class="row wrap"><span class="badge">${speech.versions.length} ${speech.versions.length===1?translateUI('versão'):translateUI('versões')}</span><span class="badge">Ativa: ${esc(speech.versions.find(version=>version.id===speech.activeVersionId).name)}</span>${received.includesNotes?htmlUI('<span class="badge">Com anotações</span>'):''}</div></div><div class="field incoming-version"><label for="codePreviewVersion">Versão para conferir</label><select id="codePreviewVersion">${speech.versions.map(version=>markupUI`<option value="${esc(version.id)}" ${version.id===previewId?'selected':''}>${esc(version.name)}${version.id===speech.activeVersionId?translateUI(' · ativa'):''}</option>`).join('')}</select><small>Conferir outra versão mantém a escolha ativa de quem enviou.</small></div><section class="incoming-options"><div class="field share-code-category"><label for="codeIncomingCategory">Salvar na categoria</label><select id="codeIncomingCategory"><option value="">Sem categoria</option>${state.categories.map(category=>markupUI`<option value="${esc(category.id)}">${esc(category.name)}</option>`).join('')}${received.category&&!matching?markupUI`<option value="__received_category__">Nova categoria: ${esc(received.category.name)}</option>`:''}</select></div><div class="incoming-checks">${speech.scheduledAt?markupUI`<label class="check-label share-code-notes"><input type="checkbox" id="codeKeepSchedule" checked><span>Manter agendamento<small>${esc(new Date(speech.scheduledAt).toLocaleString(uiLocale()))}</small></span></label>`:''}${c.rhythms?.incomingOption(speech,'codeIncomingRhythms')||''}</div></section><div class="row wrap" id="codePreviewDetails"></div><div class="field incoming-identity" id="codePreviewIdentity"></div><div class="incoming-paper"><article class="reader-text incoming-document" id="codePreviewDocument"></article></div>`,btn('discard-incoming',translateUI('Cancelar'),'','secondary')+btn('save-share-code',translateUI('Salvar no aparelho'),'Download'),true);
  rt.modal='incoming';rt.incomingSpeech={content:speech,source:'code'};$('#codeIncomingCategory').value=matching?.id||(received.category?'__received_category__':'');
  $('#codePreviewVersion').addEventListener('change',event=>{previewId=event.target.value;renderPreview();});renderPreview();
 }
 function renderPreview(){
  const content=received.speech,version=content.versions.find(item=>item.id===previewId),speech={...content,...version};
  $('#codePreviewDetails').innerHTML=markupUI`<span class="badge">${words(plain(speech.delta))} palavras</span><span class="badge">${speech.targetMinutes} minutos</span>${isPart(speech)?markupUI`<span class="badge">${speech.participants.length} participantes</span>`:''}`;
  const identity=$('#codePreviewIdentity');identity.hidden=!isPart(speech);identity.innerHTML=isPart(speech)?markupUI`<label for="codeIncomingParticipant">Qual participante é você?</label><select id="codeIncomingParticipant"><option value="">Só acompanhar</option>${speech.participants.map(person=>markupUI`<option value="${esc(person.id)}">${esc(person.name)}</option>`).join('')}</select><small>Essa identificação fica apenas neste aparelho.</small>`:'';
  const select=$('#codeIncomingParticipant');if(select)select.value=identities[previewId]||'';
  const render=()=>{$('#codePreviewDocument').innerHTML=c.documentHTML(speech,select?.value||'');c.refreshContrast();};
  select?.addEventListener('change',()=>{identities[previewId]=select.value;render();});render();
 }
 function save(){
  if(!received||rt.incomingSpeech?.source!=='code')return;const state=c.getState();
  if(state.speeches.length>=2000){toast(translateUI('Seu caderno atingiu o limite de preparações.'));return;}
  const selected=$('#codeIncomingCategory')?.value||'',category=selected==='__received_category__'?received.category:null;
  if(category&&state.categories.length>=300){toast(translateUI('Escolha uma categoria existente. O limite é de 300 categorias.'));return;}
  const createdCategory=category?{id:uid(),...clone(category)}:null,categoryId=createdCategory?.id||(state.categories.some(item=>item.id===selected)?selected:'');
  try{
   const adoption=c.rhythms?.receive(received.speech,'codeIncomingRhythms');
   const speech={...newSpeech(categoryId),...(adoption?.content||clone(received.speech))};validState({schema:1,speeches:[speech],categories:[]});
   for(const version of speech.versions){version.createdAt=speech.createdAt;version.updatedAt=speech.updatedAt;if(isPart(speech))version.myParticipantId=version.participants.some(person=>person.id===identities[version.id])?identities[version.id]:'';}
   if($('#codeKeepSchedule')&&!$('#codeKeepSchedule').checked){speech.scheduledAt=0;speech.reminders=[];}
   copyDocumentVersions(speech);if(createdCategory)state.categories.push(createdCategory);state.speeches.unshift(speech);
   if(c.withChangeOrigin('shared-import',()=>persist(true))===false){adoption?.rollback();state.speeches=state.speeches.filter(item=>item.id!==speech.id);if(createdCategory)state.categories=state.categories.filter(item=>item.id!==createdCategory.id);return;}
   c.onImported?.(speech);received=null;closeModal();rt.returnTo='home';c.go('reader',speech.id);toast(isPart(speech)?translateUI('Parte importada com todas as versões.'):translateUI('Discurso importado com todas as versões.'));
  }catch(error){toast(errorText(error));}
 }
 function handle(action){
  switch(action){case 'share-versions':chooseVersions();break;case 'share-text':void sendPreparation(false);break;case 'share-file':void sendPreparation(true);break;case 'copy-file-share-message':void copyFileMessage();break;case 'import-code':openInput();break;case 'import-file':closeModal();c.importFile();break;case 'paste-share-code':void paste();break;case 'preview-share-code':preview();break;case 'share-code':generate();break;case 'copy-share-code':void copy();break;case 'send-share-code':void send();break;case 'save-share-code':save();break;default:return false;}return true;
 }
 return {openImport,addShareOption,handle};
}
