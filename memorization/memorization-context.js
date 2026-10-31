import{normalize,wordTokens,cosine,center,sentenceSpans}from'./memorization-semantic-core.js';
import{memoryHash}from'./memorization-data.js';
export const CONTEXT_ENGINE=3;
const closed=new Set(normalize('a o as os um uma uns umas de da do das dos e ou em na no nas nos ao aos à às por para com sem que se quem qual quais como quando onde porque pois mas eu tu ele ela eles elas nós vós você vocês meu minha meus minhas seu sua seus suas nosso nossa isso isto esse essa esses essas este esta estes estas aquele aquela aqui ali lá já não sim também ainda então assim tão muito mais menos toda todo todos todas cada outro outra outros outras the a an and or of to in on for with without from that this these those it its we you they he she their our my your his her which who what when where why how not yes el la los las un una unos unas del y en por para con sin este esta esto eso sus nuestro nuestra muy más pero ni の は が を に と も で です ます する した その この それ これ').split(/\s+/));
const join=new Set(normalize('de da do das dos em na no nas nos com sem ao aos à às of for in with without del de en con sin の').split(/\s+/));
const discourse=new Set(normalize('portanto contudo entretanto todavia porém enfim logo consequentemente primeiramente finalmente ademais além subsequentemente therefore however consequently firstly finally moreover nevertheless entonces además finalmente primero después').split(/\s+/));
// Closed-class and morphology filters generate candidates; semantic evidence chooses them.
const finiteFallback=/^(?:é|são|foi|era|eram|tem|têm|seja|sejam|há|está|estão|será|serão|pode|podem|deve|devem|vamos|vejam|leiam|observem|is|are|was|were|has|have|can|will|should|es|son|fue|tiene)$/iu;
export const ROLE_SEEDS={
 content:['A coragem permite agir apesar do medo.','A energia solar reduz a dependência de combustíveis.','O narrador reconheceu seu erro e pediu perdão.','Trust makes cooperation possible.','La paciencia permite comprender al otro.','O processo tem três etapas: coletar amostras, registrar e comparar os resultados.','Primeiro reunimos as evidências. Depois verificamos sua origem.','O primeiro argumento explica a relação entre a causa e o efeito.','A pessoa encontrou uma solução para o problema.','Uma comparação mostra como essas situações se relacionam.'],
 instruction:['Peça ao participante que leia a próxima passagem.','Abra a imagem e aponte para o detalhe indicado.','Faça uma pausa e aguarde a resposta da assistência.','Read the next passage aloud.','Muestre la imagen al público.','Uma orientação de palco para quem apresenta: controlar slides, conduzir a participação ou fazer uma pausa.','Stage directions for the presenter: control slides or invite audience participation.','Instrucciones para quien presenta: dirigir la participación o manejar las diapositivas.'],
 reference:['João 3:16; página 25, parágrafo 4.','Referência: capítulo 2, versos 3 a 5.','Fonte: artigo 12, edição de outubro.','See chapter 4, page 18.','Referencia: página 22, párrafo 6.'],
 transition:['Vamos passar agora ao próximo assunto.','Até aqui consideramos a primeira parte.','Antes de continuar, retomemos a pergunta.','Let us move to the next topic.','Pasemos ahora al siguiente punto.'],
 greeting:['Bom dia a todos e obrigado pela presença.','Boa noite, sejam bem-vindos.','Agradeço a atenção de vocês.','Thank you for being here today.','Buenas tardes, gracias por venir.']
};
export function contextualWords(text){
 if(/[\u3040-\u30ff\u3400-\u9fff]/u.test(text)&&globalThis.Intl?.Segmenter)return[...new Intl.Segmenter('ja',{granularity:'word'}).segment(text)].filter(x=>x.isWordLike).map(x=>({text:x.segment,key:normalize(x.segment),offset:x.index,length:x.segment.length}));
 return wordTokens(text);
}
const normVector=xs=>{const norm=Math.hypot(...xs);return norm?xs.map(x=>x/norm):xs.map(()=>0);};
export function referenceOnly(text){
 const value=text.trim().replace(/^\[|\]$/gu,''),fields=value.replace(/^(?:refer[eê]ncia|reference|fonte|source)\s*[:：]\s*/iu,'');return /^(?:(?:ler|leia[m]?|leitura|read|leer|lectura|参照|読む)\s*[:：-]?\s*)?(?:[1-3]\s*)?[\p{L}][\p{L} .’'-]{0,55}\s+\d{1,3}\s*[:：]\s*\d{1,3}(?:\s*[-–,;]\s*\d{1,3})*[.!]?$/iu.test(value)||/^(?:(?:p[aá]g(?:ina)?\.?|page|cap[ií]tulo|chapter|vers[ií]culo|par[aá]grafo|paragraph|figura|figure)\s*[:：]?\s*\d[\d\s:.,;–-]*)+$/iu.test(fields);
}
function sentences(block){
 let spans;
 if(globalThis.Intl?.Segmenter)spans=[...new Intl.Segmenter('und',{granularity:'sentence'}).segment(block.text)].map(s=>({text:s.segment,offset:s.index}));
 else spans=sentenceSpans(block.text);
 const out=[];for(const s of spans){const raw=s.text;let from=0;for(const m of raw.matchAll(/[;；]|\n+/gu)){const end=m.index+m[0].length;if(raw.slice(from,end).trim())out.push({start:block.start+s.offset+from,end:block.start+s.offset+end});from=end;}if(raw.slice(from).trim())out.push({start:block.start+s.offset+from,end:block.start+s.offset+raw.length});}
 return out.map(r=>{while(r.start<r.end&&/\s/u.test(block.text[r.start-block.start]))r.start++;while(r.end>r.start&&/\s/u.test(block.text[r.end-block.start-1]))r.end--;return{...block,...r,text:block.text.slice(r.start-block.start,r.end-block.start)};}).filter(r=>contextualWords(r.text).length);
}
export function conceptCandidates(atom,{isVerb=(w)=>finiteFallback.test(w),tagWords}={}){
 const ws=contextualWords(atom.text),out=[],seen=new Set(),add=(start,end,terms,bonus=0)=>{const text=atom.text.slice(start,end).trim(),key=normalize(text);if(!text||text.length>120||/[.!?。！？;；\n]/u.test(text)||seen.has(key)||!terms.length)return;seen.add(key);out.push({text,key,start:atom.start+start,end:atom.start+end,terms:[...new Set(terms)],bonus});};
 const tags=tagWords?.(ws)||null;atom.tags=tags;const predicate=tags?.findIndex(x=>x==='VERB'||x==='AUX')??-1,comma=predicate>=0?atom.text.lastIndexOf(',',ws[predicate].offset):-1;
 const eligible=(w,i)=>/\p{L}/u.test(w.text)&&!closed.has(w.key)&&!discourse.has(w.key)&&(tags?['NOUN','PROPN'].includes(tags[i]):!finiteFallback.test(w.text)&&!isVerb(w.text,ws[i-1]?.text||'')&&!/mente$/u.test(w.key));
 for(let i=0;i<ws.length;i++){
  if(!eligible(ws[i],i))continue;const a=ws[i],subject=predicate>i&&a.offset>comma?.20:a.offset<comma?-.20:0;add(a.offset,a.offset+a.length,[a.key],subject);
  // Nominal links and adjacent modifiers are candidates; there is no target word count.
  let terms=[a.key],j=i+1,linked=false;for(;j<ws.length;j++){
   const gap=atom.text.slice(ws[j-1].offset+ws[j-1].length,ws[j].offset);if(/[^\s-]/u.test(gap))break;
   if(join.has(ws[j].key)||linked&&tags?.[j]==='DET'){linked=true;continue;}
   if(tags){if(linked&&tags[j]==='ADJ')continue;if(!eligible(ws[j],j)&&tags[j]!=='ADJ')break;if(!linked&&['NOUN','PROPN'].includes(tags[j])&&tags[j-1]!=='PROPN')break;}else if(!eligible(ws[j],j))break;
   const nominalSuffix=/(?:[çc][aã]o|[çc][oõ]es|dade|mento|ncia|ança|tude|logia|ismo)s?$/u;
   if(!linked&&nominalSuffix.test(ws[j].key)&&nominalSuffix.test(ws[j-1].key))break;
   terms.push(ws[j].key);add(a.offset,ws[j].offset+ws[j].length,terms,subject+(linked?.08:.02));linked=false;
  }
 }
 for(const b of atom.bold||[]){const start=Math.max(0,b.start-atom.start),end=Math.min(atom.text.length,b.end-atom.start),selected=ws.filter(w=>w.offset>=start&&w.offset+w.length<=end);if(selected.length&&selected.every(w=>eligible(w,ws.indexOf(w))||join.has(w.key)))add(start,end,selected.filter(w=>!join.has(w.key)).map(w=>w.key),.25);}
 // Bound work by salience rather than truncating a phrase to fit a word quota.
 return out.sort((a,b)=>b.bonus-a.bonus||a.start-b.start||a.text.length-b.text.length).slice(0,32);
}
export function prepareContext(parsed,{isVerb,tagWords,wordFrequency=()=>0,wordObliqueness=()=>0}={}){
 const atoms=[];let section=0;for(const block of parsed.blocks){if(block.attrs.header){section++;continue;}for(const atom of sentences(block)){atom.section=section;atom.reference=referenceOnly(atom.text);atom.candidates=atom.reference?[]:conceptCandidates(atom,{isVerb,tagWords});atoms.push(atom);}}
 const df=new Map();for(const a of atoms)for(const term of new Set(a.candidates.flatMap(c=>c.terms)))df.set(term,(df.get(term)||0)+1);
 for(const a of atoms){for(const c of a.candidates){if(c.bonus>.15)c.bonus/=1+Math.log1p(wordFrequency(c.terms[0]))/4;c.lexical=c.terms.reduce((n,k)=>n+Math.log(1+atoms.length/(df.get(k)||1))+.12*Math.log(1000/(1+wordFrequency(k))),0)/c.terms.length+c.bonus;c.specificity=c.terms.reduce((sum,k)=>sum+Math.max(0,Math.min(1,Math.log(5000/(1+wordFrequency(k)))/Math.log(5000))),0)/c.terms.length;c.obliquePenalty=c.terms.reduce((sum,k,i)=>sum+(i===0&&c.bonus>0?0:wordObliqueness(k)*.25),0);}
  // Keep candidates from the whole sentence, including its tail and emphasized spans.
  const ranked=[...a.candidates].sort((x,y)=>y.lexical-x.lexical||x.text.length-y.text.length),picked=[];for(const c of ranked){if(picked.some(p=>p.key===c.key))continue;picked.push(c);if(picked.length===12)break;}a.candidates=picked;
 }
 return{...parsed,atoms,df};
}
export function contextualRole(atom,vector,roleVectors={}){
 if(atom.reference)return{kind:'reference',confidence:1};
 const finite=atom.tags?.findIndex(x=>['VERB','AUX'].includes(x))??-1,predicate=finite>=0?finite:atom.tags?.findIndex(x=>x==='INF')??-1,hasSubject=predicate>0&&atom.tags.slice(0,predicate).some(x=>['NOUN','PROPN','PRON','INF'].includes(x)),startsAction=predicate>=0&&!hasSubject;
 const ranking=Object.entries(roleVectors).map(([kind,v])=>({kind,score:(v.examples?.length?.7*Math.max(...v.examples.map(x=>cosine(vector||[],x)))+.3*cosine(vector||[],v.centroid):cosine(vector||[],v))+(kind==='content'&&hasSubject?.18:kind==='instruction'&&startsAction?.18:0)})).sort((a,b)=>b.score-a.score),top=ranking[0],margin=top?top.score-(ranking[1]?.score||0):0;
 const substantive=atom.tags?.some(x=>x==='NOUN'||x==='PROPN')&&atom.tags?.some(x=>x==='VERB'||x==='AUX'||x==='INF');
 if(top?.kind==='instruction'&&hasSubject&&!/^\s*[[(]/u.test(atom.text))return{kind:'content',confidence:.5,uncertain:true};
 if(top&&top.kind!=='content'&&top.score>.40&&margin>.065&&!(top.kind==='transition'&&substantive&&margin<.14))return{kind:top.kind,confidence:Math.min(.99,.5+margin)};
 return{kind:'content',confidence:top?.kind==='content'?Math.min(.99,.5+margin):.5};
}
const shared=(a,b)=>{const left=new Set(a.candidates.flatMap(c=>c.terms));return new Set(b.candidates.flatMap(c=>c.terms).filter(k=>left.has(k))).size;};
const dependent=s=>/^(?:isso|isto|essa|esse|esta|este|essas|esses|seu|sua|seus|suas|ela|ele|eles|elas|depois|por fim|em seguida|por isso|portanto|assim|pois|porque|por exemplo|de modo semelhante|ou seja|em outras palavras|this|that|its|their|it|next|then|finally|therefore|because|for example|similarly|in other words|esto|después|por eso|por ejemplo|es decir|その|それ|つまり|例えば)/iu.test(s.trim());
export function partitionContext(prepared,vectors=new Map(),roleVectors={}){
 const units=[],excluded=[];let previous=null;
 for(const atom of prepared.atoms){const vector=vectors.get(atom.start),role=contextualRole(atom,vector,roleVectors);atom.role=role;
  if(role.kind!=='content'||!atom.candidates.length){excluded.push({start:atom.start,end:atom.end,kind:role.kind==='content'?'uncertain':role.kind});previous=null;continue;}
  const prev=units.at(-1),same=prev&&previous&&prev.section===atom.section&&prev.speakerId===atom.speakerId&&prev.turnStart===atom.turnStart,sim=previous&&vector&&vectors.get(previous.start)?cosine(vectors.get(previous.start),vector):0,overlap=previous?shared(previous,atom):0;
  const follows=same&&(dependent(atom.text)&&(sim>.20||overlap>0)||sim>.74&&overlap>0||!vector&&overlap>=2&&dependent(atom.text));
  if(follows&&prev.atoms.length<8){prev.end=atom.end;prev.text=prepared.text.slice(prev.start,prev.end);prev.atoms.push(atom);prev.bold.push(...atom.bold||[]);}else units.push({...atom,atoms:[atom],bold:[...atom.bold||[]]});previous=atom;
 }
 return{...prepared,units,excluded};
}
export function rankContextConcepts(unit,prepared,{vectors=new Map(),candidateVectors=new Map(),documentVector=[]}={}){
 const sentenceVectors=unit.atoms.map(a=>vectors.get(a.start)).filter(Boolean),unitVector=center(sentenceVectors),candidates=new Map();
 for(const a of unit.atoms)for(const c of a.candidates){const old=candidates.get(c.key);if(!old||old.lexical<c.lexical)candidates.set(c.key,{...c,atom:a});}
 const ranked=[...candidates.values()].map(c=>{
  const vector=candidateVectors.get(c.start+':'+c.end)||candidateVectors.get(c.key),semantic=vector&&unitVector.length?cosine(vector,unitVector):0,context=vector&&documentVector.length?cosine(vector,documentVector):0;
  const evidence=unit.atoms.filter(a=>c.terms.some(k=>a.candidates.some(p=>p.terms.includes(k)))).length/unit.atoms.length;
  // Longer wording earns nothing by itself. Extra terms must improve coverage.
  return{...c,vector,score:.62*semantic+.08*context+.18*Math.min(1,c.lexical/4)+.16*evidence+.18*(c.specificity||0)+c.bonus-.07*Math.max(0,c.terms.length-1)-(c.obliquePenalty||0)};
 }).sort((a,b)=>b.score-a.score||a.text.length-b.text.length||a.start-b.start);
 const compact=ranked.filter(c=>!ranked.some(p=>p!==c&&p.text.length<c.text.length&&c.key.includes(p.key)&&p.score>=c.score-.09));
 const chosen=[];for(const c of compact){
  if(chosen.some(p=>p.key.includes(c.key)||c.key.includes(p.key)))continue;
  const redundancy=chosen.length?Math.max(...chosen.map(p=>c.vector&&p.vector?cosine(c.vector,p.vector):c.terms.filter(x=>p.terms.includes(x)).length/Math.max(1,c.terms.length))):0;
  const newlyCovered=unit.atoms.some(a=>{const v=vectors.get(a.start);if(v&&c.vector&&chosen.length){const before=Math.max(...chosen.map(p=>p.vector?cosine(p.vector,v):0));return before<.72&&cosine(c.vector,v)>before+.08;}return c.terms.some(k=>a.candidates.some(p=>p.terms.includes(k)))&&!chosen.some(p=>p.terms.some(k=>a.candidates.some(x=>x.terms.includes(k))));});
  const useful=chosen.length===0||newlyCovered||redundancy<.68&&c.score>=compact[0].score-.12;
  if(useful){chosen.push(c);if(chosen.length>=3)break;}
 }
 const concepts=chosen.sort((a,b)=>a.start-b.start).map(c=>c.text);
 const clue=compact.find(c=>!chosen.some(p=>p.terms.some(k=>c.terms.includes(k)))&&c.terms.length===1)?.text||'';
 return{concepts,confidence:sentenceVectors.length?(compact[0]?.score||0):.35,needsConceptReview:!concepts.length||!sentenceVectors.length||unit.atoms.some(a=>a.role?.uncertain),relation:contextRelation(unit.text),retrievalClue:clue,sourceHash:memoryHash(unit.text)};
}
export function contextRelation(text){const n=normalize(text);if(/\b(?:mas|porem|no entanto|enquanto|em vez de|but|whereas|pero)\b/u.test(n))return'contrast';if(/\b(?:porque|por isso|consequencia|permite|reduz|aumenta|because|therefore|allows|por eso)\b/u.test(n))return'cause';if(/\b(?:por exemplo|imagine|for example|por ejemplo)\b/u.test(n))return'example';if(/\b(?:primeiro|depois|etapas|passos|first|next|primero)\b/u.test(n))return'steps';if(/(?:^|\s)(?:e|significa|consiste|is|means|es)(?:\s|$)/u.test(n))return'definition';return'idea';}
export function finishContext(prepared,options={}){const partitioned=partitionContext(prepared,options.vectors,options.roleVectors),documentVector=center([...options.vectors?.values()||[]]);return{units:partitioned.units.map(u=>({...u,...rankContextConcepts(u,prepared,{...options,documentVector}),atoms:undefined,candidates:undefined,role:undefined})),excluded:partitioned.excluded,engine:CONTEXT_ENGINE,semantic:!!options.vectors?.size};}
export function pooledSpan(rows,ids,needle){
 const found=[];for(let i=0;i+needle.length<=ids.length;i++){if(needle.every((v,j)=>ids[i+j]===v)){found.push(...rows.slice(i,i+needle.length));i+=needle.length-1;}}
 return found.length?normVector(found.reduce((sum,row)=>sum.map((v,j)=>v+row[j]),new Array(rows[0].length).fill(0))):null;
}
