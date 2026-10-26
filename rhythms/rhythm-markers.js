import {parseRhythm,rhythmValue} from './rhythm-core.js';

// A display projection only: implicit default runs never become document metadata.
export function rhythmLabelStarts(runs,hasRhythms=false){
 const visible=runs.filter(run=>run.text.trim()).map(run=>({...run,rhythm:parseRhythm(run.value)}));
 if(!hasRhythms&&!visible.some(run=>run.rhythm))return [];
 let previous=null;
 return visible.filter(run=>{const key=run.rhythm?rhythmValue(run.rhythm):'',start=key!==previous;previous=key;return start;});
}

const ignored='.presenter-inline-notes,.speaker-label,.rhythm-reader-label,.ql-ui';
export const isRhythmText=node=>!!node.nodeValue?.trim()&&!node.parentElement?.closest(ignored);
function firstText(element){
 const walker=element.ownerDocument.createTreeWalker(element,4);let node;
 while(node=walker.nextNode())if(isRhythmText(node))return node;
 return null;
}
// CSS pseudo-elements occupy inline space without inserting characters or blots
// into Quill. A suffix on the previous inline element is the prefix of the
// following plain text run, including a return to default inside a paragraph.
export function defaultLabelAnchor(node,root){
 let element=node.parentElement,before=null;
 while(element&&element!==root&&firstText(element)===node){before=element;element=element.parentElement;}
 if(before)return {element:before,position:'before'};
 let previous=node.previousSibling;
 while(previous&&(previous.nodeType===3&&!previous.nodeValue.trim()||previous.nodeType===1&&previous.matches(ignored)))previous=previous.previousSibling;
 return previous?.nodeType===1?{element:previous,position:'after'}:null;
}
