import {readFileSync,writeFileSync,copyFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {build} from 'esbuild';
import {parse} from 'acorn';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'..');
// Add narrowly scoped hooks to the current iPhone bundle, never replace it with
// a desktop/Android build. Retains memory, device gate, Drive and update fixes.
const marker=(name,text)=>`/* SEPREPARE SHARE ${name} START */${text}/* SEPREPARE SHARE ${name} END */`;
let source=readFileSync(path.join(root,'app.js'),'utf8').replace(/\/\* SEPREPARE SHARE ([A-Z]+) START \*\/[\s\S]*?\/\* SEPREPARE SHARE \1 END \*\//g,'');
const ast=parse(source,{ecmaVersion:'latest'}),nodes=[];
function walk(node){if(!node||typeof node!=='object')return;if(node.type)nodes.push(node);for(const [key,value]of Object.entries(node))if(key!=='start'&&key!=='end'){if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);}}
walk(ast);
const only=(items,label)=>{if(items.length!==1)throw Error('Integração ambígua: '+label+' ('+items.length+'). Preserve a base e revise antes de publicar.');return items[0];};
const edits=[],edit=(start,end,text)=>edits.push({start,end,text});
const fn=name=>only(nodes.filter(node=>node.type==='FunctionDeclaration'&&node.id?.name===name),name);
const property=(node,key)=>node.properties?.find(item=>(item.key?.name||item.key?.value)===key)?.value;
const object=id=>only(nodes.filter(node=>node.type==='ObjectExpression'&&property(node,'id')?.value===id),'objeto '+id);
const menu=fn('ZM');edit(menu.body.end-1,menu.body.end-1,marker('MENU',';SPShareCodes.addShareOption();'));
const actions=only(nodes.filter(node=>node.type==='SwitchStatement'&&node.discriminant?.name==='r'&&node.cases.some(item=>item.test?.value==='share-text')),'ações');
edit(actions.start,actions.start,marker('ACTIONS','if(SPShareCodes.handle(r))return;'));
const importing=only(actions.cases.filter(node=>node.test?.value==='import'),'importar'),call=only(importing.consequent.filter(node=>node.type==='ExpressionStatement'),'importação');edit(call.start,call.end,'SPShareCodes.openImport();');
const start=fn('aI'),startup=only(nodes.filter(node=>node.type==='CallExpression'&&node.callee?.name==='aI'&&node.start>start.end),'inicialização');
edit(startup.start,startup.start,marker('BRIDGE',`var SPShareCodes=window.SePrepareSharedCode.createShareCodeUI({getState:()=>B,rt:d,$:L,icon:te,btn:oe,option:Me,esc:P,native:fe,openModal:Te,closeModal:he,toast:ae,syncCurrent:_r,persist:le,importFile:KM,exportFile:ps,documentHTML:jp,refreshContrast:vo,go:gt,onImported(speech){for(const version of speech.versions)_t.set(za(speech,version.id),vn({...speech,...version,activeVersionId:version.id}));}});`));
for(const node of nodes.filter(node=>node.type==='CallExpression'&&node.callee?.name==='Ge'&&node.arguments[0]?.value==='import'&&node.arguments[1]?.value==='FileUp'))edit(node.arguments[2].start,node.arguments[2].end,JSON.stringify('Importar preparação'));
const version=only(nodes.filter(node=>node.type==='VariableDeclarator'&&node.id?.name==='Xb'),'versão');edit(version.init.start,version.init.end,'"1.0.46"');
const guide=object('share');edit(guide.start,guide.end,readFileSync(path.join(here,'share-guide.txt'),'utf8').trim());
const tip=property(object('notes'),'tip'),tipText=tip.type==='CallExpression'?tip.arguments[0]?.value:tip.value;
if(typeof tipText!=='string')throw Error('Revise o texto de ajuda das anotações antes de compilar.');
if(!tipText.includes('No código'))edit(tip.start,tip.end,`SPLocale.t(${JSON.stringify(tipText+' No código, só entram se você marcar Incluir minhas anotações privadas.')})`);
if(!nodes.some(node=>node.type==='ObjectExpression'&&property(node,'id')?.value==='fflate')){const licenses=object('sources');edit(licenses.start,licenses.start,`{id:'fflate',name:'fflate',note:'MIT · compactação local dos códigos',files:[['Licença MIT','fflate-LICENSE']]},`);}
for(const change of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,change.start)+change.text+source.slice(change.end);
source=source.replace('Marked, Lucide e as fontes','Marked, Lucide, fflate e as fontes');
const bundled=await build({absWorkingDir:here,entryPoints:['entry.js'],bundle:true,minify:true,format:'iife',target:['safari15.4','chrome85'],write:false,legalComments:'eof'});
const result=marker('CODEC',bundled.outputFiles[0].text)+source;parse(result,{ecmaVersion:'latest'});writeFileSync(path.join(root,'app.js'),result);
mkdirSync(path.join(root,'licenses'),{recursive:true});copyFileSync(path.join(here,'node_modules/fflate/LICENSE'),path.join(root,'licenses/fflate-LICENSE'));
const notices=readFileSync(path.join(root,'THIRD_PARTY.txt'),'utf8');if(!notices.includes('fflate'))writeFileSync(path.join(root,'THIRD_PARTY.txt'),notices+'\nfflate 0.8.2 — MIT — https://github.com/101arrowz/fflate\n');
console.log('Compartilhamento integrado; base iPhone preservada.');
