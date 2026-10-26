import {dictionaryWords,rememberedMatches} from './personal-corrections.js';
import aff from './dictionary/index.aff';
import dic from './dictionary/index.dic';
import {localRuleMatches} from './core.js';

// Hunspell interprets VERO's actual affix flags. A list of stems alone rejects
// valid inflections such as "das", "nossa" and conjugated verbs.
let checkerPromise;
const addedWords=new Set();
function init(){
  if(!checkerPromise)checkerPromise=import('./spell/dist/Hunspell.js').then(({createHunspellFromStrings})=>createHunspellFromStrings(aff,dic)).catch(error=>{checkerPromise=null;throw error;});
  return checkerPromise;
}
function useVocabulary(checker,vocabulary){
  const current=new Set(dictionaryWords(vocabulary).map(word=>word.normalize('NFC').toLocaleLowerCase('pt-BR')));
  for(const word of addedWords)if(!current.has(word)){checker.removeWord(word);addedWords.delete(word);}
  for(const word of current)if(word&&!addedWords.has(word)&&!checker.testSpelling(word)){checker.addWord(word);addedWords.add(word);}
  return current;
}
self.onmessage=async event=>{
  const {token,text,vocabulary=[]}=event.data;
  try{
    const checker=await init(),personal=useVocabulary(checker,vocabulary);
    const matches=[...rememberedMatches(text,vocabulary),...localRuleMatches(text).filter(m=>!personal.has(m.word.normalize('NFC').toLocaleLowerCase('pt-BR')))],seen=new Set();
    for(const m of text.matchAll(/[\p{L}][\p{L}\p{M}-]*/gu)){
      if(matches.length>=70)break;
      const word=m[0].normalize('NFC'),lower=word.toLocaleLowerCase('pt-BR');
      if(word.length<3||word.length>35||seen.has(lower)||matches.some(s=>m.index<s.offset+s.length&&m.index+m[0].length>s.offset))continue;
      seen.add(lower);
      if(personal.has(lower)||checker.testSpelling(word)||checker.testSpelling(lower))continue;
      const replacements=[...new Set(checker.getSpellingSuggestions(word))].filter(candidate=>candidate!==word).slice(0,4);
      matches.push({offset:m.index,length:m[0].length,word:m[0],message:'Sugestão ortográfica. Confira o contexto antes de aplicar.',replacements,safe:false,kind:'spelling'});
    }
    self.postMessage({token,matches:matches.sort((a,b)=>a.offset-b.offset),engine:'Hunspell + dicionário VERO · offline'});
  }catch(error){
    self.postMessage({token,matches:[...rememberedMatches(text,vocabulary),...localRuleMatches(text)],engine:'Regras locais · dicionário indisponível nesta revisão',error:error.message});
  }
};
