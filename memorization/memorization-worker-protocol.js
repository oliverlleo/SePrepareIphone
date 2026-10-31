import{createContextProcessor}from'./memorization-context-worker.js';
// The encoder supplies evidence for concepts. It never generates invented prose.
export function installMemorizationProtocol(model,options={}){
 const legacy=self.onmessage,cancelled=new Set();let queue=Promise.resolve();
 const context=createContextProcessor(model,options);
 self.onmessage=event=>{
  const p=event.data||{};if(p.type==='memorization-cancel'){cancelled.add(p.token);return;}
  if(p.type==='memorization-context'){queue=queue.catch(()=>{}).then(async()=>{try{if(p.protocol!==2)throw Error('Invalid context protocol');const result=await context(p.parsed,{token:p.token,cancelled:()=>cancelled.has(p.token),progress:(label,value)=>{if(!cancelled.has(p.token))self.postMessage({type:'memorization-progress',token:p.token,label,value});}});if(!cancelled.has(p.token))self.postMessage({type:'memorization-context-result',protocol:2,token:p.token,result});}catch(error){if(!cancelled.has(p.token))self.postMessage({type:'memorization-context-error',protocol:2,token:p.token,message:error.message==='MEMORIZATION_CANCELLED'?'MEMORIZATION_CANCELLED':'Contextual analysis unavailable'});}finally{cancelled.delete(p.token);}});return;}
  if(p.type!=='memorization-embeddings'){legacy?.(event);return;}
  queue=queue.catch(()=>{}).then(async()=>{try{
   if(p.protocol!==1||!Array.isArray(p.inputs)||p.inputs.length>128||p.inputs.some(s=>typeof s!=='string'||s.length>12000))throw Error('Invalid memorization embedding input');
   const extractor=await model(p.token),vectors=[];
   for(const input of p.inputs){if(cancelled.has(p.token))return;
    const windows=[];const split=text=>{if(extractor.tokenizer.encode(text).length<=128){windows.push(text);return;}if(text.length<4)throw Error('Invalid model window');let at=Math.floor(text.length/2),space=text.lastIndexOf(' ',at);if(space>at/2)at=space;split(text.slice(0,at));split(text.slice(at));};split(input);
    let sum=null,weight=0;
    for(const chunk of windows){if(cancelled.has(p.token))return;const tensor=await extractor([chunk],{pooling:'mean',normalize:true});try{const vector=tensor.tolist()[0];if(vector.length!==384||vector.some(v=>!Number.isFinite(v)))throw Error('Invalid MiniLM vector');sum||=new Array(384).fill(0);for(let j=0;j<384;j++)sum[j]+=vector[j]*chunk.length;weight+=chunk.length;}finally{tensor.dispose?.();}}
    const norm=Math.hypot(...sum);vectors.push(sum.map(v=>norm?v/norm:0));await new Promise(r=>setTimeout(r,0));
   }
   if(!cancelled.has(p.token))self.postMessage({type:'memorization-result',protocol:1,token:p.token,vectors});
  }catch{if(!cancelled.has(p.token))self.postMessage({type:'memorization-error',protocol:1,token:p.token});}finally{cancelled.delete(p.token);}});
 };
}
