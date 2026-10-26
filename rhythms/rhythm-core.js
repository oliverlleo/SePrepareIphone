// Inline Quill metadata: self-contained so versions, clipboard and portable files
// retain the name and speed without relying on another device's catalog.
export const RHYTHM_ATTRIBUTE='speech-rhythm';
const idOK=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(id);
export function rhythmDefinition(value){
 if(!value||!idOK(value.id)||typeof value.name!=='string'||!value.name.trim()||value.name.trim().length>80||!Number.isSafeInteger(value.ppm)||value.ppm<=0)throw Error('Informe um nome e uma quantidade válida de palavras por minuto.');
 return {id:value.id,name:value.name.trim(),ppm:value.ppm,...(/^#[\da-f]{6}$/i.test(value.color||'')?{color:value.color.toLowerCase()}:{})};
}
const rhythmPalette=['#c2944f','#76977c','#718f9f','#b67e7b','#9782a8','#9a935f','#6c9a96','#ad855f','#8091bb','#ac7a95','#8f9e73','#b18b72'];
const rgbHex=(h,s,l)=>{const a=s*Math.min(l,1-l),f=n=>{const k=(n+h/30)%12;return Math.round(255*(l-a*Math.max(-1,Math.min(k-3,9-k,1)))).toString(16).padStart(2,'0');};return '#'+f(0)+f(8)+f(4);};
export function allocateRhythmColor(used,preferred=''){
 const taken=new Set([...used].map(color=>String(color).toLowerCase()));
 if(/^#[\da-f]{6}$/i.test(preferred)&&!taken.has(preferred.toLowerCase()))return preferred.toLowerCase();
 for(const color of rhythmPalette)if(!taken.has(color))return color;
 for(let i=Math.max(0,taken.size-rhythmPalette.length);;i++){
  const color=rgbHex((i*137.50776405+37)%360,.29+(i%19)*.008,.48+(Math.floor(i/19)%17)*.006);
  if(!taken.has(color))return color;
 }
}
export function assignRhythmColors(catalog,extra=[]){
 const colors=new Map(),taken=new Set();
 // Reserve established colors before filling older, uncolored records.
 for(const row of catalog)if(/^#[\da-f]{6}$/i.test(row.color||'')&&!taken.has(row.color.toLowerCase())){row.color=row.color.toLowerCase();colors.set(row.id,row.color);taken.add(row.color);}
 for(const row of catalog){if(!colors.has(row.id)){row.color=allocateRhythmColor(taken,row.color);colors.set(row.id,row.color);taken.add(row.color);}else row.color=colors.get(row.id);}
 for(const row of extra)if(!colors.has(row.id)){const color=allocateRhythmColor(taken,row.color);colors.set(row.id,color);taken.add(color);}
 return colors;
}
export function parseRhythm(value){try{if(typeof value!=='string'||value.length>1000)return null;return rhythmDefinition(JSON.parse(value));}catch{return null;}}
export const rhythmValue=value=>JSON.stringify(rhythmDefinition(value));
export function validateRhythmCatalog(value){
 if(value===undefined)return;
 if(!Array.isArray(value))throw Error('Lista de ritmos inválida.');const ids=new Set();
 for(const item of value){const row=rhythmDefinition(item);if(ids.has(row.id))throw Error('Ritmo duplicado.');ids.add(row.id);}
}
export function visitRhythmOps(source,callback){
 const seen=new WeakSet();function visit(value){if(!value||typeof value!=='object'||seen.has(value))return;seen.add(value);if(Array.isArray(value.ops)){for(const op of value.ops)callback(op);return;}for(const child of Object.values(value))visit(child);}visit(source);
}
export function usedRhythms(source){const found=new Map();visitRhythmOps(source,op=>{const row=parseRhythm(op.attributes?.[RHYTHM_ATTRIBUTE]);if(row)found.set(rhythmValue(row),row);});return [...found.values()];}
export function replaceRhythm(source,id,replacement){let changed=0;visitRhythmOps(source,op=>{if(parseRhythm(op.attributes?.[RHYTHM_ATTRIBUTE])?.id!==id)return;op.attributes={...op.attributes};if(replacement)op.attributes[RHYTHM_ATTRIBUTE]=rhythmValue(replacement);else delete op.attributes[RHYTHM_ATTRIBUTE];if(!Object.keys(op.attributes).length)delete op.attributes;changed++;});return changed;}
export function receiveRhythms(source,catalog,accept,uid=()=>crypto.randomUUID()){
 const incoming=JSON.parse(JSON.stringify(source)),next=catalog.map(rhythmDefinition),mapping=new Map();assignRhythmColors(next);
 visitRhythmOps(incoming,op=>{
  const row=parseRhythm(op.attributes?.[RHYTHM_ATTRIBUTE]);if(!row)return;
  if(!accept){op.attributes={...op.attributes};delete op.attributes[RHYTHM_ATTRIBUTE];if(!Object.keys(op.attributes).length)delete op.attributes;return;}
  const key=rhythmValue(row);let chosen=mapping.get(key);
  if(!chosen){chosen=next.find(item=>item.name===row.name&&item.ppm===row.ppm);if(!chosen){chosen={...row,id:uid(),color:allocateRhythmColor(next.map(item=>item.color),row.color)};next.push(chosen);}mapping.set(key,chosen);}
  op.attributes={...op.attributes,[RHYTHM_ATTRIBUTE]:rhythmValue(chosen)};
 });return {content:incoming,catalog:next};
}
export function rhythmSegments(delta){
 let at=0;const result=[];
 for(const op of delta?.ops||[]){const text=typeof op.insert==='string'?op.insert:'\n',rhythm=parseRhythm(op.attributes?.[RHYTHM_ATTRIBUTE]),key=rhythm?rhythmValue(rhythm):'',last=result.at(-1);
  if(last&&last.key===key){last.text+=text;last.end+=text.length;}else result.push({key,rhythm,text,start:at,end:at+text.length,words:0,seconds:0});at+=text.length;
 }return result;
}
export function estimateRhythms(delta,defaultPpm=125){
 const pace=Math.max(70,Number(defaultPpm)||125),segments=rhythmSegments(delta),text=segments.map(row=>row.text).join('');let count=0,cursor=0;
 // Count the original whole words once. A mark inside a word distributes that
 // word's time proportionally instead of counting formatting fragments as words.
 for(const match of text.matchAll(/[\p{L}\p{N}]+(?:[-’'][\p{L}\p{N}]+)*/gu)){
  count++;const start=match.index,end=start+match[0].length;while(cursor<segments.length&&segments[cursor].end<=start)cursor++;
  for(let n=cursor;n<segments.length&&segments[n].start<end;n++){const row=segments[n],share=(Math.min(end,row.end)-Math.max(start,row.start))/match[0].length;row.words+=share;row.seconds+=share*60/(row.rhythm?.ppm||pace);}
 }
 const groups=new Map();for(const row of segments){if(!row.words)continue;const key=row.key,group=groups.get(key)||{key,rhythm:row.rhythm,words:0,seconds:0};group.words+=row.words;group.seconds+=row.seconds;groups.set(key,group);}
 const seconds=segments.reduce((total,row)=>total+row.seconds,0);return {words:count,seconds,roundedSeconds:Math.round(seconds),groups:[...groups.values()],segments:segments.filter(row=>row.text.trim())};
}
export function timeTone(seconds,targetSeconds,previous='normal'){
 if(!(targetSeconds>0))return 'normal';if(seconds>targetSeconds)return 'over';
 const near=targetSeconds-Math.min(15,targetSeconds*.05),release=near-Math.min(3,targetSeconds*.01);
 return seconds>=(previous==='near'?release:near)?'near':'normal';
}
