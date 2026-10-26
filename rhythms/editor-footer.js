// The existing scroll/header gestures stay in app.js. Only the footer responds
// to expansion changes, and dismissal lasts for that expansion alone.
export function mountEditorFooter(shell){
 const footer=shell?.querySelector('.editor-status'),close=footer?.querySelector('[data-action="editor-footer-close"]');if(!footer||!close)return ()=>{};
 let expanded=shell.classList.contains('editor-scrolled');close.hidden=!expanded;footer.hidden=false;shell.classList.remove('editor-footer-hidden');
 const observer=new MutationObserver(()=>{const next=shell.classList.contains('editor-scrolled');if(next!==expanded){expanded=next;footer.hidden=false;close.hidden=!expanded;shell.classList.remove('editor-footer-hidden');}});
 observer.observe(shell,{attributes:true,attributeFilter:['class']});
 const dismiss=event=>{event.preventDefault();event.stopPropagation();if(expanded){footer.hidden=true;shell.classList.add('editor-footer-hidden');}};close.addEventListener('click',dismiss);
 return ()=>{observer.disconnect();close.removeEventListener('click',dismiss);};
}
