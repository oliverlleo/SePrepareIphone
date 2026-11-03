// Paint-only contrast: authored foreground/background styles stay in the Delta.
export function parseColor(value){
  if(!value||value==='transparent')return [0,0,0,0];
  const hex=value.match(/^#([\da-f]{3,8})$/i);
  if(hex){let h=hex[1];if(h.length===3||h.length===4)h=[...h].map(c=>c+c).join('');if(h.length===6||h.length===8)return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16),h.length===8?parseInt(h.slice(6),16)/255:1];}
  const rgb=value.match(/^rgba?\(([^)]+)\)$/i);if(!rgb)return null;
  const parts=rgb[1].split(/[\s,/]+/).filter(Boolean);if(parts.length<3)return null;
  const result=parts.slice(0,3).map(p=>Math.max(0,Math.min(255,parseFloat(p)*(p.endsWith('%')?2.55:1))));result.push(parts[3]===undefined?1:Math.max(0,Math.min(1,parseFloat(parts[3])/(parts[3].endsWith('%')?100:1))));
  return result.every(Number.isFinite)?result:null;
}
export const composite=(front,back)=>front.slice(0,3).map((v,i)=>v*(front[3]??1)+back[i]*(1-(front[3]??1)));
function luminance(rgb){return rgb.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);}
export function contrast(foreground,background){const a=luminance(composite(foreground,background)),b=luminance(background);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);}
export function readableMarker(background,foreground){
  if(contrast(foreground,background)>=4.5)return null;
  const mix=(target,amount)=>background.map((v,i)=>v+(target[i]-v)*amount),choices=[];
  for(const target of [[0,0,0],[255,255,255]]){
    const limit=contrast(foreground,target);if(limit<4.5)continue;
    const goal=Math.min(4.55,limit);let low=0,high=1;
    for(let i=0;i<24;i++){const middle=(low+high)/2;if(contrast(foreground,mix(target,middle))>=goal)high=middle;else low=middle;}
    choices.push({amount:high,color:mix(target,high).map(Math.round)});
  }
  if(choices.length)return choices.sort((a,b)=>a.amount-b.amount)[0].color;
  // Very translucent lettering may not reach 4.5 against any background.
  // Keep its authored opacity and choose the most readable background available.
  return [[0,0,0],[255,255,255]].sort((a,b)=>contrast(foreground,b)-contrast(foreground,a))[0];
}
