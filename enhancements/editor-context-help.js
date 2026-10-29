import {t} from './i18n.js';
const actions={review:['Revisar','Verifique a ortografia e receba sugestões para melhorar seu texto.'],'auto-format':['Formatar','Analise o conteúdo e receba sugestões de destaque e organização.'],'notes-list':['Anotar','Adicione orientações privadas para consultar durante a apresentação.'],'rhythm-menu':['Ritmo','Defina como este trecho deve ser interpretado durante a apresentação.']};
const creation={speech:['Discurso','Crie, organize, ensaie e apresente seus discursos.'],part:['Demonstração','Prepare diálogos, identifique participantes e organize suas falas.']};
export function mountContextHelp(){
 let bubble=null,target=null,timer=0,press=null,suppress=null,hideTimer=0;
 const helpAreas='.editor-smart-actions,.reader-controls,.reader-top,.timer-dock';
 const buttonFor=node=>node?.closest?.('.editor-smart-actions button,.reader-controls button,.reader-top button,.timer-dock button,[data-creation-help],[data-creation-kind]');
 function content(button){if(button.dataset.creationHelp||button.dataset.creationKind)return creation[button.dataset.creationHelp||button.dataset.creationKind];if(button.closest('.reader-controls,.reader-top,.timer-dock'))return [button.getAttribute('aria-label')||button.title||button.textContent.trim(),''];return actions[button.dataset.action];}
 function hide(){clearTimeout(hideTimer);if(target){target.removeAttribute('aria-describedby');target=null;}bubble?.remove();bubble=null;}
 function show(button){const row=content(button);if(!row)return;hide();target=button;bubble=document.createElement('div');bubble.className='context-help-bubble';bubble.id='seprepareContextHelp';bubble.setAttribute('role','tooltip');const title=document.createElement('strong'),detail=document.createElement('span');title.textContent=t(row[0]);detail.textContent=t(row[1]);bubble.append(title,detail);document.body.append(bubble);button.setAttribute('aria-describedby',bubble.id);
  const rect=button.getBoundingClientRect(),bounds=bubble.getBoundingClientRect(),v=window.visualViewport,left=v?.offsetLeft||0,top=v?.offsetTop||0,width=v?.width||innerWidth,height=v?.height||innerHeight;
  bubble.style.left=Math.max(left+10,Math.min(rect.left+rect.width/2-bounds.width/2,left+width-bounds.width-10))+'px';bubble.style.top=(rect.top-bounds.height-10>=top+8?rect.top-bounds.height-10:Math.min(rect.bottom+10,top+height-bounds.height-10))+'px';hideTimer=setTimeout(hide,5500);
 }
 document.addEventListener('pointerover',event=>{if(event.pointerType!=='mouse')return;const button=buttonFor(event.target);if(button&&content(button))show(button);});
 document.addEventListener('pointerout',event=>{if(event.pointerType==='mouse'&&target&&!target.contains(event.relatedTarget))hide();});
 document.addEventListener('focusin',event=>{const button=buttonFor(event.target);if(button&&event.target.matches(':focus-visible'))show(button);});
 document.addEventListener('focusout',()=>hide());
 document.addEventListener('pointerdown',event=>{
  clearTimeout(timer);const button=buttonFor(event.target);if(!button||!content(button)){hide();return;}
  if(event.pointerType==='touch'&&button.closest(helpAreas)){press={x:event.clientX,y:event.clientY,button};timer=setTimeout(()=>{if(!press)return;suppress=button;show(button);},550);}
 },true);
 document.addEventListener('pointermove',event=>{if(press&&Math.hypot(event.clientX-press.x,event.clientY-press.y)>9){clearTimeout(timer);press=null;}} ,{passive:true});
 for(const type of ['pointerup','pointercancel'])document.addEventListener(type,()=>{clearTimeout(timer);press=null;setTimeout(()=>{suppress=null;},300);},true);
 document.addEventListener('click',event=>{const button=buttonFor(event.target);if(button&&suppress===button){event.preventDefault();event.stopImmediatePropagation();suppress=null;return;}suppress=null;if(button?.dataset.creationHelp){event.preventDefault();event.stopImmediatePropagation();show(button);}},true);
 document.addEventListener('contextmenu',event=>{if(buttonFor(event.target)?.closest(helpAreas))event.preventDefault();});
 window.addEventListener('resize',hide);document.addEventListener('keydown',event=>{if(event.key==='Escape')hide();});
 return {hide};
}
