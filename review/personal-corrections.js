// Namespaced records preserve the existing vocabulary array and backup merge.
// Unscoped legacy words/corrections belong to Portuguese; other languages never leak into it.
const PREFIX='\u001eSePrepareCorrection/1:';
const locale=value=>['pt-BR','en','es','ja'].includes(value)?value:'pt-BR';
const languageOf=row=>locale(row.language||'pt-BR');
const key=(word,language='pt-BR')=>String(word).normalize('NFC').toLocaleLowerCase(locale(language));
export function correctionRecord(value){
 if(typeof value!=='string'||!value.startsWith(PREFIX))return null;
 try{const row=JSON.parse(value.slice(PREFIX.length));return typeof row.word==='string'&&row.word.trim()&&row.word.length<=150&&typeof row.replacement==='string'&&row.replacement.trim()&&row.replacement.length<=1000&&(!row.language||['pt-BR','en','es','ja'].includes(row.language))?row:null;}catch{return null;}
}
export function dictionaryWords(vocabulary,language='pt-BR'){const code=locale(language),words=[];for(const raw of vocabulary||[]){if(typeof raw!=='string')continue;if(!raw.startsWith(PREFIX)){if(code==='pt-BR')words.push(raw);}else{const row=correctionRecord(raw);if(row?.kind==='word'&&languageOf(row)===code)words.push(row.word);}}return [...new Map(words.map(word=>[key(word,code),word])).values()];}
export const correctionRecords=vocabulary=>(vocabulary||[]).filter(word=>typeof word==='string'&&word.startsWith(PREFIX));
export function rememberedCorrections(vocabulary,language='pt-BR'){const found=new Map(),code=locale(language);for(const raw of vocabulary||[]){const row=correctionRecord(raw);if(row&&row.kind!=='word'&&languageOf(row)===code&&(!found.has(key(row.word,code))||(row.updatedAt||0)>(found.get(key(row.word,code)).updatedAt||0)))found.set(key(row.word,code),row);}return [...found.values()];}
export function rememberCorrection(vocabulary,word,replacement,now=Date.now(),language='pt-BR'){
 const code=locale(language),record={word:String(word).trim().normalize('NFC'),replacement:String(replacement).trim().normalize('NFC'),updatedAt:now,...(code!=='pt-BR'?{language:code}:{})};
 if(!record.word||record.word.length>150||!record.replacement||record.replacement.length>1000)throw Error('Digite uma correção válida.');
 const result=(vocabulary||[]).filter(raw=>{const old=correctionRecord(raw);return !old||old.kind==='word'||languageOf(old)!==code||key(old.word,code)!==key(record.word,code);});
 if(result.length>=5000)throw Error('Seu dicionário atingiu o limite de entradas.');return [...result,PREFIX+JSON.stringify(record)];
}
export const forgetCorrection=(vocabulary,word,language='pt-BR')=>(vocabulary||[]).filter(raw=>{const row=correctionRecord(raw);return !row||row.kind==='word'||languageOf(row)!==locale(language)||key(row.word,language)!==key(word,language);});
export function rememberWord(vocabulary,word,language='pt-BR',now=Date.now()){
 const code=locale(language),value=String(word).trim().normalize('NFC');if(!value||value.length>150)throw Error('Use uma palavra ou expressão com até 150 caracteres.');
 if(dictionaryWords(vocabulary,code).some(w=>key(w,code)===key(value,code)))return vocabulary;
 if(vocabulary.length>=5000)throw Error('Seu dicionário atingiu o limite de entradas.');
 return [...vocabulary,code==='pt-BR'?value:PREFIX+JSON.stringify({word:value,replacement:value,kind:'word',language:code,updatedAt:now})];
}
export function replaceDictionaryWords(vocabulary,words,language='pt-BR'){
 const code=locale(language);let result=(vocabulary||[]).filter(raw=>{const row=correctionRecord(raw);return code==='pt-BR'?typeof raw==='string'&&raw.startsWith(PREFIX):!row||row.kind!=='word'||languageOf(row)!==code;});
 for(const word of words)if(String(word).trim())result=rememberWord(result,word,code);return result;
}
export function rememberedMatches(text,vocabulary,language='pt-BR'){
 const code=locale(language),personal=new Set(dictionaryWords(vocabulary,code).map(word=>key(word,code))),result=[];
 for(const row of rememberedCorrections(vocabulary,code)){
  if(personal.has(key(row.word,code)))continue;const escaped=row.word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),pattern=new RegExp(escaped,'giu');
  for(const m of text.matchAll(pattern)){if(code!=='ja'&&(/[\p{L}\p{M}\p{N}_]$/u.test(text.slice(0,m.index))||/^[\p{L}\p{M}\p{N}_]/u.test(text.slice(m.index+m[0].length))))continue;result.push({offset:m.index,length:m[0].length,word:m[0],message:'Correção lembrada por você. Confira antes de aplicar.',replacements:[row.replacement],safe:false,kind:'personal'});}
 }return result;
}
