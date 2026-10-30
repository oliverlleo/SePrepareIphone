export function mountToolbarIndicator(toolbar){
 const track=document.createElement('div');track.className='toolbar-scroll-indicator';track.hidden=true;track.setAttribute('role','scrollbar');track.setAttribute('aria-orientation','horizontal');track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax','100');track.setAttribute('aria-label',toolbar.getAttribute('aria-label'));track.tabIndex=0;
 const thumb=document.createElement('span');thumb.className='toolbar-scroll-thumb';track.append(thumb);toolbar.after(track);
 let frame=0,drag=null;
 function update(){frame=0;const max=toolbar.scrollWidth-toolbar.clientWidth;track.hidden=max<=1;if(track.hidden)return;const width=track.clientWidth,size=Math.min(width,Math.max(24,width*toolbar.clientWidth/toolbar.scrollWidth)),left=Math.max(0,Math.min(max,toolbar.scrollLeft))/max*(width-size);thumb.style.width=size+'px';thumb.style.transform='translateX('+left+'px)';track.setAttribute('aria-valuenow',String(Math.round(Math.max(0,toolbar.scrollLeft)/max*100)));}
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(update);};
 const observer=new ResizeObserver(schedule);observer.observe(toolbar);for(const child of toolbar.children)observer.observe(child);
 toolbar.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);document.fonts?.ready.then(schedule);
 track.addEventListener('pointerdown',event=>{event.preventDefault();const max=toolbar.scrollWidth-toolbar.clientWidth,space=track.clientWidth-thumb.clientWidth;if(!max||!space)return;if(event.target!==thumb)toolbar.scrollLeft=Math.max(0,Math.min(1,(event.clientX-track.getBoundingClientRect().left-thumb.clientWidth/2)/space))*max;drag={x:event.clientX,left:toolbar.scrollLeft,scale:max/space};track.setPointerCapture(event.pointerId);});
 track.addEventListener('pointermove',event=>{if(drag)toolbar.scrollLeft=drag.left+(event.clientX-drag.x)*drag.scale;});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])track.addEventListener(event,()=>{drag=null;});
 track.addEventListener('keydown',event=>{if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();toolbar.scrollLeft+=event.key==='ArrowRight'?60:-60;}if(event.key==='Home'||event.key==='End'){event.preventDefault();toolbar.scrollLeft=event.key==='Home'?0:toolbar.scrollWidth;}});
 update();return ()=>{observer.disconnect();toolbar.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);if(frame)cancelAnimationFrame(frame);track.remove();};
}
