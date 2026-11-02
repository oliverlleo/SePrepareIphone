from pathlib import Path
from collections import Counter,defaultdict
import json
t=Path(__file__).resolve().parent;p=t/'shared/memorization-tagger-model.json';models=json.loads(p.read_text(encoding='utf-8'))
for lang,model in models.items():
 verbs=set();nouns=set();roles=defaultdict(Counter)
 for line in (t/'training'/f'{lang}-train.conllu').read_text(encoding='utf-8').splitlines():
  a=line.split('\t')
  if len(a)<8 or not a[0].isdigit():continue
  if a[3]=='VERB':verbs.add(a[2].lower())
  if a[3] in ['NOUN','PROPN']:nouns.add(a[2].lower());roles[a[1].lower()][a[7].split(':')[0]]+=1
 # UD splits contracted function words into component tokens; retain their surface forms too.
 closed={}
 for sentence in (t/'training'/f'{lang}-train.conllu').read_text(encoding='utf-8').split('\n\n'):
  rows=[line.split('\t') for line in sentence.splitlines() if line and not line.startswith('#')]
  children={int(row[0]):row[3] for row in rows if len(row)>3 and row[0].isdigit()}
  for row in rows:
   if len(row)<4 or '-' not in row[0]:continue
   first,last=map(int,row[0].split('-'));tags=[children.get(i) for i in range(first,last+1)]
   if 'ADP' in tags and all(tag in {'ADP','DET','PRON','PART','SCONJ','CCONJ'} for tag in tags):closed[row[1].lower()]='ADP'
 model['closedForms']=closed
 model['verbs']=sorted(verbs-nouns)
 model['oblique']={w:round(c['obl']/sum(c.values()),2) for w,c in roles.items() if sum(c.values())>=5 and c['obl']/sum(c.values())>.65}
p.write_text(json.dumps(models,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8');print('Enriched bytes:',p.stat().st_size)
