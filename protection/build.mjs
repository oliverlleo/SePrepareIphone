import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {build} from '../sharing/node_modules/esbuild/lib/main.js';
import {parse} from '../sharing/node_modules/acorn/dist/acorn.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'..');
const marker=(name,text)=>`/* SEPREPARE PROTECTION ${name} START */${text}/* SEPREPARE PROTECTION ${name} END */`;
let source=readFileSync(path.join(root,'app.js'),'utf8').replace(/\/\* SEPREPARE PROTECTION ([A-Z]+) START \*\/[\s\S]*?\/\* SEPREPARE PROTECTION \1 END \*\//g,'');
const nodes=[],ast=parse(source,{ecmaVersion:'latest'});
const bundleRanges=[...source.matchAll(/\/\* SEPREPARE [A-Z]+ (BUNDLE|CODEC) START \*\/[\s\S]*?\/\* SEPREPARE [A-Z]+ \1 END \*\//g)].map(m=>[m.index,m.index+m[0].length]);
function walk(node){if(!node||typeof node!=='object'||node.type&&bundleRanges.some(([a,b])=>node.start>=a&&node.end<=b))return;if(node.type)nodes.push(node);for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);}}
walk(ast);
const only=(matches,label)=>{if(matches.length!==1)throw Error('Integração ambígua: '+label+' ('+matches.length+').');return matches[0];};
const fn=name=>only(nodes.filter(node=>node.type==='FunctionDeclaration'&&node.id.name===name),name);
const edits=[],edit=(start,end,text)=>edits.push({start,end,text});
const syncCurrent=only(nodes.filter(n=>n.type==='FunctionDeclaration'&&n.id?.name==='_r'&&source.slice(n.start,n.end).includes('d.q')),'projeção do editor');
const syncText=source.slice(syncCurrent.start,syncCurrent.end);if(syncText.includes('d.q.getContents().ops'))edit(syncCurrent.start,syncCurrent.end,syncText.replace('{ops:d.q.getContents().ops}','window.SePrepareDriveProtection.editorDelta(d.q)'));

const checkpoint=fn('Dr'),checkpointText=source.slice(checkpoint.start,checkpoint.end);if(!checkpointText.includes('automaticCheckpoint:true'))edit(checkpoint.start,checkpoint.end,checkpointText.replace('label:t,versionId:','label:t,automaticCheckpoint:true,versionId:'));
const pruneCurrent=source.slice(syncCurrent.start,syncCurrent.end);if(!pruneCurrent.includes('pruneRedundantCheckpoints')){
 const existing=edits.find(e=>e.start===syncCurrent.start);const text=existing?existing.text:pruneCurrent;const changed=text.replace('nt(t))','window.SePrepareDriveProtection.pruneRedundantCheckpoints(t),nt(t))');if(existing)existing.text=changed;else edit(syncCurrent.start,syncCurrent.end,changed);
}
const importer=fn('QM'),importText=source.slice(importer.start,importer.end);if(!importText.includes('mergeImportedMetadata')){
 let changed=importText.replace('let r=0;for','let spIds=new Map;let r=0;for').replace('for(let a of t.speeches){','for(let a of t.speeches){spIds.set(a.id,a.id);').replace('o&&(s.id=vt()),s.categoryId','o&&(s.id=vt()),spIds.set(a.id,s.id),s.categoryId').replace('B.vocabulary=','window.SePrepareDriveProtection.mergeImportedMetadata(B,t,spIds,e,vt);B.vocabulary=');edit(importer.start,importer.end,changed);
}
const bridge=fn('Bb');edit(bridge.start,bridge.end,'function Bb({getState:t}){return window.SePrepareDriveProtection.createBridge({getState:t,canWrite:()=>!!window.orador&&!yo&&!e0&&Yt.isAllowedIPhone()});}');
const ui=fn('Mm');edit(ui.start,ui.end,'function Mm(config){return window.SePrepareDriveProtection.createUI(config);}');
const save=only(nodes.filter(node=>node.type==='FunctionDeclaration'&&node.id.name==='le'&&source.slice(node.start,node.end).includes('Yt.saveState')),'gravação iPhone');
const returns=save.body.body.filter(node=>node.type==='ReturnStatement');const result=only(returns.filter(node=>source.slice(node.start,node.end).endsWith(',r')),'resultado da gravação');
// Observe after the existing local-save result; do not wait on the network.
edit(result.argument.end,result.argument.end,marker('SAVED',',r&&(spPerfLedger.commit(B),sI?.driveLocalSaved?.(window.SePrepareDriveProtection.currentChangeOrigin(),e)),r'));
const ledgerBridge=only(nodes.filter(n=>n.type==='VariableDeclaration'&&n.declarations.some(d=>d.id?.name==='SPShareCodes')),'índice de exclusões');
edit(ledgerBridge.start,ledgerBridge.start,marker('LEDGER','var spPerfLedger=window.SePrepareDriveProtection.createDeletionLedger(B,()=>JSON.parse(sI?.driveBackupIndex?.()||"{}"));'));
const stateJSON=only(nodes.filter(n=>n.type==='VariableDeclaration'&&n.start>save.start&&n.end<save.end&&source.slice(n.start,n.end).includes('JSON.stringify(B)')),'snapshot do caderno');
edit(stateJSON.start,stateJSON.start,marker('PREPARE','spPerfLedger.prepare(B,window.SePrepareDriveProtection.currentChangeOrigin());'));
const render=only(nodes.filter(node=>node.type==='FunctionDeclaration'&&node.id.name==='fr'&&source.slice(node.start,node.end).includes('document.body.classList.toggle')),'renderização iPhone');
edit(render.body.end-1,render.body.end-1,marker('CARDS',';void Ml?.refreshCards?.();'));
const card=fn('fM'),cardText=source.slice(card.start,card.end);
if(!cardText.includes('Ml.cardIndicator(t)')){const token='${bn(t)}';const at=source.indexOf(token,card.start);if(at<0||at>=card.end)throw Error('Linha de tipo do card ausente.');edit(at,at+token.length,'<div class="drive-card-type-row">${bn(t)}${Ml.cardIndicator(t)}</div>');}
const version=only(nodes.filter(node=>node.type==='VariableDeclarator'&&node.id.name==='Xb'),'versão');edit(version.init.start,version.init.end,'"1.0.64"');
const guide=only(nodes.filter(node=>node.type==='ObjectExpression'&&node.properties.some(property=>property.key?.name==='id'&&property.value?.value==='backup')),'guia de backup');
edit(guide.start,guide.end,readFileSync(path.join(here,'backup-guide.txt'),'utf8').trim());
const heading='<section class="setting-card"><h3>${te("ShieldCheck")}Seu caderno fica com voc\\xEA</h3>';
const start=source.indexOf(heading);
if(start>=0){const end=source.indexOf('${Ml.settingsEntry()}</section>',start);if(end<0)throw Error('Card de proteção incompleto.');edit(start,end+'${Ml.settingsEntry()}</section>'.length,'<section class="setting-card"><h3>${te("Smartphone")}Memória deste iPhone</h3>${Yt.settingsSummaryHTML()}</section><section class="setting-card drive-backup-setting"><h3>${te("Cloud")}Backup e recuperação</h3>${Ml.settingsEntry()}</section>');}
else if(!source.includes('setting-card drive-backup-setting'))throw Error('Ajustes do backup não encontrados.');
for(const change of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,change.start)+change.text+source.slice(change.end);
const bundled=await build({absWorkingDir:here,entryPoints:['entry.js'],bundle:true,format:'iife',minify:true,target:['safari15.4'],write:false,legalComments:'eof'});
const localeEnd=source.indexOf('/* SEPREPARE LOCALE END */');if(localeEnd<0)throw Error('Bootstrap de idioma ausente.');
const at=localeEnd+'/* SEPREPARE LOCALE END */'.length;
source=source.slice(0,at)+marker('BUNDLE',bundled.outputFiles[0].text)+source.slice(at);
// The existing sharing/localization builders move their guarded prefixes.
// Normalize only the separator after that prefix, never the iPhone host code.
source=source.replace(/(\/\* SEPREPARE SHARE CODEC END \*\/)[\r\n]+/,'$1\n');
parse(source,{ecmaVersion:'latest'});writeFileSync(path.join(root,'app.js'),source);
console.log('Proteção integrada à base iPhone: memória, gate, editor e atualização preservados.');

await build({absWorkingDir:here,entryPoints:['content-index-worker.js'],outfile:path.join(root,'content-index-worker.js'),bundle:true,format:'iife',minify:true,target:['safari15.4'],legalComments:'eof'});
