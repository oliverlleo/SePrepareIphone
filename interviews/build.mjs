import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from '../sharing/node_modules/esbuild/lib/main.js';
import {parse} from '../sharing/node_modules/acorn/dist/acorn.mjs';

const file = new URL('../app.js', import.meta.url);
let source = readFileSync(file, 'utf8').replace(/\/\* SEPREPARE INTERVIEWS ([A-Z]+) START \*\/[\s\S]*?\/\* SEPREPARE INTERVIEWS \1 END \*\//g, '');
const bundles = [...source.matchAll(/\/\* SEPREPARE [A-Z]+ (BUNDLE|CODEC) START \*\/[\s\S]*?\/\* SEPREPARE [A-Z]+ \1 END \*\//g)].map(match => [match.index, match.index + match[0].length]);
const nodes = [];
function walk(node) {
  if (!node?.type || bundles.some(([start,end]) => node.start >= start && node.end <= end)) return;
  nodes.push(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') walk(value);
  }
}
walk(parse(source, {ecmaVersion:'latest'}));
const marker = (label, code) => '/* SEPREPARE INTERVIEWS '+label+' START */'+code+'/* SEPREPARE INTERVIEWS '+label+' END */';
function one(matches, label) {
  if (matches.length !== 1) throw Error('Integração de Entrevistas: '+label+' ('+matches.length+').');
  return matches[0];
}
const fn = name => one(nodes.filter(node => node.type === 'FunctionDeclaration' && node.id?.name === name),name);
const edits = [];
function insert(at, label, code) {edits.push({at,text:marker(label,code)});}
const bridge = one(nodes.filter(node => node.type === 'VariableDeclaration' && node.declarations.some(d => d.id?.name === 'SPShareCodes')), 'inicialização');
insert(bridge.start,'BRIDGE',[
  'var spInterviews=window.SePrepareInterviews({',
  'state:()=>B,visible:()=>d.view==="interview",',
  'enter:async()=>{await gt("interview",null);return d.view==="interview"},leave:()=>gt("home",null),',
  'filters:()=>({category:d.filter,type:d.typeFilter,search:d.search,sort:d.sort}),',
  'save:async()=>le(true)!==false&&await Yt.flushPendingSaves(),',
  'icon:te,toast:ae,player:()=>audioPlayer,recordings:()=>sp90Recordings,',
  'exportFile:ps,',
  '});',
].join(''));
const render = fn('fr');
const defaultLayout = render.body.body.find(node => node.type === 'VariableDeclaration' && source.slice(node.start,node.end).includes('Discursos e partes'));
if (!defaultLayout) throw Error('Ponto de renderização Apple indisponível.');
insert(defaultLayout.start, 'VIEW','if(d.view==="interview"){spInterviews.render();return;}');
insert(fn('qp').body.start+1,'HOMEPARK','spInterviews.parkCategoryPicker?.();');
insert(fn('qp').body.end-1,'HOME',';spInterviews.renderHome();');
insert(fn('Vp').body.start+1,'BACK','if(spInterviews.back())return true;');
const importer = fn('xn');
const queued = importer.body.body.find(node => node.type === 'IfStatement' && node.test?.property?.name === 'incomingSpeech');
if (!queued) throw Error('Fila de importação Apple indisponível.');
insert(queued.end,'IMPORT','if(spInterviews.fileImport(e,t))return;');
const actions = one(nodes.filter(node => node.type === 'SwitchStatement' && node.cases.some(c => c.test?.value === 'new-item')),'menu de criação');
const menu = actions.cases.find(node => node.test?.value === 'new-item');
const stop = one(menu.consequent.filter(node => node.type === 'BreakStatement'),'saída do menu');
insert(stop.start,'MENU','spInterviews.afterCreateMenu();');

const bundle = await build({absWorkingDir:fileURLToPath(new URL('.',import.meta.url)), entryPoints:['entry.js'], bundle:true, minify:true, format:'iife', target:['safari15.4'], write:false, legalComments:'none'});
const locale = '/* SEPREPARE LOCALE END */';
const at = source.indexOf(locale);
if (at < 0) throw Error('Catálogo do host Apple indisponível.');
insert(at+locale.length,'BUNDLE',bundle.outputFiles[0].text);
for (const {at,text} of edits.sort((a,b) => b.at-a.at)) source = source.slice(0,at)+text+source.slice(at);
// Previous generators can add a blank line after the portable sharing codec.
source = source.replace(/(\/\* SEPREPARE SHARE CODEC END \*\/)[\r\n]+/, '$1\n');
parse(source, {ecmaVersion:'latest'});
writeFileSync(file, source);
console.log('PASS Entrevistas integrada ao host Apple com voz, microfone, salvamento e arquivos da PWA.');
