import {REVIEW_PACKS} from './review-packs-manifest.js';
export const reviewLanguage=value=>['pt-BR','en','es','ja'].includes(value)?value:'pt-BR';
export const reviewLabel=code=>({'pt-BR':'Português (Brasil)',en:'English',es:'Español',ja:'日本語'}[reviewLanguage(code)]);
const result=request=>new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||Error('Falha de armazenamento.'));});
const done=tx=>new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('O armazenamento foi cancelado.'));tx.onerror=()=>{};});
export const packDigest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
export async function verifyPackFile(bytes,file){if(!(bytes instanceof ArrayBuffer)||bytes.byteLength!==file.bytes||await packDigest(bytes)!==file.sha256)throw Error('A integridade do pacote não pôde ser confirmada. Baixe novamente.');return bytes;}
export function createReviewPackStore({indexedDB=globalThis.indexedDB,fetch=globalThis.fetch,baseURL,notify=()=>{}}={}){
 let database,opening;const tasks=new Map();
 async function open(){if(database)return database;if(!indexedDB)throw Error('O armazenamento de dicionários não está disponível neste aparelho.');if(!opening)opening=new Promise((resolve,reject)=>{const req=indexedDB.open('seprepare-review-packs-v1',1);req.onupgradeneeded=()=>{for(const name of ['files','packs'])if(!req.result.objectStoreNames.contains(name))req.result.createObjectStore(name);};req.onsuccess=()=>{database=req.result;database.onversionchange=()=>{database.close();database=null;opening=null;};resolve(database);};req.onerror=()=>{opening=null;reject(req.error);};req.onblocked=()=>{opening=null;reject(Error('Feche outras abas do SePrepare para preparar o armazenamento de dicionários.'));};});return opening;}
 async function get(store,key){const db=await open();return result(db.transaction(store,'readonly').objectStore(store).get(key));}
 async function put(store,key,value){const db=await open(),tx=db.transaction(store,'readwrite'),complete=done(tx);tx.objectStore(store).put(value,key);await complete;}
 async function del(store,key){const db=await open(),tx=db.transaction(store,'readwrite'),complete=done(tx);tx.objectStore(store).delete(key);await complete;}
 async function installed(code){if(code==='pt-BR')return true;const pack=REVIEW_PACKS[code];if(!pack)return false;const meta=await get('packs',code);return meta?.version===pack.version;}
 async function read(code){const pack=REVIEW_PACKS[code];if(!pack||!await installed(code))throw Error('Baixe o pacote deste idioma antes de revisar.');const files={};try{for(const file of pack.files){const bytes=await get('files',file.sha256);await verifyPackFile(bytes,file);files[file.name]=bytes;}return files;}catch(error){await del('packs',code);notify({code,status:'missing'});throw error;}}
 async function download(file,code,signal,onBytes){
  let cached=await get('files',file.sha256);if(cached){try{await verifyPackFile(cached,file);onBytes(cached.byteLength);return;}catch{await del('files',file.sha256);}}
  if(signal.aborted)throw new DOMException('Download cancelado.','AbortError');
  let response;try{response=await fetch(new URL(file.path,baseURL),{signal,credentials:'omit',cache:'no-cache'});}catch(error){if(error.name==='AbortError')throw error;throw Error('Não foi possível baixar o pacote. Confira a conexão e tente novamente.');}if(!response.ok)throw Error('Não foi possível baixar o pacote. Confira a conexão e tente novamente.');
  let bytes;if(response.body?.getReader){const reader=response.body.getReader(),chunks=[];let length=0;try{for(;;){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>file.bytes)throw Error('O arquivo recebido não corresponde ao pacote.');chunks.push(part.value);onBytes(part.value.byteLength);}const merged=new Uint8Array(length);let at=0;for(const chunk of chunks){merged.set(chunk,at);at+=chunk.byteLength;}bytes=merged.buffer;}catch(error){void reader.cancel().catch(()=>{});throw error;}}
  else{bytes=await response.arrayBuffer();onBytes(bytes.byteLength);}
  await verifyPackFile(bytes,file);if(signal.aborted)throw new DOMException('Download cancelado.','AbortError');await put('files',file.sha256,bytes);
 }
 function install(code){
  if(code==='pt-BR')return Promise.resolve();if(tasks.has(code))return tasks.get(code).promise;const pack=REVIEW_PACKS[code];if(!pack)return Promise.reject(Error('Idioma inválido.'));
  const controller=new AbortController(),task={controller,loaded:0,total:pack.bytes,status:'downloading'};tasks.set(code,task);
  task.promise=(async()=>{notify({code,...task});try{for(const file of pack.files){await download(file,code,controller.signal,bytes=>{task.loaded+=bytes;notify({code,status:'downloading',loaded:task.loaded,total:task.total});});}if(controller.signal.aborted)throw new DOMException('Download cancelado.','AbortError');await put('packs',code,{version:pack.version,installedAt:Date.now()});notify({code,status:'installed'});}catch(error){notify({code,status:error.name==='AbortError'?'cancelled':'error',message:error.message});throw error;}finally{tasks.delete(code);}})();return task.promise;
 }
 function cancel(code){tasks.get(code)?.controller.abort();}
 async function remove(code){if(code==='pt-BR')return;cancel(code);try{await tasks.get(code)?.promise;}catch{}await del('packs',code);const db=await open(),tx=db.transaction(['packs','files'],'readwrite'),complete=done(tx),packs=tx.objectStore('packs'),files=tx.objectStore('files'),request=packs.getAllKeys();request.onsuccess=()=>{const used=new Set(request.result.flatMap(code=>REVIEW_PACKS[code]?.files.map(f=>f.sha256)||[])),candidates=new Set(REVIEW_PACKS[code]?.files.map(f=>f.sha256)||[]);for(const active of tasks.keys())for(const file of REVIEW_PACKS[active]?.files||[])used.add(file.sha256);const all=files.openCursor();all.onsuccess=()=>{const row=all.result;if(!row)return;if(candidates.has(row.key)&&!used.has(row.key))row.delete();row.continue();};};await complete;notify({code,status:'missing'});}
 return {installed,read,install,cancel,remove,progress:code=>tasks.get(code),close(){database?.close();database=null;opening=null;}};
}
