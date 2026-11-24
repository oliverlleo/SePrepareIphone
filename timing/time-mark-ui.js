import {TIME_MARK_ATTRIBUTE,TIME_POINT_ATTRIBUTE,parseTimeMark,timeMarkValue,formatTimeMark,compareTimeMark,timeMarks,timeMarkColors,timeLineEnd,previousTimeMark} from './time-mark-core.js';
import {estimateRhythms} from './rhythm-core.js';
export function createTimeMarkUI(c){
 const {$,rt}=c;
 let editorLayer=null,readerLayer=null,readerRows=[],selected=null,current=null,chosen=null,boundQ=null,observer=null,readerObserver=null,observedReader=null,frame=0,scrollFrame=0,modalCtx=null,pendingApply=false,switching=false,pressTimer=0,pressOrigin=null,suppressClick=false;
 const selector='[data-speech-time-point],[data-speech-time]';
 const put=(node,key,value)=>{if(node.dataset[key]!==value)node.dataset[key]=value;};
 const escText=value=>c.esc?c.esc(value):String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const savedMode=()=>{const mode=c.getState()?.settings?.timeMarkMode;return mode==='rhythm'||mode==='manual'?mode:'';};
 function rowIndex(q,row){
  let at=row.position;
  if(row.attribute===TIME_MARK_ATTRIBUTE){const [,offset]=q.getLine(at);at-=offset;}
  return Math.max(0,Math.min(at,q.getLength()-1));
 }
 function neutral(row){put(row.badge,'timeLabel',formatTimeMark(row.seconds));put(row.badge,'timeState','neutral');row.badge.title=c.t('Tempo previsto:')+' '+formatTimeMark(row.seconds);}
 function layer(parent,kind){parent.querySelector('.time-mark-layer')?.remove();const node=document.createElement('div');node.className='time-mark-layer time-mark-layer-'+kind;parent.append(node);return node;}
 function badge(container,seconds,editable){
  const node=document.createElement(editable?'button':'span');node.className='time-mark-badge';
  if(editable){node.type='button';node.setAttribute('aria-label',c.t('Editar referência de tempo')+' '+formatTimeMark(seconds));}
  else node.setAttribute('aria-hidden','true');
  container.append(node);return node;
 }
 function showRemoval(){
  const button=$('#editorTimeAction');if(!button)return;
  const label=c.t(chosen?'Remover tempo':'Marcar tempo'),mode=savedMode();
  button.dataset.action=chosen?'time-mark-remove':'time-mark';
  button.innerHTML=c.icon(chosen?'Trash2':'Clock')+'<span>'+escText(label)+'</span>';
  button.setAttribute('aria-label',label);
  button.title=chosen?label+' · '+formatTimeMark(chosen.seconds):(mode?label+' · '+c.t(mode==='manual'?'Tempo manual':'Pelo ritmo'):label);
 }
 function saveMode(mode){
  const state=c.getState();if(!state.settings)state.settings={};
  const previous=state.settings.timeMarkMode;
  state.settings.timeMarkMode=mode;
  if(c.persist(true)===false){
   if(previous===undefined)delete state.settings.timeMarkMode;else state.settings.timeMarkMode=previous;
   return false;
  }
  showRemoval();return true;
 }
 function estimateAt(q,index,end,marks=timeMarks(q.getContents())){
  if(end===null||end===undefined)return 0;
  const anchor=previousTimeMark(q,index,end,marks);
  const slice=anchor?q.getContents(anchor.end,Math.max(0,end-anchor.end)):q.getContents(0,end);
  return Math.round((anchor?anchor.seconds:0)+estimateRhythms(slice,c.getState()?.settings?.pace).seconds);
 }
 function capture(existingRow=null){
  const q=rt.q;if(!q)return null;
  const rawRange=q.getSelection()||rt.selection||{index:0,length:0};
  const index=existingRow?rowIndex(q,existingRow):Math.max(0,Math.min(rawRange.index,q.getLength()-1));
  return {q,range:existingRow?{index,length:0}:{index:rawRange.index,length:rawRange.length||0},index,end:timeLineEnd(q,index),scroll:document.querySelector('.editor-scroll')?.scrollTop||0,existingRow};
 }
 function restore(ctx=modalCtx){
  if(!ctx||rt.q!==ctx.q||rt.view!=='editor')return;
  const {q,range,scroll}=ctx;
  q.focus({preventScroll:true});q.setSelection(range,'silent');rt.selection={...range};
  const el=document.querySelector('.editor-scroll');if(el)el.scrollTop=scroll;
 }
 function onClose(){
  if(switching)return;
  if(rt.modal?.startsWith('time-mark-'))restore();
  modalCtx=null;pendingApply=false;
 }
 function selectAt(range,marks){
  if(!rt.q)return;
  const q=rt.q,top=q.getBounds(range.index,0)?.top;
  chosen=(marks||timeMarks(q.getContents())).find(row=>{const bounds=q.getBounds(rowIndex(q,row),0);return top!==undefined&&bounds&&Math.abs(bounds.top-top)<=1;})||null;
  showRemoval();
 }
 function editorRender(){
  const q=rt.q,parent=q?.root.closest('.editor-page');if(!q||!parent)return;
  const marks=timeMarks(q.getContents());selectAt(q.getSelection()||rt.selection||{index:0,length:0},marks);
  q.root.classList.toggle('has-time-points',!!marks.length);editorLayer=layer(parent,'editor');
  editorLayer.style.right=Math.max(0,parent.getBoundingClientRect().right-q.root.getBoundingClientRect().right)+'px';
  const relative=q.root.getBoundingClientRect().top-parent.getBoundingClientRect().top;
  for(const row of marks){
   const at=rowIndex(q,row),bounds=q.getBounds(at,1);if(!bounds)continue;
   const node=badge(editorLayer,row.seconds,true),item={...row,badge:node};neutral(item);
   node.style.top=Math.max(0,relative+bounds.top)+'px';
   node.addEventListener('pointerdown',e=>e.preventDefault());
   node.addEventListener('click',()=>{q.setSelection(at,0,'silent');rt.selection={index:at,length:0};chosen=row;showRemoval();openTimeForm({mode:'edit',row});});
  }
 }
 function schedule(){if(frame)return;frame=requestAnimationFrame(()=>{frame=0;if(rt.view==='editor')editorRender();else if(rt.view==='reader')readerRender();});}
 function refreshEditor(){
  const q=rt.q;if(!q)return;
  if(boundQ!==q){observer?.disconnect();boundQ=q;observer=new ResizeObserver(schedule);observer.observe(q.root);q.on('selection-change',range=>{if(range&&q===rt.q)selectAt(range);});chosen=null;showRemoval();}
  schedule();
 }
 function applyMarkAt(ctx,seconds,labelKey='Tempo marcado:'){
  const q=ctx?.q;if(!q||ctx.end===null||ctx.end===undefined){c.toast(c.t('Posicione o cursor no texto para marcar o tempo.'));return false;}
  if(!Number.isSafeInteger(seconds)||seconds<0||seconds>999999){c.toast(c.t('A estimativa ultrapassa o limite de tempo da marcação.'));return false;}
  const index=ctx.index;let at=index,length=1,attribute=TIME_POINT_ATTRIBUTE;const ch=q.getText(at,1);
  if(ch==='\n'){if(at>0&&q.getText(at-1,1)!=='\n')at--;else attribute=TIME_MARK_ATTRIBUTE;}
  if(attribute===TIME_POINT_ATTRIBUTE){const cp=q.getText(at,2);if(cp.charCodeAt(0)>=0xdc00&&cp.charCodeAt(0)<=0xdfff&&at>0){at--;length=2;}else if(cp.codePointAt(0)>0xffff)length=2;}
  const existing=timeMarks(q.getContents()),atTop=q.getBounds(index,0)?.top;let pointValue=String(seconds);
  if(attribute===TIME_POINT_ATTRIBUTE){const previous=existing.find(row=>row.attribute===attribute&&row.position===at);pointValue=previous&&previous.seconds===seconds?previous.value:String(seconds)+'@'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2));}
  q.history.cutoff();
  const toClear=existing.filter(row=>{
   if(ctx.existingRow&&row.attribute===ctx.existingRow.attribute&&row.position===ctx.existingRow.position)return true;
   const top=q.getBounds(rowIndex(q,row),0)?.top;return atTop!==undefined&&top!==undefined&&Math.abs(top-atTop)<=1;
  });
  for(const row of toClear){if(row.attribute===TIME_MARK_ATTRIBUTE)q.formatLine(row.position,1,row.attribute,false,'user');else q.formatText(row.position,row.length,row.attribute,false,'user');}
  if(attribute===TIME_MARK_ATTRIBUTE)q.formatLine(at,1,attribute,String(seconds),'user');else q.formatText(at,length,attribute,pointValue,'user');
  q.history.cutoff();q.focus({preventScroll:true});q.setSelection(index,0,'silent');rt.selection={index,length:0};
  const el=document.querySelector('.editor-scroll');if(el&&ctx.scroll!==undefined)el.scrollTop=ctx.scroll;
  if(c.persist(true)!==false)globalThis.SePrepareMetrics?.used('tempo','salvar_marca',{modo:labelKey==='Tempo até esta linha:'?'ritmo':'manual'});
  chosen={position:at,length,attribute,seconds,value:pointValue};showRemoval();refreshEditor();
  c.toast(c.t(labelKey)+' '+formatTimeMark(seconds));return true;
 }
 function removeRow(row,ctx=null){
  const q=ctx?.q||rt.q;if(!q||!row)return false;
  q.history.cutoff();
  if(row.attribute===TIME_MARK_ATTRIBUTE)q.formatLine(row.position,1,row.attribute,false,'user');
  else q.formatText(row.position,row.length,row.attribute,false,'user');
  q.history.cutoff();
  if(ctx)restore(ctx);
  chosen=null;showRemoval();c.persist(true);refreshEditor();return true;
 }
 function openModePicker(options={}){
  const pending=!!options.pendingApply;
  if(!modalCtx||(rt.modal!=='time-mark-manual'&&rt.modal!=='time-mark-mode'))modalCtx=capture(chosen);
  pendingApply=pending;if(!modalCtx)return;
  const currentMode=savedMode(),estimate=modalCtx.end!==null?Math.min(999999,Math.max(0,estimateAt(modalCtx.q,modalCtx.index,modalCtx.end))):null;
  const optionHtml=(id,iconName,titleKey,descKey,extra='')=>{
   const on=currentMode===id;
   return `<button type="button" class="sheet-option time-mark-mode-option${on?' selected':''}" data-action="time-mark-choose-mode" data-id="${id}" aria-pressed="${on}">${c.icon(iconName)}<span><strong>${escText(c.t(titleKey))}${extra?' <small class="time-mark-mode-preview">'+escText(extra)+'</small>':''}</strong><small>${escText(c.t(descKey))}</small></span>${c.icon(on?'Check':'ChevronRight')}</button>`;
  };
  const body=`<p class="help">${escText(c.t('Escolha como o botão Marcar tempo funciona. Depois, segure o botão quando quiser trocar.'))}</p><div class="sheet-options time-mark-mode-list">${optionHtml('rhythm','Music','Pelo ritmo','Calcula automaticamente até esta linha.',estimate!==null?formatTimeMark(estimate):'')}${optionHtml('manual','Clock','Tempo manual','Ignora o ritmo e deixa você escolher minutos e segundos.')}</div>`;
  switching=true;c.openModal(c.t('Como marcar o tempo?'),body);switching=false;
  rt.modal='time-mark-mode';document.querySelector('.modal')?.classList.add('time-mark-dialog');
 }
 function openTimeForm({mode='create',row=null}={}){
  const isEdit=mode==='edit';
  if(isEdit)modalCtx=capture(row);else if(!modalCtx)modalCtx=capture(null);
  const ctx=modalCtx;
  if(!ctx||ctx.end===null||ctx.end===undefined){c.toast(c.t('Posicione o cursor no texto para marcar o tempo.'));modalCtx=null;return;}
  const suggested=Math.min(999999,Math.max(0,estimateAt(ctx.q,ctx.index,ctx.end)));
  const initial=isEdit&&row?row.seconds:suggested,mins=Math.floor(initial/60),secs=initial%60;
  const body=`<div class="stack">
   <div class="time-mark-inputs">
    <div class="field"><label for="timeMarkMinutes">${escText(c.t('Minutos'))}</label><input id="timeMarkMinutes" type="number" min="0" max="16666" step="1" inputmode="numeric" value="${mins}"></div>
    <span class="time-mark-sep" aria-hidden="true">:</span>
    <div class="field"><label for="timeMarkSeconds">${escText(c.t('Segundos'))}</label><input id="timeMarkSeconds" type="number" min="0" max="59" step="1" inputmode="numeric" value="${String(secs).padStart(2,'0')}"></div>
   </div>
   <div class="time-mark-steps" role="group" aria-label="${escText(c.t(isEdit?'Editar tempo':'Tempo manual'))}">
    <button type="button" class="btn secondary small" data-action="time-mark-step" data-id="-30">−30s</button>
    <button type="button" class="btn secondary small" data-action="time-mark-step" data-id="30">+30s</button>
    <button type="button" class="btn secondary small" data-action="time-mark-step" data-id="60">+1m</button>
   </div>
   <div class="time-mark-rhythm-bar">
    <span>${escText(c.t('Estimativa pelo ritmo'))}: <strong>${formatTimeMark(suggested)}</strong></span>
    <button type="button" class="btn secondary small" data-action="time-mark-apply-rhythm">${escText(c.t('Usar ritmo'))}</button>
   </div>
   <p id="timeMarkError" class="time-mark-error" role="alert" hidden></p>
   ${!isEdit?`<div class="time-mark-hint-row"><small>${escText(c.t('Segure em Marcar tempo para trocar entre ritmo e manual.'))}</small><button type="button" class="btn link small" data-action="time-mark-mode-menu">${escText(c.t('Trocar modo'))}</button></div>`:''}
  </div>`;
  const footer=isEdit
   ?c.btn('time-mark-remove',c.t('Remover'),'Trash2','link danger')+c.btn('time-mark-save',c.t('Salvar'),'Check')
   :c.btn('close-modal',c.t('Cancelar'),'','secondary')+c.btn('time-mark-save',c.t('Salvar'),'Check');
  switching=true;c.openModal(c.t(isEdit?'Editar tempo':'Tempo manual'),body,footer);switching=false;
  rt.modal=isEdit?'time-mark-edit':'time-mark-manual';document.querySelector('.modal')?.classList.add('time-mark-dialog');
  for(const input of [$('#timeMarkMinutes'),$('#timeMarkSeconds')]){
   if(!input)continue;
   input.addEventListener('focus',()=>{try{input.select();}catch{}});
   input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();saveForm();}});
  }
 }
 function saveForm(){
  const mEl=$('#timeMarkMinutes'),sEl=$('#timeMarkSeconds'),err=$('#timeMarkError');if(!mEl||!sEl)return;
  const rawM=mEl.value.trim(),rawS=sEl.value.trim();
  const invalid=mEl.validity?.badInput||sEl.validity?.badInput||!/^\d*$/.test(rawM)||!/^\d*$/.test(rawS)||(rawM===''&&rawS==='');
  try{
   if(invalid)throw Error('Informe minutos e segundos válidos.');
   const total=Number(timeMarkValue(rawM===''?0:Number(rawM),rawS===''?0:Number(rawS))),ctx=modalCtx;
   switching=true;c.closeModal();switching=false;modalCtx=null;pendingApply=false;
   applyMarkAt(ctx,total,'Tempo marcado:');
  }catch(error){if(err){err.hidden=false;err.textContent=c.t(error.message);}}
 }
 function stepForm(delta){
  const mEl=$('#timeMarkMinutes'),sEl=$('#timeMarkSeconds'),err=$('#timeMarkError');if(!mEl||!sEl||!Number.isFinite(delta))return;
  const rawM=mEl.value.trim(),rawS=sEl.value.trim();
  const curM=/^\d+$/.test(rawM)?Number(rawM):0,curS=/^\d+$/.test(rawS)?Number(rawS):0;
  const next=Math.max(0,Math.min(999999,curM*60+curS+delta));
  mEl.value=String(Math.floor(next/60));sEl.value=String(next%60).padStart(2,'0');
  if(err){err.hidden=true;err.textContent='';}
 }
 function mark(){
  const ctx=capture(null);if(!ctx||ctx.end===null){c.toast(c.t('Posicione o cursor no texto para marcar o tempo.'));return;}
  const mode=savedMode();
  if(!mode){modalCtx=ctx;openModePicker({pendingApply:true});return;}
  if(mode==='manual'){modalCtx=ctx;pendingApply=false;openTimeForm({mode:'create'});return;}
  applyMarkAt(ctx,estimateAt(ctx.q,ctx.index,ctx.end),'Tempo até esta linha:');
 }
 const clearPress=()=>{clearTimeout(pressTimer);pressTimer=0;pressOrigin=null;};
 const samePointer=event=>!pressOrigin||((event.pointerId===undefined||pressOrigin.pointerId===undefined||event.pointerId===pressOrigin.pointerId)&&(!event.pointerType||!pressOrigin.pointerType||event.pointerType===pressOrigin.pointerType));
 document.addEventListener('pointerdown',event=>{
  clearPress();const button=event.target.closest?.('#editorTimeAction');
  if(!button||rt.view!=='editor'||rt.modal||(event.pointerType==='mouse'&&event.button!==0))return;
  suppressClick=false;pressOrigin={x:event.clientX||0,y:event.clientY||0,button,pointerId:event.pointerId,pointerType:event.pointerType||''};
  pressTimer=setTimeout(()=>{if(!pressOrigin||rt.view!=='editor'||rt.modal)return;suppressClick=true;pressOrigin=null;pressTimer=0;openModePicker({pendingApply:false});},500);
 },true);
 document.addEventListener('pointermove',event=>{if(pressOrigin&&samePointer(event)&&Math.hypot((event.clientX||0)-pressOrigin.x,(event.clientY||0)-pressOrigin.y)>9)clearPress();},{passive:true});
 for(const type of ['pointerup','pointercancel'])document.addEventListener(type,event=>{if(pressOrigin&&!samePointer(event))return;clearPress();if(suppressClick)setTimeout(()=>{suppressClick=false;},350);},true);
 document.addEventListener('click',event=>{if(suppressClick&&(event.target.closest?.('#editorTimeAction')||event.target.classList?.contains('modal-backdrop'))){event.preventDefault();event.stopImmediatePropagation();suppressClick=false;}},true);
 document.addEventListener('contextmenu',event=>{const button=event.target.closest?.('#editorTimeAction');if(!button||rt.view!=='editor')return;event.preventDefault();if(!suppressClick&&!rt.modal)openModePicker({pendingApply:false});});
 function anchorRect(node){const walker=document.createTreeWalker(node,4),text=walker.nextNode();if(!text)return node.getBoundingClientRect();const range=document.createRange();range.setStart(text,0);range.setEnd(text,Math.min(1,text.length));return range.getBoundingClientRect();}
 function readerRender(){
  const root=$('#readerText'),parent=root?.closest('.reader-paper');if(!root||!parent)return;
  if(observedReader!==root){readerObserver?.disconnect();observedReader=root;readerObserver=new ResizeObserver(schedule);readerObserver.observe(root);}
  const nodes=[...root.querySelectorAll(selector)].filter(node=>parseTimeMark(node.getAttribute('data-speech-time-point')??node.getAttribute('data-speech-time'))!==null);
  const visible=c.getActive()?.read?.showTimeMarks!==false;root.classList.toggle('has-time-points',visible&&!!nodes.length);
  readerLayer=layer(parent,'reader');readerLayer.style.right=Math.max(0,parent.getBoundingClientRect().right-root.getBoundingClientRect().right)+'px';
  readerLayer.hidden=!visible;readerRows=[];current=null;
  if(visible){const top=parent.getBoundingClientRect().top;for(const node of nodes){const seconds=parseTimeMark(node.getAttribute('data-speech-time-point')??node.getAttribute('data-speech-time')),b=badge(readerLayer,seconds,false),row={node,badge:b,seconds};neutral(row);b.style.top=Math.max(0,anchorRect(node).top-top)+'px';readerRows.push(row);}}
  locate();tick();
 }
 function visibleTop(){const topBar=document.querySelector('.reader-top');if(!topBar)return 0;const pos=globalThis.getComputedStyle?.(topBar)?.position;if(pos!=='sticky'&&pos!=='fixed')return 0;const box=topBar.getBoundingClientRect();return box.height>0&&box.bottom>0?box.bottom:0;}
 function locate(){const topEdge=visibleTop(),bottomEdge=innerHeight;selected=null;for(const row of readerRows){if(!row.node.isConnected)continue;const rect=anchorRect(row.node),lineBottom=rect.bottom>rect.top?rect.bottom:rect.top;if(lineBottom>=topEdge&&rect.top<=bottomEdge){selected=row;break;}}}
 function tick(){
  if(rt.view!=='reader')return;if(c.getActive()?.read?.showTimeMarks===false)return;
  locate();if(!selected){if(current)neutral(current);current=null;return;}
  const doc=c.getActive();if(current&&current!==selected)neutral(current);current=selected;if(!(doc.timer.running||doc.timer.active||doc.timer.elapsedMs>0)){neutral(current);return;}
  const elapsed=c.elapsed()/1000,result=compareTimeMark(current.seconds,elapsed),delta=Math.round(result.difference),diff=result.state==='on-time'?'✓':(delta<0?'−':'+')+(Math.abs(delta)>99?Math.round(Math.abs(delta)/60)+'m':Math.abs(delta)+'s');
  put(current.badge,'timeLabel',formatTimeMark(current.seconds)+' '+diff);put(current.badge,'timeState',result.state);
  const colors=timeMarkColors(result.state,result.intensity);
  current.badge.style.setProperty('--time-background',colors.background);current.badge.style.setProperty('--time-foreground',colors.foreground);
  current.badge.title='Previsto '+formatTimeMark(current.seconds)+' · cronômetro '+formatTimeMark(Math.floor(elapsed))+' · diferença '+delta+' segundos';
 }
 window.addEventListener('scroll',()=>{if(rt.view!=='reader'||scrollFrame)return;scrollFrame=requestAnimationFrame(()=>{scrollFrame=0;locate();tick();});},{passive:true});
 window.addEventListener('resize',schedule,{passive:true});document.fonts?.ready.then(schedule);
 function handle(action,id){
  switch(action){
   case 'time-mark':mark();return true;
   case 'time-mark-recalculate':{const ctx=capture(null);if(ctx&&ctx.end!==null)applyMarkAt(ctx,estimateAt(ctx.q,ctx.index,ctx.end),'Tempo até esta linha:');else c.toast(c.t('Posicione o cursor no texto para marcar o tempo.'));return true;}
   case 'time-mark-remove':{
    if(rt.modal==='time-mark-edit'&&modalCtx?.existingRow){const ctx=modalCtx;switching=true;c.closeModal();switching=false;modalCtx=null;pendingApply=false;removeRow(ctx.existingRow,ctx);return true;}
    removeRow(chosen);return true;
   }
   case 'time-mark-choose-mode':{
    if(id!=='rhythm'&&id!=='manual')return true;
    if(!saveMode(id))return true;
    const ctx=modalCtx,apply=pendingApply;
    if(id==='rhythm'){
     switching=true;c.closeModal();switching=false;modalCtx=null;pendingApply=false;
     if(apply&&ctx&&ctx.end!==null)applyMarkAt(ctx,estimateAt(ctx.q,ctx.index,ctx.end),'Tempo até esta linha:');
     else{restore(ctx);c.toast(c.t('Modo de marcação: Pelo ritmo'));}
    }else{
     if((apply||!ctx?.existingRow)&&ctx&&ctx.end!==null){pendingApply=false;openTimeForm({mode:'create'});}
     else{switching=true;c.closeModal();switching=false;modalCtx=null;pendingApply=false;restore(ctx);c.toast(c.t('Modo de marcação: Tempo manual'));}
    }
    return true;
   }
   case 'time-mark-mode-menu':openModePicker({pendingApply:false});return true;
   case 'time-mark-step':stepForm(Number(id));return true;
   case 'time-mark-apply-rhythm':{const ctx=modalCtx;if(!ctx)return true;const seconds=estimateAt(ctx.q,ctx.index,ctx.end);switching=true;c.closeModal();switching=false;modalCtx=null;pendingApply=false;applyMarkAt(ctx,seconds,'Tempo até esta linha:');return true;}
   case 'time-mark-save':saveForm();return true;
   default:return false;
  }
 }
 return {handle,onClose,refreshEditor,refreshReader:readerRender,tick,readingOptions(){return `<label class="check-label"><input id="readTimeMarks" type="checkbox" ${c.getActive()?.read?.showTimeMarks!==false?'checked':''}>Mostrar marcações de tempo</label>`;},bindReading(){const node=$('#readTimeMarks');node?.addEventListener('change',()=>{c.getActive().read.showTimeMarks=node.checked;c.persist(true);readerRender();});}};
}
