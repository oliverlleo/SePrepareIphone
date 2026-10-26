import {plain,createContentVersion,captureContentVersion} from './core.js';
export function semanticEdit(source,range,spans,Delta){
 let edit=new Delta(),applied=0;const full=plain(source),newlines=new Set();let position=0;
 for(const op of source.ops){if(typeof op.insert==='string'){for(let i=0;i<op.insert.length;i++)if(op.insert[i]==='\n')newlines.add(position+i);position+=op.insert.length;}else position++;}
 for(const span of spans){const at=range.index+span.offset;if(full.slice(at,at+span.length)!==span.text)continue;
  edit=edit.compose(new Delta().retain(at).retain(span.length,span.attributes));
  if(span.type==='quote'&&span.block){const start=full.lastIndexOf('\n',at-1)+1,next=full.indexOf('\n',at+span.length),end=next<0?full.length:next;if(!full.slice(start,at).trim()&&!full.slice(at+span.length,end).trim())for(let pos=start;pos<=end;pos++)if(newlines.has(pos))edit=edit.compose(new Delta().retain(pos).retain(1,{blockquote:true,header:null,list:null,'code-block':null}));}
  applied++;
 }
 return {edit,applied};
}
export function formatNewVersion(document,name,edit,Delta){
 const version=createContentVersion(document,name,true);
 document.delta={ops:new Delta(document.delta.ops).compose(edit).ops};captureContentVersion(document);return version;
}
