import {t,tr,h} from './i18n.js';
import {findTextMatches,searchableText,replacementEdit} from './editor-find-core.js';
import {styledInsertion} from './editor-text-ops.js';
export function mountEditorFind({q,root,Delta,icon,persist,checkpoint,toast}){
 let panel=null,layer=null,matches=[],current=-1,frame=0,query='',caseSensitive=false,wholeWord=false,tab='find',destroyed=false;
 const scroller=root.querySelector('.editor-scroll');
 const fields=()=>({query:panel.querySelector('#editorFindQuery'),replacement:panel.querySelector('#editorReplaceText'),count:panel.querySelector('#editorFindCount'),message:panel.querySelector('#editorFindMessage')});
 function domRange(index,length){
  const [first,from]=q.getLeaf(index),[last,to]=q.getLeaf(index+length);
  if(first?.domNode?.nodeType!==3||last?.domNode?.nodeType!==3)return null;
  const range=document.createRange();range.setStart(first.domNode,Math.min(from,first.domNode.length));range.setEnd(last.domNode,Math.min(to,last.domNode.length));return range;
 }
 function draw(){
  frame=0;if(!panel||!layer||destroyed)return;
  root.style.setProperty('--find-space',panel.offsetHeight+50+'px');layer.replaceChildren();if(!matches.length)return;
  const bounds=q.container.getBoundingClientRect(),visible=scroller.getBoundingClientRect();
  const top=visible.top-bounds.top-60,bottom=visible.bottom-bounds.top+60;
  let low=0,high=matches.length;
  while(low<high){const middle=(low+high)>>1,box=q.getBounds(matches[middle].index,matches[middle].length);if(box.top+box.height<top)low=middle+1;else high=middle;}
  const fragment=document.createDocumentFragment();
  for(let i=low;i<matches.length;i++){
   const hit=matches[i],box=q.getBounds(hit.index,hit.length);if(box.top>bottom)break;
   const range=domRange(hit.index,hit.length);if(!range)continue;
   for(const rect of range.getClientRects()){
    if(!rect.width||rect.bottom<visible.top||rect.top>visible.bottom)continue;
    const mark=document.createElement('span');mark.className='editor-find-mark'+(i===current?' current':'');
    Object.assign(mark.style,{left:rect.left-bounds.left+'px',top:rect.top-bounds.top+'px',width:rect.width+'px',height:rect.height+'px'});fragment.append(mark);
   }
  }
  layer.append(fragment);
 }
 function schedule(){if(!frame)frame=requestAnimationFrame(draw);}
 function reflect(){
  if(!panel)return;fields().count.textContent=matches.length?tr`${current+1} de ${matches.length}`:t('Nenhum resultado');
  for(const button of panel.querySelectorAll('[data-search-action="previous"],[data-search-action="next"],[data-search-action="replace"],[data-search-action="replace-all"]'))button.disabled=!matches.length;
  schedule();
 }
 function reveal(){
  if(current<0)return;const hit=matches[current],box=q.getBounds(hit.index,hit.length),container=q.container.getBoundingClientRect(),scroll=scroller.getBoundingClientRect(),panelTop=panel.getBoundingClientRect().top;
  const panelBox=panel.getBoundingClientRect(),overlaps=container.left+box.left+box.width>panelBox.left&&container.left+box.left<panelBox.right;
  const y=container.top+box.top,limit=(overlaps?Math.min(scroll.bottom,panelTop):scroll.bottom)-35;
  if(y<scroll.top+35||y+box.height>limit)scroller.scrollTop+=y-scroll.top-Math.max(25,(limit-scroll.top)*.3);
  schedule();
 }
 function update(revealMatch=true){
  if(!panel)return;query=fields().query.value;caseSensitive=panel.querySelector('#editorFindCase').checked;wholeWord=panel.querySelector('#editorFindWhole').checked;
  const previous=matches[current]?.index||0;matches=findTextMatches(searchableText(q.getContents()),query,{caseSensitive,wholeWord});current=matches.length?Math.max(0,matches.findIndex(hit=>hit.index>=previous)):-1;reflect();if(revealMatch)reveal();
 }
 function navigate(step){if(!matches.length)return;current=(current+step+matches.length)%matches.length;reflect();reveal();}
 function replace(all=false){
  if(!panel||!query)return;update(false);if(current<0)return;
  const replacement=fields().replacement.value,selected=all?matches.slice():[matches[current]],after=selected[0].index+replacement.length;
  checkpoint(t('Antes de buscar e substituir'));q.history.cutoff();q.updateContents(replacementEdit(q,selected,replacement,Delta,styledInsertion),'user');q.history.cutoff();persist(true);
  matches=findTextMatches(searchableText(q.getContents()),query,{caseSensitive,wholeWord});current=matches.length?(all?0:Math.max(0,matches.findIndex(hit=>hit.index>=after))):-1;
  fields().message.textContent=selected.length===1?t('1 substituição realizada.'):tr`${selected.length} substituições realizadas.`;reflect();reveal();
 }
 function changeTab(value){tab=value;panel.classList.toggle('is-replace',value==='replace-tab');panel.querySelectorAll('[role="tab"]').forEach(button=>{button.setAttribute('aria-selected',String(button.dataset.searchAction===value));button.tabIndex=button.dataset.searchAction===value?0:-1;});panel.querySelector('.editor-replace-controls').hidden=value!=='replace-tab';schedule();}
 function close(){if(!panel)return;panel.remove();layer?.remove();panel=null;layer=null;matches=[];current=-1;root.classList.remove('editor-find-open');if(frame)cancelAnimationFrame(frame);frame=0;}
 function open(){
  if(panel){fields().query.focus();return;}
  panel=document.createElement('section');panel.className='editor-find-panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-labelledby','editorFindTitle');
  panel.innerHTML=h`<header><h2 id="editorFindTitle">Buscar e substituir</h2><button type="button" class="icon-btn" data-search-action="close" aria-label="Fechar busca">${icon('X')}</button></header><div class="editor-find-tabs" role="tablist" aria-label="Modo de pesquisa"><button type="button" role="tab" aria-selected="true" data-search-action="find">Buscar</button><button type="button" role="tab" aria-selected="false" tabindex="-1" data-search-action="replace-tab">Substituir</button></div><label class="field editor-find-query"><span>Buscar no texto</span><input type="search" id="editorFindQuery" autocomplete="off" maxlength="1000"></label><div class="editor-find-filters"><label><input type="checkbox" id="editorFindCase">Diferenciar maiúsculas e minúsculas</label><label><input type="checkbox" id="editorFindWhole">Palavras inteiras</label></div><div class="editor-find-navigation"><span id="editorFindCount" role="status" aria-live="polite">Nenhum resultado</span><button type="button" class="icon-btn" data-search-action="previous" aria-label="Resultado anterior">${icon('ArrowUp')}</button><button type="button" class="icon-btn" data-search-action="next" aria-label="Próximo resultado">${icon('ChevronDown')}</button></div><div class="editor-replace-controls" hidden><label class="field"><span>Substituir por</span><input type="text" id="editorReplaceText" autocomplete="off" maxlength="1000"></label><div class="editor-find-replace-actions"><button type="button" class="btn secondary small" data-search-action="replace">Substituir</button><button type="button" class="btn small" data-search-action="replace-all">Substituir todas</button></div></div><p id="editorFindMessage" class="notice" role="status" aria-live="polite"></p>`;
  layer=document.createElement('div');layer.className='editor-find-layer';layer.setAttribute('aria-hidden','true');q.container.append(layer);root.append(panel);root.classList.add('editor-find-open');
  panel.addEventListener('input',event=>{if(event.target!==fields().replacement)update();});
  panel.addEventListener('change',event=>{if(event.target.type==='checkbox')update();});
  panel.addEventListener('click',event=>{const action=event.target.closest('[data-search-action]')?.dataset.searchAction;if(!action)return;if(action==='close')close();else if(action==='find'||action==='replace-tab')changeTab(action);else if(action==='previous')navigate(-1);else if(action==='next')navigate(1);else if(action==='replace'||action==='replace-all')replace(action==='replace-all');});
  panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}else if(event.key==='Enter'){event.preventDefault();navigate(event.shiftKey?-1:1);}else if(['ArrowLeft','ArrowRight'].includes(event.key)&&event.target.matches('[role="tab"]')){event.preventDefault();changeTab(tab==='find'?'replace-tab':'find');panel.querySelector('[aria-selected="true"]').focus();}});
  const range=q.getSelection()||{index:0,length:0};fields().query.value=range.length&&range.length<=1000?searchableText(q.getContents(range.index,range.length)):query;
  changeTab(tab);update();fields().query.focus();
 }
 const onText=()=>{if(panel)update(false);},onKey=event=>{if((event.ctrlKey||event.metaKey)&&['f','h'].includes(event.key.toLowerCase())){event.preventDefault();event.stopPropagation();open();if(event.key.toLowerCase()==='h')changeTab('replace-tab');}};
 q.on('text-change',onText);root.addEventListener('keydown',onKey,true);scroller.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);const viewport=window.visualViewport;const onViewport=()=>{root.style.setProperty('--find-keyboard',Math.max(0,innerHeight-(viewport?.height||innerHeight)-(viewport?.offsetTop||0))+'px');if(panel)reveal();schedule();};viewport?.addEventListener('resize',onViewport);onViewport();const observer=new ResizeObserver(schedule);observer.observe(q.root);
 return {open,close,isOpen:()=>!!panel,destroy(){destroyed=true;close();q.off('text-change',onText);root.removeEventListener('keydown',onKey,true);scroller.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);viewport?.removeEventListener('resize',onViewport);observer.disconnect();}};
}
