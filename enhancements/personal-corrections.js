// Namespaced string records keep the existing vocabulary array and its backup merge.
// They are never sent to Hunspell or displayed as dictionary words.
const PREFIX='\u001eSePrepareCorrection/1:';
const key=word=>String(word).normalize('NFC').toLocaleLowerCase('pt-BR');
export function correctionRecord(value){
 if(typeof value!=='string'||!value.startsWith(PREFIX))return null;
 try{const row=JSON.parse(value.slice(PREFIX.length));return typeof row.word==='string'&&row.word.trim()&&row.word.length<=150&&typeof row.replacement==='string'&&row.replacement.trim()&&row.replacement.length<=1000?row:null;}catch{return null;}
}
export const dictionaryWords=vocabulary=>(vocabulary||[]).filter(word=>typeof word==='string'&&!word.startsWith(PREFIX));
export const correctionRecords=vocabulary=>(vocabulary||[]).filter(word=>typeof word==='string'&&word.startsWith(PREFIX));
export function rememberedCorrections(vocabulary){const found=new Map();for(const raw of vocabulary||[]){const row=correctionRecord(raw);if(row&&(!found.has(key(row.word))||(row.updatedAt||0)>(found.get(key(row.word)).updatedAt||0)))found.set(key(row.word),row);}return [...found.values()];}
export function rememberCorrection(vocabulary,word,replacement,now=Date.now()){
 const record={word:String(word).trim().normalize('NFC'),replacement:String(replacement).trim().normalize('NFC'),updatedAt:now};
 if(!record.word||record.word.length>150||!record.replacement||record.replacement.length>1000)throw Error('Digite uma correção válida.');
 const result=(vocabulary||[]).filter(raw=>{const old=correctionRecord(raw);return !old||key(old.word)!==key(record.word);});
 if(result.length>=5000)throw Error('Seu dicionário atingiu o limite de entradas.');
 return [...result,PREFIX+JSON.stringify(record)];
}
export const forgetCorrection=(vocabulary,word)=>(vocabulary||[]).filter(raw=>{const row=correctionRecord(raw);return !row||key(row.word)!==key(word);});
export function rememberedMatches(text,vocabulary){
 const personal=new Set(dictionaryWords(vocabulary).map(key)),result=[];
 for(const row of rememberedCorrections(vocabulary)){
  if(personal.has(key(row.word)))continue;
  const escaped=row.word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),pattern=new RegExp(escaped,'giu');
  for(const m of text.matchAll(pattern)){
   if(/[\p{L}\p{M}\p{N}_]$/u.test(text.slice(0,m.index))||/^[\p{L}\p{M}\p{N}_]/u.test(text.slice(m.index+m[0].length)))continue;
   result.push({offset:m.index,length:m[0].length,word:m[0],message:'Correção lembrada por você. Confira antes de aplicar.',replacements:[row.replacement],safe:false,kind:'personal'});
  }
 }
 return result;
}
