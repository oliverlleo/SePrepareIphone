import models from './memorization-tagger-model.json';
// Averaged contextual perceptron trained on Universal Dependencies. Worker-only.
const languageWords={pt:new Set('o os uma um dos das não são é pelo pela sua seu'.split(' ')),en:new Set('the an and this that which their with without is are your'.split(' ')),es:new Set('el los la una unos las del y este esta es son sus pero'.split(' '))};
export function detectContextLanguage(text){if(/[\u3040-\u30ff\u3400-\u9fff]/u.test(text))return 'ja';const words=text.toLocaleLowerCase().match(/[\p{L}]+/gu)||[];const scores=Object.keys(languageWords).map(k=>({k,score:words.reduce((s,w)=>s+(languageWords[k].has(w)?3:0)+(models[k].freq[w]!==undefined?.2:0),0)})).sort((a,b)=>b.score-a.score);return scores[0]?.score?scores[0].k:'pt';}
const cache=new Map();
const verbSets=new Map(Object.entries(models).map(([k,m])=>[k,new Set(m.verbs||[])]));
// UD tokenizes verbal clitics separately. Recover their surface form before the
// contextual tagger sees it; noun compounds must never be treated as verbs merely
// because they contain a hyphen.
function verbalCompound(word,model){
 if(model.verbalCompounds?.[word])return model.verbalCompounds[word];
 if(!word.includes('-'))return null;const parts=word.split('-'),clitics=new Set(model.clitics||[]);
 let stem=parts.shift();if(!parts.length||!parts.every(p=>clitics.has(p)))return null;
 if(model.verbSurfaces?.[stem])return model.verbSurfaces[stem];
 // Elision of the infinitive -r before object clitics is productive Portuguese
 // morphology. Require a real verb lemma, including accented surface variants.
 if(parts.some(p=>/^[ln][oa]s?$/u.test(p))){const bare=keyOf(stem);for(const end of ['r','er','ar']){const form=bare+end;if(verbSets.get('pt')?.has(form))return 'INF';}}
 return null;
}
const keyOf=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase(),frequencies=new Map(Object.entries(models).map(([lang,m])=>{const sums=new Map();for(const[w,n]of Object.entries(m.freq))sums.set(keyOf(w),(sums.get(keyOf(w))||0)+n);return[lang,sums];})),obliqueness=new Map(Object.entries(models).map(([lang,m])=>[lang,new Map(Object.entries(m.oblique||{}).map(([w,n])=>[keyOf(w),n]))]));
export function tagContextWords(words,language='pt'){
 const model=models[language]||models.pt,key=language+'|'+words.map(w=>w.text).join(' ');if(cache.has(key))return cache.get(key);const out=[];let prev='^',prev2='^';
 for(let i=0;i<words.length;i++){
  const w=words[i].text.toLocaleLowerCase(),p=i?words[i-1].text.toLocaleLowerCase():'^',n=i+1<words.length?words[i+1].text.toLocaleLowerCase():'$',features=['bias','w='+w,'p='+p,'n='+n,'wp='+w+'|'+p,'wn='+w+'|'+n,'pos='+Math.min(i,2),'shape='+(/^\p{Lu}/u.test(words[i].text)?'U':'l'),'t='+prev,'tt='+prev2+'|'+prev,...[1,2,3,4].filter(k=>w.length>=k).map(k=>'s'+k+'='+w.slice(-k)),'ns='+n.slice(-2),'ps='+p.slice(-2),...[0,1,2,3].filter(k=>w.length-k>=4).map(k=>'stem='+w.slice(0,w.length-k))];
  const compound=verbalCompound(w,model);let label=compound?model.tags.indexOf(compound):model.closedForms?.[w]?model.tags.indexOf(model.closedForms[w]):model.fixed[w];if(label===undefined||label<0){const scores=new Array(model.tags.length).fill(0);for(const f of features){const row=model.weights[f]||[];for(let j=0;j<row.length;j+=2)scores[row[j]]+=row[j+1];}label=scores.indexOf(Math.max(...scores));}const tag=model.tags[label];out.push(tag);prev2=prev;prev=tag;
 }if(language==='en'){const verbs=verbSets.get('en');for(let i=0;i<words.length;i++){const w=words[i].text.toLocaleLowerCase();if(model.fixed[w]!==undefined)continue;const stems=[w.endsWith('ies')?w.slice(0,-3)+'y':'',w.endsWith('es')?w.slice(0,-2):'',w.endsWith('s')?w.slice(0,-1):'',w.endsWith('ed')?w.slice(0,-2):''];if(stems.some(s=>verbs.has(s)))out[i]='VERB';}}
 if(language==='pt'){const verbs=verbSets.get('pt');for(let i=0;i<words.length;i++){const w=words[i].text.toLocaleLowerCase();if(out[i]!=='NOUN'||model.freq[w])continue;for(const suffix of ['avam','aram','ando','asse','aria','amos','iam','am','as','ou','eu','ia','a','o','e']){if(w.length>suffix.length+2&&w.endsWith(suffix)&&['ar','er','ir'].some(inf=>verbs.has(w.slice(0,-suffix.length)+inf))){out[i]='VERB';break;}}}}
 if(cache.size>=512)cache.delete(cache.keys().next().value);cache.set(key,out);return out;
}
export const contextWordFrequency=(word,language='pt')=>frequencies.get(language)?.get(keyOf(word))||0;
export const contextWordObliqueness=(word,language='pt')=>obliqueness.get(language)?.get(keyOf(word))||0;
export const contextObjectClitic=(word,language='pt')=>(models[language]?.clitics||[]).includes(word.toLocaleLowerCase());
const participles=new Map(Object.entries(models).map(([lang,m])=>[lang,new Set(m.participles||[])]));
export const contextParticiple=(word,language='pt')=>participles.get(language)?.has(word.toLocaleLowerCase())||false;
