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

// Idea-card flow: no automatic question templates. Original passages remain the evidence.
export function memoryIdeaBlocks(delta,demonstration=false){
 const parsed=memoryBlocks(delta);if(!demonstration)return{...parsed,blocks:parsed.blocks.map(b=>({...b,speakerId:''}))};
 const ranges=[];let offset=0;
 for(const op of delta?.ops||[]){const value=typeof op.insert==='string'?op.insert:'\n';let speakerId=op.attributes?.speaker||'';if(!speakerId&&ranges.length&&!value.trim())speakerId=ranges.at(-1).speakerId;const last=ranges.at(-1);if(last?.speakerId===speakerId)last.end+=value.length;else ranges.push({start:offset,end:offset+value.length,speakerId});offset+=value.length;}
 const blocks=[];let cursor=0;for(const b of parsed.blocks){while(cursor<ranges.length&&ranges[cursor].end<=b.start)cursor++;for(let ri=cursor;ri<ranges.length;ri++){const r=ranges[ri];if(r.end<=b.start)continue;if(r.start>=b.end)break;let start=Math.max(b.start,r.start),end=Math.min(b.end,r.end);while(start<end&&/\s/u.test(parsed.text[start]))start++;while(end>start&&/\s/u.test(parsed.text[end-1]))end--;if(end>start)blocks.push({...b,start,end,text:parsed.text.slice(start,end),hash:textHash(parsed.text.slice(start,end)),speakerId:r.speakerId,turnStart:r.start});}}
 return{...parsed,blocks};
}
export function ideaSourceKey(delta,demonstration=false){const parsed=memoryIdeaBlocks(delta,demonstration);return demonstration?memoryHash(JSON.stringify([parsed.text,parsed.blocks.map(b=>[b.start,b.end,b.speakerId])])):memoryHash(parsed.text);}
const ideaTerms=s=>new Set(tokens(s).filter(w=>w.text.length>2&&!stop.has(normalized(w.text))).map(w=>normalized(w.text)));
function relatedIdeas(a,b,vectors){const left=ideaTerms(a.text),right=ideaTerms(b.text),common=[...right].filter(w=>left.has(w)).length;
 return common>=2||/^(?:isso|essa|esse|esta|este|portanto|por isso|assim|this|therefore|esto|por eso|そのため)/iu.test(b.text)||a.heading&&a.heading===b.heading||vectors.get(a.start)&&vectors.get(b.start)&&cosine(vectors.get(a.start),vectors.get(b.start))>.68;
}
export function segmentIdeaCards(delta,{demonstration=false,vectors=new Map()}={}){
 const parsed=memoryIdeaBlocks(delta,demonstration),units=[];
 for(const b of parsed.blocks){if(b.attrs.header||courtesy(b.text)||tokens(b.text).length<2)continue;
  // Keep reasoning together. Only very long paragraphs need sentence-boundary chunks.
  const sentences=safeSentences(b);let chunk=null;
  for(const sentence of sentences){if(chunk&&sentence.end-chunk.start<=650){chunk.end=sentence.end;chunk.text=parsed.text.slice(chunk.start,chunk.end);}else{if(chunk)units.push(chunk);chunk={...b,...sentence};}}if(chunk)units.push(chunk);
 }
 const grouped=[];for(const u of units){const prev=grouped.at(-1);if(prev&&prev.speakerId===u.speakerId&&(!demonstration||prev.turnStart===u.turnStart)&&prev.heading===u.heading&&u.end-prev.start<=650&&relatedIdeas(prev,u,vectors)){prev.end=u.end;prev.text=parsed.text.slice(prev.start,prev.end);prev.bold=[...(prev.bold||[]),...(u.bold||[])];}else grouped.push({...u});}
 return{...parsed,units:grouped};
}
export function ideaTitle(card,text){if(card.idea||card.type==='manual')return card.theme||card.keywords.slice(0,2).join(' · ');return card.theme||card.keywords.slice(0,2).join(' · ')||text.slice(card.anchor.start,card.anchor.end).split(/[.!?\n]/u)[0].slice(0,100);}
export function generateIdeaCards(delta,{existing,demonstration=false,vectors=new Map(),now=Date.now()}={}){
 const {text,blocks,units}=segmentIdeaCards(delta,{demonstration,vectors}),frequency=new Map();
 for(const u of units)for(const key of ideaTerms(u.text))frequency.set(key,(frequency.get(key)||0)+1);
 const pool=[],seen=new Set();for(const unit of units){const keys=memoryKeywords(unit,frequency).slice(0,3);if(!keys.length)continue;const anchor=makeAnchor(text,unit.start,unit.end),id='idea-'+memoryHash((unit.speakerId||'')+':'+anchor.hash);if(seen.has(id))continue;seen.add(id);
  const theme=(unit.heading||keys.slice(0,2).join(' · ')).slice(0,140),score=keys.reduce((n,k)=>n+(frequency.get(normalized(k))||1),0)+(unit.bold?.length?2:0)+(/^(?:portanto|em resumo|in conclusion|en resumen|まとめ)/iu.test(unit.text)?3:0);
  pool.push({id,type:'idea',idea:true,question:'',theme,keywords:keys,hints:[],anchor,speakerId:unit.speakerId||'',updatedAt:now,score});
 }
 // Bound a reusable bank, balancing sections and the full range instead of taking its beginning.
 const sections=new Map();for(const c of pool){const key=c.speakerId+'|'+c.theme;if(!sections.has(key))sections.set(key,[]);sections.get(key).push(c);}
 const selected=pool.length<=48?pool:[];
 if(pool.length>48)for(let i=0;i<48;i++){const start=Math.floor(i*pool.length/48),end=Math.floor((i+1)*pool.length/48);selected.push(pool.slice(start,end).sort((a,b)=>b.score-a.score||a.anchor.start-b.anchor.start)[0]);}
 const next=existing?JSON.parse(JSON.stringify(existing)):freshDeck(text,[],now),byId=new Map(next.cards.map(c=>[c.id,c]));
 for(const c of selected.sort((a,b)=>a.anchor.start-b.anchor.start)){delete c.score;if(!byId.has(c.id)&&byId.size<MAX_CARDS)byId.set(c.id,c);}
 next.cards=[...byId.values()].map(c=>{if(!isLiveCard(c))return c;const found=resolveAnchor(text,c.anchor,blocks);const changedSpeaker=found&&demonstration&&c.speakerId!==undefined&&blocks.some(b=>b.start<found.end&&b.end>found.start&&b.speakerId!==c.speakerId);return found?{...c,anchor:makeAnchor(text,found.start,found.end),needsReview:!!changedSpeaker}:{...c,needsReview:true};});
 next.sourceHash=textHash(text);next.sourceRawHash=memoryHash(text);next.ideaSource=ideaSourceKey(delta,demonstration);next.updatedAt=now;return next;
}
export function ideaCardsForScope(deck,delta,{demonstration=false,scope=[]}={}){
 const blocks=memoryIdeaBlocks(delta,demonstration).blocks,allowed=new Set(scope);
 const all=orderedMemoryCards(deck),hasIdeas=all.some(c=>c.idea);const cards=all.filter(c=>c.idea||c.type==='manual'||!hasIdeas);return cards.filter(c=>{if(!demonstration)return true;const covered=blocks.filter(b=>b.start<c.anchor.end&&b.end>c.anchor.start);return covered.length>0&&covered.every(b=>allowed.has(b.speakerId)&&(c.speakerId===undefined||c.speakerId===b.speakerId));});
}
