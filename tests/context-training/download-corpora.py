from pathlib import Path
import hashlib,json,urllib.request
t=Path(__file__).resolve().parent
data=t/'training';data.mkdir(exist_ok=True)
names={'pt':'pt_bosque','en':'en_ewt','es':'es_gsd','ja':'ja_gsd'}
for source in json.loads((t/'pos-provenance.json').read_text(encoding='utf-8')):
 for split in ['train','dev']:
  target=data/(source['language']+'-'+split+'.conllu')
  if not target.exists():
   url=source['repository'].replace('https://github.com/','https://raw.githubusercontent.com/')+'/master/'+names[source['language']]+'-ud-'+split+'.conllu'
   with urllib.request.urlopen(url,timeout=90) as r:target.write_bytes(r.read())
  actual=hashlib.file_digest(target.open('rb'),'sha256').hexdigest()
  if actual!=source[split+'SHA256']:raise SystemExit('Upstream diferente da proveniência: '+str(target))
print('Corpora originais conferidos por SHA-256')
