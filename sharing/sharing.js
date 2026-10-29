import {TIME_MARK_ATTRIBUTE,TIME_POINT_ATTRIBUTE,parseTimeMark} from '../timing/time-mark-core.js';
import {RHYTHM_ATTRIBUTE,parseRhythm,rhythmValue} from '../rhythms/rhythm-core.js';
import {newSpeech,plain,validateDelta,validState,isPart,partNarration} from './core.js';
export const SPEECH_MIME='application/vnd.seprepare.speech+json';
const fonts=new Set(['Inter','Lora','Georgia','Arial','Verdana','Times New Roman','monospace']);
const sizes=new Set(['12px','14px','16px','18px','20px','22px','24px','26px','28px','30px','32px','36px','40px','44px','48px']);
function cleanAttributes(source){
  const result={};
  for(const [key,value]of Object.entries(source||{})){
    if([TIME_MARK_ATTRIBUTE,TIME_POINT_ATTRIBUTE].includes(key)&&parseTimeMark(value)!==null){result[key]=value;continue;}
    if(key===RHYTHM_ATTRIBUTE&&parseRhythm(value))result[key]=rhythmValue(parseRhythm(value));
    else if(key==='speaker'&&typeof value==='string'&&value.length<=100)result[key]=value;
    else if(['bold','italic','underline','strike','blockquote'].includes(key)&&value===true)result[key]=true;
    else if(['color','background'].includes(key)&&typeof value==='string'&&/^(?:#[\da-f]{3,8}|[a-z]{3,20}|rgba?\([\d.,%\s]+\))$/i.test(value))result[key]=value;
    else if(key==='font'&&fonts.has(value)||key==='size'&&sizes.has(value))result[key]=value;
    else if(key==='link'&&typeof value==='string'&&value.length<=2000&&/^(?:https?:\/\/|mailto:|tel:)/i.test(value))result[key]=value;
    else if(key==='header'&&Number.isInteger(value)&&value>=1&&value<=6||key==='indent'&&Number.isInteger(value)&&value>=0&&value<=8)result[key]=value;
    else if(key==='list'&&['ordered','bullet','checked','unchecked'].includes(value)||key==='align'&&['left','center','right','justify'].includes(value)||key==='script'&&['sub','super'].includes(value)||key==='speech-kind'&&['question','scripture'].includes(value)||key==='ordinal'&&value==='true')result[key]=value;
  }
  return result;
}
function cleanDelta(source){
  validateDelta(source);
  const delta={ops:source.ops.map(op=>{const clean={insert:typeof op.insert==='string'?op.insert:{pagebreak:true}},attributes=cleanAttributes(op.attributes);if(Object.keys(attributes).length)clean.attributes=attributes;return clean;})};
  if(!delta.ops.length||typeof delta.ops.at(-1).insert!=='string'||!delta.ops.at(-1).insert.endsWith('\n'))delta.ops.push({insert:'\n'});
  return delta;
}
export function portableContent(source){
  if(!source||typeof source.title!=='string')throw Error('O arquivo não contém um discurso válido.');
  if(source.type!==undefined&&!['speech','part'].includes(source.type))throw Error('Tipo de conteúdo não reconhecido.');
  const delta=cleanDelta(source.delta);
  const speech=newSpeech();speech.title=source.title.trim().slice(0,400)||'Discurso sem título';speech.subtitle=typeof source.subtitle==='string'?source.subtitle.slice(0,1000):'';speech.delta=delta;speech.targetMinutes=source.targetMinutes;speech.layout=source.layout==='pages'?'pages':'flow';
  const read=source.read&&typeof source.read==='object'?source.read:{};speech.read={fontSize:read.fontSize,zoom:read.zoom,line:read.line,font:fonts.has(read.font)?read.font:'',highlights:read.highlights!==false,showTimeMarks:read.showTimeMarks!==false,...(read.showRhythms===true?{showRhythms:true}:{})};
  speech.type=source.type||'speech';
  if(isPart(speech)){
    if(!Array.isArray(source.participants)||source.participants.length>50)throw Error('Participantes inválidos.');
    speech.participants=source.participants.map(p=>({id:p?.id,name:p?.name}));speech.partFormat=source.partFormat;speech.myParticipantId='';
    if(source.partFormat!==2){if(!Array.isArray(source.turns)||source.turns.length>500)throw Error('Falas inválidas.');speech.turns=source.turns.map(t=>({id:t?.id,participantId:t?.participantId,delta:cleanDelta(t?.delta)}));}
  }
  if(!isPart(speech))for(const op of speech.delta.ops)if(op.attributes){delete op.attributes.speaker;if(!Object.keys(op.attributes).length)delete op.attributes;}
  validState({schema:1,speeches:[speech],categories:[]});
  return {type:speech.type,title:speech.title,subtitle:speech.subtitle,delta:speech.delta,targetMinutes:speech.targetMinutes,layout:speech.layout,read:speech.read,...(isPart(speech)?{partFormat:2,participants:speech.participants}:{})};
}
export function encodeSpeech(speech){const content=portableContent(speech);return JSON.stringify({format:isPart(content)?'orador-part-v2':'orador-speech-v1',speech:content},null,2);}
export function decodeSpeech(text){
  if(typeof text!=='string'||new TextEncoder().encode(text).length>12000000)throw Error('Arquivo muito grande ou inválido.');
  let data;try{data=JSON.parse(text.trim());}catch{throw Error('Esse arquivo não é um discurso válido do SePrepare.');}
  if(!['orador-speech-v1','orador-part-v2'].includes(data?.format)||data.format==='orador-part-v2'&&(data.speech?.type!=='part'||data.speech?.partFormat!==2))throw Error('Esse arquivo não é um discurso válido do SePrepare.');
  return portableSharedContent(data.speech);
}
// Shared files contain only the selected texts and speaker assignments. Personal
// identities, rehearsal records and restoration history remain on this device.
export function portableSharedContent(source){
  const content=portableContent(source);
  if(source.versions===undefined)return content;
  if(source.versionSchema!==1||!Array.isArray(source.versions)||!source.versions.length||source.versions.length>1000)throw Error('As versões deste arquivo não são válidas.');
  const ids=new Set(),versions=source.versions.map(version=>{
    if(typeof version?.id!=='string'||!version.id||version.id.length>100||ids.has(version.id)||typeof version.name!=='string'||!version.name.trim()||version.name.length>80)throw Error('Versão inválida no arquivo.');
    ids.add(version.id);
    const clean=portableContent({...content,delta:version.delta,...(isPart(content)?{partFormat:version.partFormat,participants:version.participants}:{})});
    return {id:version.id,name:version.name.trim(),delta:clean.delta,...(isPart(content)?{partFormat:2,participants:clean.participants}:{})};
  }),active=versions.find(version=>version.id===source.activeVersionId);
  if(!active)throw Error('A versão ativa não está incluída no arquivo.');
  return {...content,delta:active.delta,...(isPart(content)?{partFormat:2,participants:active.participants}:{}),versionSchema:1,activeVersionId:active.id,versions};
}
function selectedContentVersions(speech,ids){
  const available=speech.versions||[{id:'active',name:'Versão original'}],activeId=speech.activeVersionId||available[0]?.id;
  ids??=[activeId];
  if(!Array.isArray(ids)||!ids.length)throw Error('Selecione pelo menos uma versão para compartilhar.');
  const chosen=new Set(ids);
  if([...chosen].some(id=>!available.some(version=>version.id===id)))throw Error('Uma das versões selecionadas não está mais disponível.');
  return available.filter(version=>chosen.has(version.id)).map(version=>{
    const source=version.id===activeId?speech:version,content=portableContent({...speech,delta:source.delta,...(isPart(speech)?{partFormat:source.partFormat,participants:source.participants}:{})});
    return {sourceId:version.id,name:version.name,content};
  });
}
export function encodeSpeechVersions(speech,ids){
  const selected=selectedContentVersions(speech,ids),active=selected.find(version=>version.sourceId===speech.activeVersionId)||selected[0],versions=selected.map((version,index)=>({id:'shared-'+(index+1),name:version.name,delta:version.content.delta,...(isPart(version.content)?{partFormat:2,participants:version.content.participants}:{})})),content={...active.content,versionSchema:1,activeVersionId:versions[selected.indexOf(active)].id,versions},json=JSON.stringify({format:isPart(content)?'orador-part-v2':'orador-speech-v1',speech:content},null,2);
  if(new TextEncoder().encode(json).length>12000000)throw Error('As versões selecionadas ultrapassam o tamanho permitido. Selecione menos versões.');
  return json;
}
export function messageTextVersions(speech,ids){
  const selected=selectedContentVersions(speech,ids);
  return selected.length===1?messageText(selected[0].content):[speech.title,speech.subtitle,...selected.map(version=>version.name+'\n\n'+(isPart(version.content)?partNarration(version.content):plain(version.content.delta).trimEnd()))].filter(Boolean).join('\n\n');
}
export function messageText(speech){const text=isPart(speech)?partNarration(speech):plain(speech.delta).trimEnd();return [speech.title,speech.subtitle,'',text].filter((line,index)=>line||index===2).join('\n');}
export function shareFilename(title){return (String(title||'discurso').normalize('NFC').replace(/[\\/:*?"<>|\x00-\x1f]/g,'-').replace(/^\.+/,'').trim().slice(0,90)||'discurso')+'.seprepare';}
