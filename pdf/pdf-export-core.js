import {parseRhythm} from '../rhythms/rhythm-core.js';
import {parseTimeMark,formatTimeMark} from '../timing/time-mark-core.js';
import {visibleNotes} from '../sharing/notes-core.js';
import {parseColor,contrast} from '../memorization/teleprompter-contrast.js';

const green='#234c48',muted='#6c756e';
export const PDF_DEFAULTS=Object.freeze({fontSize:12,showRhythms:false,showTime:false,includeNotes:false});
export function pdfOptions(value={}){return {fontSize:[10,11,12,14,16,18].includes(Number(value.fontSize))?Number(value.fontSize):12,showRhythms:value.showRhythms===true,showTime:value.showTime===true,includeNotes:value.includeNotes===true};}
export function pdfFilename(title){return (String(title||'SePrepare').replace(/[<>:"/\\|?*\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim().slice(0,100)||'SePrepare')+'.pdf';}
const hex=value=>{const c=parseColor(typeof value==='string'?value:'');return c&&c[3]>0?'#'+c.slice(0,3).map(v=>Math.round(v).toString(16).padStart(2,'0')).join(''):null;};
function inline(text,a,options){
 const run={text};if(a.bold)run.bold=true;if(a.italic)run.italics=true;
 const decorations=[];if(a.underline)decorations.push('underline');if(a.strike)decorations.push('lineThrough');if(decorations.length)run.decoration=decorations;
 const bg=hex(a.background),fg=hex(a.color);if(bg)run.background=bg;
 if(fg)run.color=contrast(parseColor(fg),parseColor(bg||'#ffffff'))>=3?fg:green;
 const size=Number.parseFloat(a.size);if(Number.isFinite(size))run.fontSize=Math.max(8,Math.min(32,size*options.fontSize/17));
 if(['Lora','Georgia','Times New Roman'].includes(a.font))run.font='Lora';
 if(a.script==='super')run.sup=true;if(a.script==='sub')run.sub=true;
 if(typeof a.link==='string'&&/^(https?:\/\/|mailto:)/i.test(a.link))run.link=a.link;
 return run;
}
// Split only on Quill's real paragraph/page boundaries. Inline styles never lose text.
export function pdfBlocks(delta){
 const rows=[];let runs=[],start=0,at=0;
 const flush=(attrs={},force=false)=>{if(force||runs.length)rows.push({runs,start,end:at,attrs});runs=[];start=at;};
 for(const op of delta?.ops||[]){
  if(typeof op.insert!=='string'){flush();if(op.insert?.pagebreak)rows.push({pageBreak:true});at++;start=at;continue;}
  const attrs=op.attributes||{},chunks=op.insert.split('\n');
  chunks.forEach((text,index)=>{if(text){runs.push({text,attrs,at});at+=text.length;}if(index<chunks.length-1){flush(attrs,true);at++;start=at;}});
 }
 flush();return rows;
}
function listPrefix(row,counters){const a=row.attrs,level=Math.max(0,Math.min(8,Number(a.indent)||0));if(!a.list){counters.length=0;return '';}counters.length=level+1;if(a.list==='ordered'){counters[level]=(counters[level]||0)+1;return String(counters[level])+(a.ordinal?'º':'.')+'  ';}counters[level]=0;return a.list==='checked'?'✓  ':a.list==='unchecked'?'○  ':'•  ';}
export function pdfDefinition(source,value={},assets={}){
 const options=pdfOptions(value),rows=pdfBlocks(source.delta),content=[],counters=[],hasRhythms=(source.delta?.ops||[]).some(o=>parseRhythm(o.attributes?.['speech-rhythm']));let pendingPage=false,lastSpeaker='',rhythmKey='',lastTime='';
 const part=source.kind==='part'||source.type==='part'||Array.isArray(source.participants)&&source.participants.length>0;
 const participants=new Map((source.participants||[]).map(p=>[p.id,p.name]));
 const title=String(source.title||'Sem título'),version=source.versions?.find(v=>v.id===source.activeVersionId)?.name||'';
 content.push({text:part?'DEMONSTRAÇÃO':'DISCURSO',color:muted,fontSize:8,characterSpacing:1.3,margin:[0,0,0,10]});
 content.push({text:title,font:'Lora',fontSize:25,color:green,margin:[0,0,0,source.subtitle?7:12],headlineLevel:1,keepWithNext:true});
 if(source.subtitle)content.push({text:String(source.subtitle),fontSize:11,color:muted,margin:[0,0,0,12],keepWithNext:true});
 if(version)content.push({text:version,fontSize:8,color:muted,margin:[0,0,0,8],keepWithNext:true});
 content.push({canvas:[{type:'line',x1:0,y1:0,x2:507.28,y2:0,lineWidth:.6,lineColor:'#dce2da'}],margin:[0,2,0,18]});
 for(const row of rows){
  if(row.pageBreak){pendingPage=content.some(n=>n._body);continue;}
  const raw=row.runs.map(r=>r.text).join(''),a=row.attrs;
  if(!raw.trim()){content.push({text:' ',fontSize:options.fontSize/2,margin:[0,0,0,3]});continue;}
  const pieces=[];let speaker=row.runs.find(r=>r.attrs.speaker)?.attrs.speaker||a.speaker||'';
  // Speaker labels follow inline assignments, including changes inside one paragraph.
  for(const run of row.runs){
   if(part){const next=run.attrs.speaker||speaker;if(next&&next!==lastSpeaker){pieces.push({text:(pieces.length?'\n':'')+(participants.get(next)||'Participante')+': ',bold:true,color:green});lastSpeaker=next;}speaker=next;}
   if(options.showRhythms){const rhythm=parseRhythm(run.attrs['speech-rhythm']),key=rhythm?JSON.stringify(rhythm):'default';if(key!==rhythmKey){if(rhythm||rhythmKey||hasRhythms){pieces.push({text:'['+(rhythm?.name||'Padrão')+'] ',color:rhythm?.color||muted,fontSize:8,bold:true});}rhythmKey=key;}}
   pieces.push(inline(run.text,run.attrs,options));
   if(options.showTime){const seconds=parseTimeMark(run.attrs['speech-time-point']);if(seconds!==null&&run.attrs['speech-time-point']!==lastTime)pieces.push({text:'  '+formatTimeMark(seconds)+'  ',fontSize:8,color:muted,noWrap:true});lastTime=run.attrs['speech-time-point']||'';}
  }
  const prefix=listPrefix(row,counters);if(prefix)pieces.unshift({text:prefix});
  const header=Number(a.header)||0,quote=!!a.blockquote||a['speech-kind']==='scripture';
  const node={text:pieces,margin:[Math.min(8,Number(a.indent)||0)*16+(quote?13:0),header?10:0,0,header?8:9],lineHeight:1.35,...(['center','right','justify'].includes(a.align)?{alignment:a.align}:{}),...(a.direction==='rtl'?{alignment:'right'}:{}),_body:true};
  if(header){node.font='Lora';node.fontSize=header===1?20:header===2?17:14;node.color=green;node.headlineLevel=header+1;node.keepWithNext=true;}
  if(quote){node.italics=true;node.color='#465952';}
  if(options.showTime){const seconds=parseTimeMark(a['speech-time']);if(seconds!==null){node.columns=[{width:'*',text:node.text,lineHeight:node.lineHeight},{width:35,text:formatTimeMark(seconds),alignment:'right',color:muted,fontSize:8}];delete node.text;}}
  if(pendingPage){node.pageBreak='before';pendingPage=false;}content.push(node);
 }
 if(options.includeNotes){const sourceText=(source.delta.ops||[]).map(o=>typeof o.insert==='string'?o.insert:'\n').join(''),notes=visibleNotes(source);if(notes.length){content.push({text:'Anotações privadas',font:'Lora',fontSize:19,color:green,pageBreak:'before',margin:[0,0,0,16],headlineLevel:1});notes.forEach((note,index)=>{const first=note.ranges?.[0],text=sourceText;if(first)content.push({text:text.slice(first.index,first.index+Math.min(first.length,180)),italics:true,color:muted,fontSize:10,margin:[0,4,0,4]});content.push({text:[{text:String(index+1)+'. ',bold:true},{text:note.text}],margin:[0,0,0,12],lineHeight:1.35});});}}
 return {
  info:{title,author:'SePrepare',creator:'SePrepare',subject:part?'Demonstração':'Discurso'},pageSize:'A4',pageMargins:[44,42,44,57],
  defaultStyle:{font:'Roboto',fontSize:options.fontSize,color:'#233c36',lineHeight:1.35},
  content,
  images:assets.logo?{seprepare:assets.logo}:{},
  footer:(page,pages)=>({margin:[44,8,44,0],stack:[
   {canvas:[{type:'line',x1:0,y1:0,x2:507.28,y2:0,lineWidth:.5,lineColor:'#dce2da'}],margin:[0,0,0,7]},
   {columns:[{text:'Página '+page+' de '+pages,fontSize:8,color:muted,margin:[0,5,0,0]},assets.logo?{image:'seprepare',width:82,height:27.33,alignment:'right'}:{text:'SePrepare',font:'Lora',fontSize:13,color:green,alignment:'right'}]}
  ]}),
  pageBreakBefore:(node,container)=>!!node.headlineLevel&&container.getFollowingNodesOnPage().length===0&&container.getNodesOnNextPage().length>0,
  compress:true
 };
}
