// Optional acceleration only. Notebook commits and recovery never depend on this
// database. Invalid, missing or quota-limited caches are rebuilt from real data.
export function createContentIndexCache(factory=globalThis.indexedDB){
 let dbPromise=null;
 const open=()=>dbPromise||=(new Promise((resolve,reject)=>{if(!factory)return resolve(null);const r=factory.open('seprepare-content-index-v3',1);r.onupgradeneeded=()=>r.result.createObjectStore('cache');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Cache ocupado.'));})).catch(()=>null);
 async function access(value){const db=await new Promise(resolve=>{const timer=setTimeout(()=>resolve(null),500);open().then(value=>{clearTimeout(timer);resolve(value);},()=>{clearTimeout(timer);resolve(null);});});if(!db)return null;return new Promise((resolve,reject)=>{const write=value!==undefined,tx=db.transaction('cache',write?'readwrite':'readonly'),store=tx.objectStore('cache'),request=write?store.put(value,'index'):store.get('index');let result=null;const timer=setTimeout(()=>resolve(null),500);request.onsuccess=()=>{result=request.result;};tx.oncomplete=()=>{clearTimeout(timer);resolve(write?true:result);};tx.onerror=()=>{clearTimeout(timer);reject(tx.error);};tx.onabort=()=>{clearTimeout(timer);reject(tx.error);};});}
 return {load:()=>access(),save:value=>access(value)};
}
