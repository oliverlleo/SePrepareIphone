"""Derive surface morphology from the same licensed UD training split as the POS model.

No application examples or user documents are training data. Corpus files are
obtained by the existing download-corpora.py script; this step is reproducible.
"""
from pathlib import Path
from collections import Counter, defaultdict
import argparse, json

parser = argparse.ArgumentParser()
parser.add_argument('--corpora', type=Path, required=True)
parser.add_argument('--model', type=Path, required=True)
args = parser.parse_args()
models = json.loads(args.model.read_text(encoding='utf-8'))
for lang, model in models.items():
    surfaces = defaultdict(Counter)
    clitics = Counter()
    compounds = {}
    participles = set()
    for sentence in (args.corpora / f'{lang}-train.conllu').read_text(encoding='utf-8').split('\n\n'):
        rows = [line.split('\t') for line in sentence.splitlines() if line and not line.startswith('#')]
        children = {int(r[0]): r for r in rows if len(r) > 7 and r[0].isdigit()}
        for row in children.values():
            if row[3] in {'VERB', 'AUX'}:
                if 'VerbForm=Part' in row[5]:
                    participles.add(row[1].lower())
                tag = 'INF' if 'VerbForm=Inf' in row[5] else row[3]
                surfaces[row[1].lower()][tag] += 1
        for row in rows:
            if len(row) < 4 or '-' not in row[0]:
                continue
            first, last = map(int, row[0].split('-'))
            parts = [children.get(i) for i in range(first, last + 1)]
            if any(p is None for p in parts):
                continue
            verbs = [p for p in parts if p[3] in {'VERB', 'AUX'}]
            if len(verbs) == 1 and all(p[3] in {'VERB', 'AUX', 'PRON', 'PART'} for p in parts):
                v = verbs[0]
                compounds[row[1].lower()] = 'INF' if 'VerbForm=Inf' in v[5] else v[3]
                for p in parts:
                    if p[3] == 'PRON':
                        clitics[p[1].lower()] += 1
    model['verbSurfaces'] = {w: c.most_common(1)[0][0] for w, c in surfaces.items()}
    model['verbalCompounds'] = compounds
    model['clitics'] = sorted(clitics)
    model['participles'] = sorted(participles)
args.model.write_text(json.dumps(models, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
print(json.dumps({'bytes': args.model.stat().st_size, 'surfaces': {k: len(v['verbSurfaces']) for k, v in models.items()}}))
