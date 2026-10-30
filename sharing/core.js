import {validateMemorization,copyMemorization} from '../memorization/memorization-data.js';
import {TIME_MARK_ATTRIBUTE,TIME_POINT_ATTRIBUTE,parseTimeMark} from '../timing/time-mark-core.js';
import {validateDeletionTombstones} from '../protection/sync-deletions.js';
import {parseRhythm,RHYTHM_ATTRIBUTE,validateRhythmCatalog} from '../rhythms/rhythm-core.js';
import {normalizeNotes,withoutNoteAttributes,noteRanges} from './notes-core.js';
export const uid=()=>globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
export const clone=x=>JSON.parse(JSON.stringify(x));
export const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const plain=delta=>(delta?.ops||[]).map(o=>typeof o.insert==='string'?o.insert:o.insert?.pagebreak?'\n':'').join('');
export const words=text=>(text.match(/[\p{L}\p{N}]+(?:[-’'][\p{L}\p{N}]+)*/gu)||[]).length;
export const clock=ms=>{const s=Math.floor(Math.max(0,ms)/1000);return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;};
export function newSpeech(categoryId=''){
  const now=Date.now();return {id:uid(),type:'speech',title:'Discurso sem título',subtitle:'',categoryId,delta:{ops:[{insert:'\n'}]},createdAt:now,updatedAt:now,pinned:false,targetMinutes:4,layout:'flow',scheduledAt:0,reminders:[1440,60],history:[],rehearsals:[],timer:{running:false,elapsedMs:0,startedAt:0},read:{fontSize:27,zoom:100,line:1.7,font:'',highlights:true,onlyMine:false}};
}
export const isPart=s=>s?.type==='part';
export const typeLabel=s=>isPart(s)?'Parte':'Discurso';
export const participantName=(s,id)=>s.participants?.find(p=>p.id===id)?.name||'Sem participante';
export function newPart(categoryId=''){return {...newSpeech(categoryId),type:'part',partFormat:2,title:'Parte sem título',participants:[],myParticipantId:''};}
export function normalizePart(s){
 if(!Array.isArray(s.participants)||s.participants.length>50)throw Error('Use até 50 participantes nesta parte.');
 const ids=new Set();s.participants=s.participants.map(p=>{if(typeof p?.id!=='string'||!p.id||p.id.length>100||ids.has(p.id)||typeof p.name!=='string'||!p.name.trim())throw Error('Participante inválido.');ids.add(p.id);return {id:p.id,name:p.name.trim().slice(0,80)};});
 if(s.partFormat!==undefined&&s.partFormat!==1&&s.partFormat!==2)throw Error('Esta parte usa um formato mais recente. Atualize o aplicativo.');
 if(s.partFormat!==2){
  if(!Array.isArray(s.turns)||s.turns.length>500)throw Error('Falas inválidas na parte antiga.');
  const seen=new Set(),ops=[];
  for(const t of s.turns){if(typeof t?.id!=='string'||seen.has(t.id)||!ids.has(t.participantId))throw Error('Fala sem participante válido.');seen.add(t.id);validateDelta(t.delta);
   for(const op of t.delta.ops)ops.push({...clone(op),...(typeof op.insert==='string'?{attributes:{...op.attributes,speaker:t.participantId}}:{})});
   if(typeof ops.at(-1)?.insert!=='string'||!ops.at(-1).insert.endsWith('\n'))ops.push({insert:'\n'});
  }
  s.delta={ops:ops.length?ops:[{insert:'\n'}]};
 }
 validateDelta(s.delta);
 for(const op of s.delta.ops){const id=op.attributes?.speaker;if(id!==undefined&&(typeof id!=='string'||!ids.has(id)))throw Error('Trecho com participante inválido.');}
 if(!s.delta.ops.length||typeof s.delta.ops.at(-1).insert!=='string'||!s.delta.ops.at(-1).insert.endsWith('\n'))s.delta.ops.push({insert:'\n'});
 s.partFormat=2;delete s.turns;s.myParticipantId=ids.has(s.myParticipantId)?s.myParticipantId:'';return s;
}
// Speaker marks travel with the rich-text operations as the document is edited.
// Presentation fragments are derived; they never replace the complete source text.
export function partSegments(s){
 const segments=[],lines=[];let at=0;
 const blockKeys=['align','blockquote','header','indent','list','speech-kind','ordinal','direction'];
 for(const op of s.delta?.ops||[]){
  const text=typeof op.insert==='string'?op.insert:'\n',length=typeof op.insert==='string'?op.insert.length:1;
  if(typeof op.insert==='string')for(let i=0;i<text.length;i++)if(text[i]==='\n'){const attributes={};for(const key of blockKeys)if(op.attributes?.[key]!==undefined)attributes[key]=op.attributes[key];lines.push({at:at+i,attributes});}
  let id=op.attributes?.speaker||'';
  if(!id&&segments.length&&(typeof op.insert!=='string'||!text.trim()))id=segments.at(-1).participantId;
  let segment=segments.at(-1);if(!segment||segment.participantId!==id){segment={id:'segment-'+at,participantId:id,start:at,end:at,text:'',delta:{ops:[]}};segments.push(segment);}
  const clean=clone(op);if(clean.attributes){delete clean.attributes.speaker;if(!Object.keys(clean.attributes).length)delete clean.attributes;}
  segment.delta.ops.push(clean);segment.text+=text;at+=length;segment.end=at;
 }
 for(const segment of segments){const last=segment.delta.ops.at(-1);if(typeof last?.insert!=='string'||!last.insert.endsWith('\n')){const line=lines.find(l=>l.at>=segment.end-1),attributes=line?.attributes||{};segment.delta.ops.push({insert:'\n',...(Object.keys(attributes).length?{attributes}:{} )});}}
 return segments;
}
export const partNarration=s=>partSegments(s).map(t=>(t.participantId?participantName(s,t.participantId)+':\n':'')+t.text.trimEnd()).join('\n\n');
export function validState(data){
  if(!data || data.schema!==1 || !Array.isArray(data.speeches) || !Array.isArray(data.categories)) throw Error('Esse arquivo não é um backup válido do SePrepare.');
  if(data.speeches.length>2000 || data.categories.length>300) throw Error('O arquivo ultrapassa o limite de importação.');
  validateDeletionTombstones(data.deletionTombstones);if(data.deletionTombstones?.some(row=>data.speeches.some(doc=>doc.id===row.id)))throw Error('Registro de exclusões conflitante.');
  const speechIds=new Set(), catIds=new Set();
  for(const c of data.categories){if(typeof c.id!=='string'||typeof c.name!=='string'||catIds.has(c.id))throw Error('Categoria inválida no arquivo.');catIds.add(c.id);c.color=/^#[\da-f]{6}$/i.test(c.color)?c.color:'#61776c';c.icon=typeof c.icon==='string'?c.icon:'BookOpen';}
  for(const s of data.speeches){
    if(typeof s.id!=='string'||speechIds.has(s.id)||typeof s.title!=='string'||!Array.isArray(s.delta?.ops))throw Error('Discurso inválido no arquivo.');
    speechIds.add(s.id);validateDelta(s.delta);
    if(s.type!==undefined&&!['speech','part'].includes(s.type))throw Error('Tipo de conteúdo inválido.');s.type||='speech';if(isPart(s))normalizePart(s);
    s.title=s.title.slice(0,400);s.subtitle=String(s.subtitle||'').slice(0,1000);
    s.targetMinutes=Math.max(1,Math.min(240,Number(s.targetMinutes)||4));
    s.scheduledAt=Math.max(0,Number(s.scheduledAt)||0);
    s.reminders=Array.isArray(s.reminders)?[...new Set(s.reminders.filter(n=>Number.isFinite(n)&&n>=0&&n<=525600))]:[];
    s.read={fontSize:27,zoom:100,line:1.7,font:'',highlights:true,onlyMine:false,...s.read};s.read.onlyMine=isPart(s)&&!!s.myParticipantId&&s.read.onlyMine===true;
    s.read.fontSize=Math.max(16,Math.min(54,Number(s.read.fontSize)||27));s.read.zoom=Math.max(75,Math.min(160,Number(s.read.zoom)||100));s.read.line=Math.max(1.2,Math.min(2.3,Number(s.read.line)||1.7));
    s.history=Array.isArray(s.history)?s.history.slice(-15).filter(h=>Array.isArray(h.delta?.ops)):[];for(const h of s.history){validateDelta(h.delta);if(h.type==='part')normalizePart(h);}
    s.rehearsals=Array.isArray(s.rehearsals)?s.rehearsals:[];
    s.timer=normalizeTimer(s.timer);
    normalizeVersions(s);
  }
  data.settings={theme:'light',pace:125,rate:1,voice:'',...data.settings};data.vocabulary=Array.isArray(data.vocabulary)?data.vocabulary.slice(0,5000):[];
  validateRhythmCatalog(data.settings.rhythms);
  if(data.editorDrafts!==undefined){
   if(!Array.isArray(data.editorDrafts)||data.editorDrafts.length>2000)throw Error('Rascunhos inválidos no arquivo.');
   const drafts=new Set();for(const row of data.editorDrafts){if(!row||typeof row.speechId!=='string'||drafts.has(row.speechId)||row.document?.id!==row.speechId||data.deletionTombstones?.some(t=>t.id===row.speechId))throw Error('Rascunho inválido no arquivo.');drafts.add(row.speechId);validState({schema:1,speeches:[clone(row.document)],categories:clone(data.categories),settings:{},vocabulary:[]});}
  }

  return data;
}
export function validateDelta(delta){
  if(!Array.isArray(delta?.ops)||delta.ops.length>30000)throw Error('Documento inválido.');
  for(const op of delta.ops){
    if(op.attributes?.[TIME_POINT_ATTRIBUTE]!==undefined&&(parseTimeMark(op.attributes[TIME_POINT_ATTRIBUTE])===null||typeof op.insert!=='string'))throw Error('Marcação de tempo inválida.');
    if(op.attributes?.[TIME_MARK_ATTRIBUTE]!==undefined&&(parseTimeMark(op.attributes[TIME_MARK_ATTRIBUTE])===null||typeof op.insert!=='string'||!op.insert.includes('\n')))throw Error('Marcação de tempo inválida.');
    if(op.attributes?.[RHYTHM_ATTRIBUTE]!==undefined&&!parseRhythm(op.attributes[RHYTHM_ATTRIBUTE]))throw Error('Marcação de ritmo inválida.');
    if(typeof op.insert!=='string' && !(op.insert&&op.insert.pagebreak===true))throw Error('O documento contém um elemento não suportado.');
    if(op.attributes && (typeof op.attributes!=='object'||Array.isArray(op.attributes)))throw Error('Formatação inválida.');
  }
  if(plain(delta).length>600000)throw Error('O discurso ultrapassa 600 mil caracteres.');
}
export const commonCorrections={
 'concerteza':'com certeza','derrepente':'de repente','apartir':'a partir','excessão':'exceção','excessões':'exceções','discurço':'discurso','discurços':'discursos','portugues':'português','voçe':'você','voces':'vocês','tambem':'também','nao':'não','ninguem':'ninguém','alguem':'alguém','entao':'então','amanha':'amanhã','ate':'até','ja':'já','sao':'são','estao':'estão','estou':'estou','estara':'estará','serao':'serão','irmao':'irmão','irmaos':'irmãos','biblia':'Bíblia','biblico':'bíblico','biblicos':'bíblicos','jesus':'Jesus','jeova':'Jeová','corintios':'Coríntios','mateus':'Mateus','joao':'João','paulo':'Paulo','god':'God','previlegio':'privilégio','previlegios':'privilégios','beneficiente':'beneficente','exitar':'hesitar','enchergar':'enxergar','mecher':'mexer','menas':'menos','seje':'seja','esteje':'esteja','porisso':'por isso','asvezes':'às vezes','atravez':'através','atravéz':'através','impressindível':'imprescindível','compreenção':'compreensão','pretenção':'pretensão','ancioso':'ansioso','anciedade':'ansiedade','cansasso':'cansaço','familia':'família','familias':'famílias','proximo':'próximo','proxima':'próxima','proposito':'propósito','propositos':'propósitos','principio':'princípio','principios':'princípios','necessario':'necessário','necessaria':'necessária','possivel':'possível','dificil':'difícil','facil':'fácil','importancia':'importância','paciencia':'paciência','consiencia':'consciência','religiao':'religião','reuniao':'reunião','reunioes':'reuniões','autoriade':'autoridade','diferençia':'diferença','definivamente':'definitivamente','parabens':'parabéns','vc':'você','vcs':'vocês','pq':'porque','tbm':'também'
};
export function localRuleMatches(text){
  const matches=[];
  for(const m of text.matchAll(/[\p{L}][\p{L}\p{M}-]*/gu)){
    const lower=m[0].toLocaleLowerCase('pt-BR'), target=commonCorrections[lower];
    if(target && target!==m[0]){
      let replacement=target;
      if(m[0]===m[0].toLocaleUpperCase('pt-BR'))replacement=target.toLocaleUpperCase('pt-BR');
      else if(m[0][0]===m[0][0].toLocaleUpperCase('pt-BR'))replacement=target[0].toLocaleUpperCase('pt-BR')+target.slice(1);
      if(replacement!==m[0])matches.push({offset:m.index,length:m[0].length,word:m[0],message:'Grafia, acentuação ou forma usual em português.',replacements:[replacement],safe:!['vc','vcs','pq','tbm','principio','principios','proposito','proximo','proxima','ate','estara'].includes(lower),kind:'rule'});
    }
  }
  for(const m of text.matchAll(/\b([\p{L}]{2,})[ \t]+\1\b/giu))matches.push({offset:m.index,length:m[0].length,word:m[0],message:'Palavra repetida. Confira se a repetição é intencional.',replacements:[m[1]],safe:false,kind:'repetition'});
  for(const m of text.matchAll(/[^\S\n]{2,}/g))matches.push({offset:m.index,length:m[0].length,word:m[0],message:'Espaço duplicado.',replacements:[' '],safe:true,kind:'spacing'});
  return matches.sort((a,b)=>a.offset-b.offset);
}

// Content variants belong to one preparation. Root content remains an active
// projection so the existing cards, reminders, editor and sharing keep working.
const versionFields=['presenterNotes','delta','participants','partFormat','myParticipantId','history','rehearsals','timer'];
export function normalizeTimer(timer={}){
 timer||={};
 return {...timer,active:timer.active===true,running:timer.running===true,elapsedMs:Math.max(0,Number(timer.elapsedMs)||0),startedAt:Math.max(0,Number(timer.startedAt)||0)};
}
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
export function versionContentKey(source){
 const ops=[];
 for(const op of withoutNoteAttributes(source.delta).ops){const attributes=sorted(op.attributes||{}),last=ops.at(-1);if(last&&typeof last.insert==='string'&&typeof op.insert==='string'&&JSON.stringify(last.attributes)===JSON.stringify(attributes))last.insert+=op.insert;else ops.push({insert:op.insert,attributes});}
 const text=JSON.stringify({ops,participants:source.participants?.map(p=>({id:p.id,name:p.name}))||[]});let a=2166136261,b=2246822519;
 for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b^text.charCodeAt(i),3266489917);}
 return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');
}
export const activeContentVersion=s=>s?.versions?.find(v=>v.id===s.activeVersionId);
export function projectContentVersion(s,id=s.activeVersionId){
 const v=s.versions.find(v=>v.id===id);if(!v)throw Error('Esta versão não está disponível.');s.activeVersionId=v.id;
 for(const key of versionFields){if(key in v)s[key]=v[key];else if(['participants','partFormat','myParticipantId'].includes(key))delete s[key];}
 return v;
}
export function normalizeVersions(s){
 if(s.versionSchema!==undefined&&s.versionSchema!==1)throw Error('As versões usam um formato mais recente. Atualize o aplicativo.');
 if(s.versions===undefined){
  const legacyId='legacy-'+Array.from(String(s.id)).reduce((h,c)=>Math.imul(h^c.charCodeAt(0),16777619)>>>0,2166136261).toString(16)+'-'+Math.max(0,Number(s.createdAt)||0).toString(36);
  const v={id:legacyId,name:'Versão original',createdAt:s.createdAt||0,updatedAt:s.updatedAt||0,revision:1};
  for(const key of versionFields)if(key in s)v[key]=clone(s[key]);s.versions=[v];s.activeVersionId=v.id;
 }else if(!Array.isArray(s.versions)||!s.versions.length||s.versions.length>1000)throw Error('Lista de versões inválida.');
 const seen=new Set();
 for(const v of s.versions){
  if(typeof v.id!=='string'||!v.id||v.id.length>100||seen.has(v.id)||typeof v.name!=='string'||!v.name.trim())throw Error('Versão inválida.');seen.add(v.id);v.name=v.name.trim().slice(0,80);validateDelta(v.delta);
  if(isPart(s))normalizePart(v);
  v.presenterNotes=normalizeNotes(v.presenterNotes);
  v.history=Array.isArray(v.history)?v.history.slice(-15):[];
  for(const h of v.history){validateDelta(h.delta);h.presenterNotes=normalizeNotes(h.presenterNotes);if(h.type==='part')normalizePart(h);}
  v.rehearsals=Array.isArray(v.rehearsals)?v.rehearsals:[];
  v.rehearsals=v.rehearsals.map(r=>({...r,versionId:v.id,versionName:r.versionName||v.name,...(!r.contentKey?{legacy:true}:{})}));
  v.timer=normalizeTimer(v.timer);v.timer.versionId=v.id;
  if((v.timer.running||v.timer.elapsedMs)&&!v.timer.contentKey)v.timer.legacy=true;
  v.revision=Math.max(1,Math.floor(Number(v.revision)||1));v.contentKey=versionContentKey(v);
  if(v.memorization!==undefined)validateMemorization(v.memorization);
 }
 s.versionSchema=1;if(!seen.has(s.activeVersionId))s.activeVersionId=s.versions[0].id;
 projectContentVersion(s);return s;
}
export function ensureVersions(s){if(!s.versions)normalizeVersions(s);return activeContentVersion(s);}
export function captureContentVersion(s){
 const v=ensureVersions(s),key=versionContentKey(s);
 if(v.contentKey!==key){v.revision++;v.contentKey=key;v.updatedAt=Date.now();if((s.timer?.running||s.timer?.elapsedMs)&&s.timer.contentKey&&s.timer.contentKey!==key)s.timer.contentChanged=true;}
 for(const field of versionFields)if(field in s)v[field]=s[field];v.timer.versionId=v.id;return v;
}
export function selectContentVersion(s,id){captureContentVersion(s);if(id!==s.activeVersionId&&s.timer.running)throw Error('Pause ou encerre o ensaio antes de trocar de versão.');return projectContentVersion(s,id);}
export function createContentVersion(s,name,copy=false){
 if(s.timer?.running)throw Error('Pause ou encerre o ensaio antes de criar outra versão.');
 const source=captureContentVersion(s),now=Date.now(),v={id:uid(),name:String(name).trim().slice(0,80),createdAt:now,updatedAt:now,revision:1,presenterNotes:copy?clone(source.presenterNotes||[]):[],delta:copy?clone(source.delta):{ops:[{insert:'\n'}]},history:[],rehearsals:[],timer:normalizeTimer()};
 if(!v.name)throw Error('Dê um nome à versão.');if(s.versions.length>=1000)throw Error('Esta preparação atingiu o limite de versões.');
 if(isPart(s)){v.partFormat=2;v.participants=clone(source.participants);v.myParticipantId=source.myParticipantId||'';}
 if(copy&&source.memorization)v.memorization=copyMemorization(source.memorization,{reviews:true});
 v.contentKey=versionContentKey(v);v.timer.versionId=v.id;s.versions.push(v);projectContentVersion(s,v.id);return v;
}
export function deleteContentVersion(s,id){
 if(s.timer?.running&&id===s.activeVersionId)throw Error('Pause ou encerre o ensaio antes de excluir esta versão.');
 captureContentVersion(s);if(s.versions.length<=1)throw Error('A última versão não pode ser excluída.');if(!s.versions.some(v=>v.id===id))throw Error('Versão não encontrada.');
 const wasActive=id===s.activeVersionId;s.versions=s.versions.filter(v=>v.id!==id);if(wasActive)projectContentVersion(s,s.versions[0].id);
}
export const versionTimerElapsed=s=>Math.max(0,s?.timer?.elapsedMs||0)+(s?.timer?.running?Math.max(0,Date.now()-s.timer.startedAt):0);
export function toggleVersionTimer(s){
 const v=captureContentVersion(s),t=s.timer;
 if(t.running){t.elapsedMs=versionTimerElapsed(s);t.running=false;t.startedAt=0;}
 else{if(!t.elapsedMs){t.contentKey=v.contentKey;t.contentRevision=v.revision;t.sessionStartedAt=Date.now();delete t.legacy;delete t.contentChanged;}else if(t.contentKey&&t.contentKey!==v.contentKey)t.contentChanged=true;t.running=true;t.startedAt=Date.now();}
 t.active=true;captureContentVersion(s);
}
export function finishVersionRehearsal(s,options={}){
 const v=captureContentVersion(s),t=s.timer,elapsed=versionTimerElapsed(s);if(!elapsed&&!t.running)return null;
 const interactiveMeta=options?.mode==='interactive'?{rehearsalMode:'interactive',interactionMode:options.interactionMode==='auto'?'auto':'manual'}:{};
 if(elapsed>0)s.rehearsals.push({at:Date.now(),duration:elapsed,versionId:v.id,versionName:v.name,contentRevision:t.contentRevision??null,contentKey:t.contentKey||null,...interactiveMeta,...(t.legacy?{legacy:true}:{}),...(t.contentChanged?{contentChanged:true}:{})});
 s.timer={active:false,running:false,elapsedMs:0,startedAt:0,versionId:v.id};captureContentVersion(s);return {duration:elapsed};
}
export function rehearsalContentLabel(record,version){
 const prefix=record?.rehearsalMode==='interactive'?'Ensaio interativo · ':'';
 if(record.contentChanged)return prefix+'Texto alterado durante o ensaio';if(record.legacy||!record.contentKey)return prefix+'Registro anterior à atualização';
 return prefix+(record.contentKey===version.contentKey?'Texto atual':`Texto anterior · revisão ${record.contentRevision||1}`);
}
export function copyDocumentVersions(s){
 ensureVersions(s);const active=s.activeVersionId;
 for(const v of s.versions){const old=v.id;v.id=uid();if(old===active)s.activeVersionId=v.id;v.history=[];v.rehearsals=[];if(v.memorization)v.memorization=copyMemorization(v.memorization);v.timer={active:false,running:false,elapsedMs:0,startedAt:0,versionId:v.id};}
 projectContentVersion(s);
}
export function pauseAllVersionTimers(s){
 captureContentVersion(s);for(const v of s.versions){if(v.timer.running){v.timer.elapsedMs=Math.max(0,v.timer.elapsedMs||0)+Math.max(0,Date.now()-v.timer.startedAt);v.timer.running=false;v.timer.startedAt=0;}v.timer.active=!!v.timer.elapsedMs;}projectContentVersion(s);
}
export function documentVersionsKey(s){
 ensureVersions(s);return JSON.stringify({active:s.versions.findIndex(v=>v.id===s.activeVersionId),versions:s.versions.map(v=>({name:v.name,key:versionContentKey(v),presenterNotes:v.presenterNotes,anchors:[...noteRanges(v.delta)],history:v.history,rehearsals:v.rehearsals.map(({versionId,versionName,...r})=>r)}))});
}
