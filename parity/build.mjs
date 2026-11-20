import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {parse} from '../sharing/node_modules/acorn/dist/acorn.mjs';import {build} from '../sharing/node_modules/esbuild/lib/main.js';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'..'),marker=(name,code)=>`/* SEPREPARE PARITY ${name} START */${code}/* SEPREPARE PARITY ${name} END */`;
let source=fs.readFileSync(path.join(root,'app.js'),'utf8').replace(/\/\* SEPREPARE PARITY ([A-Z]+) START \*\/[\s\S]*?\/\* SEPREPARE PARITY \1 END \*\//g,'');
const ranges=[...source.matchAll(/\/\* SEPREPARE [A-Z]+ (BUNDLE|CODEC) START \*\/[\s\S]*?\/\* SEPREPARE [A-Z]+ \1 END \*\//g)].map(m=>[m.index,m.index+m[0].length]),nodes=[];
function walk(n){if(!n||typeof n!=='object'||n.type&&ranges.some(([a,b])=>n.start>=a&&n.end<=b))return;if(n.type)nodes.push(n);for(const v of Object.values(n)){if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}}walk(parse(source,{ecmaVersion:'latest'}));
const one=(xs,label)=>{if(xs.length!==1)throw Error('Apple parity '+label+': '+xs.length);return xs[0];},fn=name=>one(nodes.filter(n=>n.type==='FunctionDeclaration'&&n.id?.name===name),name),edits=[];
const insert=(at,label,code)=>edits.push({at,code:marker(label,code)}),hook=(name,label,code,end=false)=>{const f=fn(name);insert(end?f.body.end-1:f.body.start+1,label,(end?';':'')+code);};
const active=one(nodes.filter(n=>n.type==='VariableDeclarator'&&n.id?.name==='ue'),'editor getter');
insert(active.init.body.start,'ACTIVE','window.SePrepareParityRuntime?.getEditor()||');
hook('hs','BUTTON','if(window.SePrepareParityRuntime)return window.SePrepareParityRuntime.updateSaveButton();');
hook('gM','EDITOR','window.SePrepareParityRuntime?.mountEditor();',true);
hook('YM','INCOMING','if(window.SePrepareParityRuntime)return window.SePrepareParityRuntime.receiveFile();');
// Keep the recording guard before navigation, and the original navigation body
// beneath the hook, so removing only our markers restores the existing host.
const nav=fn('gt'),guard=nav.body.body[0];
if(!source.slice(guard.start,guard.end).includes('sp90Recordings'))throw Error('Recording navigation guard unavailable');
insert(guard.end,'NAV','if(window.SePrepareParityRuntime)return window.SePrepareParityRuntime.navigate(t,e);');
hook('le','SAVING','window.SePrepareParityRuntime?.prepareSave();');
const save=fn('le'),json=one(nodes.filter(n=>n.type==='VariableDeclaration'&&n.start>save.start&&n.end<save.end&&source.slice(n.start,n.end).includes('JSON.stringify(B)')),'save snapshot');
insert(json.start,'DRAFT','window.SePrepareParityRuntime?.retain();');
const sync=one(nodes.filter(n=>n.type==='CallExpression'&&n.callee?.name==='_r'&&n.start>save.start&&n.end<save.end),'synchronize draft');insert(sync.end,'RETAIN',',window.SePrepareParityRuntime?.retain()');
// A blocked/gated save must not leave an optimistic status in the editor.
for(const ret of nodes.filter(n=>n.type==='ReturnStatement'&&n.start>save.start&&n.end<save.end&&n.argument?.value===false)){insert(ret.argument.start,'ERROR','(window.SePrepareParityRuntime?.mark("error"),');insert(ret.argument.end,'ERROR',')');}
const actions=one(nodes.filter(n=>n.type==='SwitchStatement'&&n.discriminant?.name==='r'&&n.cases.some(x=>x.test?.value==='save-editor')),'actions');
const byText=(name,fragment)=>one(nodes.filter(n=>n.type==='FunctionDeclaration'&&n.id?.name===name&&source.slice(n.start,n.end).includes(fragment)),name+' '+fragment);
const hookBody=(f,label,code)=>insert(f.body.start+1,label,code);
const vault=byText('M','pwa-snapshot-preview');
hookBody(vault,'LOCALCOPIES',`if(window.SePrepareParity){await ct();await ne();window.SePrepareParity.openLocalCopies({copies:w.slice(0,fn),openModal:l,button:s,icon:o,escape:i,formatDate:Br,formatSize:rt});r.modal="pwa-vault";return;}`);
hookBody(byText('$','pwa-memory-vault'),'LOCALSUMMARY',`if(window.SePrepareParity){
 if(e)return "";
 return SPLocale.h\`<div class="pwa-memory-box apple-simple-sheet"><p class="help">\${SPLocale.t("Seu caderno é salvo automaticamente neste aparelho.")}</p><div class="apple-sheet-actions">\${s("pwa-memory-vault",SPLocale.t("Cópias de recuperação"),"History","small secondary")}\${s("pwa-save-device-file",SPLocale.t("Exportar backup"),"Download","small soft")}\${v()?"":s("pwa-install",j()?"Instalar no iPhone":SPLocale.t("Instalar aplicativo"),"Smartphone","small")}</div></div>\`;
 }`);
hook('TM','AGENDASHEET',`if(window.SePrepareParity){if(t)d.speechId=t;window.SePrepareParity.openAgendaDate({speech:ue(),openModal:Te,button:oe,escape:P});d.modal="agenda-date";return;}`);
const persistAgenda=`const spAgendaId=d.speechId;void window.SePrepareParityRuntime.saveAgendaDate(spAgendaId,spAgendaDate).then(ok=>{if(!ok)return;he();["editor","part"].includes(d.view)?yl():fr();ae(SPLocale.t(`;
hook('EM','AGENDASAVE',`if(window.SePrepareParityRuntime){const spAgendaDate=window.SePrepareParity.readAgendaDate(L("#scheduleDate"),ae);if(spAgendaDate===null)return;${persistAgenda}"Data salva na Agenda."));});return;}`);
const clear=one(actions.cases.filter(n=>n.test?.value==='clear-schedule'),'clear schedule');
insert(clear.consequent[0].start,'AGENDACLEAR',`if(window.SePrepareParityRuntime){const spAgendaDate=0;${persistAgenda}"Agendamento removido."));});break;}`);
hookBody(byText('Be','case"pwa-export-ics"'),'CALENDAREXPORT',`if(k==="pwa-export-ics"&&window.SePrepareParity){const speech=f().speeches.find(item=>item.id===(_||r.speechId));const date=window.SePrepareParity.readAgendaDate(a("#scheduleDate"),u);if(speech&&date!==null)Pe({...speech,scheduledAt:date});return true;}`);
const exportCalendar=byText('Pe','BEGIN:VCALENDAR');
const exportMessage=one(nodes.filter(n=>n.type==='CallExpression'&&n.start>exportCalendar.start&&n.end<exportCalendar.end&&n.callee?.name==='u'&&n.arguments[0]?.arguments?.[0]?.value?.startsWith('Abrindo o Calendário')),'calendar export message');
insert(exportMessage.arguments[0].start,'CALENDARMESSAGE','SPLocale.t("Abra o arquivo para adicionar o evento ao Calendário.")||');
hook('pM','AGENDAEMPTY','const help=L("#viewContent .empty p");if(help)help.textContent=SPLocale.t("Adicione uma data para ver suas próximas apresentações aqui.");',true);
const settingsRender=fn('hM').body.body[0];
if(!source.slice(settingsRender.start,settingsRender.end).includes('settings-list'))throw Error('Apple settings template unavailable');
insert(settingsRender.end,'AGENDASETTINGS',`;for(const title of $t("#viewContent .setting-card > h3")){if(title.textContent.trim()===SPLocale.t("Notificações no iPhone")){const help=title.nextElementSibling;if(help)help.textContent=SPLocale.t("O SePrepare não envia lembretes no iPhone. Para receber um aviso, use o Calendário.");break;}}`);
const saveCase=one(actions.cases.filter(n=>n.test?.value==='save-editor'),'confirm');insert(saveCase.consequent[0].start,'CONFIRM','if(window.SePrepareParityRuntime){void window.SePrepareParityRuntime.confirm();break;}');
for(const name of ['new-speech','new-part']){const item=one(actions.cases.filter(n=>n.test?.value===name),name);const unshift=one(nodes.filter(n=>n.type==='CallExpression'&&n.start>item.start&&n.end<item.end&&n.callee?.property?.name==='unshift'),'new document');insert(unshift.start,'UNPUBLISHED','l.editorUnpublished=true,');}
for(const name of ['hb','gb','yb']){const call=one(nodes.filter(n=>n.type==='CallExpression'&&n.callee?.name===name),'editor factory '+name);const config=call.arguments[0],getter=config.properties.find(p=>p.key?.name==='getState').value;insert(getter.body.start,'PROJECTION','window.SePrepareParityRuntime?.editorState()||');}
hook('n0','VERSION','const spParityBefore=window.SePrepareParityRuntime?.versionSnapshot();');
const version=fn('n0'),change=one(nodes.filter(n=>n.type==='CallExpression'&&n.callee?.name==='t'&&n.start>version.start&&n.end<version.end),'version mutation');insert(change.end,'RUNTIME',',window.SePrepareParityRuntime?.versionChanged(r)');
const rollback=one(nodes.filter(n=>n.type==='VariableDeclarator'&&n.id?.name==='n'&&n.start>version.start&&n.end<version.end),'version rollback');insert(rollback.init.body.end-1,'ROLLBACK',';window.SePrepareParityRuntime?.versionRollback(spParityBefore);');
const drive=one(nodes.filter(n=>n.type==='CallExpression'&&n.callee?.name==='Mm'),'Drive UI');const restore=drive.arguments[0].properties.find(p=>p.key?.name==='commitRestore').value;insert(restore.start,'RESTORE','window.SePrepareParityRuntime?.commitRestore||');
const bridge=one(nodes.filter(n=>n.type==='VariableDeclaration'&&n.declarations.some(d=>d.id?.name==='SPShareCodes')),'bridge');
insert(bridge.start,'BRIDGE',`window.SePrepareParityRuntime=window.SePrepareParity.createEditorRuntime({getState:()=>B,setState:next=>{B=next;},rt:d,$:L,icon:te,getDrive:()=>sI,getRhythms:()=>SPR,syncCurrent:_r,persist:le,flush:()=>Yt.flushPendingSaves(),lock:window.SePrepareDriveProtection.lockFileImport,closeModal:he,toast:ae,render:fr,keepAwake:on=>Yt.setKeepAwake(on),onConfirmed:()=>Yt.onExplicitEditorSave(),onImported(speech){for(const version of speech.versions)_t.set(za(speech,version.id),vn({...speech,...version,activeVersionId:version.id}));}});`);
for(const edit of edits.sort((a,b)=>b.at-a.at))source=source.slice(0,edit.at)+edit.code+source.slice(edit.at);
const bundle=await build({absWorkingDir:here,entryPoints:['entry.js'],bundle:true,minify:true,format:'iife',target:['safari15.4'],loader:{'.css':'text'},write:false,legalComments:'eof'}),end='/* SEPREPARE LOCALE END */',at=source.indexOf(end)+end.length;
if(at<end.length)throw Error('Locale bootstrap unavailable');source=source.slice(0,at)+marker('BUNDLE',bundle.outputFiles[0].text)+source.slice(at);parse(source,{ecmaVersion:'latest'});fs.writeFileSync(path.join(root,'app.js'),source);console.log('PASS Apple editor/share parity integrated without replacing the host.');
