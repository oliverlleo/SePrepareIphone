import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse} from '../sharing/node_modules/acorn/dist/acorn.mjs';
import {build} from '../sharing/node_modules/esbuild/lib/main.js';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'..');
const marker=(label,code)=>`/* SEPREPARE MEMORIZATION ${label} START */${code}/* SEPREPARE MEMORIZATION ${label} END */`;
const strip=source=>source.replace(/\/\* SEPREPARE MEMORIZATION ([A-Z]+) START \*\/[\s\S]*?\/\* SEPREPARE MEMORIZATION \1 END \*\//g,'');
function collect(source){const ranges=[...source.matchAll(/\/\* SEPREPARE [A-Z]+ (BUNDLE|CODEC) START \*\/[\s\S]*?\/\* SEPREPARE [A-Z]+ \1 END \*\//g)].map(m=>[m.index,m.index+m[0].length]),nodes=[];
 function walk(node,parents=[]){if(!node||typeof node!=='object'||node.type&&ranges.some(([a,b])=>node.start>=a&&node.end<=b))return;if(node.type)nodes.push({node,parents});for(const value of Object.values(node)){if(Array.isArray(value))for(const child of value)walk(child,[...parents,node]);else if(value&&typeof value==='object')walk(value,[...parents,node]);}}walk(parse(source,{ecmaVersion:'latest'}));return nodes;
}
let source=strip(readFileSync(path.join(root,'app.js'),'utf8'));const all=collect(source),nodes=all.map(x=>x.node),text=n=>source.slice(n.start,n.end),only=(items,name)=>{if(items.length!==1)throw Error('Memorization host anchor '+name+': '+items.length);return items[0];},fn=name=>only(nodes.filter(n=>n.type==='FunctionDeclaration'&&n.id?.name===name),name);
const edits=[],edit=(a,b,value)=>edits.push({a,b,value}),hook=(node,label,code,end=false)=>edit(end?node.body.end-1:node.body.start+1,end?node.body.end-1:node.body.start+1,marker(label,end?';'+code:code));
const version=only(nodes.filter(n=>n.type==='VariableDeclarator'&&n.id?.name==='Xb'),'app version');edit(version.init.start,version.init.end,'"1.0.77"');
const bridge=only(nodes.filter(n=>n.type==='VariableDeclaration'&&n.declarations.some(d=>d.id?.name==='SPShareCodes')),'bridge');
edit(bridge.start,bridge.start,marker('BRIDGE',`var sp77Memory=window.SePrepareMemorization.createMemorizationUI({rt:d,icon:te,t:SPLocale.t,getState:()=>B,getSpeech:()=>B.speeches.find(s=>s.id===d.speechId),openModal:Te,closeModal:he,toast:ae,persist:()=>le(true),navigate:view=>gt(view),renderReaderContent:ds,pauseAudio:()=>audioPlayer.pause(),pauseTimer:()=>{const s=ue();if(s?.timer?.running)Ln(s);}});`));
hook(only(nodes.filter(n=>n.type==='VariableDeclarator'&&n.id?.name==='te'),'icon').init,'ICON',`if(t==='Brain')return window.SePrepareMemorization.memoryBrainIcon();`);
const renderer=fn('fr'),names=only(nodes.filter(n=>n.type==='VariableDeclaration'&&n.start>renderer.start&&n.end<renderer.end&&n.declarations.some(d=>d.init?.type==='ObjectExpression'&&d.init.properties.some(p=>(p.key.name||p.key.value)==='home'))),'main views');
hook(renderer,'DISPOSE','sp77Memory.dispose();');edit(names.start,names.start,marker('VIEW',`if(d.view==='memorization'){document.body.classList.remove('editor-open','reader-open','focus-mode');sp77Memory.render();return;}`));
hook(fn('wM'),'MENU',`if(!se(ue())){const option=L('.sheet-options [data-action="open"]');if(option)option.insertAdjacentHTML('afterend',\`<button type="button" class="sheet-option" data-action="memory-open">\${te('Brain')}<span><strong>\${SPLocale.t('Memorizar')}</strong><small>\${SPLocale.t('Estude seu discurso com cartões inteligentes.')}</small></span>\${te('ChevronRight')}</button>\`);}`,true);
const reader=fn('t0');let readerText=text(reader);if(!readerText.includes('sp77Memory.selector')){const old=readerText.match(/<span class="tiny muted">MODO DE APRESENTA[^<]+<\/span>/)?.[0];if(!old)throw Error('Reader mode label missing');readerText=readerText.replace(old,'${se(t)?SPLocale.h`'+old+'`:sp77Memory.selector(\'presentation\')}');edit(reader.start,reader.end,readerText);}
const actions=only(nodes.filter(n=>n.type==='SwitchStatement'&&n.discriminant?.name==='r'&&n.cases.some(c=>c.test?.value==='share-text')),'actions');edit(actions.start,actions.start,marker('ACTIONS','if(sp77Memory.handle(r,e))return;'));
hook(fn('Vp'),'BACK',`if(d.view==='memorization'&&!L('.modal-backdrop'))return sp77Memory.back();`);
hook(fn('Tr'),'VALIDATE',`for(const doc of t?.speeches||[])for(const version of doc?.versions||[])if(version.memorization!==undefined)window.SePrepareMemorization.validateMemorization(version.memorization);`);
const newVersion=fn('Am'),returnNode=only(nodes.filter(n=>n.type==='ReturnStatement'&&n.start>newVersion.start&&n.end<newVersion.end),'new-version return');
hook(newVersion,'COPYSOURCE',`var sp77Source=t.versions?.find(v=>v.id===t.activeVersionId)?.memorization;`);edit(returnNode.start,returnNode.start,marker('COPYVERSION',`if(r&&sp77Source)${text(returnNode.argument.type==='SequenceExpression'?returnNode.argument.expressions.at(-1):returnNode.argument)}.memorization=window.SePrepareMemorization.copyMemorization(sp77Source,{reviews:true});`));
hook(fn('rc'),'DUPLICATE',`for(const version of t.versions||[])if(version.memorization)version.memorization=window.SePrepareMemorization.copyMemorization(version.memorization);`);
for(const n of nodes.filter(n=>n.type==='NewExpression'&&n.callee?.name==='Worker'&&n.arguments[0]?.value==='semantic-worker.js'))edit(n.start,n.end,'window.SePrepareMemorization.getLocalSemanticWorker()');
for(const e of edits.sort((a,b)=>b.a-a.a))source=source.slice(0,e.a)+e.value+source.slice(e.b);
const bundled=await build({absWorkingDir:here,entryPoints:['entry.js'],bundle:true,minify:true,format:'iife',target:['safari15.4'],loader:{'.css':'text'},write:false,legalComments:'eof'}),localeEnd='/* SEPREPARE LOCALE END */',localeAt=source.indexOf(localeEnd)+localeEnd.length,at=localeAt+(source[localeAt]==='\n'?1:0);
source=source.slice(0,at)+marker('BUNDLE',bundled.outputFiles[0].text)+source.slice(at);source=source.replace(/(\/\* SEPREPARE SHARE CODEC END \*\/)[\r\n]+/,'$1\n');parse(source,{ecmaVersion:'latest'});writeFileSync(path.join(root,'app.js'),source);
// Extend the existing Apple worker inside its closure; retain its formatting implementation.
let worker=strip(readFileSync(path.join(root,'semantic-worker.js'),'utf8'));const workerNodes=collect(worker),model=only(workerNodes.filter(({node:n})=>n.type==='FunctionDeclaration'&&worker.slice(n.start,n.end).includes('feature-extraction')),'existing MiniLM loader');
const scope=[...model.parents].reverse().find(n=>['ArrowFunctionExpression','FunctionExpression'].includes(n.type));if(!scope?.body?.end)throw Error('Worker model scope unavailable');
worker=worker.slice(0,scope.body.end-1)+marker('WORKERBRIDGE',`;self.SePrepareMemorizationWorker.install(${model.node.id.name});`)+worker.slice(scope.body.end-1);
const extension=await build({absWorkingDir:here,entryPoints:['worker-extension.js'],bundle:true,minify:true,format:'iife',target:['safari15.4'],write:false,legalComments:'eof'});
worker=marker('WORKERBUNDLE',extension.outputFiles[0].text)+worker;parse(worker,{ecmaVersion:'latest'});writeFileSync(path.join(root,'semantic-worker.js'),worker);
console.log('Memorization integrated with the preserved Apple host, storage and MiniLM worker.');
