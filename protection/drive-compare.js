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
 return serialize({documents:state.speeches.map(document=>({id:document.id,content:documentKey(document),versions:document.versions.map(version=>({key:versionKey(version),history:historyKey(version.history),rehearsals:rehearsalKey(version.rehearsals)})).sort((a,b)=>serialize(a).localeCompare(serialize(b)))})).sort((a,b)=>a.id.localeCompare(b.id)),categories:state.categories,vocabulary:[...(state.vocabulary||[])].sort(),settings:state.settings});
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
// Merge independent fields only with an actual common snapshot. Concurrent
// edits of the same text, version structure or deletion still require a choice.
export function mergeIndependent(base,local,remote){
 if(!base?.versions||!local.versions||!remote.versions)return null;
 const structure=value=>serialize({active:value.activeVersionId,versions:value.versions.map(version=>({id:version.id,name:version.name}))});
 if(structure(base)!==structure(local)||structure(base)!==structure(remote))return null;
 const inactive=value=>serialize(value.versions.filter(version=>version.id!==value.activeVersionId).map(versionKey));
 if(inactive(base)!==inactive(local)||inactive(base)!==inactive(remote))return null;
 const values=document=>Object.fromEntries([...general.map(key=>[key,serialize(generalValue(document,key))]),['content',versionBody(activeVersion(document))],['records',serialize(document.versions.map(v=>({id:v.id,history:historyKey(v.history),rehearsals:rehearsalKey(v.rehearsals)})))]]);
 const original=values(base),here=values(local),there=values(remote),changedHere=Object.keys(here).filter(key=>here[key]!==original[key]),changedThere=Object.keys(there).filter(key=>there[key]!==original[key]);
 if((changedHere.includes('deleted')&&changedThere.length)||(changedThere.includes('deleted')&&changedHere.length))return null;
 if(changedHere.some(key=>changedThere.includes(key)&&here[key]!==there[key]))return null;
 const result=JSON.parse(JSON.stringify(remote));
 for(const key of general)if(changedHere.includes(key)){if(key in local)result[key]=JSON.parse(JSON.stringify(local[key]));else delete result[key];}
 if(changedHere.includes('content')&&!changedThere.includes('content')){
  const active=activeVersion(local),index=result.versions.findIndex(version=>version.id===active.id);result.versions[index]=JSON.parse(JSON.stringify(active));
 }
 for(const version of result.versions){const source=(changedHere.includes('records')?local:remote).versions.find(v=>v.id===version.id);if(source){version.history=JSON.parse(JSON.stringify(source.history));version.rehearsals=JSON.parse(JSON.stringify(source.rehearsals));}}
 return result;
}
