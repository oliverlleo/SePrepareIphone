import {mergeMemorization,mergeDocumentMemorization} from '../memorization/memorization-data.js';
import {parseRhythm,rhythmValue,visitRhythmOps} from './rhythm-core.js';
import {protectedGlobals,applyProtectedGlobal} from './sync-globals.js';
import {deletionMatches,mergeDeletionTombstones} from './sync-deletions.js';
import {backupContentIndex,backupStateHash} from './drive-backup-state.js';
import {versionBody,versionKey,sameVersion,activeVersion,documentKey,restoreKey,contentDifferences,mergeIndependent,generalValue} from './drive-compare.js';
import {clone,validState,ensureVersions,captureContentVersion,projectContentVersion,pauseAllVersionTimers} from './core.js';
export const stable=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const body=versionBody;
const general=['title','subtitle','categoryId','targetMinutes','layout','scheduledAt','reminders','pinned','deleted','deletedAt'];
const equivalentTo=(left,right)=>sameVersion(left,right)&&(left.name===right.name||left.driveSourceId===right.id&&[right.name+' · Drive',right.name+' · Rascunho Drive'].some(name=>left.name===name.slice(0,80))||right.driveSourceId===left.id&&[left.name+' · Drive',left.name+' · Rascunho Drive'].some(name=>right.name===name.slice(0,80)));
const meta=s=>stable(Object.fromEntries(general.map(k=>[k,generalValue(s,k)])));
const union=(a=[],b=[])=>[...new Map([...a,...b].map(x=>[stable(x),clone(x)])).values()];
export async function driveHash(text){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('');}
function parsed(raw){const source=typeof raw==='string'?JSON.parse(raw):clone(raw);if(source?.schema!==1||!Array.isArray(source.speeches)||!Array.isArray(source.categories))throw Error('Este arquivo não é um backup válido do SePrepare.');return validState(source);}
const versionTime=v=>Math.max(Number(v.updatedAt)||0,...(v.presenterNotes||[]).map(n=>Number(n.updatedAt)||0));
const relation=(a,b)=>!a||!b||a===b||Math.max(a,b)>Date.now()+86400000?'unknown':a>b?'local':'cloud';
export function inspectDriveBackup(local,raw,indexes=null){
 const incoming=parsed(raw),localDocuments=new Map(local.speeches.map(d=>[d.id,d])),conflicts=[];let added=0,versions=0,identical=0,localNewer=0,cloudNewer=0;
 for(const remote of incoming.speeches){
  const original=localDocuments.get(remote.id);if(!original){added++;continue;}
  if(indexes?.localIndex.documents[remote.id]===indexes?.remoteIndex.documents[remote.id]&&indexes?.localIndex.documents[remote.id]){identical+=remote.versions.length;continue;}
  if((original.type||'speech')!==(remote.type||'speech'))throw Error('Uma preparação tem tipos incompatíveis nos dois aparelhos. Nenhum conteúdo foi alterado.');
  const target=clone(original);captureContentVersion(target);let localAt=0,cloudAt=0,changed=meta(target)!==meta(remote);
  for(const v of remote.versions){const equivalent=target.versions.find(t=>equivalentTo(t,v));if(equivalent){identical++;if(equivalent.id===v.id&&equivalent.name!==v.name)changed=true;continue;}versions++;const same=target.versions.find(t=>t.id===v.id);if(same){changed=true;localAt=Math.max(localAt,versionTime(same));cloudAt=Math.max(cloudAt,versionTime(v));}}
  if(changed){localAt=Math.max(localAt,Number(target.updatedAt)||0);cloudAt=Math.max(cloudAt,Number(remote.updatedAt)||0);const newer=relation(localAt,cloudAt);if(newer==='local')localNewer++;if(newer==='cloud')cloudNewer++;conflicts.push({kind:'speech',id:remote.id,title:target.title||remote.title,localAt,cloudAt,newer,...contentDifferences(target,remote)});}
 }
 for(const remote of incoming.categories){const target=local.categories.find(c=>c.id===remote.id);if(target&&stable(target)!==stable(remote)&&!local.categories.some(c=>c.driveSourceId===remote.id&&c.driveSourceKey===stable(remote)))conflicts.push({kind:'category',id:remote.id,title:target.name||remote.name,newer:'unknown',localAt:0,cloudAt:0});}
 return {conflicts,added,versions,identical,localNewer,cloudNewer,remoteItems:incoming.speeches.filter(s=>!s.deleted).length,localItems:local.speeches.filter(s=>!s.deleted).length,incoming};
}
export async function mergeDriveBackup(local,raw,{manual=false,policy='both',documentPolicies={},categoryPolicies={},unchangedDocuments=[],removedDocuments=[],draftPolicies={},globalPolicies={}}={}){
 if(!['both','local','cloud'].includes(policy))throw Error('Escolha como deseja preservar os conteúdos.');
 let added=0,alternatives=0;
 if(policy==='local')return {state:local,changed:false,added,alternatives};
 const before=await backupStateHash(local),remoteHash=await backupStateHash(raw);
 if(before===remoteHash)return {state:local,changed:false,added,alternatives};
 const incoming=parsed(raw);
 if(policy==='cloud'&&manual&&!Object.keys(documentPolicies).length&&!Object.keys(categoryPolicies).length){
  const state=clone(incoming);for(const doc of state.speeches){mergeDocumentMemorization(local.speeches.find(d=>d.id===doc.id),doc);pauseAllVersionTimers(doc);}
  return {state,changed:stable(local)!==stable(state),added:state.speeches.filter(d=>!local.speeches.some(l=>l.id===d.id)).length,alternatives:0};
 }
 const next={...local,speeches:local.speeches.slice(),categories:local.categories.slice(),vocabulary:local.vocabulary.slice(),settings:clone(local.settings)};

 const empty=!next.speeches.length&&!next.categories.length&&!next.vocabulary.length;
 const categoryMap=new Map();
 for(const remote of incoming.categories){
  const choice=categoryPolicies[remote.id]||policy;if(choice==='local')continue;
  const target=next.categories.find(c=>c.id===remote.id);
  if(!target){next.categories.push(clone(remote));continue;}
  if(stable(target)===stable(remote))continue;
  if(choice==='cloud'){next.categories[next.categories.indexOf(target)]=clone(remote);continue;}
  const copy=clone(remote);copy.id='drive-cat-'+(await driveHash(stable(remote))).slice(0,28);copy.name=(copy.name+' · Drive').slice(0,100);copy.driveSourceId=remote.id;copy.driveSourceKey=stable(remote);categoryMap.set(remote.id,copy.id);
  if(!next.categories.some(c=>c.id===copy.id)){if(next.categories.length>=300)throw Error('Há muitas categorias para preservar as duas cópias. Libere espaço antes de continuar.');next.categories.push(copy);}
 }
 if(policy==='both'&&globalPolicies['setting:rhythms']!=='cloud'&&globalPolicies['setting:rhythms']!=='local'&&incoming.settings.rhythms){
  const catalog=clone(next.settings.rhythms||[]),mapping=new Map();
  for(const source of incoming.settings.rhythms){const same=catalog.find(row=>row.id===source.id);if(same&&stable(same)===stable(source))continue;const row=clone(source);if(same){row.id='drive-rhythm-'+(await driveHash(stable(source))).slice(0,32);mapping.set(source.id,row.id);}if(!catalog.some(item=>item.id===row.id))catalog.push(row);}
  if(mapping.size)visitRhythmOps(incoming,op=>{const row=parseRhythm(op.attributes?.['speech-rhythm']);if(row&&mapping.has(row.id))op.attributes={...op.attributes,'speech-rhythm':rhythmValue({...row,id:mapping.get(row.id)})};});
  next.settings.rhythms=catalog;
 }
 for(const source of incoming.speeches){
  const choice=documentPolicies[source.id]||policy;if(choice==='local'||unchangedDocuments.includes(source.id))continue;const remote=clone(source);
  ensureVersions(remote);pauseAllVersionTimers(remote);let target=next.speeches.find(s=>s.id===remote.id);
  if(!target){const copy=clone(remote);if(categoryMap.has(copy.categoryId))copy.categoryId=categoryMap.get(copy.categoryId);next.speeches.push(copy);added++;continue;}
  if((target.type||'speech')!==(remote.type||'speech'))throw Error('Uma preparação tem tipos incompatíveis. Nenhum conteúdo foi alterado.');
  const previousTarget=target;target=clone(target);next.speeches[next.speeches.indexOf(previousTarget)]=target;
  if(choice==='cloud'){
   const read=clone(target.read),person=target.myParticipantId;
   for(const version of remote.versions){const existing=target.versions.find(v=>v.id===version.id);if(existing?.timer)version.timer=clone(existing.timer);if(version.participants)version.myParticipantId=version.participants.some(p=>p.id===person)?person:'';}
   mergeDocumentMemorization(target,remote);remote.read=read;projectContentVersion(remote);next.speeches[next.speeches.indexOf(target)]=remote;continue;
  }
  if(manual&&target.deleted&&!remote.deleted){target.deleted=false;delete target.deletedAt;}
  captureContentVersion(target);const localPerson=target.myParticipantId,ids=new Map();
  for(const version of remote.versions){
   const same=target.versions.find(v=>v.id===version.id),equivalent=target.versions.find(v=>equivalentTo(v,version));
   if(equivalent){
    if(choice==='cloud')equivalent.name=version.name;
    ids.set(version.id,equivalent.id);const history=version.history.map(h=>({...h,versionId:equivalent.id})),rehearsals=version.rehearsals.map(r=>({...r,versionId:equivalent.id}));
    if(equivalent.memorization||version.memorization)equivalent.memorization=mergeMemorization(equivalent.memorization,version.memorization);
    equivalent.history=union(equivalent.history,history).slice(-15);equivalent.rehearsals=union(equivalent.rehearsals,rehearsals);continue;
   }
   if(target.versions.length>=1000)throw Error('Uma preparação atingiu o limite de versões. Libere espaço antes de continuar.');
   const v=clone(version);
   if(same){v.driveSourceId=version.id;v.id='drive-'+await driveHash(version.id+version.name+body(version));v.name=(v.name+' · Drive').slice(0,80);}
   ids.set(version.id,v.id);if(target.versions.some(x=>x.id===v.id))continue;
   if(v.participants)v.myParticipantId=v.participants.some(p=>p.id===localPerson)?localPerson:'';
   v.history=v.history.map(h=>({...h,versionId:v.id}));v.rehearsals=v.rehearsals.map(r=>({...r,versionId:v.id}));v.timer.versionId=v.id;
   target.versions.push(v);alternatives++;
  }
  if(choice==='cloud'){
   const read=clone(target.read);for(const field of general){if(field in remote)target[field]=clone(remote[field]);else delete target[field];}target.updatedAt=remote.updatedAt;target.read=read;
   if(manual||!target.deleted)target.activeVersionId=ids.get(remote.activeVersionId)||target.activeVersionId;
  }
  projectContentVersion(target);
 }
 const draftRows=new Map((next.editorDrafts||[]).map(row=>[row.speechId,row]));
 const localDraftIndex=(await backupContentIndex(local)).drafts,remoteDraftIndex=(await backupContentIndex(incoming)).drafts;
 for(const source of incoming.editorDrafts||[]){
  const id=source.speechId,choice=draftPolicies[id]||documentPolicies[id]||policy,existing=draftRows.get(id);
  if(choice==='local')continue;
  if(!existing||choice==='cloud'){draftRows.set(id,clone(source));continue;}
  if(localDraftIndex[id]===remoteDraftIndex[id])continue;
  // An explicit Both choice preserves the local working draft and makes each
  // genuinely different remote draft version available as an inactive version.
  let target=next.speeches.find(row=>row.id===id);if(!target)continue;
  const original=target;target=clone(target);next.speeches[next.speeches.indexOf(original)]=target;
  const recovered=clone(source.document);captureContentVersion(recovered);pauseAllVersionTimers(recovered);
  for(const sourceVersion of recovered.versions){
   if(target.versions.some(v=>equivalentTo(v,sourceVersion)))continue;
   const version=clone(sourceVersion),same=target.versions.some(v=>v.id===version.id);
   if(same){version.driveSourceId=version.id;version.id='draft-drive-'+await driveHash(version.id+version.name+body(version));version.name=(version.name+' · Rascunho Drive').slice(0,80);}
   if(target.versions.some(v=>v.id===version.id))continue;
   if(target.versions.length>=1000)throw Error('Uma preparação atingiu o limite de versões.');
   version.timer.versionId=version.id;version.history=version.history.map(row=>({...row,versionId:version.id}));version.rehearsals=version.rehearsals.map(row=>({...row,versionId:version.id}));target.versions.push(version);alternatives++;
  }
  projectContentVersion(target);
 }
 for(const[id,choice]of Object.entries(draftPolicies))if(choice==='cloud'&&!remoteDraftIndex[id])draftRows.delete(id);
 if(draftRows.size||next.editorDrafts||incoming.editorDrafts)next.editorDrafts=[...draftRows.values()];
 const tombstones=mergeDeletionTombstones(local.deletionTombstones,incoming.deletionTombstones);if(tombstones.length||local.deletionTombstones||incoming.deletionTombstones)next.deletionTombstones=tombstones.filter(row=>!next.speeches.some(d=>d.id===row.id)||removedDocuments.includes(row.id));
 if(removedDocuments.length){const removed=new Set(removedDocuments);next.speeches=next.speeches.filter(d=>!removed.has(d.id));if(next.editorDrafts)next.editorDrafts=next.editorDrafts.filter(d=>!removed.has(d.speechId));}
 next.vocabulary=[...new Set([...next.vocabulary,...incoming.vocabulary])];if(empty)next.settings=clone(incoming.settings);
 const incomingGlobals=protectedGlobals(incoming);for(const[key,choice]of Object.entries(globalPolicies))if(choice==='cloud')applyProtectedGlobal(next,key,incomingGlobals[key]);

 if(next.categories.length>300||next.vocabulary.length>5000)throw Error('O conjunto ultrapassa o limite de categorias ou palavras do dicionário. Nenhum dado foi alterado.');
 if(next.speeches.length>2000)throw Error('Há muitas preparações para juntar os backups. Nenhum dado foi alterado.');
 return {state:next,changed:before!==await backupStateHash(next),added,alternatives};
}
// A pair of fingerprints remembers both sides after a successful, persisted recovery.
// Timers and reading preferences stay local; text, active version and rehearsals are compared.
export async function driveIndex(raw){
 let index=await backupContentIndex(raw);if(index.legacy)index=await backupContentIndex(parsed(raw));
 return {format:3,documents:index.syncDocuments,categories:index.categories,stateHash:index.stateHash,drafts:index.drafts,globals:index.globals,versionCount:Object.values(index.versions).reduce((n,rows)=>n+Object.keys(rows).length,0)};
}
export async function planDriveRestore(local,raw,baseline=null){
 if(baseline&&(baseline.local?.format!==3||baseline.remote?.format!==3))baseline=null;
 const localIndex=await driveIndex(local),remoteIndex=await driveIndex(raw),documents=Object.create(null),categories=Object.create(null),dirtyLocal={documents:Object.create(null),categories:Object.create(null)},conflicts=[],unchangedDocuments=[],removedDocuments=[];
 if(localIndex.stateHash===remoteIndex.stateHash){
  return {report:{conflicts:[],added:0,versions:0,identical:localIndex.versionCount,localNewer:0,cloudNewer:0,remoteItems:local.speeches.filter(d=>!d.deleted).length,localItems:local.speeches.filter(d=>!d.deleted).length,incoming:local},documents,categories,dirtyLocal,localIndex,remoteIndex,result:{state:local,changed:false,added:0,alternatives:0},snapshot:JSON.stringify(local)};
 }
 const report=inspectDriveBackup(local,raw,{localIndex,remoteIndex}),draftPolicies=Object.create(null),globalPolicies=Object.create(null);
 const baseState=baseline?.state?parsed(baseline.state):null,mergedIncoming={...report.incoming,speeches:report.incoming.speeches.slice()},baseDocuments=new Map((baseState?.speeches||[]).map(document=>[document.id,document]));
 for(const remote of report.incoming.speeches){
  const original=local.speeches.find(s=>s.id===remote.id),lhs=localIndex.documents[remote.id],rhs=remoteIndex.documents[remote.id],oldLocal=baseline?.local?.documents?.[remote.id],oldRemote=baseline?.remote?.documents?.[remote.id];
  if(!original){
   const deleted=local.deletionTombstones?.find(row=>row.id===remote.id);
   if(deleted){if(deletionMatches(deleted,rhs)){documents[remote.id]='local';continue;}conflicts.push({kind:'speech',id:remote.id,title:remote.title,newer:'unknown',localAt:deleted.removedAt,cloudAt:remote.updatedAt||0,fields:['Exclusão local','Texto'],localPreview:'',cloudPreview:body(activeVersion(remote)).slice(0,280)});documents[remote.id]='both';continue;}
   if(oldLocal&&oldRemote){
    if(rhs===oldRemote){documents[remote.id]='local';dirtyLocal.documents[remote.id]=oldLocal;continue;}
    conflicts.push({kind:'speech',id:remote.id,title:remote.title,newer:'unknown',localAt:0,cloudAt:remote.updatedAt||0,fields:['Exclusão local','Texto'],localPreview:'',cloudPreview:body(activeVersion(remote)).slice(0,280)});documents[remote.id]='both';continue;
   }
   documents[remote.id]='cloud';continue;
  }
  if(lhs===rhs){documents[remote.id]='both';unchangedDocuments.push(remote.id);continue;}
  const target=clone(original);captureContentVersion(target);
  if(oldLocal&&oldRemote){
   const changedHere=lhs!==oldLocal,changedThere=rhs!==oldRemote;
   if(!changedThere){documents[remote.id]='local';if(changedHere)dirtyLocal.documents[remote.id]=oldLocal;continue;}
   if(!changedHere){documents[remote.id]='cloud';continue;}
    const resolved=mergeIndependent(baseDocuments.get(remote.id),target,remote);
    if(resolved){mergedIncoming.speeches[mergedIncoming.speeches.findIndex(document=>document.id===remote.id)]=resolved;documents[remote.id]='cloud';dirtyLocal.documents[remote.id]=oldLocal;continue;}
  }else{
   const existing=report.conflicts.find(row=>row.kind==='speech'&&row.id===remote.id),activeDifferent=versionKey(activeVersion(target))!==versionKey(activeVersion(remote));
   if(!existing&&!activeDifferent){documents[remote.id]='both';continue;}
   const contained=target.versions.every(v=>remote.versions.some(r=>equivalentTo(v,r)&&r.name===v.name));
   // First recovery, including the repair of a formerly imported but inactive version.
   if(!existing&&activeDifferent&&contained){documents[remote.id]='cloud';continue;}
  }
  const row=report.conflicts.find(row=>row.kind==='speech'&&row.id===remote.id)||{kind:'speech',id:remote.id,title:target.title||remote.title,localAt:Number(target.updatedAt)||0,cloudAt:Number(remote.updatedAt)||0,newer:relation(Number(target.updatedAt)||0,Number(remote.updatedAt)||0)};
  if(versionKey(activeVersion(target))!==versionKey(activeVersion(remote))){row.activeDifference=true;row.localVersion=target.versions.find(v=>v.id===target.activeVersionId)?.name;row.cloudVersion=remote.versions.find(v=>v.id===remote.activeVersionId)?.name;}
  documents[remote.id]='both';conflicts.push(row);
 }
 for(const remote of report.incoming.categories){
  const lhs=localIndex.categories[remote.id],rhs=remoteIndex.categories[remote.id];if(!lhs||lhs===rhs){categories[remote.id]='both';continue;}
  const oldLocal=baseline?.local?.categories?.[remote.id],oldRemote=baseline?.remote?.categories?.[remote.id];
  if(oldLocal&&oldRemote){if(rhs===oldRemote){categories[remote.id]='local';if(lhs!==oldLocal)dirtyLocal.categories[remote.id]=oldLocal;continue;}if(lhs===oldLocal){categories[remote.id]='cloud';continue;}}
  const row=report.conflicts.find(r=>r.kind==='category'&&r.id===remote.id);if(row)conflicts.push(row);categories[remote.id]='both';
 }
 const globals=new Set([...Object.keys(localIndex.globals||{}),...Object.keys(remoteIndex.globals||{})]);
 for(const key of globals){
  const lhs=localIndex.globals?.[key]||null,rhs=remoteIndex.globals?.[key]||null,oldLocal=baseline?.local?.globals?.[key]||null,oldRemote=baseline?.remote?.globals?.[key]||null;
  if(lhs===rhs){globalPolicies[key]='local';continue;}
  if(baseline?.local?.globals&&baseline?.remote?.globals){if(rhs===oldRemote){globalPolicies[key]='local';continue;}if(lhs===oldLocal){globalPolicies[key]='cloud';continue;}}
  if(!lhs){globalPolicies[key]='cloud';continue;}
  if(key==='vocabulary'){if(baseState){const baseWords=new Set(baseState.vocabulary),here=new Set(local.vocabulary),there=new Set(report.incoming.vocabulary);mergedIncoming.vocabulary=[...new Set([...here,...there])].filter(word=>!baseWords.has(word)||here.has(word)&&there.has(word));globalPolicies[key]='cloud';}else globalPolicies[key]='both';continue;}
  if(!local.speeches.length){globalPolicies[key]='cloud';continue;}
  conflicts.push({kind:'configuration',id:key,title:'Configurações do caderno',newer:'unknown',fields:[key.startsWith('setting:')?'Preferências de apresentação':'Dados do caderno'],localAt:0,cloudAt:0});globalPolicies[key]='both';
 }
 const draftIds=new Set([...Object.keys(localIndex.drafts||{}),...Object.keys(remoteIndex.drafts||{})]);
 for(const id of draftIds){
  const lhs=localIndex.drafts?.[id]||null,rhs=remoteIndex.drafts?.[id]||null,oldLocal=baseline?.local?.drafts?.[id]||null,oldRemote=baseline?.remote?.drafts?.[id]||null;
  if(lhs===rhs){draftPolicies[id]='local';continue;}
  if(baseline?.local?.drafts&&baseline?.remote?.drafts){
   const changedHere=lhs!==oldLocal,changedThere=rhs!==oldRemote;
   const localDocumentChanged=localIndex.documents[id]!==baseline.local.documents?.[id],remoteDocumentChanged=remoteIndex.documents[id]!==baseline.remote.documents?.[id];
   // A working draft and a confirmed edit of that document share one conflict
   // boundary. Never reopen an unchanged stale draft over a newer confirmation.
   if(!(changedHere&&remoteDocumentChanged||changedThere&&localDocumentChanged)){
    if(!changedHere){draftPolicies[id]='cloud';continue;}
    if(!changedThere){draftPolicies[id]='local';if(oldLocal)(dirtyLocal.drafts||=(Object.create(null)))[id]=oldLocal;continue;}
   }
  }else{
   if(!lhs&&!oldLocal){draftPolicies[id]='cloud';continue;}
   if(!rhs&&!oldRemote){draftPolicies[id]='local';continue;}
  }
  const original=local.speeches.find(d=>d.id===id)||report.incoming.speeches.find(d=>d.id===id);
  if(!conflicts.some(row=>row.kind==='speech'&&row.id===id))conflicts.push({kind:'speech',id,title:original?.title||'',newer:'unknown',localAt:0,cloudAt:0,fields:['Rascunho não confirmado']});
  draftPolicies[id]='both';
 }
 for(const original of local.speeches){
  const tombstone=report.incoming.deletionTombstones?.find(row=>row.id===original.id);
  if(tombstone){if(deletionMatches(tombstone,localIndex.documents[original.id]))removedDocuments.push(original.id);else conflicts.push({kind:'speech',id:original.id,title:original.title,newer:'unknown',localAt:original.updatedAt||0,cloudAt:tombstone.removedAt,fields:['Texto','Exclusão no Drive'],localPreview:body(activeVersion(original)).slice(0,280),cloudPreview:''});continue;}
  if(remoteIndex.documents[original.id]||!baseline?.remote?.documents?.[original.id]||!baseline?.local?.documents?.[original.id])continue;
  if(localIndex.documents[original.id]===baseline.local.documents[original.id])removedDocuments.push(original.id);
  else conflicts.push({kind:'speech',id:original.id,title:original.title,newer:'unknown',localAt:original.updatedAt||0,cloudAt:0,fields:['Texto','Exclusão no Drive'],localPreview:body(activeVersion(original)).slice(0,280),cloudPreview:''});
 }
 const result=conflicts.length?null:await mergeDriveBackup(local,mergedIncoming,{documentPolicies:documents,categoryPolicies:categories,unchangedDocuments,removedDocuments,draftPolicies,globalPolicies});
 return {report:{...report,conflicts},documents,categories,draftPolicies,globalPolicies,dirtyLocal,localIndex,remoteIndex,result,snapshot:JSON.stringify(local)};
}
