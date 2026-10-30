import {normalize,wordTokens,quotationSpans,sentenceSpans,sectionSpans,modelWindows,lexicalProfile,phraseSpans,cosine,center,overlaps,stableRank,discourseRole} from './memorization-semantic-core.js';
// Extraction, not generation: every proposed span must exist verbatim.
export async function analyzeContent({text,title='',contextText='',participantNames=[]},embedding){
 if(typeof text!=='string'||text.length>2000000)throw Error('O texto ultrapassa o limite de análise de 2 milhões de caracteres.');
 const quotes=quotationSpans(text),sentences=sentenceSpans(text,participantNames),sections=sectionSpans(sentences),progress=embedding.progress||(()=>{});
 const statistics={characters:text.length,words:wordTokens(text).length,sentences:sentences.length,sections:sections.length,modelWindows:0,truncated:false};
 if(!sentences.length)return {spans:quotes,engine:'MiniLM · análise contextual local',sentences:0,coverage:statistics};
 const encodeCount=value=>embedding.tokenCount(value),windows=sentences.map(s=>modelWindows(s,encodeCount)),titleWindows=title?modelWindows({offset:0,text:title},encodeCount):[];
 const contextSentences=contextText&&contextText!==text?sentenceSpans(contextText,participantNames):[],contextParts=contextSentences.map(s=>modelWindows(s,encodeCount)),contextWindows=contextParts.flat();
 const inputs=[...windows.flat(),...titleWindows,...contextWindows];statistics.modelWindows=inputs.length;
 const vectors=await embedding.embed(inputs.map(w=>w.text),'Lendo todas as frases, do começo ao fim…',0,62);let at=0;
 const sentenceVectors=windows.map(parts=>{const result=center(vectors.slice(at,at+parts.length),parts.map(p=>Math.max(1,wordTokens(p.text).length)));at+=parts.length;return result;});
 const titleVector=titleWindows.length?center(vectors.slice(at,at+titleWindows.length)):null;at+=titleWindows.length;
 const sectionVectors=sections.map(section=>{const seen=new Set();return center(section.filter(i=>{const key=normalize(sentences[i].text);if(seen.has(key))return false;seen.add(key);return true;}).map(i=>sentenceVectors[i]));});
 // Balance sections so a long or repeated introduction cannot drown the ending.
 const contextVectors=contextParts.map(parts=>{const vector=center(vectors.slice(at,at+parts.length));at+=parts.length;return vector;}),contextSections=sectionSpans(contextSentences);
 const documentVector=contextWindows.length?center(contextSections.map(section=>center(section.map(i=>contextVectors[i])))):center(sectionVectors),profile=lexicalProfile(contextSentences.length?contextSentences:sentences,title,embedding.isVerb);
 const sectionOf=new Map();sections.forEach((section,index)=>section.forEach(i=>sectionOf.set(i,index)));
 const candidatesBySentence=sentences.map(s=>phraseSpans(s,profile));
 const eligible=sentences.map((s,index)=>{
  const section=sectionOf.get(index),role=discourseRole(s),neighbours=sections[section].filter(i=>i!==index),local=neighbours.length?neighbours.reduce((sum,i)=>sum+Math.max(0,cosine(sentenceVectors[index],sentenceVectors[i])),0)/neighbours.length:cosine(sentenceVectors[index],documentVector);
  const score=.40*cosine(sentenceVectors[index],sectionVectors[section])+.25*cosine(sentenceVectors[index],documentVector)+.15*local+(titleVector?.length ? .10*cosine(sentenceVectors[index],titleVector):.10*cosine(sentenceVectors[index],documentVector))+role.bonus;
  return {...s,index,section,role,vector:sentenceVectors[index],score};
 }).filter(s=>s.role.kind!=='greeting'&&candidatesBySentence[s.index].length);
 const wordCount=statistics.words,keyBudget=Math.max(1,Math.ceil(wordCount/42)),keySentences=[],usedSentences=new Set(),seenSentences=new Set();
 function takeSentence(item){const key=normalize(item.text).replace(/\s+/gu,' ');if(usedSentences.has(item.index)||seenSentences.has(key))return false;keySentences.push(item);usedSentences.add(item.index);seenSentences.add(key);return true;}
 const diverse=pool=>pool.map(s=>({...s,score:keySentences.length?.62*s.score-.38*Math.max(0,...keySentences.map(other=>cosine(s.vector,other.vector))):s.score})).sort(stableRank);
 for(let section=0;section<sections.length;section++){for(const item of diverse(eligible.filter(s=>s.section===section)))if(takeSentence(item))break;}
 while(keySentences.length<keyBudget){let taken=false;for(const item of diverse(eligible.filter(s=>!usedSentences.has(s.index))))if(takeSentence(item)){taken=true;break;}if(!taken)break;}keySentences.sort((a,b)=>a.offset-b.offset);
 const phraseCandidates=keySentences.flatMap(sentence=>candidatesBySentence[sentence.index].map(p=>({...p,sentence}))),phraseVectors=phraseCandidates.length?await embedding.embed(phraseCandidates.map(p=>p.text),'Comparando palavras-chave com o contexto de cada trecho…',62,94):[];statistics.modelWindows+=phraseCandidates.length;
 const rankedPhrases=phraseCandidates.map((p,index)=>{
  const semantic=.43*cosine(phraseVectors[index],p.sentence.vector)+.31*cosine(phraseVectors[index],sectionVectors[p.sentence.section])+.16*cosine(phraseVectors[index],documentVector)+(titleVector?.length ? .10*cosine(phraseVectors[index],titleVector):.10*cosine(phraseVectors[index],documentVector));
  return {...p,vector:phraseVectors[index],score:semantic+Math.min(.075,p.score*.012)+(p.words>1?.035:0)-(p.words===1&&/^(?:mensagem|mensagens|texto|textos|conteudo|resultado|resultados|trabalho|cuidado|cuidados|uso)$/u.test(normalize(p.text))&&!profile.titleTerms.has(normalize(p.text))?.12:0)};
 });
 const spans=[...quotes],chosenPhrases=[],phraseKeys=new Set(),usedTerms=new Set();
 for(const sentence of keySentences){
  const pool=rankedPhrases.filter(p=>p.sentence.index===sentence.index).map(p=>({...p,score:p.score-.15*Math.max(0,...chosenPhrases.map(other=>cosine(p.vector,other.vector)))-.16*p.terms.filter(term=>usedTerms.has(term)).length/p.terms.length})).sort(stableRank);
  const best=pool.find(p=>!phraseKeys.has(normalize(p.text))&&p.terms.some(term=>!usedTerms.has(term)))||null;if(!best)continue;chosenPhrases.push(best);phraseKeys.add(normalize(best.text));for(const term of best.terms)usedTerms.add(term);
  spans.push({offset:best.offset,length:best.length,text:best.text,type:'key',attributes:{bold:true},context:sentence.text,explanation:'Palavra-chave relacionada à ideia deste trecho.'});
 }
 progress('Escolhendo os pontos importantes sem repetir os mesmos destaques…',96);
 const highlightBudget=Math.max(1,Math.ceil(wordCount/135)),highlights=[],highlightTexts=new Set(),highlightPool=eligible.filter(s=>!s.fragment&&s.words>=5&&s.words<=42&&s.length<=280&&!quotes.some(q=>overlaps(s,q)));
 function takeHighlight(pool){const ranked=pool.map(s=>({...s,score:s.score-.13*Math.max(0,...highlights.filter(other=>other.section===s.section).map(other=>cosine(s.vector,other.vector)))})).sort(stableRank);const best=ranked.find(s=>!highlightTexts.has(normalize(s.text))&&!highlights.some(other=>other.index===s.index));if(best){highlights.push(best);highlightTexts.add(normalize(best.text));}}
 const sectionOrder=sections.map((_,section)=>({section,score:Math.max(-1,...highlightPool.filter(s=>s.section===section).map(s=>s.score)),offset:sentences[sections[section][0]].offset,length:0})).sort(stableRank);
 for(const {section}of sectionOrder){if(highlights.length>=highlightBudget)break;takeHighlight(highlightPool.filter(s=>s.section===section));}
 while(highlights.length<highlightBudget){const before=highlights.length;takeHighlight(highlightPool);if(highlights.length===before)break;}
 const explanations={conclusion:'Conclusão ou orientação que reúne a ideia do trecho.',contrast:'Distinção importante para compreender o argumento.',question:'Pergunta relacionada ao assunto deste trecho.',reason:'Relação de causa, consequência ou finalidade.',idea:'Ideia relevante no contexto deste trecho.'};
 for(const s of highlights)spans.push({offset:s.offset,length:s.length,text:s.text,type:'central',attributes:{background:'#f8e4a1'},context:s.text,explanation:explanations[s.role.kind]});
 for(const reference of text.matchAll(/\b(?:[1-3]\s+)?[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\p{L}]+(?:\s+(?:de|dos|das|aos|do|da)\s+[\p{L}]+)?\s+\d{1,3}:\d{1,3}(?:[-–]\d{1,3})?/gu))spans.push({offset:reference.index,length:reference[0].length,text:reference[0],type:'reference',attributes:{bold:true}});
 const unique=new Set(),result=spans.filter(span=>{const key=span.offset+':'+span.length+':'+span.type;if(unique.has(key)||span.length<=0||text.slice(span.offset,span.offset+span.length)!==span.text)return false;unique.add(key);return true;}).sort((a,b)=>a.offset-b.offset||a.type.localeCompare(b.type,'en'));
 return {spans:result,engine:'MiniLM · contexto do texto e de cada seção · análise local',sentences:sentences.length,coverage:statistics};
}

// The same literal-span extraction used by formatting, with source validation.
export function memoryEvidencePhrases(sentence,profile){return phraseSpans(sentence,profile).filter(p=>p.length>0&&sentence.text.slice(p.offset-sentence.offset,p.offset-sentence.offset+p.length)===p.text);}
