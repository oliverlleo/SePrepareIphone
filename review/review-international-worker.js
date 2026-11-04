import {dictionaryWords,rememberedMatches} from './personal-corrections.js';
import {JAPANESE_ENGINE} from './review-packs-manifest.js';
let checker,language='',added=new Set();
async function latin(code,files,vocabulary){
 if(!checker||language!==code){const {createHunspellFromStrings}=await import('./spell/dist/Hunspell.js');const decode=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes);checker=await createHunspellFromStrings(decode(files['index.aff']),decode(files['index.dic']));language=code;added=new Set();}
 const personal=new Set(dictionaryWords(vocabulary,code).map(word=>word.normalize('NFC').toLocaleLowerCase(code)));
 for(const word of added)if(!personal.has(word)){checker.removeWord(word);added.delete(word);}
 for(const word of personal)if(!added.has(word)&&!checker.testSpelling(word)){checker.addWord(word);added.add(word);}
 return personal;
}
self.onmessage=async({data})=>{
 const {token,text,code,vocabulary=[],files}=data;try{
  let matches=rememberedMatches(text,vocabulary,code),engine;
  if(code==='ja'){
   importScripts(JAPANESE_ENGINE);await self.SePrepareJapaneseReview.initialize(files);
   const findings=await self.SePrepareJapaneseReview.check(text),personal=new Set(dictionaryWords(vocabulary,code));
   for(const row of findings){const range=row.fix?.range||row.range||[row.index,row.index+1],offset=range[0],length=range[1]-range[0];if(!Number.isInteger(offset)||!Number.isInteger(length)||offset<0||length<0||offset+length>text.length)continue;const word=text.slice(offset,offset+length);if(personal.has(word)||!length)continue;matches.push({offset,length,word,message:row.message,replacements:typeof row.fix?.text==='string'?[row.fix.text]:[],safe:false,kind:'writing',rule:row.ruleId});}
   engine='textlint + Kuromoji · 日本語 · offline';
  }else if(code==='en'||code==='es'){
   const personal=await latin(code,files,vocabulary),seen=new Set();
   for(const row of text.matchAll(/[\p{L}][\p{L}\p{M}]*(?:['’\-][\p{L}\p{M}]+)*/gu)){if(matches.length>=150)break;const word=row[0].normalize('NFC'),lower=word.toLocaleLowerCase(code);if(word.length<2||word.length>70||seen.has(lower)||personal.has(lower)||matches.some(m=>row.index<m.offset+m.length&&row.index+row[0].length>m.offset))continue;seen.add(lower);if(checker.testSpelling(word)||checker.testSpelling(lower))continue;const replacements=[...new Set(checker.getSpellingSuggestions(word))].filter(v=>v!==word).slice(0,4);matches.push({offset:row.index,length:row[0].length,word:row[0],message:code==='en'?'Spelling suggestion. Check the context before applying.':'Sugerencia ortográfica. Revisa el contexto antes de aplicarla.',replacements,safe:false,kind:'spelling'});}
   engine='Hunspell · '+(code==='en'?'English':'Español')+' · offline';
  }else throw Error('Idioma de revisão inválido.');
  const unique=new Set();matches=matches.filter(m=>{const key=m.offset+':'+m.length;if(unique.has(key))return false;unique.add(key);return true;}).sort((a,b)=>a.offset-b.offset).slice(0,150);
  self.postMessage({token,matches,engine});
 }catch(error){self.postMessage({token,matches:[],error:error.message,engine:'Pacote de revisão indisponível'});}
};
