import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from '../sharing/node_modules/esbuild/lib/main.js';
import {parse} from '../sharing/node_modules/acorn/dist/acorn.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'..');
const marker=(name,text)=>`/* SEPREPARE RHYTHMS ${name} START */${text}/* SEPREPARE RHYTHMS ${name} END */`;
let source=readFileSync(path.join(root,'app.js'),'utf8').replace(/\/\* SEPREPARE RHYTHMS ([A-Z]+) START \*\/[\s\S]*?\/\* SEPREPARE RHYTHMS \1 END \*\//g,'');
const nodes=[];
function walk(node){if(!node||typeof node!=='object')return;if(node.type)nodes.push(node);for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);}}
walk(parse(source,{ecmaVersion:'latest'}));
const only=(rows,label)=>{if(rows.length!==1)throw Error('Integração de ritmos ambígua: '+label+' ('+rows.length+').');return rows[0];};
const fn=(name,match='')=>only(nodes.filter(n=>n.type==='FunctionDeclaration'&&n.id?.name===name&&source.slice(n.start,n.end).includes(match)),name);
const text=node=>source.slice(node.start,node.end),edits=[],edit=(start,end,value)=>edits.push({start,end,value});
const hook=(node,name,value,atEnd=false)=>edit(atEnd?node.body.end-1:node.body.start+1,atEnd?node.body.end-1:node.body.start+1,marker(name,value));
const transform=(node,changes)=>{let result=text(node);for(const [before,after]of changes){if(result.split(before).length!==2)throw Error('Âncora de ritmos ausente ou repetida em '+node.id?.name+': '+before.slice(0,70));result=result.replace(before,after);}edit(node.start,node.end,result);};
for(const name of ['yb','bb']){const node=fn(name),before=text(node),after=before.replaceAll('Revisar portugu\\xEAs','Revisar').replaceAll('Analisar e formatar','Formatar');if(before!==after)edit(node.start,node.end,after);}
// These hooks are inside the original host scope. The memory, gate, voice,
// authorization and update implementation stays byte-for-byte unchanged.
const registration=only(nodes.filter(n=>n.type==='ExpressionStatement'&&text(n).startsWith('It.register(new Mp(')),'attributo Quill');
edit(registration.end,registration.end,marker('REGISTER',`;It.register(new(class extends Va.Attributor{canAdd(node,value){return !!window.SePrepareRhythms.parseRhythm(value)&&super.canAdd(node,value);}})('speech-rhythm','data-speech-rhythm',{scope:Va.Scope.INLINE}),true);`));
const clean=only(nodes.filter(n=>n.type==='Property'&&n.key?.name==='ALLOWED_ATTR'&&text(n).includes('data-presenter-note')),'HTML seguro');
if(!clean.value.elements.some(n=>n.value==='data-speech-rhythm'))edit(clean.value.start+1,clean.value.start+1,'"data-speech-rhythm",');
// Legacy .seprepare files still use the host's original rich-text sanitizer.
// Add only the same validated attribute accepted by codes and the APK.
const attributes=fn('DO');if(!text(attributes).includes('parseRhythm')){const loop=only(nodes.filter(n=>n.type==='ForOfStatement'&&n.start>attributes.start&&n.end<attributes.end),'formatação dos arquivos');edit(loop.body.start,loop.body.end,'{if(r==="speech-rhythm"){const rhythm=window.SePrepareRhythms.parseRhythm(a);if(rhythm)e[r]=JSON.stringify(rhythm);continue;}'+text(loop.body)+'}');}
const portable=fn('ml');if(!text(portable).includes('showRhythms')){const read=only(nodes.filter(n=>n.type==='ObjectExpression'&&n.start>portable.start&&n.end<portable.end&&n.properties.some(p=>p.key?.name==='highlights')),'preferências do arquivo');edit(read.end-1,read.end-1,',...(a.showRhythms===true?{showRhythms:true}:{})');}
const editor=fn('gM');
let editorSource=text(editor);
const replaceEditor=(before,after)=>{if(editorSource.includes(after))return;if(editorSource.split(before).length!==2)throw Error('Editor: '+before);editorSource=editorSource.replace(before,after);};
replaceEditor('<span id="estimatedTime"></span>','<button type="button" id="estimatedTime" data-action="rhythm-analysis"></button>');
// AST locations identify the existing note action and page label without
// depending on translated minified literals or a whole replacement editor.
const note=only(nodes.filter(n=>n.type==='CallExpression'&&n.start>editor.start&&n.end<editor.end&&n.callee?.name==='oe'&&n.arguments[0]?.value==='notes-list'),'Anotar');
replaceEditor('${'+text(note)+'}', '${'+text(note)+'}${oe("rhythm-menu",SPLocale.t("Ritmo"),"Music","small soft rhythm-action",\'id="rhythmAction"\')}');
if(!editorSource.includes('SPLocale.t("Página")')){const page=only(nodes.filter(n=>n.type==='ConditionalExpression'&&n.start>editor.start&&n.end<editor.end&&text(n).startsWith('t.layout===')),'Página');replaceEditor(text(page),'SPLocale.t("Página")');}
replaceEditor('</button></footer>','</button><button type="button" class="editor-footer-close" data-action="editor-footer-close" aria-label="Ocultar rodapé" title="Ocultar rodapé" hidden>${te("X")}</button></footer>');
for(const [action,label]of [['review','Revisar'],['auto-format','Formatar']]){const call=only(nodes.filter(n=>n.type==='CallExpression'&&n.start>editor.start&&n.end<editor.end&&n.callee?.name==='oe'&&n.arguments[0]?.value===action),action);replaceEditor(text(call.arguments[1]),'SPLocale.t('+JSON.stringify(label)+')');}
editorSource=editorSource.slice(0,-1)+marker('ATTACH',';disposeRhythmFooter=window.SePrepareRhythms.mountEditorFooter(L(".editor-shell"));SPR.attach(r);SPR.stats();')+'}';edit(editor.start,editor.end,editorSource);
hook(fn('fr','document.body.classList.toggle'),'DISPOSE','disposeRhythmFooter();SPR.refresh();');
hook(fn('he','audioPlayer.stopPreview'),'CLOSE','SPR.onClose();');
hook(fn('ds'),'READER',';SPR.refreshReader();',true);
const stats=fn('$p');edit(stats.start,stats.end,'function $p(){if(!d.q)return;let n=jr(d.q.getText());L("#wordCount").textContent=SPLocale.tr`${n} ${n===1?SPLocale.t("palavra"):SPLocale.t("palavras")} · ${d.q.getLength()-1} caracteres`;SPR.stats();}');
// Keep the original validator, adding validation only for optional new metadata.
hook(fn('Tr'),'VALIDATE','window.SePrepareRhythms.validateState(t);');
const settings=only(nodes.filter(n=>n.type==='FunctionDeclaration'&&text(n).includes('id="readingPace"')),'Ajustes');
const pace=only(nodes.filter(n=>n.type==='CallExpression'&&n.start>settings.start&&n.end<settings.end&&n.callee?.name==='oe'&&n.arguments[0]?.value==='save-pace'),'Salvar ritmo');
if(!text(settings).includes('"rhythm-manager"'))edit(pace.end+1,pace.end+1,'<div class="divider"></div>${oe("rhythm-manager",SPLocale.t("Gerenciar ritmos"),"Music","small soft")}');
const reading=only(nodes.filter(n=>n.type==='FunctionDeclaration'&&text(n).includes('id="readHighlights"')),'Ajustes de leitura');
const notes=only(nodes.filter(n=>n.type==='CallExpression'&&n.start>reading.start&&n.end<reading.end&&text(n)==='Sr.readingOptions()'),'opções de notas');if(!text(reading).includes('SPR.readingOptions()'))edit(notes.end+1,notes.end+1,'${SPR.readingOptions()}');
hook(reading,'READING',';L("#showRhythms")?.addEventListener("change",e=>SPR.setReaderVisibility(e.target.checked));',true);
const actions=only(nodes.filter(n=>n.type==='SwitchStatement'&&n.discriminant?.name==='r'&&n.cases.some(c=>c.test?.value==='share-text')),'ações');edit(actions.start,actions.start,marker('ACTIONS','if(SPR.handle(r,a))return;'));
const pointer=only(nodes.filter(n=>n.type==='Literal'&&typeof n.value==='string'&&n.value.includes('.toolbar button,.part-assignment-bar button,.note-action,')),'foco do editor');if(!pointer.value.includes('.rhythm-action'))edit(pointer.start,pointer.end,JSON.stringify(pointer.value.replace('.note-action,','.note-action,.rhythm-action,#estimatedTime,.editor-footer-close,')));
const incoming=fn('Op');if(!text(incoming).includes('incoming-options')){let incomingSource=text(incoming);const start=incomingSource.indexOf('<div class="field" style="margin-top:16px"><label for="incomingCategory">'),end=incomingSource.indexOf('</select></div>',start)+15;if(start<0||end<15)throw Error('Categoria recebida ausente.');const category=incomingSource.slice(start,end).replace(' style="margin-top:16px"','');incomingSource=incomingSource.slice(0,start)+incomingSource.slice(end);incomingSource=incomingSource.replace('<div class="field incoming-identity">','<section class="incoming-options">'+category+'<div class="incoming-checks">${SPR.incomingOption(t)}</div></section><div class="field incoming-identity">');edit(incoming.start,incoming.end,incomingSource);}
const receive=fn('YM');if(!text(receive).includes('SPR.receive')){let receiveSource=text(receive).replace('{','{var rhythmAdoption;');for(const [before,after]of [['ye(t.content)','(rhythmAdoption=SPR.receive(t.content)).content'],['B.speeches=B.speeches.filter','rhythmAdoption.rollback();B.speeches=B.speeches.filter']]){if(receiveSource.split(before).length!==2)throw Error('Importação: '+before);receiveSource=receiveSource.replace(before,after);}edit(receive.start,receive.end,receiveSource);}
const merge=fn('QM');if(!text(merge).includes('SPR.adoptBackup')){const copied=only(nodes.filter(n=>n.type==='CallExpression'&&n.start>merge.start&&n.end<merge.end&&text(n)==='ye(a)'&&source.slice(n.end,n.end+30).startsWith(';o&&')),'mesclar backup');edit(copied.start,copied.end,'SPR.adoptBackup(a)');}
const startup=fn('aI'),call=only(nodes.filter(n=>n.type==='CallExpression'&&n.callee?.name==='aI'&&n.start>startup.end),'inicialização');
const shared=only(nodes.filter(n=>n.type==='VariableDeclaration'&&n.start>startup.end&&text(n).startsWith('var SPShareCodes=')),'compartilhamento');
edit(shared.start,shared.start,marker('BRIDGE',`var disposeRhythmFooter=()=>{},SPR=window.SePrepareRhythms.createRhythmUI({getState:()=>B,getActive:ue,rt:d,$:L,btn:oe,icon:te,esc:P,openModal:Te,closeModal:he,persist:le,toast:ae,Delta:qt,refreshReader:Ha});SPR.adoptBackup=value=>{const adoption=window.SePrepareRhythms.receiveRhythms(value,B.settings.rhythms||[],true);B.settings.rhythms=adoption.catalog;return adoption.content;};window.SePrepareRhythmsUI=SPR;`));
for(const change of edits.sort((a,b)=>b.start-a.start)){if(change.start>change.end)throw Error('Intervalo inválido');source=source.slice(0,change.start)+change.value+source.slice(change.end);}
const bundle=await build({absWorkingDir:here,entryPoints:['entry.js'],bundle:true,minify:true,format:'iife',target:['safari15.4'],loader:{'.css':'text'},write:false,legalComments:'eof'});
const locale='/* SEPREPARE LOCALE END */',at=source.indexOf(locale)+locale.length;if(at<locale.length)throw Error('Idioma não encontrado');source=source.slice(0,at)+marker('BUNDLE',bundle.outputFiles[0].text)+source.slice(at);
source=source.replace(/(\/\* SEPREPARE SHARE CODEC END \*\/)[\r\n]+/,'$1\n');
parse(source,{ecmaVersion:'latest'});writeFileSync(path.join(root,'app.js'),source);
console.log('Ritmos e interface 1.0.58 integrados à base atual do iPhone.');
