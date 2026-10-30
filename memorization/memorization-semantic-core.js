// Deterministic analysis. Source positions use UTF-16, like Quill.
export const normalize=text=>String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const stop=new Set(normalize('a o as os um uma uns umas e ou de da do das dos em na no nas nos por para com sem se que quem qual quais como quando onde porque pois mas mais menos eu tu ele ela nós vós eles elas você vocês meu minha meus minhas seu sua seus suas nosso nossa nossos nossas isso isto esse essa esses essas este esta estes estas aquele aquela ao aos à às é são era foi ser estar ter tem têm muito toda todo todos todas já não sim também entre cada então sobre depois antes pode podem deve devem precisa precisam hoje aqui vamos quero queremos apenas mesmo assim ainda bem tão só até há seja sejam será serão estamos está estão estava estavam sendo sido fazer faz fazem feito feita fez fazemos dizer diz disse olhar veja vemos ver podemos devemos precisamos falar fala falam falou vou vai vão ir foram fica ficam ficou ficar dar dá dão deu existe existem usar usa usamos trazer traz tenho temos tinha houver neste nesta nestes nestas naquele naquela dele dela deles delas nele nela pelo pela pelos pelas numa num enquanto através durante contra desde segundo dessa desse dessas desses disto disso coisa coisas algo alguém ninguém tudo nada pessoa pessoas maneira forma modo parte ponto exemplo assunto questão vez vezes dia dias momento atenção obrigado obrigada pessoal bom boa olá oi final início começo certo certa importante importância principal principais seguinte seguir agora sempre nunca talvez bastante realmente geralmente normalmente simplesmente especialmente necessário necessária possível outro outra outros outras interessante lembrar pensar acha acho achar sabe sabemos conseguir consegue deixar deixa torna tornar tipo tanto quanto poucos pouco muita muitas vários várias essencial essenciais fundamental fundamentais evitar evita evitam evitamos garantir garante garantem conferir confere conferimos verificar verifica verifique concluir conclui escolher escolhe cuidar cuida causar causa causam conferir instalar instala instalamos começar começa reduzir reduz aumentam aumenta proteger protege protegem permite permitem utilizar utiliza utilizam explicar explica mostrar mostra manter mantém ajudam ajuda reduzimos perceba percebem').split(/\s+/));
const joiners=new Set('de da do das dos em na no nas nos para com sem ao aos à às por pelo pela pelos pelas'.split(' '));
const abbreviations=new Set('sr sra srta dr dra prof profa eng pág págs fig figs art arts ex etc av tel aprox min máx obs ref refs núm vol cap caps vers'.split(' '));
export const wordTokens=text=>[...text.matchAll(/[\p{L}\p{N}][\p{L}\p{M}\p{N}’'-]*/gu)].map(match=>({text:match[0],key:normalize(match[0]),offset:match.index,length:match[0].length}));
export const contentWord=token=>token.text.length>=3&&/\p{L}/u.test(token.text)&&!stop.has(token.key);
export const cosine=(a,b)=>a.reduce((sum,value,i)=>sum+value*(b[i]||0),0);
export function center(vectors,weights){
 if(!vectors.length)return [];
 const result=new Array(vectors[0].length).fill(0);
 for(let j=0;j<vectors.length;j++)for(let i=0;i<result.length;i++)result[i]+=vectors[j][i]*(weights?.[j]??1);
 const norm=Math.hypot(...result);return norm?result.map(value=>value/norm):result;
}
export const overlaps=(a,b)=>a.offset<b.offset+b.length&&a.offset+a.length>b.offset;
export const stableRank=(a,b)=>Math.round(b.score*1e5)-Math.round(a.score*1e5)||a.offset-b.offset||b.length-a.length;
export function quotationSpans(text){
 const spans=[],pairs={'“':'”','«':'»','"':'"'};let start=-1,close='';
 for(let i=0;i<text.length;i++){
  if(text[i]==='"'&&text[i-1]==='\\')continue;
  if(start<0&&pairs[text[i]]){start=i;close=pairs[text[i]];}
  else if(start>=0&&text[i]===close){
   if(i-start>=7){const offset=start,length=i-start+1,lineStart=text.lastIndexOf('\n',start-1)+1,next=text.indexOf('\n',i+1),lineEnd=next<0?text.length:next;
    spans.push({offset,length,text:text.slice(offset,offset+length),type:'quote',block:!text.slice(lineStart,start).trim()&&!text.slice(i+1,lineEnd).trim(),attributes:{italic:true}});}
   start=-1;close='';
  }
 }
 return spans;
}
export function sentenceSpans(text,participantNames=[]){
 const result=[];let paragraph=0;
 for(const line of text.matchAll(/[^\n]+/g)){
  let start=0;
  const add=end=>{let begin=start;while(begin<end&&/\s/u.test(line[0][begin]))begin++;while(end>begin&&/\s/u.test(line[0][end-1]))end--;
   let value=line[0].slice(begin,end);const label=value.match(/^([^:]{1,80}):\s*/u);
   if(label&&(participantNames.some(name=>normalize(name)===normalize(label[1]))||/^(?:pessoa|participante|apresentador|narrador)\s*\d*$/i.test(label[1]))){begin+=label[0].length;value=line[0].slice(begin,end);}
   const tokens=wordTokens(value);
   if(tokens.length>=2||/\p{L}{4}/u.test(value)){
    if(tokens.length<=64)result.push({offset:line.index+begin,length:end-begin,text:value,paragraph,words:tokens.length});
    else{let first=0;
     while(first<tokens.length){let last=Math.min(tokens.length,first+60),natural=false;
      if(last<tokens.length)for(let j=last-1;j>=first+24;j--){const gap=value.slice(tokens[j].offset+tokens[j].length,tokens[j+1].offset);if(/[,;:]/u.test(gap)){last=j+1;natural=true;break;}}
      const from=first?tokens[first].offset:0,to=last<tokens.length?tokens[last].offset:value.length,fragment=value.slice(from,to).trimEnd();
      result.push({offset:line.index+begin+from,length:fragment.length,text:fragment,paragraph,words:last-first,fragment:!natural&&(last<tokens.length||first>0)});first=last;
     }
    }
   }
  };
  for(let i=0;i<line[0].length;i++){
   if(!/[.!?]/.test(line[0][i]))continue;
   if(line[0][i]==='.'){
    if(/\d/.test(line[0][i-1]||'')&&/\d/.test(line[0][i+1]||''))continue;
    const preceding=line[0].slice(start,i).match(/([\p{L}]+)$/u)?.[1]||'';
    if(abbreviations.has(preceding.toLowerCase())||preceding.length===1)continue;
    if(/\S/u.test(line[0][i+1]||'')&&!/[.!?”"»')\]]/u.test(line[0][i+1]))continue;
   }
   let end=i+1;while(end<line[0].length&&/[.!?”"»')\]]/u.test(line[0][end]))end++;
   if(end<line[0].length&&!/\s/u.test(line[0][end]))continue;
   add(end);start=end;i=end-1;
  }
  if(start<line[0].length)add(line[0].length);paragraph++;
 }
 return result;
}
// Split using the actual tokenizer. No tail is silently discarded.
export function modelWindows(span,tokenCount,limit=128){
 const result=[];let start=0;const fits=value=>tokenCount(value)<=limit;
 while(start<span.text.length){
  const tail=span.text.slice(start);
  if(fits(tail)){result.push({offset:span.offset+start,length:tail.length,text:tail});break;}
  const boundaries=[...tail.matchAll(/\s+/gu)].map(match=>match.index+match[0].length).filter(end=>end>0);
  let low=0,high=boundaries.length-1,best=0;
  while(low<=high){const middle=(low+high)>>1,end=boundaries[middle];if(fits(tail.slice(0,end))){best=end;low=middle+1;}else high=middle-1;}
  if(!best){const points=[...tail];low=1;high=points.length;
   while(low<=high){const middle=(low+high)>>1,end=points.slice(0,middle).join('').length;if(fits(tail.slice(0,end))){best=end;low=middle+1;}else high=middle-1;}
   if(!best)throw Error('Não foi possível preparar um trecho para o modelo local.');
  }
  result.push({offset:span.offset+start,length:best,text:tail.slice(0,best)});start+=best;
 }
 return result;
}
export function sectionSpans(sentences){
 const sections=[];let current=[],count=0;const flush=()=>{if(current.length)sections.push(current);current=[];count=0;};
 for(let i=0;i<sentences.length;i++){const s=sentences[i],newParagraph=current.length&&sentences[current.at(-1)].paragraph!==s.paragraph;
  if(current.length&&(count>=125||current.length>=7||newParagraph&&count>=32))flush();current.push(i);count+=s.words;
 }
 flush();return sections;
}
export function lexicalProfile(sentences,title='',isVerb=()=>false){
 const frequency=new Map(),sentencesByWord=new Map(),cooccurrence=new Map(),titleTerms=new Set(wordTokens(title).filter(contentWord).map(t=>t.key));
 for(let i=0;i<sentences.length;i++){const terms=wordTokens(sentences[i].text).filter(contentWord);
  for(const term of terms){frequency.set(term.key,(frequency.get(term.key)||0)+1);if(!sentencesByWord.has(term.key))sentencesByWord.set(term.key,new Set());sentencesByWord.get(term.key).add(i);}
  for(let j=0;j<terms.length;j++)for(let k=j+1;k<Math.min(terms.length,j+4);k++)if(terms[j].key!==terms[k].key)for(const [a,b]of [[terms[j],terms[k]],[terms[k],terms[j]]]){if(!cooccurrence.has(a.key))cooccurrence.set(a.key,new Set());cooccurrence.get(a.key).add(b.key);}
 }
 const salience=key=>Math.log1p(frequency.get(key)||0)*.5+Math.log1p(cooccurrence.get(key)?.size||0)*.15+(titleTerms.has(key)?.8:0);
 return {frequency,sentencesByWord,titleTerms,salience,isVerb};
}
export function phraseSpans(sentence,profile){
 const tokens=wordTokens(sentence.text),candidates=[],meaningful=(token,index)=>contentWord(token)&&!profile?.isVerb?.(token.text,tokens[index-1]?.text||'');
 for(let i=0;i<tokens.length;i++){if(!meaningful(tokens[i],i))continue;
  for(let j=i;j<Math.min(tokens.length,i+5);j++){
   if(j>i){const gap=sentence.text.slice(tokens[j-1].offset+tokens[j-1].length,tokens[j].offset);if(/[^\s-]/u.test(gap)||!meaningful(tokens[j],j)&&!joiners.has(tokens[j].key))break;}
   if(!meaningful(tokens[j],j))continue;
   const selected=tokens.slice(i,j+1),terms=selected.filter(contentWord),length=tokens[j].offset+tokens[j].length-tokens[i].offset;
   if(length>72||terms.length>4)break;
   if(i===j&&profile&&(profile.frequency.get(tokens[i].key)||0)<2&&!profile.titleTerms.has(tokens[i].key)&&tokens[i].text.length<6)continue;
   const score=terms.reduce((sum,t)=>sum+(profile?.salience(t.key)||1),0)/Math.sqrt(terms.length)+Math.min(terms.length,3)*.15-(j-i+1-terms.length)*.1;
   candidates.push({offset:sentence.offset+tokens[i].offset,length,text:sentence.text.slice(tokens[i].offset,tokens[j].offset+tokens[j].length),terms:terms.map(t=>t.key),score,words:j-i+1});
  }
 }
 const ranked=candidates.sort(stableRank),chosen=[],seen=new Set();
 for(const candidate of ranked){const key=normalize(candidate.text);if(seen.has(key))continue;seen.add(key);if(chosen.filter(other=>overlaps(candidate,other)).length>=2)continue;chosen.push(candidate);if(chosen.length===8)break;}
 return chosen;
}
export function discourseRole(sentence){
 const text=normalize(sentence.text);
 if(/^(?:bom dia|boa tarde|boa noite|ola\b|oi\b|muito obrigad|obrigad[oa] pela|obrigad[oa] a todos|e isso[.!]|ate a proxima)/u.test(text))return {kind:'greeting',bonus:-.45};
 if(/\b(?:portanto|em conclusao|concluimos|concluindo|em resumo|por isso|assim sendo|a recomendacao|recomendamos|a conclusao|devemos|e fundamental|e essencial|o mais importante)\b/u.test(text))return {kind:'conclusion',bonus:.07};
 if(/\b(?:nao basta|nao significa|em vez de|no entanto|por outro lado|ao contrario|mas sim|porem)\b/u.test(text))return {kind:'contrast',bonus:.05};
 if(sentence.text.endsWith('?'))return {kind:'question',bonus:.045};
 if(/\b(?:porque|pois|por causa|evita|evitam|garante|garantem|permite|reduz|aumenta|protege|protegem|significa)\b/u.test(text))return {kind:'reason',bonus:.035};
 return {kind:'idea',bonus:0};
}
