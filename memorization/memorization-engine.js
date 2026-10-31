import {getLocalSemanticWorker} from './semantic-service.js';
import {segmentMemoryIdeas,generateMemoryCards,segmentIdeaCards,generateIdeaCards} from './memorization-generator.js';
import {memoryId} from './memorization-data.js';
export function createMemorizationEngine(){
 let active=null;
 function cancel(){active?.();active=null;}
 async function generate(delta,{existing,t=s=>s,onProgress=()=>{},semantic=true,timeout=12000,ideas=false,demonstration=false}={}){
  cancel();let stopped=false,cancelWait;const token='memory-'+memoryId();active=()=>{stopped=true;cancelWait?.();};
  onProgress(t('Separando ideias'),10);await new Promise(r=>setTimeout(r,0));
  const segmented=ideas?segmentIdeaCards(delta,{demonstration}):segmentMemoryIdeas(delta),vectors=new Map();
  if(semantic&&segmented.units.length>1){
   onProgress(t('Comparando ideias no aparelho'),30);
   try{
    const worker=getLocalSemanticWorker(),step=Math.max(1,Math.ceil(segmented.units.length/128)),selected=segmented.units.filter((_,i)=>i%step===0).slice(0,128);
    const result=await new Promise(resolve=>{let timer;const finish=value=>{clearTimeout(timer);worker.removeEventListener('message',message);worker.removeEventListener('error',error);cancelWait=null;resolve(value);};const message=({data})=>{if(data.token===token&&data.type==='memorization-result')finish(data.vectors);else if(data.token===token&&data.type==='memorization-error')finish(null);};const error=()=>finish(null);cancelWait=()=>{worker.postMessage({type:'memorization-cancel',token});finish(null);};timer=setTimeout(cancelWait,timeout);worker.addEventListener('message',message);worker.addEventListener('error',error);worker.postMessage({type:'memorization-embeddings',protocol:1,token,inputs:selected.map(u=>u.text)});});
    if(result)selected.forEach((u,i)=>{if(Array.isArray(result[i])&&result[i].length===384)vectors.set(u.start,result[i]);});
   }catch{/* The deterministic, grounded engine works without the model. */}
  }
  if(stopped)throw Error('MEMORIZATION_CANCELLED');onProgress(t('Escolhendo cartões'),65);await new Promise(r=>setTimeout(r,0));
  const deck=ideas?generateIdeaCards(delta,{existing,demonstration,vectors}):generateMemoryCards(delta,{existing,t,vectors});if(stopped)throw Error('MEMORIZATION_CANCELLED');onProgress(t('Conferindo respostas'),95);active=null;
  return{deck,semantic:vectors.size>0};
 }
 return{generate,cancel};
}
