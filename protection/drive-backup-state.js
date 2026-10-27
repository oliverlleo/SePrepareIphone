import {createContentIndex,CONTENT_SIGNATURE_FORMAT} from './content-index.js';
import {createContentIndexCache} from './content-index-cache.js';
export {CONTENT_SIGNATURE_FORMAT};
let worker=null,workerFailed=false,nextId=0,fallback=null,cache=null,ready=null,saveTimer=null,lastMetrics=null;
const requests=new Map(),inFlight=new Map();
function stopWorker(){workerFailed=true;worker?.terminate();worker=null;for(const request of requests.values())(clearTimeout(request.timer),request.reject(Error('Índice local reiniciado.')));requests.clear();}
function getWorker(){if(workerFailed||typeof Worker==='undefined')return null;if(worker)return worker;try{worker=new Worker('content-index-worker.js');worker.onmessage=({data})=>{const request=requests.get(data.id);if(!request)return;requests.delete(data.id);clearTimeout(request.timer);if(data.error)request.reject(Error(data.error));else request.resolve(data.result);};worker.onerror=stopWorker;return worker;}catch{workerFailed=true;return null;}}
async function inProcess(raw){fallback||=createContentIndex();if(!ready){cache=createContentIndexCache();ready=cache.load().then(value=>value&&fallback.importCache(value)).catch(()=>false);}await ready;const result=await fallback.update(raw);if(result.metrics.hashes&&typeof window!=='undefined'){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{void fallback.exportCache().then(value=>cache.save(value)).catch(()=>{});},1200);}return result;}
export function backupContentIndex(input){const raw=typeof input==='string'?input:JSON.stringify(input);if(inFlight.has(raw))return inFlight.get(raw);const job=(async()=>{const w=getWorker();let result;if(w){const id=++nextId;try{result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{requests.delete(id);reject(Error('Índice local indisponível.'));},20000);requests.set(id,{resolve,reject,timer});w.postMessage({id,raw});});}catch{stopWorker();result=await inProcess(raw);}}else result=await inProcess(raw);lastMetrics=result.metrics;return result;})();inFlight.set(raw,job);void job.finally(()=>inFlight.delete(raw)).catch(()=>{});return job;}
export const backupStateHash=async input=>(await backupContentIndex(input)).stateHash;
export const backupDocumentHash=async(document,input)=>(await backupContentIndex(input)).documents[document.id];
export const backupHashMetrics=()=>lastMetrics;
