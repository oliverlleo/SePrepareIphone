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
 if(deck.ideaEngine!==undefined)require(deck.ideaEngine===2);
 if(deck.ideaBank!==undefined)require(Array.isArray(deck.ideaBank)&&deck.ideaBank.length<=MAX_CARDS&&deck.ideaBank.every(validId)&&new Set(deck.ideaBank).size===deck.ideaBank.length);
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
 const bank=winner(left.ideaBank?left:null,right.ideaBank?right:null);if(bank){result.ideaBank=clone(bank.ideaBank);result.ideaEngine=2;}
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
 require(Array.isArray(r.entries)&&r.entries.length>0&&r.entries.length<=(r.training===2?MAX_CARDS:12)&&r.entries.every(e=>e&&validId(e.cardId)&&digest(e.anchorHash))&&new Set(r.entries.map(e=>e.cardId)).size===r.entries.length);
 require(Array.isArray(r.answers)&&r.answers.length<=6000);const ids=new Set();for(const a of r.answers){require(a&&validId(a.id)&&!ids.has(a.id)&&stamp(a.at)&&Number.isInteger(a.index)&&a.index>=0&&a.index<r.entries.length&&(r.training===2?[0,1,2]:[0,2]).includes(a.rating));ids.add(a.id);}
 require(r.cursor&&validId(r.cursor.id)&&stamp(r.cursor.at)&&Number.isInteger(r.cursor.index)&&r.cursor.index>=0&&r.cursor.index<(r.training===2?r.groups?.length:r.entries.length));require(r.finishedAt===undefined||stamp(r.finishedAt));
 if(r.training!==undefined){require(r.training===2&&[1,2,3,4].includes(r.level)&&Array.isArray(r.groups)&&r.groups.length>0&&r.groups.length<=MAX_CARDS);const flat=r.groups.flat();require(r.groups.every(g=>Array.isArray(g)&&g.length>0&&g.every(i=>Number.isInteger(i)&&i>=0&&i<r.entries.length))&&flat.length===r.entries.length&&new Set(flat).size===flat.length&&flat.every((v,i)=>v===i));require(Array.isArray(r.signals)&&r.signals.length<=12000);const seen=new Set();for(const s of r.signals){require(s&&validId(s.id)&&!seen.has(s.id)&&stamp(s.at)&&Number.isInteger(s.index)&&s.index>=0&&s.index<r.entries.length&&['hint','reveal','difficult'].includes(s.kind));seen.add(s.id);}}
 return r;
}
export function mergeIdeaRound(a,b){
 if(!a)return clone(validateIdeaRound(b));validateIdeaRound(a);validateIdeaRound(b);
 // An ID denotes one immutable selection. Conflicting payloads must not silently mix answers.
 require(memoryStable([a.scope,a.entries,a.sourceHash,a.at,a.training,a.level,a.groups])===memoryStable([b.scope,b.entries,b.sourceHash,b.at,b.training,b.level,b.groups]));
 const next=clone(winner(a,b)),answers=new Map();for(const answer of [...a.answers,...b.answers])answers.set(answer.id,winner(answers.get(answer.id),answer,'at'));
 next.answers=[...answers.values()].map(clone).sort((x,y)=>x.at-y.at||x.id.localeCompare(y.id));if(a.training===2){const signals=new Map();for(const s of [...a.signals,...b.signals])signals.set(s.id,winner(signals.get(s.id),s,'at'));next.signals=[...signals.values()].map(clone).sort((x,y)=>x.at-y.at||x.id.localeCompare(y.id));}next.cursor=clone(winner(a.cursor,b.cursor,'at'));const finished=Math.max(a.finishedAt||0,b.finishedAt||0);if(finished)next.finishedAt=finished;next.updatedAt=Math.max(a.updatedAt,b.updatedAt);return validateIdeaRound(next);
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

export const trainingGroup=(r,index=r.cursor.index)=>r.training===2?r.groups[index]:[index];
export function trainingResult(r){
 const latest=ideaRoundResult(r).answers,signalSets={hint:new Set(),reveal:new Set(),difficult:new Set()};
 for(const s of r.signals||[])signalSets[s.kind]?.add(s.index);
 const assisted=new Set([...signalSets.hint,...signalSets.reveal]),difficult=new Set([...signalSets.difficult,...[...latest].filter(([,a])=>a.rating===0).map(([i])=>i)]);
 const independent=[...latest].filter(([i,a])=>a.rating===2&&!assisted.has(i)&&!difficult.has(i)).length;
 const independentPercent=latest.size?Math.round(100*independent/latest.size):null;
 return{...ideaRoundResult(r),...(r.training===2?{percent:independentPercent,remembered:independent}:{}),independent,hinted:signalSets.hint.size,consulted:signalSets.reveal.size,difficult:difficult.size,assisted:assisted.size,independentPercent};
}
export function recordTrainingSignal(deck,r,kind,at=Date.now()){
 if(r.training!==2||!['hint','reveal','difficult'].includes(kind))throw Error('Treino inválido.');
 const indices=trainingGroup(r),existing=new Set(r.signals.filter(s=>s.kind===kind).map(s=>s.index));if(r.signals.length+indices.filter(i=>!existing.has(i)).length>12000)throw Error('Limite de registros deste treino.');
 for(const index of indices)if(!existing.has(index))r.signals.push({id:memoryId(),at,index,kind});
 r.updatedAt=Math.max(at,r.updatedAt);deck.updatedAt=Math.max(at,deck.updatedAt+1);
}
export function completeTrainingGroup(deck,r,at=Date.now()){
 const stats=trainingResult(r),cards=new Map(deck.cards.map(c=>[c.id,c])),signalsByIndex=new Map();for(const s of r.signals){if(!signalsByIndex.has(s.index))signalsByIndex.set(s.index,[]);signalsByIndex.get(s.index).push(s);}
 for(const index of trainingGroup(r)){
  const entry=r.entries[index],card=cards.get(entry.cardId);if(!card||card.anchor.hash!==entry.anchorHash||!isLiveCard(card)||card.needsReview)continue;
  const old=stats.answers.get(index);if(old)continue; // Navigation/back cannot manufacture extra successful reviews.
  const signals=signalsByIndex.get(index)||[],rating=signals.some(s=>s.kind==='difficult')?0:signals.length?1:2;
  if(r.answers.length>=6000)throw Error('Limite de avaliações deste treino.');const review=addMemoryReview(deck,card,rating,at);r.answers.push({id:review.id,at,index,rating});
 }r.updatedAt=at;
}
export function adaptiveTrainingLevel(deck,pool,scope){
 const valid=new Map(pool.map(c=>[c.id,c.anchor.hash])),rows=(deck.ideaRounds||[]).filter(r=>r.training===2&&r.finishedAt&&ideaScopeKey(r.scope)===ideaScopeKey(scope)&&r.entries.every(e=>valid.get(e.cardId)===e.anchorHash)).sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id));
 let level=1;const successes=new Map(),coverage=new Set();
 for(const r of rows){const result=trainingResult(r);if(r.level!==level)continue;
  if(result.independentPercent>=80&&result.answered===result.total&&!result.difficult){successes.set(level,(successes.get(level)||0)+1);for(const e of r.entries)coverage.add(e.cardId);if(successes.get(level)>=2&&coverage.size>=Math.ceil(pool.length*.7)){level=Math.min(4,level+1);coverage.clear();}}
  else if(result.difficult>result.total/2){level=Math.max(1,level-1);successes.delete(level);coverage.clear();}
 }
 return pool.length<2?1:level;
}
export function selectAdaptiveRound(deck,pool,scope=[],sections=new Map(),now=Date.now()){
 const unique=[...new Map(pool.filter(c=>isLiveCard(c)&&!c.needsReview).map(c=>[c.id,c])).values()];if(!unique.length)return null;
 const level=adaptiveTrainingLevel(deck,unique,scope),base=selectIdeaRound(deck,unique,scope,now),seed=memoryId(),scoped=(deck.ideaRounds||[]).filter(r=>ideaScopeKey(r.scope)===ideaScopeKey(scope)),used=new Map(),help=new Map();
 for(const r of scoped){for(const e of r.entries)used.set(e.cardId,(used.get(e.cardId)||0)+1);if(r.training===2)for(const s of r.signals){const e=r.entries[s.index];if(e)help.set(e.cardId,Math.max(help.get(e.cardId)||0,s.at));}}
 const rows=unique.map(c=>{const schedule=cardSchedule(deck,c,now),recentHelp=(help.get(c.id)||0)>now-86400000*3;return {c,schedule,priority:(schedule.difficult?100:0)+(recentHelp?40:0)+(schedule.dueNow?20:0)+(schedule.count?0:15),tie:memoryHash(c.id+seed)};}).sort((a,b)=>b.priority-a.priority||(used.get(a.c.id)||0)-(used.get(b.c.id)||0)||a.tie.localeCompare(b.tie));
 let selected;
 if(level===4)selected=[...unique];
 else{
  const size=Math.min(8,unique.length>2?Math.max(2,Math.ceil(unique.length*.6)):unique.length),prioritySlots=Math.max(1,Math.floor(size*.7));selected=rows.slice(0,prioritySlots).map(x=>x.c);
  // Always reserve coverage for other parts; already-mastered introductions still recur.
  const coverage=rows.filter(x=>!selected.includes(x.c)).sort((a,b)=>(used.get(a.c.id)||0)-(used.get(b.c.id)||0)||a.tie.localeCompare(b.tie));for(const x of coverage){if(selected.length===size)break;selected.push(x.c);}
  if(level<=2&&selected.length<unique.length){const signature=list=>list.map(c=>c.id).sort().join('|'),past=new Set(scoped.map(r=>r.entries.map(e=>e.cardId).sort().join('|')));if(past.has(signature(selected))){let found=false;for(const item of rows.filter(x=>!selected.includes(x.c))){for(let i=selected.length-1;i>=prioritySlots;i--){const trial=selected.slice();trial[i]=item.c;if(!past.has(signature(trial))){selected=trial;found=true;break;}}if(found)break;}}}
  if(level===3){const ids=new Set(selected.map(c=>sections.get(c.id)?.id||c.id));selected=unique.filter(c=>ids.has(sections.get(c.id)?.id||c.id));}
 }
 // Study order follows the discourse, even when difficulty decides what is selected.
 selected.sort((a,b)=>a.anchor.start-b.anchor.start||a.id.localeCompare(b.id));
 const entries=selected.map(c=>({cardId:c.id,anchorHash:c.anchor.hash})),groups=[];
 for(let i=0;i<selected.length;i++){
  const prev=groups.at(-1),a=prev&&selected[prev.at(-1)],b=selected[i],same=!!a&&(sections.get(a.id)?.id||a.id)===(sections.get(b.id)?.id||b.id),left=new Set(sections.get(a?.id)?.terms||[]),overlap=(sections.get(b.id)?.terms||[]).filter(w=>left.has(w)).length,connected=!!a&&(same||overlap>=2)&&a.speakerId===b.speakerId&&b.anchor.start-a.anchor.end<500;
  if(prev&&(level===4||level===3&&same||level===2&&prev.length<2&&connected))prev.push(i);else groups.push([i]);
 }
 return validateIdeaRound({...base,training:2,level,entries,groups,signals:[],cursor:{id:memoryId(),at:now,index:0}});
}
