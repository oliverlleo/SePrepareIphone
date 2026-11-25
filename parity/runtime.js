import {clone,projectContentVersion} from '../protection/core.js';
import {openEditorDraft,retainEditorDraft,hasEditorChanges,confirmEditorDraft,syncEditorVersionRuntime} from './editor-drafts.js';
import {createEditorProtection} from './editor-protection.js';
import {t} from '../localization/shared.js';
import {receiveFilePreparation} from './incoming-file.js';

// The Apple host keeps ownership of IDB/OPFS, device gating and the write queue.
// This adapter holds only the editor projection and waits for that queue's receipt.
export function createEditorRuntime(c){
 let working=null,busy=false,generation=0;
 const saved=()=>c.getState().speeches.find(doc=>doc.id===c.rt.speechId);
 const getEditor=()=>c.rt.view==='editor'&&working?.id===c.rt.speechId?working:null;
 const protection=createEditorProtection({getState:c.getState,getDocument:getEditor,isDirty:()=>!!getEditor()&&!!saved()&&hasEditorChanges(saved(),working),readStatus:()=>JSON.parse(c.getDrive()?.driveStatus?.()||'{}'),readReceipt:()=>JSON.parse(c.getDrive()?.driveBackupIndex?.()||'{}'),icon:c.icon});
 const restore=(target,value)=>{for(const key of Object.keys(target))delete target[key];Object.assign(target,clone(value));projectContentVersion(target);};
 function retain(){if(getEditor()&&saved())retainEditorDraft(c.getState(),saved(),working);}
 function prepareSave(){++generation;retain();protection.mark('saving');}
 async function notifyDrive(raw,origin){try{await c.getDrive()?.driveLocalSaved?.(origin,raw);}catch{/* Network failure never changes a local receipt. */}}
 function observeSave(raw,accepted,origin){
  const current=++generation;
  if(!accepted){protection.mark('error');return;}
  protection.mark('saving');
  void Promise.resolve().then(()=>c.flush()).then(ok=>{
   if(current!==generation)return;
   // A newer edit has no receipt yet, even when an older write just succeeded.
   if(JSON.stringify(c.getState())!==raw){protection.mark('saving');return;}
   protection.mark(ok?'saved':'error');if(ok)void notifyDrive(raw,origin);
  }).catch(()=>{if(current===generation)protection.mark('error');});
 }
 function updateSaveButton(){
  const button=c.$('.editor-save');if(!getEditor()||!saved()||!button)return;
  button.disabled=busy;button.toggleAttribute('aria-busy',busy);if(busy)return;
  const clean=!hasEditorChanges(saved(),working),key=clean?'view':saved().editorUnpublished?'create':'apply',label=protection.text(key);
  button.dataset.action=clean?'present':'save-editor';button.title=protection.text(clean?'view':key+'Help');button.setAttribute('aria-label',label);
  if(button.querySelector('span')?.textContent!==label) {button.innerHTML=c.icon(clean?'Play':'Check');const span=document.createElement('span');span.textContent=label;button.append(span);}
 }
 function mountEditor(){
  if(!getEditor())return;const header=c.$('.editor-top');if(!header)return;
  const name=header.querySelector('.editor-name .name');if(name)name.textContent=protection.text('editor');
  let row=header.querySelector('.editor-protection');if(!row){row=document.createElement('div');row.className='editor-protection';
   const local=c.$('#saveStatus')||document.createElement('span');local.id='saveStatus';local.className='save-status';local.setAttribute('role','status');local.setAttribute('aria-live','polite');
   const cloud=document.createElement('button');cloud.type='button';cloud.id='editorDriveStatus';cloud.className='editor-drive-status';cloud.dataset.action='drive-settings';row.append(local,cloud);header.append(row);}
  updateSaveButton();void protection.refresh();
 }
 async function durable(){return c.persist(true)!==false&&await c.flush();}
 async function navigate(view,id=c.rt.speechId){
  if(busy||c.rt.importingSharedCode||c.rt.fileImportCommit)return false;
  busy=true;updateSaveButton();const release=c.lock?.()||(()=>{});
  try{
   if(!await durable()){protection.mark('error');return false;}
   if(view==='part')view='editor';const doc=c.getState().speeches.find(item=>item.id===id);
   const next=view==='editor'&&doc?openEditorDraft(c.getState(),doc,{preferSavedVersion:c.rt.view==='reader'&&id===c.rt.speechId}):null;
   const fromSearch=c.rt.view==='home'&&c.rt.search&&view==='reader';
   c.rt.q=null;c.closeModal();working=next;c.rt.view=view;c.rt.speechId=id;c.rt.page=0;c.rt.focus=false;c.render();window.scrollTo(0,0);c.keepAwake(['reader','teleprompter'].includes(view));
   if(next&&doc&&hasEditorChanges(doc,next))globalThis.SePrepareMetrics?.used('editor','recuperar_rascunho',{tipo:doc.type==='part'?'demonstracao':'discurso'});
   if(view==='reader'&&doc)globalThis.SePrepareMetrics?.used('apresentacao','usar_apresentacao',{tipo:doc.type==='part'?'demonstracao':'discurso'});
   if(fromSearch&&doc)globalThis.SePrepareMetrics?.used('caderno','abrir_resultado_busca');
   return true;
  }catch{protection.mark('error');c.toast(t('Não foi possível salvar. Exporte um backup antes de fechar.'));return false;}
  finally{busy=false;release();updateSaveButton();}
 }
 async function confirm(){
  if(busy||!getEditor()||!saved())return false;
  busy=true;updateSaveButton();const release=c.lock?.()||(()=>{});let previous,index,pending,drafts,staged=false;
  let finishMetric;
  try{
   c.syncCurrent();retain();
   if(hasEditorChanges(saved(),working)&&working.delta?.ops.some(op=>typeof op.insert==='string'&&op.insert.trim())){
     finishMetric=globalThis.SePrepareMetrics?.begin('editor','salvar_preparacao',{tipo:working.type==='part'?'demonstracao':'discurso'});
   }
   if(!await durable())throw Error('save');
   const state=c.getState();previous=saved();index=state.speeches.indexOf(previous);pending=clone(working);drafts=clone(state.editorDrafts||[]);
   const next=confirmEditorDraft(previous,working);state.speeches[index]=next;restore(working,next);staged=true;
   if(!await durable())throw Error('save');
   staged=false;finishMetric?.('sucesso');updateSaveButton();c.onConfirmed?.();c.toast(t('Alterações salvas. A apresentação foi atualizada.'));return true;
  }catch{
   finishMetric?.('erro');
   if(staged){c.getState().speeches[index]=previous;c.getState().editorDrafts=drafts;restore(working,pending);retain();try{await durable();}catch{}}
   protection.mark('error');updateSaveButton();c.toast(t('Não foi possível salvar. Exporte um backup antes de fechar.'));return false;
  }finally{busy=false;release();updateSaveButton();}
 }
 function editorState(){const doc=getEditor();return doc?{...c.getState(),speeches:c.getState().speeches.map(item=>item.id===doc.id?doc:item)}:c.getState();}
 function versionSnapshot(){return getEditor()&&saved()?clone(saved()):null;}
 function versionChanged(before){if(getEditor()&&saved())syncEditorVersionRuntime(saved(),before,working);retain();}
 function versionRollback(previous){if(previous&&saved())restore(saved(),previous);retain();}
 async function saveAgendaDate(id,date){
  if(busy||c.rt.fileImportCommit||c.rt.importingSharedCode)return false;
  const state=c.getState(),document=state.speeches.find(item=>item.id===id&&!item.deleted);
  if(!document)return false;
  const targets=new Set([document]);
  if(getEditor()?.id===id)targets.add(working);
  const draft=state.editorDrafts?.find(item=>item.speechId===id)?.document;
  if(draft)targets.add(draft);
  const previousDrafts=state.editorDrafts;
  const previousDates=new Map([...targets].map(item=>[item,item.scheduledAt]));
  busy=true;
  const release=c.lock?.()||(()=>{});
  try{
   for(const item of targets)item.scheduledAt=date;
   if(!await durable())throw Error('save');
   if(date)globalThis.SePrepareMetrics?.used('agenda','agendar');
   return true;
  }catch{
   for(const [item,previous] of previousDates)item.scheduledAt=previous;
   state.editorDrafts=previousDrafts;
   try{await durable();}catch{}
   c.toast(t('Não foi possível salvar a data. Tente novamente.'));
   return false;
  }finally{busy=false;release();updateSaveButton();}
 }
 // Restore must serialize the received notebook without projecting an old Quill
 // editor into it. Keep the old projection available if the write fails.
 async function commitRestore(next,options){
  if(busy)return false;busy=true;const release=c.lock?.()||(()=>{}),previous=c.getState(),oldWorking=working,q=c.rt.q,view=c.rt.view,speechId=c.rt.speechId;
  try{
   next.settings.language=previous.settings.language;
   if(options?.reloadEditorSpeechId&&c.rt.view==='editor'&&c.rt.speechId===options.reloadEditorSpeechId){
    const target=next.speeches.find(s=>s.id===c.rt.speechId&&!s.deleted);
    working=target?openEditorDraft(next,target):null;c.rt.q=null;c.setState(next);if(!await durable())throw Error('save');
    if(!target){c.rt.view='home';c.rt.speechId=null;c.render();return true;}
    const y=window.scrollY;c.render();window.scrollTo(0,y);return true;
   }
   if(options?.preserveEditorSpeechId&&c.rt.view==='editor'&&working?.id===options.preserveEditorSpeechId){
    c.setState(next);retain();if(!await durable())throw Error('save');updateSaveButton();void protection.refresh();return true;
   }
   if(options?.preserveView&&['reader','home','agenda','categories','settings'].includes(c.rt.view)){
    working=null;c.rt.q=null;c.setState(next);if(!await durable())throw Error('save');
    if(c.rt.view==='reader'){
     if(!next.speeches.some(s=>s.id===c.rt.speechId&&!s.deleted)){c.rt.view='home';c.rt.speechId=null;c.render();return true;}
    }else c.rt.speechId=null;
    const y=window.scrollY;c.render();window.scrollTo(0,y);return true;
   }
   working=null;c.rt.q=null;c.setState(next);if(!await durable())throw Error('save');c.rt.view='home';c.rt.speechId=null;c.render();return true;
  }
  catch{c.setState(previous);working=oldWorking;c.rt.q=q;c.rt.view=view;c.rt.speechId=speechId;try{await durable();}catch{}protection.mark('error');return false;}
  finally{busy=false;release();}
 }
 function hasOpenEditorChanges(){if(!getEditor()||!saved())return false;c.syncCurrent();return hasEditorChanges(saved(),working);}
 function syncReaderDraftNotice(){
  if(c.rt.view!=='reader')return;
  const doc=saved(),paper=c.$('.reader-paper');if(!doc||!paper?.parentElement)return;
  paper.parentElement.querySelector('.reader-draft-notice')?.remove();
  const draft=(c.getState().editorDrafts||[]).find(item=>item.speechId===doc.id)?.document;
  if(!draft||draft.id!==doc.id||draft.type!==doc.type||!hasEditorChanges(doc,draft))return;
  const banner=document.createElement('div');banner.className='reader-draft-notice';banner.setAttribute('role','status');
  const message=document.createElement('span');message.textContent=t('Há alterações salvas em rascunho neste item.');
  const action=document.createElement('button');action.type='button';action.className='btn small secondary';action.dataset.action='edit';action.dataset.id=doc.id;
  action.innerHTML=c.icon('PenLine');const label=document.createElement('span');label.textContent=t('Abrir no editor');action.append(label);
  banner.append(message,action);paper.parentElement.insertBefore(banner,paper);
 }
 return {getEditor,editorState,hasOpenEditorChanges,prepareSave,retain,observeSave,notifyDrive,mountEditor,updateSaveButton,navigate,confirm,versionSnapshot,versionChanged,versionRollback,saveAgendaDate,commitRestore,syncReaderDraftNotice,receiveFile:()=>receiveFilePreparation({...c,navigate}),mark:protection.mark};
}
