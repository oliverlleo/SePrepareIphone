// Private bodies stay in version data; rich text contains opaque anchors only.
export const NOTE_ATTRIBUTE='presenter-note';
const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(id);
export function noteIds(value){return typeof value==='string'?[...new Set(value.split(' ').filter(validId))].slice(0,30):[];}
export function normalizeNotes(value){
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>1000)throw Error('Lista de anotações inválida.');
 const seen=new Set(),timestamp=n=>Number.isFinite(Number(n))?Math.max(0,Number(n)):0;
 return value.map(note=>{
  if(!validId(note?.id)||seen.has(note.id)||typeof note.text!=='string'||!note.text.trim()||note.text.length>2000)throw Error('Anotação privada inválida.');
  seen.add(note.id);return {id:note.id,text:note.text,createdAt:timestamp(note.createdAt),updatedAt:timestamp(note.updatedAt),...(note.archived===true?{archived:true}:{})};
 });
}
export function noteRanges(delta){
 const found=new Map();let at=0;
 for(const op of delta?.ops||[]){
  const length=typeof op.insert==='string'?op.insert.length:1;
  if(typeof op.insert==='string')for(const id of noteIds(op.attributes?.[NOTE_ATTRIBUTE])){
   let ranges=found.get(id);if(!ranges)found.set(id,ranges=[]);
   const last=ranges.at(-1);if(last&&last.index+last.length===at)last.length+=length;else ranges.push({index:at,length});
  }
  at+=length;
 }
 return found;
}
export function visibleNotes(source){const ranges=noteRanges(source.delta);return (source.presenterNotes||[]).filter(note=>!note.archived||ranges.has(note.id)).map(note=>({...note,ranges:ranges.get(note.id)||[]}));}
export function withoutNoteAttributes(delta){return {ops:(delta?.ops||[]).map(op=>{
 const clean={...op};if(op.attributes){const attributes={...op.attributes};delete attributes[NOTE_ATTRIBUTE];if(Object.keys(attributes).length)clean.attributes=attributes;else delete clean.attributes;}return clean;
})};}
export function noteAnchorDelta(delta,range,id,remove=false){
 const result=[],start=range?.index||0,end=start+(range?.length||0);let at=0;
 const push=(op,insert,from)=>{
  const attributes={...op.attributes},ids=noteIds(attributes[NOTE_ATTRIBUTE]).filter(x=>x!==id);
  if(!remove&&from>=start&&from<end&&insert!=='\n')ids.push(id);
  if(ids.length)attributes[NOTE_ATTRIBUTE]=[...new Set(ids)].join(' ');else delete attributes[NOTE_ATTRIBUTE];
  result.push({insert,...(Object.keys(attributes).length?{attributes}:{})});
 };
 for(const op of delta?.ops||[]){
  const length=typeof op.insert==='string'?op.insert.length:1;
  if(typeof op.insert!=='string')result.push({...op});
  else{
   const points=[...new Set([0,length,Math.max(0,Math.min(length,start-at)),Math.max(0,Math.min(length,end-at)),...[...op.insert.matchAll(/\n/g)].flatMap(m=>[m.index,m.index+1])])].sort((a,b)=>a-b);
   for(let i=1;i<points.length;i++)if(points[i]>points[i-1])push(op,op.insert.slice(points[i-1],points[i]),at+points[i-1]);
  }
  at+=length;
 }
 return {ops:result};
}
