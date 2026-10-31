import{prepareContext,finishContext,ROLE_SEEDS,pooledSpan}from'./memorization-context.js';
import{modelWindows,center}from'./memorization-semantic-core.js';
import{memoryHash}from'./memorization-data.js';
import{tagContextWords,detectContextLanguage,contextWordFrequency,contextWordObliqueness}from'./memorization-pos.js';
export function createContextProcessor(model,{isVerb}={}){
 const atomsCache=new Map(),results=new Map();let roles;
 const save=(map,key,value,max)=>{map.delete(key);map.set(key,value);while(map.size>max)map.delete(map.keys().next().value);return value;};
 return async function process(parsed,{token,cancelled=()=>false,progress=()=>{}}={}){
  const check=()=>{if(cancelled())throw Error('MEMORIZATION_CANCELLED');};
  if(!parsed||typeof parsed.text!=='string'||parsed.text.length>600001||!Array.isArray(parsed.blocks)||parsed.blocks.length>20000||parsed.blocks.some(b=>!Number.isInteger(b.start)||!Number.isInteger(b.end)||b.start<0||b.end>b.start+parsed.text.length||b.end>parsed.text.length||b.end<=b.start||parsed.text.slice(b.start,b.end)!==b.text))throw Error('Invalid contextual source');
  const key=memoryHash(JSON.stringify([parsed.text,parsed.blocks.map(b=>[b.start,b.end,b.attrs.header,b.attrs.list,b.speakerId,b.turnStart])]))+':3';
  if(results.has(key))return{...results.get(key),cacheHit:true};
  const language=detectContextLanguage(parsed.text),prepared=prepareContext(parsed,{isVerb,tagWords:ws=>tagContextWords(ws,language),wordFrequency:w=>contextWordFrequency(w,language),wordObliqueness:w=>contextWordObliqueness(w,language)});check();progress('Identificando conteúdo e orientações',10);
  if(!prepared.atoms.some(a=>!a.reference&&a.candidates.length))return save(results,key,finishContext(prepared),3);
  // Missing optional model files must not trigger failed module/model requests offline.
  // Android assets use file: and remain locally available without Cache Storage.
  if(globalThis.navigator?.onLine===false&&globalThis.caches&&globalThis.location?.protocol!=='file:'){
   const resources=['ai/transformers.web.min.js','models/orador-minilm/config.json','models/orador-minilm/tokenizer.json'];
   for(const resource of resources){check();if(!await caches.match(new URL(resource,globalThis.location.href).href,{ignoreSearch:true}))return{...finishContext(prepared),provisionalReason:'offline-resources-unavailable'};}
  }
  const loading=setInterval(()=>progress('Carregando análise local',12),5000);let extractor;try{extractor=await model(token);}catch{check();return{...finishContext(prepared),provisionalReason:'encoder-unavailable'};}finally{clearInterval(loading);}const tokenCount=s=>extractor.tokenizer.encode(s).length;check();
  if(!roles){const groups={};for(const[kind,seeds]of Object.entries(ROLE_SEEDS)){const vectors=[];for(const s of seeds){check();const tensor=await extractor([s],{pooling:'mean',normalize:true});try{vectors.push(tensor.tolist()[0]);}finally{tensor.dispose?.();}await new Promise(r=>setTimeout(r,0));}groups[kind]={centroid:center(vectors),examples:vectors};}roles=groups;}
  const vectors=new Map(),candidateVectors=new Map();let inference=0,hits=0;
  const relevant=prepared.atoms.filter(a=>!a.reference&&a.candidates.length);
  for(let i=0;i<relevant.length;i++){
   check();const a=relevant[i],cacheKey=memoryHash(a.text+JSON.stringify(a.candidates.map(c=>[c.key,c.start-a.start,c.end-a.start])));let saved=atomsCache.get(cacheKey);
   if(saved)hits++;
   else{
    const parts=[],candidateParts=new Map();for(const window of modelWindows({text:a.text,offset:a.start},tokenCount,128)){
     check();const tensor=await extractor([window.text],{pooling:'none',normalize:false});inference++;
     try{
      const rows=tensor.tolist()[0],ids=extractor.tokenizer.encode(window.text);if(rows.length!==ids.length||rows.some(row=>row.length!==384||row.some(v=>!Number.isFinite(v))))throw Error('Invalid contextual MiniLM representation');
      parts.push(center(rows));
      for(const c of a.candidates){if(c.start<window.offset||c.end>window.offset+window.length)continue;const needle=extractor.tokenizer.encode(c.text,{add_special_tokens:false});if(!needle.length)continue;const vector=pooledSpan(rows,ids,needle);if(vector){if(!candidateParts.has(c.key))candidateParts.set(c.key,[]);candidateParts.get(c.key).push(vector);}}
     }finally{tensor.dispose?.();}
     await new Promise(r=>setTimeout(r,0));
    }
    saved=save(atomsCache,cacheKey,{vector:new Float32Array(center(parts)),concepts:new Map([...candidateParts].map(([k,vs])=>[k,new Float32Array(center(vs))]))},192);
   }
   vectors.set(a.start,saved.vector);for(const c of a.candidates){const v=saved.concepts.get(c.key);if(v)candidateVectors.set(c.start+':'+c.end,v);}
   progress('Comparando conceitos no contexto',20+Math.round((i+1)/Math.max(1,relevant.length)*65));
  }
  check();const result=finishContext(prepared,{vectors,candidateVectors,roleVectors:roles});result.metrics={atoms:prepared.atoms.length,inferenceWindows:inference,cachedAtoms:hits};check();return save(results,key,result,3);
 };
}
