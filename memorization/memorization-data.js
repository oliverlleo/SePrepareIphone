// Portable version-owned study data. No Delta, answer copies, or speech revision clocks.
export const MEMORY_SCHEMA=1,MAX_CARDS=2000,MAX_REVIEWS=100000;
export const memoryText=delta=>(delta?.ops||[]).map(op=>typeof op.insert==='string'?op.insert:'\n').join('');
export const normalizeMemoryText=text=>String(text).normalize('NFC').replace(/\s+/gu,' ').trim().toLocaleLowerCase();
export function memoryHash(value){let a=2166136261,b=2246822519;for(let i=0;i<value.length;i++){a=Math.imul(a^value.charCodeAt(i),16777619);b=Math.imul(b^value.charCodeAt(i),3266489917);}return(a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');}
export const textHash=text=>memoryHash(normalizeMemoryText(text));
export const memoryId=()=>globalThis.crypto?.randomUUID?.()||'m-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+'-'+Math.random().toString(36).slice(2);
export const memoryStable=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const clone=value=>JSON.parse(JSON.stringify(value));
const kinds=new Set(['idea','definition','steps','cause','contrast','example','cloze','conclusion','manual']);
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(value)&&!['__proto__','constructor','prototype'].includes(value);
const stamp=value=>Number.isSafeInteger(value)&&value>=0&&value<=8640000000000000;
const digest=value=>typeof value==='string'&&/^[a-f0-9]{16}$/.test(value);
const string=(value,max)=>typeof value==='string'&&value.length<=max;
const require=(yes)=>{if(!yes)throw Error('Dados de memorização inválidos.');};
export function validateMemorization(deck){
 if(deck===undefined)return deck;
 require(deck&&typeof deck==='object'&&!Array.isArray(deck)&&deck.schema===1&&digest(deck.sourceHash)&&digest(deck.sourceRawHash));
 require(Array.isArray(deck.cards)&&deck.cards.length<=MAX_CARDS&&Array.isArray(deck.reviews)&&deck.reviews.length<=MAX_REVIEWS&&stamp(deck.updatedAt));
 const ids=new Set();
 for(const c of deck.cards){
  require(c&&validId(c.id)&&!ids.has(c.id)&&kinds.has(c.type)&&string(c.question,400)&&string(c.theme,140)&&Array.isArray(c.keywords)&&c.keywords.length<=5&&c.keywords.every(k=>string(k,80))&&Array.isArray(c.hints)&&c.hints.length<=5&&c.hints.every(h=>string(h,300))&&stamp(c.updatedAt));ids.add(c.id);
  const a=c.anchor;require(a&&Number.isSafeInteger(a.start)&&a.start>=0&&Number.isSafeInteger(a.end)&&a.end>a.start&&a.end<=600001&&digest(a.hash)&&string(a.prefix,32)&&string(a.suffix,32)&&string(a.before,48)&&string(a.after,48));
  require(c.deletedAt===undefined||stamp(c.deletedAt)&&c.deleted===true);require(c.deleted===undefined||typeof c.deleted==='boolean');require(c.needsReview===undefined||typeof c.needsReview==='boolean');require(c.cloze===undefined||string(c.cloze,80));
 }
 const events=new Set();for(const r of deck.reviews){require(r&&validId(r.id)&&!events.has(r.id)&&validId(r.cardId)&&digest(r.anchorHash)&&stamp(r.at)&&[0,1,2].includes(r.rating));events.add(r.id);}
 if(deck.order!==undefined)require(deck.order&&Array.isArray(deck.order.ids)&&deck.order.ids.length<=MAX_CARDS&&deck.order.ids.every(validId)&&stamp(deck.order.at)&&validId(deck.order.id));
 if(deck.session!==undefined){const s=deck.session;require(s&&validId(s.id)&&stamp(s.updatedAt)&&['normal','difficult'].includes(s.mode)&&Array.isArray(s.queue)&&s.queue.length<=MAX_CARDS*3&&s.queue.every(validId)&&Number.isSafeInteger(s.position)&&s.position>=0&&s.position<=s.queue.length&&Array.isArray(s.answers)&&s.answers.length<=MAX_CARDS*3&&s.answers.every(validId));}
 return deck;
}
export function makeAnchor(text,start,end){
 while(start<end&&/\s/u.test(text[start]))start++;while(end>start&&/\s/u.test(text[end-1]))end--;
 if(end<=start||end>text.length)throw Error('Escolha um trecho do discurso.');
 const length=Math.min(32,Math.max(1,Math.floor((end-start)/4)));
 return {start,end,hash:textHash(text.slice(start,end)),prefix:text.slice(start,start+length),suffix:text.slice(end-length,end),before:text.slice(Math.max(0,start-48),start),after:text.slice(end,end+48)};
}
export const isLiveCard=card=>card.deleted!==true&&!card.deletedAt;
export function orderedMemoryCards(deck,{includeUnlinked=false}={}){
 if(!deck)return[];const positions=new Map((deck.order?.ids||[]).map((id,i)=>[id,i]));
 return deck.cards.filter(c=>isLiveCard(c)&&(includeUnlinked||!c.needsReview)).sort((a,b)=>(positions.get(a.id)??1e8)-(positions.get(b.id)??1e8)||a.anchor.start-b.anchor.start||a.id.localeCompare(b.id));
}
export function resolveAnchor(text,anchor,blocks=[]){
 const matches=[];const consider=(start,end)=>{if(start>=0&&end>start&&end<=text.length&&textHash(text.slice(start,end))===anchor.hash&&!matches.some(m=>m.start===start&&m.end===end))matches.push({start,end});};
 consider(anchor.start,anchor.end);
 for(const block of blocks)if(block.hash===anchor.hash)consider(block.start,block.end);
 if(!matches.length&&anchor.prefix){let from=0,attempts=0;while(attempts++<100){const at=text.indexOf(anchor.prefix,from);if(at<0)break;from=at+1;consider(at,at+anchor.end-anchor.start);if(anchor.suffix){const end=text.indexOf(anchor.suffix,at+anchor.prefix.length);if(end>=0&&end-at<12000)consider(at,end+anchor.suffix.length);}}}
 if(matches.length===1)return matches[0];
 if(matches.length>1){const scored=matches.map(m=>({...m,score:Number(text.slice(Math.max(0,m.start-48),m.start)===anchor.before)+Number(text.slice(m.end,m.end+48)===anchor.after)})).sort((a,b)=>b.score-a.score);if(scored[0].score>scored[1].score&&scored[0].score>0)return scored[0];}
 return null;
}
export function reconcileMemorization(deck,text,blocks=[],rawHash=memoryHash(text)){
 if(!deck)return{deck:null,changed:false,unlinked:0};
 if(deck.sourceRawHash===rawHash)return{deck,changed:false,unlinked:deck.cards.filter(c=>isLiveCard(c)&&c.needsReview).length};
 const next=clone(deck);let unlinked=0;
 for(const c of next.cards){if(!isLiveCard(c))continue;const match=resolveAnchor(text,c.anchor,blocks);if(match){c.anchor=makeAnchor(text,match.start,match.end);delete c.needsReview;}else{c.needsReview=true;unlinked++;}}
 next.sourceHash=textHash(text);next.sourceRawHash=rawHash;
 return {deck:next,changed:memoryStable(deck)!==memoryStable(next),unlinked};
}
const winner=(a,b,key='updatedAt')=>!a?b:!b?a:(a[key]||0)!==(b[key]||0)?(a[key]||0)>(b[key]||0)?a:b:memoryStable(a)>=memoryStable(b)?a:b;
export function mergeMemorization(left,right){
 if(!left)return right?clone(validateMemorization(right)):undefined;if(!right)return clone(validateMemorization(left));
 validateMemorization(left);validateMemorization(right);
 const newest=winner(left,right),result={schema:1,sourceHash:newest.sourceHash,sourceRawHash:newest.sourceRawHash,cards:[],reviews:[],updatedAt:Math.max(left.updatedAt,right.updatedAt)};
 const cards=new Map();for(const c of [...left.cards,...right.cards]){const old=cards.get(c.id),chosen=clone(winner(old,c));const deletedAt=Math.max(old?.deletedAt||0,c.deletedAt||0);if(deletedAt){chosen.deletedAt=deletedAt;chosen.deleted=true;}cards.set(c.id,chosen);}
 result.cards=[...cards.values()].sort((a,b)=>a.id.localeCompare(b.id));
 const events=new Map();for(const r of [...left.reviews,...right.reviews])events.set(r.id,winner(events.get(r.id),r,'at'));result.reviews=[...events.values()].map(clone).sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id));
 const order=winner(left.order,right.order,'at');if(order)result.order=clone(order);
 const session=winner(left.session,right.session);if(session)result.session=clone(session);
 validateMemorization(result);return result;
}
export function mergeDocumentMemorization(source,target){
 for(const version of target?.versions||[]){const aliases=new Set([version.id,version.driveSourceId].filter(Boolean));const from=source?.versions?.find(v=>aliases.has(v.id)||v.driveSourceId&&aliases.has(v.driveSourceId));if(from?.memorization||version.memorization){const deck=mergeMemorization(from?.memorization,version.memorization);if(deck)version.memorization=deck;}}
 return target;
}
export function freshDeck(text,cards,now=Date.now()){return validateMemorization({schema:1,sourceHash:textHash(text),sourceRawHash:memoryHash(text),cards,reviews:[],updatedAt:now});}
export const memoryChangeTime=deck=>Math.max(Date.now(),(deck?.updatedAt||0)+1);
const reviewCache=new WeakMap();
function groups(deck){let cache=reviewCache.get(deck);if(!cache||cache.count!==deck.reviews.length){const byCard=new Map();for(const r of deck.reviews){if(!byCard.has(r.cardId))byCard.set(r.cardId,[]);byCard.get(r.cardId).push(r);}for(const rows of byCard.values())rows.sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id));cache={count:deck.reviews.length,byCard};reviewCache.set(deck,cache);}return cache.byCard;}
export function cardSchedule(deck,card,now=Date.now()){
 const records=(groups(deck).get(card.id)||[]).filter(r=>r.anchorHash===card.anchor.hash);let interval=0,ease=2.3,lapses=0,streak=0,due=0,lastRating=null;
 for(const r of records){lastRating=r.rating;if(r.rating===0){interval=10/1440;lapses++;streak=0;ease=Math.max(1.3,ease-.2);}else if(r.rating===1){interval=Math.max(1,interval*.8);streak=0;ease=Math.max(1.3,ease-.1);}else{streak++;interval=streak===1?1:streak===2?3:Math.min(365,Math.max(7,interval*ease));ease=Math.min(2.8,ease+.05);}due=r.at+Math.round(interval*86400000);}
 return {count:records.length,lastRating,lapses,streak,due,dueNow:due<=now,difficult:lastRating!==null&&(lastRating<2||streak<2&&lapses>0)};
}
export function memoryStudyQueue(deck,mode='normal',now=Date.now()){
 const cards=orderedMemoryCards(deck);if(mode==='difficult')return cards.filter(c=>cardSchedule(deck,c,now).difficult).sort((a,b)=>(cardSchedule(deck,a,now).lastRating??2)-(cardSchedule(deck,b,now).lastRating??2)||a.anchor.start-b.anchor.start).map(c=>c.id);
 const due=cards.filter(c=>cardSchedule(deck,c,now).dueNow);return(due.length?due:cards).map(c=>c.id);
}
export function addMemoryReview(deck,card,rating,at=Date.now()){
 if(![0,1,2].includes(rating)||!isLiveCard(card)||card.needsReview)throw Error('Confira o vínculo deste cartão antes de estudar.');
 if(deck.reviews.length>=MAX_REVIEWS)throw Error('Este conjunto atingiu o limite de avaliações. Exporte um backup antes de continuar.');
 const review={id:memoryId(),cardId:card.id,anchorHash:card.anchor.hash,at,rating};deck.reviews.push(review);deck.updatedAt=Math.max(at,deck.updatedAt+1);return review;
}
export function copyMemorization(deck,{reviews=false}={}){if(!deck)return undefined;const copy=clone(deck);if(!reviews){copy.reviews=[];delete copy.session;}return copy;}
