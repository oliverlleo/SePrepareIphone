// Keep review navigation local to the dialog; never save UI state in a speech.
let sequence=0;
export function reviewKey(match){return match.reviewKey||=(++sequence).toString(36);}

export function rebaseReviewMatches(matches,edits){
 const ordered=[...edits].sort((a,b)=>a.offset-b.offset);
 return matches.filter(m=>!ordered.some(e=>m===e.match||m.offset<e.offset+e.length&&m.offset+m.length>e.offset)).map(m=>({...m,offset:m.offset+ordered.filter(e=>e.offset+e.length<=m.offset).reduce((n,e)=>n+e.replacement.length-e.length,0)}));
}

export function renderReviewDialog(openModal,title,body,footer,wide){
 const old=document.querySelector('#reviewCards'),modal=old?.closest('.modal'),scroll=modal?.querySelector('.modal-body');
 if(!scroll){openModal(title,body,footer,wide);return;}
 const top=scroll.scrollTop,left=scroll.scrollLeft,rect=scroll.getBoundingClientRect();
 const cards=[...old.querySelectorAll('[data-review-key]')];
 const visible=cards.findIndex(card=>card.getBoundingClientRect().bottom>rect.top+1);
 // Keep several nearby anchors so deleting the current card preserves its neighbor.
 const anchors=visible<0?[]:cards.slice(visible,visible+4).map(card=>({key:card.dataset.reviewKey,y:card.getBoundingClientRect().top-rect.top}));
 const focused=document.activeElement,focus=scroll.contains(focused)?{
  key:focused.closest('[data-review-key]')?.dataset.reviewKey,id:focused.id,
  action:focused.dataset.action,choice:focused.dataset.choice,
  kind:focused.hasAttribute('data-custom-correction')?'custom':focused.hasAttribute('data-remember-correction')?'remember':focused.hasAttribute('data-review-index')?'check':null,
  start:focused.selectionStart,end:focused.selectionEnd,direction:focused.selectionDirection
 }:null;
 scroll.innerHTML=body;
 const foot=modal.querySelector('.modal-footer');if(foot)foot.innerHTML=footer;
 const rows=[...scroll.querySelectorAll('[data-review-key]')];
 const anchor=anchors.map(a=>({a,card:rows.find(card=>card.dataset.reviewKey===a.key)})).find(row=>row.card);
 scroll.scrollTop=top;scroll.scrollLeft=left;
 if(anchor)scroll.scrollTop+=anchor.card.getBoundingClientRect().top-scroll.getBoundingClientRect().top-anchor.a.y;
 if(focus){
  const card=rows.find(card=>card.dataset.reviewKey===focus.key),fields=focus.key&&!card?[]:[...(card||scroll).querySelectorAll('input,button')];
  const field=fields.find(el=>focus.kind==='custom'?el.hasAttribute('data-custom-correction'):focus.kind==='remember'?el.hasAttribute('data-remember-correction'):focus.kind==='check'?el.hasAttribute('data-review-index'):focus.action&&el.dataset.action===focus.action&&el.dataset.choice===focus.choice)||fields.find(el=>focus.id&&el.id===focus.id);
  if(field){field.focus({preventScroll:true});if(focus.start!==null&&typeof field.setSelectionRange==='function')try{field.setSelectionRange(focus.start,focus.end,focus.direction);}catch{}}
 }
}
