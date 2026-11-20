import {mergeMemorization} from '../memorization/memorization-data.js';
import {clone,validState,ensureVersions,captureContentVersion,projectContentVersion,finishVersionRehearsal} from '../protection/core.js';

const general=['title','subtitle','categoryId','targetMinutes','scheduledAt','reminders','layout','pinned'];
const content=['delta','presenterNotes','participants','partFormat','myParticipantId','history'];
const fields=(source,keys)=>Object.fromEntries(keys.map(key=>[key,source[key]??null]));
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const records=state=>Array.isArray(state.editorDrafts)?state.editorDrafts:[];
const history=(a=[],b=[])=>[...new Map([...a,...b].map(item=>[item.id||JSON.stringify(item),clone(item)])).values()].sort((a,b)=>(a.at||0)-(b.at||0)).slice(-15);

// Timer, reading preferences and active-version selection are independent of
// confirming an edit. Only editor content and general editor fields are pending.
export function editorDocumentKey(doc){
 ensureVersions(doc);
 return JSON.stringify({general:fields(doc,general),versions:doc.versions.map(version=>({id:version.id,name:version.name,...fields(version,content)}))});
}
export const hasEditorChanges=(saved,working)=>!!saved.editorUnpublished||editorDocumentKey(saved)!==editorDocumentKey(working);

export function openEditorDraft(state,saved,{preferSavedVersion=false}={}){
 ensureVersions(saved);
 const entry=records(state).find(item=>item.speechId===saved.id);
 let working=clone(saved);
 if(entry){
  const raw=entry.document;
  if(!raw||raw.id!==saved.id||raw.type!==saved.type)throw Error('O rascunho não corresponde a esta preparação. Exporte um backup para preservá-lo.');
  working=validState({schema:1,categories:[],speeches:[clone(raw)]}).speeches[0];
  for(const key of general)if(entry.baseGeneral&&equal(working[key]??null,entry.baseGeneral[key]??null)){
   if(key in saved)working[key]=clone(saved[key]);else delete working[key];
  }
  // Preserve versions added by a later restore, without resurrecting versions
  // deliberately removed in the editor draft.
  const baseIds=entry.baseVersionIds||[];
  for(const version of saved.versions)if(!baseIds.includes(version.id)&&!working.versions.some(item=>item.id===version.id))working.versions.push(clone(version));
 }
 for(const version of working.versions){
  const confirmed=saved.versions.find(item=>item.id===version.id);if(!confirmed)continue;
  if(confirmed.memorization||version.memorization)version.memorization=mergeMemorization(confirmed.memorization,version.memorization);
  version.timer=clone(confirmed.timer);version.rehearsals=clone(confirmed.rehearsals);
  version.history=history(confirmed.history,version.history);
  if(entry?.baseIdentities&&version.myParticipantId===entry.baseIdentities[version.id])version.myParticipantId=version.participants?.some(person=>person.id===confirmed.myParticipantId)?confirmed.myParticipantId:'';
 }
 working.read=clone(saved.read);
 working.deleted=!!saved.deleted;if(saved.deletedAt)working.deletedAt=saved.deletedAt;else delete working.deletedAt;
 if(preferSavedVersion&&working.versions.some(version=>version.id===saved.activeVersionId))working.activeVersionId=saved.activeVersionId;
 projectContentVersion(working);
 return working;
}

export function retainEditorDraft(state,saved,working){
 captureContentVersion(working);
 const previous=records(state),entry=previous.find(item=>item.speechId===saved.id);
 const next=previous.filter(item=>item.speechId!==saved.id&&state.speeches.some(doc=>doc.id===item.speechId));
 if(editorDocumentKey(saved)!==editorDocumentKey(working))next.push({speechId:saved.id,updatedAt:working.updatedAt||Date.now(),baseGeneral:entry?.baseGeneral||fields(saved,general),baseVersionIds:entry?.baseVersionIds||saved.versions.map(version=>version.id),baseIdentities:entry?.baseIdentities||Object.fromEntries(saved.versions.map(version=>[version.id,version.myParticipantId||''])),document:clone(working)});
 state.editorDrafts=next;
}

export function confirmEditorDraft(saved,working){
 captureContentVersion(working);
 const confirmed=clone(working);
 confirmed.createdAt=saved.createdAt;confirmed.updatedAt=Date.now();confirmed.read=clone(saved.read);
 confirmed.deleted=!!saved.deleted;if(saved.deletedAt)confirmed.deletedAt=saved.deletedAt;else delete confirmed.deletedAt;
 delete confirmed.editorUnpublished;
 for(const version of confirmed.versions){
  const original=saved.versions.find(item=>item.id===version.id);if(!original)continue;
  if(original.memorization||version.memorization)version.memorization=mergeMemorization(original.memorization,version.memorization);
  version.timer=clone(original.timer);version.rehearsals=clone(original.rehearsals);version.history=history(original.history,version.history);
  if((version.timer.running||version.timer.elapsedMs)&&version.timer.contentKey&&version.timer.contentKey!==version.contentKey)version.timer.contentChanged=true;
 }
 projectContentVersion(confirmed);
 if(!confirmed.myParticipantId&&confirmed.read)confirmed.read.onlyMine=false;
 return confirmed;
}

// Version switches may pause or finish a real rehearsal. Apply only those
// operational changes to the saved document, never the unconfirmed text.
export function syncEditorVersionRuntime(saved,before,working){
 const previousId=saved.activeVersionId;
 captureContentVersion(saved);
 for(const version of working.versions){
  const original=before.versions.find(item=>item.id===version.id),confirmed=saved.versions.find(item=>item.id===version.id);
  if(!original||!confirmed)continue;
  if(original.timer.running&&!version.timer.running){
   projectContentVersion(saved,confirmed.id);
   const finished=version.rehearsals.length>original.rehearsals.length;
   const duration=finished?version.rehearsals.at(-1).duration:version.timer.elapsedMs;
   saved.timer={...clone(confirmed.timer),running:false,startedAt:0,elapsedMs:duration,active:true};
   captureContentVersion(saved);
   if(finished)finishVersionRehearsal(saved);
  }
 }
 const nextId=saved.versions.some(version=>version.id===working.activeVersionId)?working.activeVersionId:previousId;
 projectContentVersion(saved,nextId);
}
