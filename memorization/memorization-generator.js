import {sentenceSpans,cosine} from './memorization-semantic-core.js';
import {memoryEvidencePhrases} from './memorization-semantic-analysis.js';
import {memoryText,textHash,memoryHash,makeAnchor,freshDeck,orderedMemoryCards,MAX_CARDS,isLiveCard,resolveAnchor} from './memorization-data.js';

const normalized=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const stop=new Set('a o as os um uma uns umas de da do das dos e ou em no na nos nas que se ao aos para por com sem mais menos como quando onde porque mas pois este esta isso isto voce voces ele ela eles elas nos meu minha seu sua ser estar ter sao foi era tem muito todos todas todo toda ja nao sim tambem pode deve vai aqui agora entao apenas mesmo assim sobre entre the a an and or of to in on for with without is are was be this that it its we you they he she have has can will would do does not el la los las un una unos unas de del y o en por para con sin es son fue ser este esta esto eso que como cuando donde porque pero no si tambien puede debe las sus nuestro nuestra'.split(' '));
function tokens(text){
 if(/[\u3040-\u30ff\u3400-\u9fff]/u.test(text)&&globalThis.Intl?.Segmenter){return [...new Intl.Segmenter('ja',{granularity:'word'}).segment(text)].filter(x=>x.isWordLike).map(x=>({text:x.segment,offset:x.index}));}
 return [...text.matchAll(/[\p{L}\p{N}][\p{L}\p{M}\p{N}'’-]*/gu)].map(m=>({text:m[0],offset:m.index}));
}
export function memoryBlocks(delta){
 const text=memoryText(delta),lines=[];let start=0,offset=0,bold=[];
 for(const op of delta?.ops||[]){const value=typeof op.insert==='string'?op.insert:'\n';if(op.attributes?.bold&&typeof op.insert==='string')bold.push({start:offset,end:offset+value.length});
  for(let i=0;i<value.length;i++)if(value[i]==='\n'){const raw=text.slice(start,offset+i),left=raw.search(/\S/u);if(left>=0){const end=start+raw.trimEnd().length;lines.push({start:start+left,end,text:text.slice(start+left,end),attrs:{...(op.attributes||{}),...(typeof op.insert==='object'?{pagebreak:true}:{})},bold:bold.filter(b=>b.end>start&&b.start<end)});}start=offset+i+1;}offset+=value.length;
 }
 if(start<text.length&&text.slice(start).trim()){const at=start+text.slice(start).search(/\S/u);lines.push({start:at,end:text.trimEnd().length,text:text.slice(at).trimEnd(),attrs:{},bold:bold.filter(b=>b.end>at)});}
 let heading='';for(const line of lines){if(line.attrs.header)heading=line.text;line.heading=heading;line.hash=textHash(line.text);}
 return{ text,blocks:lines };
}
const courtesy=text=>/^(?:bom dia|boa tarde|boa noite|ola\b|oi\b|obrigad[oa]|good morning|good afternoon|hello\b|thank you|buenos dias|buenas tardes|gracias|こんにちは|ありがとう)/iu.test(normalized(text))&&tokens(text).length<12;
const safeSentences=block=>{const rows=sentenceSpans(block.text);return rows.length?rows.map(s=>({...s,start:block.start+s.offset,end:block.start+s.offset+s.length})): [{text:block.text,start:block.start,end:block.end}];};
export function segmentMemoryIdeas(delta,{vectors=new Map()}={}){
 const {text,blocks}=memoryBlocks(delta),units=[];
 for(let i=0;i<blocks.length;i++){
  const b=blocks[i];if(b.attrs.header||courtesy(b.text))continue;
  if(b.attrs.list||/:\s*$/u.test(b.text)&&blocks[i+1]?.attrs.list){
   let end=b.end,j=i+1;while(j<blocks.length&&blocks[j].attrs.list&&!blocks[j].attrs.header){end=blocks[j].end;j++;}
   if(end>b.end||b.attrs.list){units.push({...b,end,text:text.slice(b.start,end),kind:'steps'});i=j-1;continue;}
  }
  // Split on actual sentence/idea boundaries, never a fixed word-count partition.
  const sentences=safeSentences(b);let pending=null;
  for(const sentence of sentences){
   const signal=/^(?:por exemplo|por isso|assim|isso|essa|esse|esta|este|essas|esses|dessa|deste|pois|porque|for example|therefore|this|because|por ejemplo|por eso|esto|porque|例えば|そのため)/iu.test(sentence.text);
   const shared=pending?tokens(sentence.text).filter(w=>w.text.length>3&&!stop.has(normalized(w.text))&&normalized(pending.text).includes(normalized(w.text))).length:0;
   if(pending&&((signal||shared>=2)&&pending.text.length+sentence.text.length<1000)){pending.end=sentence.end;pending.text=text.slice(pending.start,pending.end);}else{if(pending)units.push(pending);pending={...b,start:sentence.start,end:sentence.end,text:sentence.text};}
  }if(pending)units.push(pending);
 }
 // Embeddings can join short, tightly related adjacent ideas, never cross headings/lists.
 const joined=[];for(const unit of units){const previous=joined.at(-1),a=previous&&vectors.get(previous.start),b=vectors.get(unit.start);const overlap=previous?tokens(unit.text).filter(t=>previous.text.toLocaleLowerCase().includes(t.text.toLocaleLowerCase())&&!stop.has(normalized(t.text))).length:0;
  if(previous&&a&&b&&cosine(a,b)>.78&&overlap>=2&&previous.heading===unit.heading&&!previous.kind&&!unit.kind&&previous.text.length<140&&previous.text.length+unit.text.length<700){previous.end=unit.end;previous.text=text.slice(previous.start,previous.end);}else joined.push({...unit});}
 return {text,blocks,units:joined};
}
export function memoryKeywords(unit,frequencies=new Map()){
 const source=unit.text,candidates=[];
 for(const b of unit.bold||[]){const value=source.slice(Math.max(0,b.start-unit.start),Math.min(source.length,b.end-unit.start)).trim();if(value.length>=3&&value.length<=72)candidates.push({text:value,score:12});}
 for(const phrase of memoryEvidencePhrases({text:source,offset:0})){if(phrase.text.length<=72&&tokens(phrase.text).length<=5)candidates.push({text:phrase.text,score:(phrase.score||1)+.4});}
 for(const token of tokens(source)){const key=normalized(token.text);if(token.text.length<2||stop.has(key)||/^\d+$/.test(key))continue;candidates.push({text:token.text,score:1+Math.log(1+unit.text.length/Math.max(1,frequencies.get(key)||1))*.1+(unit.heading&&normalized(unit.heading).includes(key)?2:0)});}
 const result=[];for(const item of candidates.sort((a,b)=>b.score-a.score||source.indexOf(a.text)-source.indexOf(b.text))){const key=normalized(item.text);if(!source.includes(item.text)||result.some(s=>normalized(s)===key||normalized(s).includes(key)||key.includes(normalized(s))))continue;result.push(item.text);if(result.length===5)break;}
 // Short factual sentences may have only two distinct meaningful words.
 if(result.length<2)for(const t of tokens(source)){if(t.text.length>=2&&!stop.has(normalized(t.text))&&!result.some(k=>normalized(k)===normalized(t.text))){result.push(t.text);if(result.length===2)break;}}
 return result.slice(0,5);
}
const lowerStart=text=>text[0]?.toLocaleLowerCase()+text.slice(1);
export function memoryCardFor(unit,text,{t=s=>s,frequencies=new Map(),now=Date.now()}={}){
 const original=text.slice(unit.start,unit.end);if(original!==unit.text||original.trim().length<8)return null;
 const keywords=memoryKeywords(unit,frequencies);if(keywords.length<2)return null;
 let type='idea',question=t('Explique esta ideia com suas palavras.'),theme=(unit.heading||keywords.slice(0,2).join(' · ')).slice(0,140),cloze;
 const definition=original.match(/^([^.!?:\n]{3,80}?)\s+(é|significa|refere-se a|is|means|es|se define como)\s+(.{8,})/iu);
 const cause=original.match(/^([^.!?:\n]{3,80}?)\s+(ajuda a|permite|reduz|aumenta|helps to|allows|reduces|increases|ayuda a|reduce|aumenta)\s+(.{5,})/iu);
 const contrast=original.match(/^(.{12,}?)\b(?:mas|porém|enquanto|but|whereas|pero|sin embargo)\b(.{12,})/iu);
 if(unit.kind==='steps'||/\b(?:etapas|passos|steps|stages|pasos|段階|手順)\s*[:：]/iu.test(original)){type='steps';question=t('Quais itens ou etapas o texto apresenta?');}
 else if(/^(?:portanto|em resumo|para concluir|em conclusao|in conclusion|to conclude|en resumen|para concluir|まとめ|したがって)/iu.test(normalized(original))){type='conclusion';question=t('Qual é a conclusão apresentada neste trecho?');}
 else if(definition&&tokens(definition[1]).length<=10){type='definition';theme=definition[1];question=t('Como o texto define este conceito?')+' '+definition[1];}
 else if(cause&&tokens(cause[1]).length<=10){type='cause';theme=cause[1];
  const pt=cause[2].toLowerCase(),inf=cause[3].match(/^([\p{L}]+(?:ar|er|ir))\s+.{3,}/u);
  question=pt==='ajuda a'&&inf?t('O que {subject} ajuda a {action}?').replace('{subject}',lowerStart(cause[1])).replace('{action}',inf[1]):t('Que resultados o texto associa a este elemento?')+' '+cause[1];
 }else if(contrast){type='contrast';question=t('Que diferença o texto apresenta entre estas ideias?');}
 else if(/\b(?:por exemplo|for example|por ejemplo|例えば)/iu.test(original)){type='example';question=t('Que exemplo é usado para explicar esta ideia?');}
 else if(original.length<=260&&keywords[0].length>=4&&original.includes(keywords[0])){type='cloze';question='';cloze=keywords[0];}
 const anchor=makeAnchor(text,unit.start,unit.end),id='auto-'+anchor.hash;
 return {id,type,question,theme,keywords,hints:[],anchor,updatedAt:now,...(cloze?{cloze}:{})};
}
export function memoryCardFront(card,text,t=s=>s){if(card.question)return card.question;if(card.type==='cloze'&&card.cloze){const original=text.slice(card.anchor.start,card.anchor.end);return t('Complete a ideia:')+' '+original.replace(card.cloze,'_____');}return card.theme;}
export function generateMemoryCards(delta,{existing,t=s=>s,vectors=new Map(),now=Date.now()}={}){
 const {text,blocks,units}=segmentMemoryIdeas(delta,{vectors}),frequency=new Map();
 for(const u of units)for(const key of new Set(tokens(u.text).filter(w=>!stop.has(normalized(w.text))).map(w=>normalized(w.text))))frequency.set(key,(frequency.get(key)||0)+1);
 const seen=new Set(),cards=[];for(const unit of units){const card=memoryCardFor(unit,text,{t,frequencies:frequency,now});if(!card||seen.has(card.id))continue;seen.add(card.id);cards.push(card);if(cards.length>MAX_CARDS)throw Error('Este discurso contém muitas ideias. Crie cartões por trechos para organizar seu estudo.');}
 if(!existing)return freshDeck(text,cards,now);
 const byId=new Map(existing.cards.map(c=>[c.id,c]));
 for(const card of cards)if(!byId.has(card.id))byId.set(card.id,card);
 // Keep edits, tombstones and review events; rebind only exact source evidence.
 const next={...existing,cards:[...byId.values()].map(card=>{if(!isLiveCard(card))return card;const found=resolveAnchor(text,card.anchor,blocks);return found?{...card,anchor:makeAnchor(text,found.start,found.end),needsReview:false}:{...card,needsReview:true};}),sourceHash:textHash(text),sourceRawHash:memoryHash(text),updatedAt:now};
 if(next.order){const ids=orderedMemoryCards(next,{includeUnlinked:true}).map(c=>c.id);next.order={ids,at:now,id:'order-'+memoryHash(ids.join(':')+now)};}
 return next;
}
