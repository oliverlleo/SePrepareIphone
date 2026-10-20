import {zlibSync,Unzlib} from 'fflate';
import {clone,ensureVersions,validState} from './core.js';
import {encodeSpeechVersions,portableSharedContent} from './sharing.js';
import {normalizeNotes,noteIds,NOTE_ATTRIBUTE} from './notes-core.js';
import {CODE_MESSAGE_START,CODE_MESSAGE_END} from './share-message.js';

// Identical on Android, web and iPhone. Entire content, no URL or remote lookup.
// SEPREPARE:1:<UTF-8 size in base36>:<CRC32 hex>:<zlib as base64url>
export const SHARE_CODE_PREFIX='SEPREPARE:1:';
export const MAX_CODE_BYTES=12_000_000,MAX_CODE_LENGTH=16_100_000;
export const MAX_SHARED_MESSAGE_LENGTH=MAX_CODE_LENGTH+20_000;
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const invalid=()=>Error('Código inválido ou incompleto. Copie o código inteiro e tente novamente.');
const table=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
export function codeChecksum(bytes){let crc=0xffffffff;for(const byte of bytes)crc=table[(crc^byte)&255]^(crc>>>8);return ((crc^0xffffffff)>>>0).toString(16).padStart(8,'0');}
function base64url(bytes){let binary='';for(let at=0;at<bytes.length;at+=8192)binary+=String.fromCharCode(...bytes.subarray(at,at+8192));return btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
function unbase64(text){
 if(!/^[A-Za-z0-9_-]+$/.test(text)||text.length%4===1)throw invalid();
 const raw=atob(text.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-text.length%4)%4)),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
 if(base64url(bytes)!==text)throw invalid();return bytes;
}
function annotations(clean,source,include){
 const notes=include?normalizeNotes(source.presenterNotes):[],ids=new Set(notes.map(note=>note.id));clean.presenterNotes=notes;
 for(let i=0;i<clean.delta.ops.length;i++){
  const from=source.delta.ops[i]?.attributes,op=clean.delta.ops[i];
  if(from?.direction==='rtl')op.attributes={...op.attributes,direction:'rtl'};
  const anchors=include?noteIds(from?.[NOTE_ATTRIBUTE]).filter(id=>ids.has(id)):[];
  if(anchors.length)op.attributes={...op.attributes,[NOTE_ATTRIBUTE]:anchors.join(' ')};
 }
 return clean;
}
export function portableCodeContent(source,includeNotes=false){
 const clean=portableSharedContent(source);
 if(!clean.versions)throw Error('Este código não contém uma lista válida de versões.');
 for(let i=0;i<clean.versions.length;i++)annotations(clean.versions[i],source.versions[i],includeNotes);
 const active=clean.versions.find(version=>version.id===clean.activeVersionId);
 clean.delta=clone(active.delta);clean.presenterNotes=clone(active.presenterNotes);
 clean.read={...clean.read,onlyMine:false,showPresenterNotes:source.read?.showPresenterNotes!==false};
 const checked={...clone(clean),id:'code-validation',scheduledAt:source.scheduledAt,reminders:source.reminders};validState({schema:1,speeches:[checked],categories:[]});
 clean.scheduledAt=checked.scheduledAt;clean.reminders=checked.reminders;clean.pinned=source.pinned===true;
 return clean;
}
function categoryContent(source){
 if(!source)return null;
 if(typeof source.name!=='string'||!source.name.trim()||source.name.length>100||typeof source.icon!=='string'||source.icon.length>100||source.icon in Object.prototype||!/^#[\da-f]{6}$/i.test(source.color))throw Error('Categoria inválida no código.');
 return {name:source.name.trim(),icon:source.icon,color:source.color};
}
export function createCodePayload(speech,{category=null,includeNotes=false,versionIds}={}){
 const source=clone(speech);ensureVersions(source);
 const ids=versionIds??source.versions.map(version=>version.id),content=JSON.parse(encodeSpeechVersions(source,ids)).speech;
 const chosen=new Set(ids),versions=source.versions.filter(version=>chosen.has(version.id));
 for(let i=0;i<content.versions.length;i++)annotations(content.versions[i],versions[i].id===source.activeVersionId?source:versions[i],includeNotes);
 content.read.showPresenterNotes=source.read?.showPresenterNotes!==false;
 content.scheduledAt=source.scheduledAt;content.reminders=source.reminders;content.pinned=source.pinned===true;
 return {format:'seprepare-share-code',schema:1,speech:portableCodeContent(content,includeNotes),category:categoryContent(category),includesNotes:includeNotes===true};
}
export function encodeShareCode(speech,options={}){
 const payload=createCodePayload(speech,options),bytes=encoder.encode(JSON.stringify(payload));
 if(bytes.length>MAX_CODE_BYTES)throw Error('Esta preparação é grande demais para um código. Use o compartilhamento por arquivo.');
 const code=SHARE_CODE_PREFIX+bytes.length.toString(36)+':'+codeChecksum(bytes)+':'+base64url(zlibSync(bytes,{level:6}));
 if(code.length>MAX_CODE_LENGTH)throw Error('Esta preparação é grande demais para um código. Use o compartilhamento por arquivo.');return code;
}
export function decodeShareCode(input){
 if(typeof input!=='string'||input.length>MAX_CODE_LENGTH)throw invalid();
 const parts=input.trim().replace(/[\s\u200b-\u200d\ufeff]/g,'').split(':');
 if(parts[0]!=='SEPREPARE')throw invalid();
 if(parts[1]!=='1')throw Error('Este código usa uma versão mais recente. Atualize o SePrepare para importar.');
 if(parts.length!==5||!/^[1-9a-z][0-9a-z]{0,5}$/.test(parts[2])||!/^[\da-f]{8}$/.test(parts[3]))throw invalid();
 const size=parseInt(parts[2],36);if(!Number.isSafeInteger(size)||size<1||size>MAX_CODE_BYTES||size.toString(36)!==parts[2])throw invalid();
 let payload;
 try{
  const packed=unbase64(parts[4]);if(packed.length>MAX_CODE_BYTES+100000)throw invalid();
  const output=new Uint8Array(size);let offset=0,done=false;
  const stream=new Unzlib((chunk,final)=>{if(offset+chunk.length>size)throw invalid();output.set(chunk,offset);offset+=chunk.length;done=final;});
  for(let at=0;at<packed.length;at+=1024)stream.push(packed.subarray(at,at+1024),at+1024>=packed.length);
  if(!done||offset!==size||codeChecksum(output)!==parts[3])throw invalid();
  payload=JSON.parse(decoder.decode(output),(key,value)=>{if(['__proto__','constructor','prototype'].includes(key))throw invalid();return value;});
 }catch{throw invalid();}
 if(payload?.format!=='seprepare-share-code'||payload.schema!==1||typeof payload.includesNotes!=='boolean')throw invalid();
 return {format:payload.format,schema:1,speech:portableCodeContent(payload.speech,payload.includesNotes),category:categoryContent(payload.category),includesNotes:payload.includesNotes};
}
// A received message may contain a title, instructions, URLs and forwarded text.
// Keep the strict wire decoder unchanged; extract only its framed/plain code.
export function decodeShareMessage(input){
 if(typeof input!=='string'||input.length>MAX_SHARED_MESSAGE_LENGTH)throw invalid();
 const text=input.replace(/[\u200b-\u200d\ufeff]/g,''),marker=text.indexOf(CODE_MESSAGE_START);
 let body=text;
 if(marker>=0){
  if(text.indexOf(CODE_MESSAGE_START,marker+CODE_MESSAGE_START.length)>=0)throw Error('Há mais de um código na mensagem. Importe uma preparação de cada vez.');
  const start=marker+CODE_MESSAGE_START.length,end=text.indexOf(CODE_MESSAGE_END,start);
  if(end<0)throw invalid();body=text.slice(start,end);
 }
 const pattern=/SEPREPARE:\d+:/g,first=pattern.exec(body);if(!first)throw invalid();
 if(pattern.exec(body))throw Error('Há mais de um código na mensagem. Importe uma preparação de cada vez.');
 const candidate=body.slice(first.index).trim();
 if(marker>=0)return decodeShareCode(candidate);
 try{return decodeShareCode(candidate);}catch(error){
  const token=candidate.match(/^SEPREPARE:\d+:[0-9a-z]+:[\da-f]{8}:[A-Za-z0-9_-]+/)?.[0];
  if(token&&token!==candidate)return decodeShareCode(token);throw error;
 }
}
