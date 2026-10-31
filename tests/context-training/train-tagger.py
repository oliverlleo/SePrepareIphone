from pathlib import Path
from collections import Counter,defaultdict
import json,random
t=Path(__file__).resolve().parent
def read(text):
 s=[]
 for line in text.splitlines()+['']:
  if not line:
   if s:yield s
   s=[];continue
  a=line.split('\t')
  if len(a)>5 and a[0].isdigit() and a[3] not in ['PUNCT','SYM','X']:s.append((a[1],'INF' if a[3]=='VERB' and 'VerbForm=Inf' in a[5] else a[3]))
def features(words,i,prev,prev2):
 w=words[i].lower();p=words[i-1].lower() if i else '^';n=words[i+1].lower() if i+1<len(words) else '$'
 return ['bias','w='+w,'p='+p,'n='+n,'wp='+w+'|'+p,'wn='+w+'|'+n,'pos='+str(min(i,2)),'shape='+('U' if words[i][0].isupper() else 'l'),'t='+prev,'tt='+prev2+'|'+prev]+['s'+str(k)+'='+w[-k:] for k in [1,2,3,4] if len(w)>=k]+['ns='+n[-2:],'ps='+p[-2:]]+['stem='+w[:len(w)-k] for k in [0,1,2,3] if len(w)-k>=4]
models={};reports=[]
for lang in ['pt','en','es','ja']:
 train=list(read((t/'training'/f'{lang}-train.conllu').read_text(encoding='utf-8')));labels=sorted({tag for s in train for _,tag in s});ids={x:i for i,x in enumerate(labels)};freq=Counter(w.lower() for s in train for w,_ in s);lex=defaultdict(Counter)
 for s in train:
  for w,tag in s:lex[w.lower()][ids[tag]]+=1
 fixed={w:max(c,key=c.get) for w,c in lex.items() if sum(c.values())>=15 and max(c.values())/sum(c.values())>=.98}
 counts=Counter()
 for s in train:
  words=[w for w,_ in s];prev=prev2='^'
  for i,(_,tag) in enumerate(s):counts.update(features(words,i,prev,prev2));prev2,prev=prev,tag
 weights=defaultdict(lambda:defaultdict(float));totals=defaultdict(float);stamp=defaultdict(int);step=0;rng=random.Random(816)
 def guess(fs,weights):
  scores=[0.]*len(labels)
  for f in fs:
   for label,value in weights.get(f,{}).items():scores[label]+=value
  return max(range(len(labels)),key=lambda k:scores[k])
 for epoch in range(4):
  rng.shuffle(train)
  for s in train:
   words=[w for w,_ in s];prev=prev2='^'
   for i,(word,tag) in enumerate(s):
    step+=1;fs=[f for f in features(words,i,prev,prev2) if counts[f]>=4];pred=fixed.get(word.lower())
    if pred is None:pred=guess(fs,weights)
    truth=ids[tag]
    if pred!=truth:
     for f in fs:
      for k,delta in [(truth,1),(pred,-1)]:
       key=(f,k);totals[key]+=(step-stamp[key])*weights[f][k];stamp[key]=step;weights[f][k]+=delta
    prev2,prev=prev,labels[pred]
 averaged={}
 for f,row in weights.items():
  v=[]
  for k,value in row.items():
   key=(f,k);n=round((totals[key]+(step-stamp[key])*value)/step,2)
   if abs(n)>=.04:v.extend([k,n])
  if v:averaged[f]=v
 out={'tags':labels,'fixed':fixed,'weights':averaged,'freq':dict(freq)};models[lang]=out
 good=total=0
 for s in read((t/'training'/f'{lang}-dev.conllu').read_text(encoding='utf-8')):
  words=[w for w,_ in s];prev=prev2='^'
  for i,(word,truth) in enumerate(s):
   scores=[0.]*len(labels);pred=fixed.get(word.lower())
   if pred is None:
    for f in features(words,i,prev,prev2):
     row=averaged.get(f,[])
     for j in range(0,len(row),2):scores[row[j]]+=row[j+1]
    pred=max(range(len(labels)),key=lambda k:scores[k])
   prev2,prev=prev,labels[pred];good+=labels[pred]==truth;total+=1
 reports.append({'language':lang,'trainingSentences':len(train),'devTokens':total,'accuracy':good/total,'features':len(averaged)});print(reports[-1],flush=True)
(t/'shared/memorization-tagger-model.json').write_text(json.dumps(models,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8');(t/'tagger-evaluation.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print('bytes:',(t/'shared/memorization-tagger-model.json').stat().st_size,flush=True)
