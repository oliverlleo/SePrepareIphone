import {clone,validState,uid,isPart,documentVersionsKey,pauseAllVersionTimers} from './core.js';
import {receiveRhythms} from '../rhythms/rhythm-core.js';
import {mergeImportedMetadata} from './import-metadata.js';

const snapshot=s=>({type:s.type||'speech',title:s.title,subtitle:s.subtitle,delta:s.delta,presenterNotes:s.presenterNotes||[],...(isPart(s)?{partFormat:2,participants:s.participants,myParticipantId:s.myParticipantId}:{})});

// Both sources remain untouched. Metadata/draft conflicts may add documents, so
// validation belongs after the complete merge, never just on the incoming file.
export function prepareFileBackup(local,incoming,{maxLength=Infinity,newId=uid}={}){
 const next=clone(local),data=validState(clone(incoming)),ids=new Map(),categories=new Map();
 for(const category of data.categories){
  const same=next.categories.find(item=>item.id===category.id);
  if(!same){next.categories.push(clone(category));categories.set(category.id,category.id);}
  else if(same.name===category.name)categories.set(category.id,category.id);
  else{const copy={...clone(category),id:newId()};next.categories.push(copy);categories.set(category.id,copy.id);}
 }
 for(const original of data.speeches){
  ids.set(original.id,original.id);const same=next.speeches.find(item=>item.id===original.id);
  if(same&&JSON.stringify(snapshot(same))===JSON.stringify(snapshot(original))&&documentVersionsKey(same)===documentVersionsKey(original))continue;
  const adopted=receiveRhythms(original,next.settings.rhythms||[],true,newId);next.settings.rhythms=adopted.catalog;
  const speech=adopted.content;if(same)speech.id=newId();ids.set(original.id,speech.id);
  speech.categoryId=categories.get(speech.categoryId)||'';pauseAllVersionTimers(speech);next.speeches.push(speech);
 }
 mergeImportedMetadata(next,data,ids,categories,newId);
 next.vocabulary=[...new Set([...next.vocabulary,...(data.vocabulary||[])])];
 if(next.vocabulary.length>5000)throw Error('O arquivo ultrapassa o limite de importação.');
 validState(next);
 if(JSON.stringify(next).length>maxLength)throw Error('O arquivo ultrapassa o limite de importação.');
 return {state:next,added:next.speeches.length-local.speeches.length};
}
