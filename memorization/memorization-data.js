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
  require(c.idea===undefined||typeof c.idea==='boolean');require(c.speakerId===undefined||string(c.speakerId,100));
 }
 const events=new Set();for(const r of deck.reviews){require(r&&validId(r.id)&&!events.has(r.id)&&validId(r.cardId)&&digest(r.anchorHash)&&stamp(r.at)&&[0,1,2].includes(r.rating));events.add(r.id);}
 if(deck.order!==undefined)require(deck.order&&Array.isArray(deck.order.ids)&&deck.order.ids.length<=MAX_CARDS&&deck.order.ids.every(validId)&&stamp(deck.order.at)&&validId(deck.order.id));
 if(deck.session!==undefined){const s=deck.session;require(s&&validId(s.id)&&stamp(s.updatedAt)&&['normal','difficult'].includes(s.mode)&&Array.isArray(s.queue)&&s.queue.length<=MAX_CARDS*3&&s.queue.every(validId)&&Number.isSafeInteger(s.position)&&s.position>=0&&s.position<=s.queue.length&&Array.isArray(s.answers)&&s.answers.length<=MAX_CARDS*3&&s.answers.every(validId));}
 if(deck.ideaSource!==undefined)require(digest(deck.ideaSource));
 if(deck.ideaRounds!==undefined){require(Array.isArray(deck.ideaRounds)&&deck.ideaRounds.length<=10000);const rounds=new Set();for(const r of deck.ideaRounds){validateIdeaRound(r);require(!rounds.has(r.id));rounds.add(r.id);}}
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
 const source=winner(left.ideaSource?left:null,right.ideaSource?right:null);if(source)result.ideaSource=source.ideaSource;
 if(left.ideaRounds||right.ideaRounds){const rounds=new Map();for(const r of [...left.ideaRounds||[],...right.ideaRounds||[]])rounds.set(r.id,mergeIdeaRound(rounds.get(r.id),r));result.ideaRounds=[...rounds.values()].sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id));}
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
export function copyMemorization(deck,{reviews=false}={}){if(!deck)return undefined;const copy=clone(deck);if(!reviews){copy.reviews=[];delete copy.session;delete copy.ideaRounds;}return copy;}

// New rounds are additive. Legacy cards, sessions and review events are retained.
export function validateIdeaRound(r){
 require(r&&validId(r.id)&&stamp(r.at)&&stamp(r.updatedAt)&&digest(r.sourceHash)&&Array.isArray(r.scope)&&r.scope.length<=50&&r.scope.every(id=>string(id,100))&&new Set(r.scope).size===r.scope.length);
 require(Array.isArray(r.entries)&&r.entries.length>0&&r.entries.length<=12&&r.entries.every(e=>e&&validId(e.cardId)&&digest(e.anchorHash))&&new Set(r.entries.map(e=>e.cardId)).size===r.entries.length);
 require(Array.isArray(r.answers)&&r.answers.length<=2000);const ids=new Set();for(const a of r.answers){require(a&&validId(a.id)&&!ids.has(a.id)&&stamp(a.at)&&Number.isInteger(a.index)&&a.index>=0&&a.index<r.entries.length&&[0,2].includes(a.rating));ids.add(a.id);}
 require(r.cursor&&validId(r.cursor.id)&&stamp(r.cursor.at)&&Number.isInteger(r.cursor.index)&&r.cursor.index>=0&&r.cursor.index<r.entries.length);require(r.finishedAt===undefined||stamp(r.finishedAt));return r;
}
export function mergeIdeaRound(a,b){
 if(!a)return clone(validateIdeaRound(b));validateIdeaRound(a);validateIdeaRound(b);
 // An ID denotes one immutable selection. Conflicting payloads must not silently mix answers.
 require(memoryStable([a.scope,a.entries,a.sourceHash,a.at])===memoryStable([b.scope,b.entries,b.sourceHash,b.at]));
 const next=clone(winner(a,b)),answers=new Map();for(const answer of [...a.answers,...b.answers])answers.set(answer.id,winner(answers.get(answer.id),answer,'at'));
 next.answers=[...answers.values()].map(clone).sort((x,y)=>x.at-y.at||x.id.localeCompare(y.id));next.cursor=clone(winner(a.cursor,b.cursor,'at'));const finished=Math.max(a.finishedAt||0,b.finishedAt||0);if(finished)next.finishedAt=finished;next.updatedAt=Math.max(a.updatedAt,b.updatedAt);return validateIdeaRound(next);
}
export const ideaScopeKey=scope=>JSON.stringify([...scope].sort());
export function ideaRoundResult(round){
 const latest=new Map();for(const a of round.answers)latest.set(a.index,winner(latest.get(a.index),a,'at'));const values=[...latest.values()],remembered=values.filter(a=>a.rating===2).length;
 return{total:round.entries.length,answered:values.length,remembered,review:values.length-remembered,unrated:round.entries.length-values.length,percent:values.length?Math.round(100*remembered/values.length):null,answers:latest};
}
export function selectIdeaRound(deck,pool,scope=[],now=Date.now()){
 const rounds=(deck.ideaRounds||[]).filter(r=>ideaScopeKey(r.scope)===ideaScopeKey(scope)),previous=rounds.at(-1),used=new Map(),lastUsed=new Map();
 for(const r of rounds)for(const e of r.entries){used.set(e.cardId,(used.get(e.cardId)||0)+1);lastUsed.set(e.cardId,r.at);}
 const unique=[...new Map(pool.filter(c=>isLiveCard(c)&&!c.needsReview).map(c=>[c.id,c])).values()];if(!unique.length)return null;
 // Small rounds, balanced over the whole speech. A different selection is guaranteed
 // when the available bank has more cards than the round; order remains chronological.
 const size=Math.min(8,unique.length>2?Math.max(2,Math.ceil(unique.length*.6)):unique.length),seed=memoryHash(memoryId());
 const previousIds=new Set(previous?.entries.map(e=>e.cardId)||[]),rank=c=>(used.get(c.id)||0)*10+(previousIds.has(c.id)?5:0);
 const ranked=unique.map(c=>({c,rank:rank(c),tie:memoryHash(c.id+seed)})).sort((a,b)=>a.rank-b.rank||a.tie.localeCompare(b.tie));
 const selected=[],sections=new Set();
 for(const item of ranked){const section=item.c.speakerId||item.c.theme;if(sections.has(section))continue;selected.push(item.c);sections.add(section);if(selected.length===size)break;}
 for(const item of ranked){if(selected.length===size)break;if(!selected.includes(item.c))selected.push(item.c);}
 if(previous&&selected.length<unique.length&&selected.every(c=>previousIds.has(c.id))){const fresh=ranked.find(x=>!previousIds.has(x.c.id));if(fresh)selected[selected.length-1]=fresh.c;}
 const signature=list=>list.map(c=>c.id).sort().join('|'),past=new Set(rounds.map(r=>r.entries.map(e=>e.cardId).sort().join('|')));
 if(selected.length<unique.length&&past.has(signature(selected))){let found=false;for(const item of ranked.filter(x=>!selected.includes(x.c))){for(let i=selected.length-1;i>=0;i--){const trial=selected.slice();trial[i]=item.c;if(!past.has(signature(trial))){selected.splice(0,selected.length,...trial);found=true;break;}}if(found)break;}}
 const order=new Map((deck.order?.ids||[]).map((id,i)=>[id,i]));selected.sort((a,b)=>(order.get(a.id)??1e8)-(order.get(b.id)??1e8)||a.anchor.start-b.anchor.start||a.id.localeCompare(b.id));
 return validateIdeaRound({id:'round-'+memoryId(),at:now,updatedAt:now,scope:[...scope].sort(),sourceHash:deck.ideaSource||deck.sourceHash,entries:selected.map(c=>({cardId:c.id,anchorHash:c.anchor.hash})),answers:[],cursor:{id:memoryId(),at:now,index:0}});
}
export function recordIdeaAnswer(deck,round,index,rating,at=Date.now()){
 if(![0,2].includes(rating)||!round.entries[index])throw Error('Avaliação inválida.');if(round.answers.length>=2000)throw Error('Esta rodada atingiu o limite de avaliações.');
 const entry=round.entries[index],card=deck.cards.find(c=>c.id===entry.cardId);if(!card||card.anchor.hash!==entry.anchorHash)throw Error('O trecho mudou. Inicie uma nova rodada.');
 const review=addMemoryReview(deck,card,rating,at);round.answers.push({id:review.id,at,index,rating});round.updatedAt=at;return review;
}
