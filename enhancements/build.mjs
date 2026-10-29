import{readFileSync,writeFileSync}from'node:fs';import path from'node:path';import{fileURLToPath}from'node:url';
import{parse}from'../sharing/node_modules/acorn/dist/acorn.mjs';import{build}from'../sharing/node_modules/esbuild/lib/main.js';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'..');
const marker=(name,text)=>`/* SEPREPARE ENHANCEMENTS ${name} START */${text}/* SEPREPARE ENHANCEMENTS ${name} END */`;
let source=readFileSync(path.join(root,'app.js'),'utf8').replace(/\/\* SEPREPARE ENHANCEMENTS ([A-Z]+) START \*\/[\s\S]*?\/\* SEPREPARE ENHANCEMENTS \1 END \*\//g,'');
function collect(s,type='script'){const all=[];function walk(n,ancestors=[]){if(!n||typeof n!=='object')return;if(n.type)all.push({node:n,ancestors});for(const value of Object.values(n)){if(Array.isArray(value))value.forEach(v=>walk(v,n.type?[...ancestors,n]:ancestors));else if(value&&typeof value==='object')walk(value,n.type?[...ancestors,n]:ancestors);}}walk(parse(s,{ecmaVersion:'latest',sourceType:type}));return all;}
const parsed=collect(source),only=(rows,label)=>{if(rows.length!==1)throw Error(label+' ambíguo: '+rows.length);return rows[0];},text=n=>source.slice(n.start,n.end);
const editor=only(parsed.filter(({node:n})=>n.type==='FunctionDeclaration'&&n.id?.name==='gM'&&text(n).includes('id="textEditor"')),'editor');
const scope=editor.ancestors.filter(n=>['ArrowFunctionExpression','FunctionExpression','FunctionDeclaration'].includes(n.type)).at(-1);
if(!scope)throw Error('Escopo do aplicativo não encontrado.');
const nodes=parsed.map(x=>x.node).filter(n=>n.start>=scope.body.start&&n.end<=scope.body.end);
const fn=(name,match='')=>only(nodes.filter(n=>n.type==='FunctionDeclaration'&&n.id?.name===name&&text(n).includes(match)),name);
const edits=[],edit=(start,end,value)=>edits.push({start,end,value});
const hook=(node,name,value,end=false)=>edit(end?node.body.end-1:node.body.start+1,end?node.body.end-1:node.body.start+1,marker(name,value));
const theme=only(nodes.filter(n=>n.type==='FunctionDeclaration'&&text(n).length<800&&text(n).includes('B.settings.theme')&&text(n).includes('classList.toggle("dark"')),'tema');
const map={state:'B',rt:'d',$:'L',$$:'$t',icon:'te',btn:'oe',ib:'Ge',tool:'$r',option:'Me',esc:'P',plain:'Fe',Delta:'qt',active:'ue',isPart:'se',persist:'le',toast:'ae',checkpoint:'Dr',syncCurrent:'_r',updateScope:'ua',render:'fr',renderEditor:'gM',openModal:'Te',closeModal:'he',mergeReviewMatches:'wl',renderReview:'ca',applyReview:'FM',replaceStyled:'BM',dictionary:'rI',showAutoHighlights:'o0',renderSemanticPreview:'UM',applySemanticFormatting:'jM',commitVersionChange:'n0',appearanceSettings:'sp62Appearance',applyTheme:theme.id.name,worker:'ja',el:'e',translateUI:'SPLocale.t',formatUI:'SPLocale.tr',markupUI:'SPLocale.h',htmlUI:'SPLocale.html',systemMessage:'SPLocale.systemMessage'};
function translate(code){const changes=new Map();for(const{node:n,ancestors}of collect(code)){if(n.type!=='Identifier'||!map[n.name])continue;const parent=ancestors.at(-1);if(parent?.type==='MemberExpression'&&parent.property===n&&!parent.computed)continue;if(parent?.type==='Property'&&parent.key===n&&!parent.computed){if(!parent.shorthand)continue;changes.set(parent.start,{start:parent.start,end:parent.end,value:n.name+':'+map[n.name]});continue;}if(parent?.type==='Property'&&parent.shorthand)continue;changes.set(n.start,{start:n.start,end:n.end,value:map[n.name]});}for(const c of [...changes.values()].sort((a,b)=>b.start-a.start))code=code.slice(0,c.start)+c.value+code.slice(c.end);return code;}
const ui=readFileSync(path.join(here,'host-ui.js'),'utf8');
for(const{node:n}of collect(ui).filter(({node:n})=>n.type==='FunctionDeclaration')){
 const code=translate(ui.slice(n.start,n.end));if(n.id.name==='appearanceSettings')continue;
 const old=fn(map[n.id.name]);edit(old.start,old.end,code);
}
const appearance=only(collect(ui).map(x=>x.node).filter(n=>n.type==='FunctionDeclaration'&&n.id?.name==='appearanceSettings'),'aparência');
const registry='var {mountEditorFind,mountToolbarIndicator,mountContextHelp,mountSettingsNavigation,styleSettingsDialog,dictionaryWords,correctionRecords,rememberedCorrections,rememberCorrection,forgetCorrection,rememberedMatches,semanticEdit,formatNewVersion}=window.SePrepareEnhancements;var sp62Settings=null,sp62Find=null,sp62Toolbar=()=>{},sp62Help=mountContextHelp();';
const mount=`function sp62MountSettings(){
 const host=L('#viewContent'),cards=[...host.querySelectorAll('.settings-list>.setting-card')],memory=cards.find(c=>c.querySelector('[data-action="pwa-memory-vault"]')),notifications=cards.find(c=>c.querySelector('h3')?.textContent.trim()===SPLocale.t('Notificações no iPhone'));
 if(!memory||!notifications)throw Error('Os controles do aparelho precisam permanecer disponíveis.');
 host.querySelector('.settings-list').insertAdjacentHTML('beforeend',SPLocale.h\`<section class="setting-card legal-settings-card"><h3>Privacidade</h3><p>Ao usar o SePrepare, você está de acordo com os Termos de Uso e a Política de Privacidade.</p><div class="legal-links"><a class="btn small secondary legal-document-link" href="https://seprepareapp.com.br/termos/" target="_blank" rel="noopener noreferrer">\${te('FileText')}<span>Termos de Uso</span></a><a class="btn small secondary legal-document-link" href="https://seprepareapp.com.br/privacidade/" target="_blank" rel="noopener noreferrer">\${te('ShieldCheck')}<span>Política de Privacidade</span></a></div></section>\`);
 sp62Settings=mountSettingsNavigation({host,version:Xb,query:d.settingsQuery||'',onQuery:value=>{d.settingsQuery=value;},icon:te,escape:P,openModal:Te,mark:()=>{d.modal='settings-panel';},appearance:sp62Appearance,count:value=>SPLocale.tr\`\${value} ajustes encontrados\`,empty:()=>SPLocale.t('Nenhum ajuste encontrado'),panels:{memory,notifications},extraEntries:[{id:'memory',title:memory.querySelector('h3').textContent,category:SPLocale.t('DADOS E SEGURANÇA'),group:3,icon:'Smartphone',panel:'memory',keywords:'armazenamento memória dados espaço segurança storage memory OPFS IndexedDB',concepts:['recover']}],filterEntry:e=>!['exact-time','notification-permission'].includes(e.id)});
}`;
const bridge=only(nodes.filter(n=>n.type==='VariableDeclaration'&&n.declarations.some(d=>d.id?.name==='SPShareCodes')),'ponte');edit(bridge.start,bridge.start,marker('BRIDGE',registry+translate(ui.slice(appearance.start,appearance.end))+mount));
hook(fn('hM'),'SETTINGS',';sp62MountSettings();',true);
hook(fn('fr','document.body.classList.toggle'),'DISPOSE',"if(sp62Settings){if(d.modal==='settings-panel')he();sp62Settings.destroy();sp62Settings=null;}sp62Find?.destroy();sp62Find=null;sp62Toolbar();sp62Help.hide();");
hook(fn('Te','#overlays'),'OPEN','sp62Settings?.release();sp62Find?.close();sp62Help.hide();');
hook(fn('he','audioPlayer.stopPreview'),'CLOSE','sp62Settings?.release();');
const e=editor.node;let editorSource=text(e),redo=only(nodes.filter(n=>n.type==='CallExpression'&&n.start>e.start&&n.end<e.end&&n.callee?.name==='$r'&&n.arguments[0]?.value==='redo'),'refazer');
editorSource=editorSource.replace('$r("editor-find",SPLocale.t("Buscar e substituir"),"Search")','$r("editor-find","Search",SPLocale.t("Buscar e substituir"))');
if(!editorSource.includes('"editor-find"'))editorSource=editorSource.replace('${'+text(redo)+'}','${'+text(redo)+'}${$r("editor-find","Search",SPLocale.t("Buscar e substituir"))}');
editorSource=editorSource.slice(0,-1)+marker('ATTACH',';sp62Toolbar=mountToolbarIndicator(L(".toolbar"));sp62Find=mountEditorFind({q:d.q,root:L(".editor-shell"),Delta:qt,icon:te,persist:le,checkpoint:Dr,toast:ae});')+'}';edit(e.start,e.end,editorSource);
const back=only(nodes.filter(n=>n.type==='FunctionDeclaration'&&text(n).includes('.editorFrom')&&text(n).includes('.modal-backdrop')&&text(n).length<1500),'Voltar');hook(back,'BACK','if(sp62Find?.isOpen()){sp62Find.close();return true;}');
const actions=only(nodes.filter(n=>n.type==='SwitchStatement'&&n.discriminant?.name==='r'&&n.cases.some(c=>c.test?.value==='share-text')),'ações');
const code=readFileSync(path.join(here,'host-actions.js'),'utf8'),cases=collect(code).map(x=>x.node).filter(n=>n.type==='SwitchCase'),added=[];
for(const c of cases){const replacement=translate('function adapter(){switch(action){'+code.slice(c.start,c.end)+'}}'),start=replacement.indexOf('{',replacement.indexOf('switch('))+1,body=replacement.slice(start,-2),old=actions.cases.find(n=>n.test?.value===c.test.value);if(old)edit(old.start,old.end,body);else added.push(body);}
edit(actions.cases[0].start,actions.cases[0].start,marker('ACTIONS','case"editor-find":sp62Find?.open();break;'+added.join('')));
for(const c of edits.sort((a,b)=>b.start-a.start)){if(c.start>c.end)throw Error('Intervalo inválido.');source=source.slice(0,c.start)+c.value+source.slice(c.end);}
const bundled=await build({absWorkingDir:here,entryPoints:['entry.js'],bundle:true,minify:true,format:'iife',target:['safari15.4'],loader:{'.css':'text'},write:false,legalComments:'eof'});
const end='/* SEPREPARE LOCALE END */',at=source.indexOf(end)+end.length;if(at<end.length)throw Error('Runtime de idioma ausente.');source=source.slice(0,at)+marker('BUNDLE',bundled.outputFiles[0].text)+source.slice(at);
source=source.replace(/(\/\* SEPREPARE SHARE CODEC END \*\/)[\r\n]+/,'$1\n');
parse(source,{ecmaVersion:'latest'});writeFileSync(path.join(root,'app.js'),source);
await build({absWorkingDir:here,entryPoints:['review-worker.js'],outfile:path.join(root,'review-worker.js'),bundle:true,minify:true,format:'iife',target:['safari15.4'],external:['./spell/dist/Hunspell.js'],loader:{'.aff':'text','.dic':'text'},plugins:[{name:'portable-dictionary-lines',setup(build){build.onLoad({filter:/\.(?:aff|dic)$/},args=>({contents:readFileSync(args.path,'utf8').replace(/\r\n/g,'\n'),loader:'text'}));}}],legalComments:'eof'});
console.log('Paridade 1.0.59–1.0.62 integrada ao host Apple, sem substituir memória ou gestos.');
