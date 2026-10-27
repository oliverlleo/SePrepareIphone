import {createContentIndex} from './content-index.js';
import {createContentIndexCache} from './content-index-cache.js';
const engine=createContentIndex(),cache=createContentIndexCache();
const ready=cache.load().then(value=>value&&engine.importCache(value)).catch(()=>false);
let queue=Promise.resolve(),saveTimer=null;
self.onmessage=({data})=>{queue=queue.catch(()=>{}).then(async()=>{try{await ready;const result=await engine.update(data.raw);self.postMessage({id:data.id,result});if(result.metrics.hashes){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{void engine.exportCache().then(value=>cache.save(value)).catch(()=>{});},1200);}}catch(error){self.postMessage({id:data.id,error:error.message});}});};
