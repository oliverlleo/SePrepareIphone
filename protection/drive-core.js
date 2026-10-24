import {versionBody,versionKey,sameVersion,activeVersion,documentKey,restoreKey,contentDifferences,mergeIndependent,generalValue} from './drive-compare.js';
import {clone,validState,ensureVersions,captureContentVersion,projectContentVersion,pauseAllVersionTimers} from './core.js';
export const stable=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const body=versionBody;
const general=['title','subtitle','categoryId','targetMinutes','layout','scheduledAt','reminders','pinned','deleted','deletedAt'];
const equivalentTo=sameVersion;
const meta=s=>stable(Object.fromEntries(general.map(k=>[k,generalValue(s,k)])));
const union=(a=[],b=[])=>[...new Map([...a,...b].map(x=>[stable(x),clone(x)])).values()];
export async function driveHash(text){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('');}
function parsed(raw){const source=typeof raw==='string'?JSON.parse(raw):clone(raw);if(source?.schema!==1||!Array.isArray(source.speeches)||!Array.isArray(source.categories))throw Error('Este arquivo não é um backup válido do SePrepare.');return validState(source);}
const versionTime=v=>Math.max(Number(v.updatedAt)||0,...(v.presenterNotes||[]).map(n=>Number(n.updatedAt)||0));
const relation=(a,b)=>!a||!b||a===b||Math.max(a,b)>Date.now()+86400000?'unknown':a>b?'local':'cloud';
export function inspectDriveBackup(local,raw){
 const incoming=parsed(raw),conflicts=[];let added=0,versions=0,identical=0,localNewer=0,cloudNewer=0;
 for(const remote of incoming.speeches){
  const original=local.speeches.find(s=>s.id===remote.id);if(!original){added++;continue;}
  if((original.type||'speech')!==(remote.type||'speech'))throw Error('Uma preparação tem tipos incompatíveis nos dois aparelhos. Nenhum conteúdo foi alterado.');
  const target=clone(original);captureContentVersion(target);let localAt=0,cloudAt=0,changed=meta(target)!==meta(remote);
  for(const v of remote.versions){const equivalent=target.versions.find(t=>equivalentTo(t,v));if(equivalent){identical++;if(equivalent.id===v.id&&equivalent.name!==v.name)changed=true;continue;}versions++;const same=target.versions.find(t=>t.id===v.id);if(same){changed=true;localAt=Math.max(localAt,versionTime(same));cloudAt=Math.max(cloudAt,versionTime(v));}}
  if(changed){localAt=Math.max(localAt,Number(target.updatedAt)||0);cloudAt=Math.max(cloudAt,Number(remote.updatedAt)||0);const newer=relation(localAt,cloudAt);if(newer==='local')localNewer++;if(newer==='cloud')cloudNewer++;conflicts.push({kind:'speech',id:remote.id,title:target.title||remote.title,localAt,cloudAt,newer,...contentDifferences(target,remote)});}
 }
 for(const remote of incoming.categories){const target=local.categories.find(c=>c.id===remote.id);if(target&&stable(target)!==stable(remote)&&!local.categories.some(c=>c.driveSourceId===remote.id&&c.driveSourceKey===stable(remote)))conflicts.push({kind:'category',id:remote.id,title:target.name||remote.name,newer:'unknown',localAt:0,cloudAt:0});}
 return {conflicts,added,versions,identical,localNewer,cloudNewer,remoteItems:incoming.speeches.filter(s=>!s.deleted).length,localItems:local.speeches.filter(s=>!s.deleted).length,incoming};
}
export async function mergeDriveBackup(local,raw,{manual=false,policy='both',documentPolicies={},categoryPolicies={}}={}){
 if(!['both','local','cloud'].includes(policy))throw Error('Escolha como deseja preservar os conteúdos.');
 const incoming=parsed(raw),next=clone(local),before=restoreKey(local);let added=0,alternatives=0;
 if(policy==='local')return {state:next,changed:false,added,alternatives};
 const empty=!next.speeches.length&&!next.categories.length&&!next.vocabulary.length;
 const categoryMap=new Map();
 for(const remote of incoming.categories){
  const choice=categoryPolicies[remote.id]||policy;if(choice==='local')continue;
  const target=next.categories.find(c=>c.id===remote.id);
  if(!target){next.categories.push(clone(remote));continue;}
  if(stable(target)===stable(remote))continue;
  if(choice==='cloud'){Object.assign(target,clone(remote));continue;}
  const copy=clone(remote);copy.id='drive-cat-'+(await driveHash(stable(remote))).slice(0,28);copy.name=(copy.name+' · Drive').slice(0,100);copy.driveSourceId=remote.id;copy.driveSourceKey=stable(remote);categoryMap.set(remote.id,copy.id);
  if(!next.categories.some(c=>c.id===copy.id)){if(next.categories.length>=300)throw Error('Há muitas categorias para preservar as duas cópias. Libere espaço antes de continuar.');next.categories.push(copy);}
 }
 for(const remote of incoming.speeches){
  const choice=documentPolicies[remote.id]||policy;if(choice==='local')continue;
  ensureVersions(remote);pauseAllVersionTimers(remote);const target=next.speeches.find(s=>s.id===remote.id);
  if(!target){const copy=clone(remote);if(categoryMap.has(copy.categoryId))copy.categoryId=categoryMap.get(copy.categoryId);next.speeches.push(copy);added++;continue;}
  if((target.type||'speech')!==(remote.type||'speech'))throw Error('Uma preparação tem tipos incompatíveis. Nenhum conteúdo foi alterado.');
  if(manual&&target.deleted&&!remote.deleted){target.deleted=false;delete target.deletedAt;}
  captureContentVersion(target);const localPerson=target.myParticipantId,ids=new Map();
  for(const version of remote.versions){
   const same=target.versions.find(v=>v.id===version.id),equivalent=target.versions.find(v=>equivalentTo(v,version));
   if(equivalent){
    if(choice==='cloud')equivalent.name=version.name;
    ids.set(version.id,equivalent.id);const history=version.history.map(h=>({...h,versionId:equivalent.id})),rehearsals=version.rehearsals.map(r=>({...r,versionId:equivalent.id}));
    equivalent.history=union(equivalent.history,history).slice(-15);equivalent.rehearsals=union(equivalent.rehearsals,rehearsals);continue;
   }
   if(target.versions.length>=1000)throw Error('Uma preparação atingiu o limite de versões. Libere espaço antes de continuar.');
   const v=clone(version);
   if(same){v.driveSourceId=version.id;v.id='drive-'+await driveHash(version.id+body(version));v.name=(v.name+' · Drive').slice(0,80);}
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
 next.vocabulary=[...new Set([...next.vocabulary,...incoming.vocabulary])];if(empty)next.settings=clone(incoming.settings);
 if(next.categories.length>300||next.vocabulary.length>5000)throw Error('O conjunto ultrapassa o limite de categorias ou palavras do dicionário. Nenhum dado foi alterado.');
 if(next.speeches.length>2000)throw Error('Há muitas preparações para juntar os backups. Nenhum dado foi alterado.');
 return {state:next,changed:before!==restoreKey(next),added,alternatives};
}
// A pair of fingerprints remembers both sides after a successful, persisted recovery.
// Timers and reading preferences stay local; text, active version and rehearsals are compared.
export async function driveIndex(raw){
 const state=parsed(raw),documents=Object.create(null),categories=Object.create(null);
 for(const original of state.speeches){const s=clone(original);captureContentVersion(s);documents[s.id]=await driveHash(documentKey(s));}
 for(const category of state.categories)categories[category.id]=await driveHash(stable(category));
 return {format:2,documents,categories};
}
export async function planDriveRestore(local,raw,baseline=null){
 if(baseline&&(baseline.local?.format!==2||baseline.remote?.format!==2))baseline=null;
 const report=inspectDriveBackup(local,raw),localIndex=await driveIndex(local),remoteIndex=await driveIndex(report.incoming),documents=Object.create(null),categories=Object.create(null),dirtyLocal={documents:Object.create(null),categories:Object.create(null)},conflicts=[];
 const baseState=baseline?.state?parsed(baseline.state):null,mergedIncoming=clone(report.incoming),baseDocuments=new Map((baseState?.speeches||[]).map(document=>[document.id,document]));
 for(const remote of report.incoming.speeches){
  const original=local.speeches.find(s=>s.id===remote.id);if(!original){documents[remote.id]='cloud';continue;}
  const target=clone(original);captureContentVersion(target);const lhs=localIndex.documents[remote.id],rhs=remoteIndex.documents[remote.id],oldLocal=baseline?.local?.documents?.[remote.id],oldRemote=baseline?.remote?.documents?.[remote.id];
  if(lhs===rhs){documents[remote.id]='both';continue;}
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
 const result=conflicts.length?null:await mergeDriveBackup(local,mergedIncoming,{documentPolicies:documents,categoryPolicies:categories});
 return {report:{...report,conflicts},documents,categories,dirtyLocal,localIndex,remoteIndex,result,snapshot:JSON.stringify(local)};
}
