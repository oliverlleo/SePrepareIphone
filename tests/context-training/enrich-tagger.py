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
 model['verbs']=sorted(verbs-nouns)
 model['oblique']={w:round(c['obl']/sum(c.values()),2) for w,c in roles.items() if sum(c.values())>=5 and c['obl']/sum(c.values())>.65}
p.write_text(json.dumps(models,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8');print('Enriched bytes:',p.stat().st_size)
