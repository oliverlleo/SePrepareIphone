// Reveal names only when the full row fits at the user's current font size.
export function mountReaderTools(bar,names){
 if(!bar)return ()=>{};
 for(const [action,name] of Object.entries(names)){const button=bar.querySelector(`[data-action="${action}"]`);if(!button)continue;const label=document.createElement('span');label.className='reader-tool-label';label.textContent=name;label.setAttribute('aria-hidden','true');button.append(label);}
 let frame=0,stopped=false;
 function measure(){frame=0;if(stopped||!bar.isConnected)return;const buttons=[...bar.children],gap=parseFloat(getComputedStyle(bar).columnGap)||0;
  const parent=bar.closest('.reader-controls'),desktop=window.matchMedia('(min-width:800px)').matches,ps=parent&&getComputedStyle(parent);
  const capacity=desktop&&parent?.clientWidth>0?parent.clientWidth-(parseFloat(ps.paddingLeft)||0)-(parseFloat(ps.paddingRight)||0)-(parent.querySelector('.reader-primary-timer')?.getBoundingClientRect().width||0)-(parseFloat(ps.columnGap)||0):bar.clientWidth;
  const listen=buttons.find(button=>button.dataset.action==='speak'),listenWidth=listen?.querySelector('span')?.getBoundingClientRect().width||0,compact=Math.max(72,48+listenWidth)+(buttons.length-1)*44+(buttons.length-1)*gap,audioOnly=compact>capacity;bar.classList.toggle('icon-only-audio',audioOnly);
  const required=buttons.reduce((total,button)=>{const label=button.querySelector('span'),width=label?.getBoundingClientRect().width||0;return total+Math.max(44,20+6+width+22);},Math.max(0,buttons.length-1)*gap);
  // Small safety margin avoids oscillation from rounding at the fit boundary.
  const showNames=required+4<=capacity;bar.classList.toggle('show-tool-names',showNames);
  if(desktop&&parent){const width=Math.ceil(Math.min(capacity,showNames?required+4:audioOnly?buttons.length*44+(buttons.length-1)*gap:compact));if(parent.style.getPropertyValue('--reader-tools-width')!==width+'px')parent.style.setProperty('--reader-tools-width',width+'px');}
  else parent?.style.removeProperty('--reader-tools-width');
 }
 function schedule(){if(!frame)frame=requestAnimationFrame(measure);}
 const observer=new ResizeObserver(schedule);observer.observe(bar);
 const mutations=new MutationObserver(schedule);mutations.observe(bar,{childList:true,subtree:true,characterData:true});
 window.addEventListener('resize',schedule,{passive:true});document.fonts?.ready.then(schedule);schedule();
 return ()=>{stopped=true;observer.disconnect();mutations.disconnect();window.removeEventListener('resize',schedule);if(frame)cancelAnimationFrame(frame);};
}
