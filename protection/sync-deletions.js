import {canonicalContent} from './content-index.js';
import {sha256Sync} from './sha256-sync.js';
const runtime=new Set(['timer','updatedAt','revision','contentKey','read','myParticipantId']);
const projection=['delta','presenterNotes','participants','partFormat'];
const digest=(kind,value)=>sha256Sync(kind+'\n'+canonicalContent(value));
export function synchronousDocumentHash(doc){
 const versions=(doc.versions||[]).map(v=>{const contentHash=digest('content',Object.fromEntries(projection.filter(k=>k in v).map(k=>[k,v[k]]))),records=digest('records',{history:v.history||[],rehearsals:v.rehearsals||[]}),meta=Object.fromEntries(Object.entries(v).filter(([k])=>!projection.includes(k)&&!runtime.has(k)&&!['history','rehearsals'].includes(k)));return {id:v.id,hash:digest('version',{...meta,contentHash,records})};});
 const projectionHash=digest('content',Object.fromEntries(projection.filter(k=>k in doc).map(k=>[k,doc[k]]))),records=digest('records',{history:doc.history||[],rehearsals:doc.rehearsals||[]}),meta=Object.fromEntries(Object.entries(doc).filter(([k])=>!projection.includes(k)&&!runtime.has(k)&&!['versions','history','rehearsals'].includes(k)));
 return digest('document',{...meta,projectionHash,records,versions});
}
export function validateDeletionTombstones(value){if(value===undefined)return;if(!Array.isArray(value))throw Error('Registro de exclusões inválido.');const ids=new Set();for(const row of value){if(!row||typeof row.id!=='string'||!row.id||row.id.length>1000||ids.has(row.id)||!Number.isFinite(row.removedAt)||row.removedAt<0||!/^[a-f0-9]{64}$/.test(row.deletedHash||'')||row.baseHash!==null&&row.baseHash!==undefined&&!/^[a-f0-9]{64}$/.test(row.baseHash))throw Error('Registro de exclusões inválido.');if(row.knownHashes!==undefined&&(!Array.isArray(row.knownHashes)||row.knownHashes.some(h=>!/^[a-f0-9]{64}$/.test(h))))throw Error('Registro de exclusões inválido.');ids.add(row.id);}}
export function createDeletionLedger(initial,getConfirmation=()=>({})){let previous=new Map(initial.speeches.map(d=>[d.id,d]));
 return {prepare(state,origin='user'){
  validateDeletionTombstones(state.deletionTombstones);const present=new Set(state.speeches.map(d=>d.id)),rows=new Map((state.deletionTombstones||[]).filter(t=>!present.has(t.id)).map(t=>[t.id,t]));
  if(!['drive','manual-restore','migration','internal'].includes(origin)){let confirmed={};try{confirmed=getConfirmation().syncDocuments||{};}catch{}for(const[id,doc]of previous)if(!present.has(id)&&!rows.has(id))rows.set(id,{id,removedAt:Date.now(),deletedHash:synchronousDocumentHash(doc),baseHash:confirmed[id]||null});}
  if(rows.size||state.deletionTombstones)state.deletionTombstones=[...rows.values()].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
 },commit(state){previous=new Map(state.speeches.map(d=>[d.id,d]));}};
}

export const deletionMatches=(row,hash)=>!!row&&[row.deletedHash,row.baseHash,...(row.knownHashes||[])].includes(hash);
export function mergeDeletionTombstones(local=[],remote=[]){const rows=new Map();for(const row of [...local,...remote]){const prior=rows.get(row.id);if(!prior){rows.set(row.id,{...row});continue;}const hashes=[...new Set([prior.deletedHash,prior.baseHash,...(prior.knownHashes||[]),row.deletedHash,row.baseHash,...(row.knownHashes||[])].filter(Boolean))].sort();rows.set(row.id,{id:row.id,removedAt:Math.max(prior.removedAt,row.removedAt),deletedHash:hashes[0],baseHash:null,knownHashes:hashes});}return [...rows.values()].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);}
