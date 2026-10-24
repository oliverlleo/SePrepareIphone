import {normalizedDelta} from './drive-compare.js';
// Shared semantic receipt format with native DriveContent. Do not normalize or mutate
// the state here: Android receives the exact persisted JSON, including editor drafts.
const omitted=(key,object)=>key==='timer'||key==='updatedAt'||
 (['deleted','pinned'].includes(key)&&object[key]===false)||
 (key==='deletedAt'&&!object.deleted)||
 (!!object.delta&&typeof object.delta==='object'&&!Array.isArray(object.delta)&&(key==='revision'||key==='contentKey'));
const quote=value=>'"'+[...String(value)].map(character=>{
 const code=character.charCodeAt(0);
 if(character==='"'||character==='\\')return '\\'+character;
 if(code<32||(character.length===1&&code>=0xd800&&code<=0xdfff))return '\\u'+code.toString(16).padStart(4,'0');
 return character;
}).join('')+'"';
function canonical(value){
 if(value===null||value===undefined)return 'null';
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(typeof value==='object'){
  if(Array.isArray(value.ops))value={...value,ops:normalizedDelta(value).ops};
  return '{'+Object.keys(value).filter(key=>!omitted(key,value)&&value[key]!==undefined).sort().map(key=>quote(key)+':'+canonical(value[key])).join(',')+'}';
 }
 if(typeof value==='number'){
  if(!Number.isFinite(value))throw Error('Número inválido no backup.');
  const bytes=new DataView(new ArrayBuffer(8));bytes.setFloat64(0,value===0?0:value,false);
  return 'd'+bytes.getUint32(0).toString(16).padStart(8,'0')+bytes.getUint32(4).toString(16).padStart(8,'0');
 }
 if(typeof value==='boolean')return String(value);
 return quote(value);
}
async function digest(value){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value)));
 return [...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
function parsed(raw){const state=typeof raw==='string'?JSON.parse(raw):raw;if(state?.schema!==1||!Array.isArray(state.speeches)||!Array.isArray(state.categories))throw Error('Este arquivo não é um backup compatível do SePrepare.');return state;}
export const backupStateHash=raw=>digest(parsed(raw));
export function backupDocumentHash(document,raw,lookup=null){
 const state=parsed(raw),draft=lookup?lookup.drafts.get(document.id)||null:(state.editorDrafts||[]).find(entry=>entry.speechId===document.id)||null;
 const category=id=>lookup?lookup.categories.get(id)||null:state.categories.find(entry=>entry.id===id)||null;
 return digest({document,category:category(document.categoryId),draft,draftCategory:draft?.document?category(draft.document.categoryId):null});
}
