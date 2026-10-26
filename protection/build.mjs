import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {build} from '../sharing/node_modules/esbuild/lib/main.js';
import {parse} from '../sharing/node_modules/acorn/dist/acorn.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'..');
const marker=(name,text)=>`/* SEPREPARE PROTECTION ${name} START */${text}/* SEPREPARE PROTECTION ${name} END */`;
let source=readFileSync(path.join(root,'app.js'),'utf8').replace(/\/\* SEPREPARE PROTECTION ([A-Z]+) START \*\/[\s\S]*?\/\* SEPREPARE PROTECTION \1 END \*\//g,'');
const nodes=[],ast=parse(source,{ecmaVersion:'latest'});
function walk(node){if(!node||typeof node!=='object')return;if(node.type)nodes.push(node);for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);}}
walk(ast);
const only=(matches,label)=>{if(matches.length!==1)throw Error('Integração ambígua: '+label+' ('+matches.length+').');return matches[0];};
const fn=name=>only(nodes.filter(node=>node.type==='FunctionDeclaration'&&node.id.name===name),name);
const edits=[],edit=(start,end,text)=>edits.push({start,end,text});
const bridge=fn('Bb');edit(bridge.start,bridge.end,'function Bb({getState:t}){return window.SePrepareDriveProtection.createBridge({getState:t,canWrite:()=>!!window.orador&&!yo&&!e0&&Yt.isAllowedIPhone()});}');
const ui=fn('Mm');edit(ui.start,ui.end,'function Mm(config){return window.SePrepareDriveProtection.createUI(config);}');
const save=only(nodes.filter(node=>node.type==='FunctionDeclaration'&&node.id.name==='le'&&source.slice(node.start,node.end).includes('Yt.saveState')),'gravação iPhone');
const returns=save.body.body.filter(node=>node.type==='ReturnStatement');const result=only(returns.filter(node=>source.slice(node.start,node.end).endsWith(',r')),'resultado da gravação');
// Observe after the existing local-save result; do not wait on the network.
edit(result.argument.end,result.argument.end,marker('SAVED',',r&&sI?.driveLocalSaved?.(),r'));
const render=only(nodes.filter(node=>node.type==='FunctionDeclaration'&&node.id.name==='fr'&&source.slice(node.start,node.end).includes('document.body.classList.toggle')),'renderização iPhone');
edit(render.body.end-1,render.body.end-1,marker('CARDS',';void Ml?.refreshCards?.();'));
const card=fn('fM'),cardText=source.slice(card.start,card.end);
if(!cardText.includes('Ml.cardIndicator(t)')){const token='${bn(t)}';const at=source.indexOf(token,card.start);if(at<0||at>=card.end)throw Error('Linha de tipo do card ausente.');edit(at,at+token.length,'<div class="drive-card-type-row">${bn(t)}${Ml.cardIndicator(t)}</div>');}
const version=only(nodes.filter(node=>node.type==='VariableDeclarator'&&node.id.name==='Xb'),'versão');edit(version.init.start,version.init.end,'"1.0.58"');
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
