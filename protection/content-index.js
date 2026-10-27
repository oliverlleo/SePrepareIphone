import {protectedGlobals} from './sync-globals.js';
import {normalizedDelta} from './drive-compare.js';

export const CONTENT_SIGNATURE_FORMAT=3;
const localSettings=new Set(['theme','language','rate','voice','audioLanguage','audioLocale','audioVoice','onlineReview','reviewEndpoint']);
const projectionKeys=['delta','presenterNotes','participants','partFormat'];
const runtimeKeys=new Set(['timer','updatedAt','revision','contentKey','read','myParticipantId']);
const quote=value=>'"'+[...String(value)].map(c=>{const n=c.charCodeAt(0);return c==='"'||c==='\\'?'\\'+c:n<32||c.length===1&&n>=0xd800&&n<=0xdfff?'\\u'+n.toString(16).padStart(4,'0'):c;}).join('')+'"';
// This canonical representation is identical to native DriveContent, including
// IEEE-754 numbers, Unicode and Quill's semantically irrelevant block splitting.
export function canonicalContent(value){
 if(value===null||value===undefined)return 'null';
 if(Array.isArray(value))return '['+value.map(canonicalContent).join(',')+']';
 if(typeof value==='object'){
  if(Array.isArray(value.ops))value={...value,ops:normalizedDelta(value).ops};
  return '{'+Object.keys(value).filter(k=>value[k]!==undefined&&!(k==='timer'||k==='updatedAt'||k==='read'||k==='myParticipantId'||value.delta&&['revision','contentKey'].includes(k))&&!(['deleted','pinned'].includes(k)&&value[k]===false)&&!(k==='deletedAt'&&!value.deleted)).sort().map(k=>quote(k)+':'+canonicalContent(value[k])).join(',')+'}';
 }
 if(typeof value==='number'){if(!Number.isFinite(value))throw Error('Número inválido no backup.');const d=new DataView(new ArrayBuffer(8));d.setFloat64(0,value===0?0:value,false);return 'd'+d.getUint32(0).toString(16).padStart(8,'0')+d.getUint32(4).toString(16).padStart(8,'0');}
 return typeof value==='boolean'?String(value):quote(value);
}
export async function contentSHA(text){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}

// The cache is keyed by exact source bytes, never by a revision clock or a weak
// checksum. External backup hashes are never accepted as evidence. Bounded LRU
// entries retain recent revisions so undo can reuse the previous real SHA-256.
export function createContentIndex({maxBytes=32*1024*1024,onMetrics=()=>{}}={}){
 const cache=new Map();let bytes=0,hashes=0,hits=0,parsedVersions=0,lastMetrics=null,lastSnapshot=null;
 const measure=()=>({hashes,hits,parsedVersions,cacheBytes:bytes});
 function get(key,source){const rows=cache.get(key);const entry=rows?.find(e=>e.source===source);if(!entry)return null;cache.delete(key);cache.set(key,rows);hits++;return entry.value;}
 function put(key,source,value){const rows=cache.get(key)||[],entry={source,value,bytes:source.length*2+JSON.stringify(value).length*2+80};if(entry.bytes>maxBytes)return value;
  while(rows.length>=3)bytes-=rows.shift().bytes;rows.push(entry);bytes+=entry.bytes;cache.delete(key);cache.set(key,rows);
  while(bytes>maxBytes&&cache.size){const first=cache.keys().next().value;for(const row of cache.get(first))bytes-=row.bytes;cache.delete(first);}return value;
 }
 async function digest(kind,value,identity=''){const source=canonicalContent(value),key='sha:'+kind+':'+identity,found=get(key,source);if(found!==null)return found;hashes++;return put(key,source,await contentSHA(kind+'\n'+source));}
 async function version(raw,namespace){const found=get('version:'+namespace,raw);if(found)return found;parsedVersions++;const v=JSON.parse(raw),content=Object.fromEntries(projectionKeys.filter(k=>k in v).map(k=>[k,v[k]]));
  const contentHash=await digest('content',content,namespace),records=await digest('records',{history:v.history||[],rehearsals:v.rehearsals||[]},namespace);
  const meta=Object.fromEntries(Object.entries(v).filter(([k])=>!projectionKeys.includes(k)&&!['history','rehearsals'].includes(k)&&!runtimeKeys.has(k)));
  const hash=await digest('version',{...meta,contentHash,records},namespace);return put('version:'+namespace,raw,{id:v.id,hash,contentHash,records});
 }
 async function document(raw,namespace){const found=get('document:'+namespace,raw);if(found)return found;
  const fields=objectFields(raw),id=JSON.parse(fields.id||'""'),versions=[],rawVersions=fields.versions?arrayValues(fields.versions):[];
  for(let i=0;i<rawVersions.length;i++){const vf=objectFields(rawVersions[i]),vid=JSON.parse(vf.id||'""');versions.push(await version(rawVersions[i],namespace+'/'+vid));}
  const projection={};for(const k of projectionKeys)if(fields[k])projection[k]=JSON.parse(fields[k]);
  const projectionHash=await digest('content',projection,namespace+'/projection'),records=await digest('records',{history:JSON.parse(fields.history||'[]'),rehearsals:JSON.parse(fields.rehearsals||'[]')},namespace);
  const meta={};for(const[k,v]of Object.entries(fields))if(!projectionKeys.includes(k)&&!runtimeKeys.has(k)&&!['versions','history','rehearsals'].includes(k))meta[k]=JSON.parse(v);
  const hash=await digest('document',{...meta,projectionHash,records,versions:versions.map(v=>({id:v.id,hash:v.hash}))},namespace);
  return put('document:'+namespace,raw,{id,hash,versions,categoryId:meta.categoryId||''});
 }
 async function update(input){
  const start=performance.now(),before=measure(),raw=typeof input==='string'?input:JSON.stringify(input);
  if(lastSnapshot?.raw===raw){lastMetrics={hashes:0,hits:1,parsedVersions:0,cacheBytes:bytes,elapsedMs:performance.now()-start};onMetrics(lastMetrics);return {...lastSnapshot.result,metrics:lastMetrics};}
  const root=objectFields(raw);
  if(JSON.parse(root.schema||'null')!==1||!root.speeches||!root.categories)throw Error('Este arquivo não é um backup compatível do SePrepare.');
  const documentRows=[],documents=Object.create(null),syncDocuments=Object.create(null),versions=Object.create(null),categoryRows=[],categories=Object.create(null),drafts=new Map();
  for(const source of arrayValues(root.speeches)){const fields=objectFields(source),id=JSON.parse(fields.id||'""');if(!id||syncDocuments[id])throw Error('Identificador de preparação inválido.');const row=await document(source,'speech/'+id);documentRows.push(row);syncDocuments[id]=row.hash;versions[id]=Object.fromEntries(row.versions.map(v=>[v.id,{hash:v.hash,contentHash:v.contentHash}]));}
  for(const source of arrayValues(root.categories)){const row=JSON.parse(source);if(!row.id||categories[row.id])throw Error('Categoria inválida.');const hash=await digest('category',row,row.id);categories[row.id]=hash;categoryRows.push({id:row.id,hash});}
  for(const source of arrayValues(root.editorDrafts||'[]')){const f=objectFields(source),id=JSON.parse(f.speechId||'""');if(!id||!f.document)throw Error('Rascunho inválido.');const row=await document(f.document,'draft/'+id);const meta=Object.fromEntries(Object.entries(f).filter(([k])=>k!=='document'&&!['savedAt','updatedAt'].includes(k)).map(([k,v])=>[k,JSON.parse(v)]));drafts.set(id,{hash:await digest('draft',{...meta,documentHash:row.hash},id),categoryId:row.categoryId});}
  for(const row of documentRows){const draft=drafts.get(row.id);documents[row.id]=await digest('card',{document:row.hash,category:categories[row.categoryId]||null,draft:draft?.hash||null,draftCategory:categories[draft?.categoryId]||null},row.id);}
  const settings=JSON.parse(root.settings||'{}');for(const key of localSettings)delete settings[key];
  const deletionRows=JSON.parse(root.deletionTombstones||'[]');if(!Array.isArray(deletionRows))throw Error('Registro de exclusões inválido.');
  const seenDeleted=new Set(),deletions=deletionRows.map(row=>{if(!row||typeof row.id!=='string'||!row.id||seenDeleted.has(row.id)||syncDocuments[row.id]||!/^[a-f0-9]{64}$/.test(row.deletedHash||''))throw Error('Registro de exclusões conflitante.');seenDeleted.add(row.id);return {id:row.id,hashes:[...new Set([row.deletedHash,row.baseHash,...(row.knownHashes||[])].filter(Boolean))].sort()};}).sort(byId);
  const rest={};for(const[k,v]of Object.entries(root))if(!['speeches','categories','settings','vocabulary','editorDrafts','contentVersion','deletionTombstones'].includes(k))rest[k]=JSON.parse(v);
  const stateHash=await digest('state',{format:CONTENT_SIGNATURE_FORMAT,...rest,deletions,documents:documentRows.map(r=>({id:r.id,hash:r.hash})).sort(byId),categories:categoryRows.sort(byId),drafts:[...drafts].map(([id,row])=>({id,hash:row.hash})).sort(byId),settings,vocabulary:JSON.parse(root.vocabulary||'[]').sort()});
  const globals=Object.create(null);for(const[key,value]of Object.entries(protectedGlobals({...rest,settings,vocabulary:JSON.parse(root.vocabulary||'[]')})))globals[key]=await digest('global',value,key);
  lastMetrics={hashes:hashes-before.hashes,hits:hits-before.hits,parsedVersions:parsedVersions-before.parsedVersions,cacheBytes:bytes,elapsedMs:performance.now()-start};onMetrics(lastMetrics);
  const result={globals,format:CONTENT_SIGNATURE_FORMAT,legacy:documentRows.some(row=>!row.versions.length),hasProtectedData:!!(documentRows.length||deletionRows.length||drafts.size),stateHash,documents,syncDocuments,categories,versions,drafts:Object.fromEntries([...drafts].map(([id,row])=>[id,row.hash])),metrics:lastMetrics};lastSnapshot={raw,result};return result;
 }
 async function exportCache(){const body={format:CONTENT_SIGNATURE_FORMAT,entries:[...cache].map(([key,rows])=>[key,rows.map(({source,value})=>({source,value}))])};return {body,seal:await contentSHA(JSON.stringify(body))};}
 async function importCache(envelope){try{if(envelope?.body?.format!==CONTENT_SIGNATURE_FORMAT||await contentSHA(JSON.stringify(envelope.body))!==envelope.seal)return false;const body=envelope.body;if(!Array.isArray(body.entries))return false;const staged=[];let size=0;for(const[key,rows]of body.entries){if(typeof key!=='string'||!Array.isArray(rows)||rows.length>3)return false;for(const row of rows){if(typeof row.source!=='string')return false;size+=row.source.length*2+JSON.stringify(row.value).length*2+80;staged.push([key,row.source,row.value]);}}if(size>maxBytes)return false;cache.clear();bytes=0;for(const row of staged)put(...row);return true;}catch{return false;}}
 return {update,exportCache,importCache,metrics:()=>lastMetrics,clear(){cache.clear();bytes=0;lastSnapshot=null;}};
}
const byId=(a,b)=>a.id<b.id?-1:a.id>b.id?1:0;

// Read only JSON boundaries: unchanged documents and versions are not parsed or
// normalized again. Escapes and nested arrays/objects are handled explicitly.
function skip(text,at){while(/\s/.test(text[at]||'')&&at<text.length)at++;return at;}
function stringEnd(text,at){const string=/"(?:[^"\\]|\\.)*"/y;string.lastIndex=at;if(!string.test(text))throw Error('JSON incompleto.');return string.lastIndex;}
function valueEnd(text,at){at=skip(text,at);if(text[at]==='"')return stringEnd(text,at);if(text[at]==='{'||text[at]==='['){const stack=[text[at]],pairs={'}':'{',']':'['},tokens=/"(?:[^"\\]|\\.)*"|[{}\[\]]/g;tokens.lastIndex=at+1;let token;while(token=tokens.exec(text)){const c=token[0];if(c[0]==='"')continue;if(c==='{'||c==='[')stack.push(c);else{if(stack.pop()!==pairs[c])throw Error('JSON inválido.');if(!stack.length)return tokens.lastIndex;}}throw Error('JSON incompleto.');}let end=at;while(end<text.length&&!/[\s,}\]]/.test(text[end]))end++;if(end===at)throw Error('JSON inválido.');JSON.parse(text.slice(at,end));return end;}
export function objectFields(raw){let at=skip(raw,0);if(raw[at++]!=='{')throw Error('Objeto JSON inválido.');const result=Object.create(null);at=skip(raw,at);if(raw[at]==='}'){if(skip(raw,at+1)!==raw.length)throw Error('JSON inválido.');return result;}for(;;){at=skip(raw,at);if(raw[at]!=='"')throw Error('Chave JSON inválida.');const end=stringEnd(raw,at),key=JSON.parse(raw.slice(at,end));if(Object.prototype.hasOwnProperty.call(result,key))throw Error('Chave JSON duplicada.');at=skip(raw,end);if(raw[at++]!==':')throw Error('JSON inválido.');at=skip(raw,at);const stop=valueEnd(raw,at);result[key]=raw.slice(at,stop);at=skip(raw,stop);if(raw[at]==='}'){if(skip(raw,at+1)!==raw.length)throw Error('JSON inválido.');return result;}if(raw[at++]!==',')throw Error('JSON inválido.');}}
export function arrayValues(raw){let at=skip(raw,0);if(raw[at++]!=='[')throw Error('Lista JSON inválida.');const result=[];at=skip(raw,at);if(raw[at]===']'){if(skip(raw,at+1)!==raw.length)throw Error('JSON inválido.');return result;}for(;;){const end=valueEnd(raw,at);result.push(raw.slice(at,end));at=skip(raw,end);if(raw[at]===']'){if(skip(raw,at+1)!==raw.length)throw Error('JSON inválido.');return result;}if(raw[at++]!==',')throw Error('JSON inválido.');at=skip(raw,at);}}
