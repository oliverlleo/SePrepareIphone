import{mergeDocumentTeleprompter}from'../memorization/teleprompter-data.js';
import {mergeDocumentMemorization} from '../memorization/memorization-data.js';
// Compare the data a person can recover, independent of Quill's internal blocks,
// generated revision clocks and aliases of the same named content version.
export const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])])):value;
export const serialize=value=>JSON.stringify(ordered(value));
export function normalizedDelta(delta){
 const ops=[];
 const inline=['bold','italic','underline','strike','color','background','size','font','link','script'];
 for(const source of delta?.ops||[]){
  if(typeof source.insert==='string'&&!source.insert)continue;
  const attributes=ordered(Object.fromEntries(Object.entries(source.attributes||{}).filter(([key,value])=>value!==null&&value!==undefined&&!(value===false&&['bold','italic','underline','strike'].includes(key)))));
  for(const insert of typeof source.insert==='string'?source.insert.match(/[^\n]+|\n+/g):[source.insert]){
   const attrs=typeof insert==='string'&&insert.startsWith('\n')?Object.fromEntries(Object.entries(attributes).filter(([key])=>!inline.includes(key))):attributes;
   const op={insert,...(Object.keys(attrs).length?{attributes:attrs}:{})},last=ops[ops.length-1];
   if(last&&typeof last.insert==='string'&&typeof op.insert==='string'&&serialize(last.attributes||{})===serialize(attrs))last.insert+=op.insert;
   else ops.push(op);
  }
 }
 return {ops};
}
function notes(list=[]){return list.map(note=>Object.fromEntries(Object.entries(note).filter(([key])=>!['createdAt','updatedAt'].includes(key)))).sort((a,b)=>String(a.id).localeCompare(String(b.id)));}
export const versionBody=value=>serialize({delta:normalizedDelta(value?.delta),presenterNotes:notes(value?.presenterNotes),participants:value?.participants,partFormat:value?.partFormat});
export const versionKey=value=>serialize({name:value?.name||'',body:versionBody(value)});
export const sameVersion=(left,right)=>versionBody(left)===versionBody(right)&&(left.id===right.id||left.driveSourceId===right.id||right.driveSourceId===left.id||left.driveSourceId&&left.driveSourceId===right.driveSourceId);
export const activeVersion=document=>document.versions?.find(version=>version.id===document.activeVersionId)||document.versions?.[0]||document;
const general=['title','subtitle','categoryId','targetMinutes','layout','scheduledAt','reminders','pinned','deleted','deletedAt'];
export const generalValue=(document,key)=>['pinned','deleted'].includes(key)?!!document[key]:key==='deletedAt'&&!document.deleted?null:document[key]??null;
export function documentKey(document){
 return serialize({type:document.type||'speech',general:Object.fromEntries(general.map(key=>[key,generalValue(document,key)])),active:{id:document.activeVersionId,key:versionKey(activeVersion(document))},versions:(document.versions||[]).map(v=>({id:v.id,source:v.driveSourceId||null,key:versionKey(v)})).sort((a,b)=>a.id.localeCompare(b.id))});
}
function historyKey(history){return serialize((history||[]).map(entry=>{const value={...entry,delta:normalizedDelta(entry.delta),presenterNotes:notes(entry.presenterNotes)};delete value.versionId;delete value.updatedAt;return value;}));}
function rehearsalKey(rehearsals){return serialize((rehearsals||[]).map(entry=>{const value={...entry};delete value.versionId;return value;}));}
export function restoreKey(state){
 return serialize({documents:state.speeches.map(document=>({id:document.id,content:documentKey(document),versions:document.versions.map(version=>({key:versionKey(version),history:historyKey(version.history),rehearsals:rehearsalKey(version.rehearsals),memorization:version.memorization,teleprompter:version.teleprompter})).sort((a,b)=>serialize(a).localeCompare(serialize(b)))})).sort((a,b)=>a.id.localeCompare(b.id)),categories:state.categories,vocabulary:[...(state.vocabulary||[])].sort(),settings:state.settings});
}
export function contentDifferences(local,remote){
 const left=activeVersion(local),right=activeVersion(remote),fields=[];
 const text=value=>(value.delta?.ops||[]).map(op=>typeof op.insert==='string'?op.insert:serialize(op.insert)).join('');
 if(text(left)!==text(right))fields.push('Texto');
 else if(serialize(normalizedDelta(left.delta))!==serialize(normalizedDelta(right.delta)))fields.push('Formatação');
 if(serialize(notes(left.presenterNotes))!==serialize(notes(right.presenterNotes)))fields.push('Anotações privadas');
 if(serialize(left.participants)!==serialize(right.participants))fields.push('Participantes');
 for(const [key,label] of [['title','Título'],['subtitle','Subtítulo'],['categoryId','Categoria'],['targetMinutes','Duração prevista'],['scheduledAt','Agenda'],['reminders','Lembretes'],['pinned','Fixação'],['deleted','Lixeira']])if(serialize(generalValue(local,key))!==serialize(generalValue(remote,key)))fields.push(label);
 if(versionKey(left)!==versionKey(right)&&versionBody(left)===versionBody(right))fields.push('Versão ativa');
 if(serialize(local.versions.map(version=>version.name).sort())!==serialize(remote.versions.map(version=>version.name).sort()))fields.push('Versões');
 else if(serialize(local.versions.filter(version=>version.id!==local.activeVersionId).map(versionKey).sort())!==serialize(remote.versions.filter(version=>version.id!==remote.activeVersionId).map(versionKey).sort()))fields.push('Outras versões');
 return {fields:[...new Set(fields)],localPreview:text(left).slice(0,280),cloudPreview:text(right).slice(0,280)};
}
function splitDeltaParagraphs(delta){
 const ops=normalizedDelta(delta).ops,paragraphs=[];
 let current=[];
 const flush=()=>{const norm=normalizedDelta({ops:current}).ops;paragraphs.push({ops:norm,key:serialize(norm)});current=[];};
 for(const op of ops){
  if(typeof op.insert!=='string'||!op.insert.includes('\n')){current.push(op);continue;}
  const parts=op.insert.split('\n');
  for(let i=0;i<parts.length;i++){
   if(parts[i])current.push({insert:parts[i],...(op.attributes?{attributes:op.attributes}:{})});
   if(i<parts.length-1){current.push({insert:'\n',...(op.attributes?{attributes:op.attributes}:{})});flush();}
  }
 }
 if(current.length)flush();
 return paragraphs;
}
function uniqueAnchors(bSlice,tSlice,bOff,tOff){
 const count=rows=>{const m=new Map();rows.forEach((r,i)=>m.set(r.key,(m.get(r.key)||0)+1));return m;};
 const cB=count(bSlice),cT=count(tSlice),posT=new Map();
 tSlice.forEach((r,i)=>{if(cT.get(r.key)===1&&cB.get(r.key)===1)posT.set(r.key,i);});
 const pairs=[];
 bSlice.forEach((r,i)=>{if(cB.get(r.key)===1&&posT.has(r.key))pairs.push({b:bOff+i,t:tOff+posT.get(r.key)});});
 if(!pairs.length)return [];
 const tails=[],prev=new Array(pairs.length).fill(-1);
 for(let i=0;i<pairs.length;i++){
  const val=pairs[i].t;let lo=0,hi=tails.length;
  while(lo<hi){const mid=(lo+hi)>>1;if(pairs[tails[mid]].t<val)lo=mid+1;else hi=mid;}
  if(lo>0)prev[i]=tails[lo-1];
  tails[lo]=i;
 }
 const out=[];for(let k=tails.at(-1);k>=0;k=prev[k])out.push(pairs[k]);
 return out.reverse();
}
function dpLcs(bSlice,tSlice,bOff,tOff){
 const m=bSlice.length,n=tSlice.length;
 if(!m||!n||m*n>40000)return [];
 const dp=Array.from({length:m+1},()=>new Int32Array(n+1));
 for(let i=m-1;i>=0;i--)for(let j=n-1;j>=0;j--)dp[i][j]=bSlice[i].key===tSlice[j].key?1+dp[i+1][j+1]:Math.max(dp[i+1][j],dp[i][j+1]);
 const matches=[];let i=0,j=0;
 while(i<m&&j<n){
  if(bSlice[i].key===tSlice[j].key){matches.push({b:bOff+i,t:tOff+j});i++;j++;}
  else if(dp[i+1][j]>=dp[i][j+1])i++;
  else j++;
 }
 return matches;
}
function computeHunks(bP,tP){
 let prefix=0;while(prefix<bP.length&&prefix<tP.length&&bP[prefix].key===tP[prefix].key)prefix++;
 let suffix=0;while(prefix+suffix<bP.length&&prefix+suffix<tP.length&&bP[bP.length-1-suffix].key===tP[tP.length-1-suffix].key)suffix++;
 const matches=[];
 for(let i=0;i<prefix;i++)matches.push({b:i,t:i});
 const bEnd=bP.length-suffix,tEnd=tP.length-suffix;
 if(prefix<bEnd||prefix<tEnd){
  const anchors=uniqueAnchors(bP.slice(prefix,bEnd),tP.slice(prefix,tEnd),prefix,prefix);
  const bounds=[{b:prefix-1,t:prefix-1},...anchors,{b:bEnd,t:tEnd}];
  for(let k=0;k<bounds.length-1;k++){
   const b0=bounds[k].b+1,b1=bounds[k+1].b,t0=bounds[k].t+1,t1=bounds[k+1].t;
   matches.push(...dpLcs(bP.slice(b0,b1),tP.slice(t0,t1),b0,t0));
   if(k<bounds.length-2)matches.push(bounds[k+1]);
  }
 }
 for(let i=suffix;i>0;i--)matches.push({b:bP.length-i,t:tP.length-i});
 const hunks=[];let bPos=0,tPos=0;
 for(const match of [...matches,{b:bP.length,t:tP.length}]){
  if(bPos<match.b||tPos<match.t)hunks.push({b0:bPos,b1:match.b,t0:tPos,t1:match.t});
  bPos=match.b+1;tPos=match.t+1;
 }
 return hunks;
}
export function mergeDeltaParagraphs(baseDelta,localDelta,remoteDelta){
 const B=normalizedDelta(baseDelta),L=normalizedDelta(localDelta),R=normalizedDelta(remoteDelta);
 if(serialize(L)===serialize(R))return L;
 if(serialize(L)===serialize(B))return R;
 if(serialize(R)===serialize(B))return L;
 const bP=splitDeltaParagraphs(B),lP=splitDeltaParagraphs(L),rP=splitDeltaParagraphs(R);
 // Keep single-paragraph conflicts explicit unless changes are identical.
 if(bP.length<2)return null;
 const hunksL=computeHunks(bP,lP),hunksR=computeHunks(bP,rP);
 const merged=[];let i=0,j=0,bPos=0;
 const segKey=(rows,h)=>serialize(rows.slice(h.t0,h.t1).map(p=>p.key));
 while(i<hunksL.length||j<hunksR.length){
  const hL=hunksL[i],hR=hunksR[j];
  if(!hR){for(let k=bPos;k<hL.b0;k++)merged.push(bP[k]);merged.push(...lP.slice(hL.t0,hL.t1));bPos=hL.b1;i++;continue;}
  if(!hL){for(let k=bPos;k<hR.b0;k++)merged.push(bP[k]);merged.push(...rP.slice(hR.t0,hR.t1));bPos=hR.b1;j++;continue;}
  if(hL.b0===hR.b0&&hL.b1===hR.b1&&segKey(lP,hL)===segKey(rP,hR)){
   for(let k=bPos;k<hL.b0;k++)merged.push(bP[k]);merged.push(...lP.slice(hL.t0,hL.t1));bPos=hL.b1;i++;j++;continue;
  }
  const bothIns=hL.b0===hL.b1&&hR.b0===hR.b1&&hL.b0===hR.b0;
  const nonEmptyOverlap=Math.max(hL.b0,hR.b0)<Math.min(hL.b1,hR.b1);
  const insInside=(hL.b0===hL.b1&&hL.b0>hR.b0&&hL.b0<hR.b1)||(hR.b0===hR.b1&&hR.b0>hL.b0&&hR.b0<hL.b1);
  if(bothIns||nonEmptyOverlap||insInside)return null;
  if(hL.b1<hR.b0||(hL.b1===hR.b0&&!(hR.b0===hR.b1&&hL.b0!==hL.b1))||(hL.b0===hL.b1&&hL.b0===hR.b0)){
   for(let k=bPos;k<hL.b0;k++)merged.push(bP[k]);merged.push(...lP.slice(hL.t0,hL.t1));bPos=hL.b1;i++;continue;
  }
  for(let k=bPos;k<hR.b0;k++)merged.push(bP[k]);merged.push(...rP.slice(hR.t0,hR.t1));bPos=hR.b1;j++;
 }
 for(let k=bPos;k<bP.length;k++)merged.push(bP[k]);
 return normalizedDelta({ops:merged.flatMap(p=>p.ops)});
}
function noteKey(note){return serialize(Object.fromEntries(Object.entries(note).filter(([key])=>!['createdAt','updatedAt'].includes(key))));}
export function mergePresenterNotes(baseNotes=[],localNotes=[],remoteNotes=[],mergedDelta=null){
 const map=rows=>{const m=new Map();for(const n of rows||[])if(n?.id)m.set(n.id,n);return m;};
 const bM=map(baseNotes),lM=map(localNotes),rM=map(remoteNotes);
 const referenced=new Set();
 for(const op of mergedDelta?.ops||[])if(op.attributes?.['presenter-note'])referenced.add(op.attributes['presenter-note']);
 const result=[],seen=new Set();
 const decide=id=>{
  const b=bM.get(id),l=lM.get(id),r=rM.get(id);
  if(!b){
   if(l&&!r)return l;if(!l&&r)return r;
   if(noteKey(l)===noteKey(r))return (r.updatedAt||0)>(l.updatedAt||0)?r:l;
   return undefined;
  }
  const bK=noteKey(b),lK=l?noteKey(l):null,rK=r?noteKey(r):null;
  if(!l&&!r)return null;
  if(!l){if(rK!==bK||referenced.has(id))return undefined;return null;}
  if(!r){if(lK!==bK||referenced.has(id))return undefined;return null;}
  if(lK===rK)return (r.updatedAt||0)>(l.updatedAt||0)?r:l;
  if(lK===bK)return r;
  if(rK===bK)return l;
  return undefined;
 };
 for(const list of [localNotes||[],remoteNotes||[]])for(const n of list){
  if(!n?.id||seen.has(n.id))continue;seen.add(n.id);
  const chosen=decide(n.id);if(chosen===undefined)return null;
  if(chosen)result.push(JSON.parse(JSON.stringify(chosen)));
 }
 return result;
}
// Merge independent fields only with an actual common snapshot. Concurrent
// edits of overlapping text, version structure or deletion still require a choice.
export function mergeIndependent(base,local,remote){
 if(!base?.versions||!local.versions||!remote.versions)return null;
 const structure=value=>serialize({active:value.activeVersionId,versions:value.versions.map(version=>({id:version.id,name:version.name}))});
 if(structure(base)!==structure(local)||structure(base)!==structure(remote))return null;
 const inactive=value=>serialize(value.versions.filter(version=>version.id!==value.activeVersionId).map(versionKey));
 if(inactive(base)!==inactive(local)||inactive(base)!==inactive(remote))return null;
 const values=document=>Object.fromEntries([...general.map(key=>[key,serialize(generalValue(document,key))]),['content',versionBody(activeVersion(document))],['records',serialize(document.versions.map(v=>({id:v.id,history:historyKey(v.history),rehearsals:rehearsalKey(v.rehearsals)})))]]);
 const original=values(base),here=values(local),there=values(remote),changedHere=Object.keys(here).filter(key=>here[key]!==original[key]),changedThere=Object.keys(there).filter(key=>there[key]!==original[key]);
 if((changedHere.includes('deleted')&&changedThere.length)||(changedThere.includes('deleted')&&changedHere.length))return null;
 if(changedHere.some(key=>key!=='content'&&changedThere.includes(key)&&here[key]!==there[key]))return null;
 const result=JSON.parse(JSON.stringify(remote));
 for(const key of general)if(changedHere.includes(key)){if(key in local)result[key]=JSON.parse(JSON.stringify(local[key]));else delete result[key];}
 if(changedHere.includes('content')&&!changedThere.includes('content')){
  const active=activeVersion(local),index=result.versions.findIndex(version=>version.id===active.id);result.versions[index]=JSON.parse(JSON.stringify(active));
 }else if(changedHere.includes('content')&&changedThere.includes('content')&&here.content!==there.content){
  const aB=activeVersion(base),aL=activeVersion(local),aR=activeVersion(remote);
  const pick=(bV,lV,rV)=>{const bk=serialize(bV),lk=serialize(lV),rk=serialize(rV);if(lk===rk)return {ok:true,val:lV};if(lk===bk)return {ok:true,val:rV};if(rk===bk)return {ok:true,val:lV};return {ok:false};};
  const part=pick(aB.participants,aL.participants,aR.participants),fmt=pick(aB.partFormat,aL.partFormat,aR.partFormat);
  if(!part.ok||!fmt.ok)return null;
  const mergedDelta=mergeDeltaParagraphs(aB.delta,aL.delta,aR.delta);if(!mergedDelta)return null;
  const mergedNotes=mergePresenterNotes(aB.presenterNotes,aL.presenterNotes,aR.presenterNotes,mergedDelta);if(!mergedNotes)return null;
  const index=result.versions.findIndex(version=>version.id===aL.id);if(index<0)return null;
  const targetVersion=result.versions[index];
  targetVersion.delta=JSON.parse(JSON.stringify(mergedDelta));
  targetVersion.presenterNotes=JSON.parse(JSON.stringify(mergedNotes));
  if(part.val!==undefined)targetVersion.participants=JSON.parse(JSON.stringify(part.val));
  if(fmt.val!==undefined)targetVersion.partFormat=JSON.parse(JSON.stringify(fmt.val));
  targetVersion.updatedAt=Math.max(Number(aL.updatedAt)||0,Number(aR.updatedAt)||0,Number(targetVersion.updatedAt)||0);
  result.delta=JSON.parse(JSON.stringify(mergedDelta));
  result.presenterNotes=JSON.parse(JSON.stringify(mergedNotes));
  if(part.val!==undefined)result.participants=JSON.parse(JSON.stringify(part.val));
  if(fmt.val!==undefined)result.partFormat=JSON.parse(JSON.stringify(fmt.val));
  result.updatedAt=Math.max(Number(local.updatedAt)||0,Number(remote.updatedAt)||0,Number(result.updatedAt)||0);
 }
 for(const version of result.versions){const source=(changedHere.includes('records')?local:remote).versions.find(v=>v.id===version.id);if(source){version.history=JSON.parse(JSON.stringify(source.history));version.rehearsals=JSON.parse(JSON.stringify(source.rehearsals));}}
 return mergeDocumentTeleprompter(remote,mergeDocumentMemorization(remote,mergeDocumentTeleprompter(local,mergeDocumentMemorization(local,result))));
}
