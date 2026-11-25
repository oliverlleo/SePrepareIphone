import assert from 'node:assert/strict';
import {fixture,until} from './drive-web-fixture.mjs';
import {createDriveUI} from './drive-ui.js';
import {newSpeech,clone,ensureVersions,captureContentVersion} from './core.js';
import {retainEditorDraft} from '../parity/editor-drafts.js';
import {createEditorRuntime} from '../parity/runtime.js';
import {JSDOM} from '../qa/time-dom/node_modules/jsdom/lib/api.js';

const checks=[];
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}

function makeSpeech(id,text,notes=[]){
 const s=newSpeech();s.id=id;s.title=id;s.delta={ops:[{insert:text}]};s.presenterNotes=notes;
 ensureVersions(s);captureContentVersion(s);return s;
}
function editDoc(doc,text,notes){
 const next=clone(doc);next.delta={ops:[{insert:text}]};
 if(notes!==undefined)next.presenterNotes=clone(notes);
 captureContentVersion(next);return next;
}

function harnessFor(f,{view='home',speechId=null,q=null,cardDom=false,hasOpenEditorChanges,intervalHook}={}){
 let modal=null,restores=[],lastRestoreOptions=null;
 const rt={view,speechId,q,modal:null};
 const draftNode={dataset:{driveDraft:'prepared'},hidden:true,textContent:''};
 const cardNode={dataset:{driveDocument:'prepared'},isConnected:true,parentElement:{children:[draftNode]},setAttribute(k,v){this[k]=v;}};
 f.doc.documentElement={lang:'pt-BR'};
 f.doc.querySelectorAll=selector=>cardDom&&selector==='[data-drive-document]'?[cardNode]:[];
 globalThis.window=f.win;globalThis.document=f.doc;
 const shell={classList:{add(){}}};
 const ui=createDriveUI({
  window:f.win,document:f.doc,
  setIntervalFn:intervalHook?(fn,ms)=>{intervalHook(fn,ms);return 1;}:undefined,
  clearIntervalFn:intervalHook?()=>{}:undefined,
  hasOpenEditorChanges,
  native:{...f.drive,driveTakeOffer:()=>false},rt,
  $:selector=>selector==='.modal'?shell:selector==='.modal-backdrop'?(modal?shell:null):null,
  icon:name=>name,btn:(action,label)=>`<button data-action="${action}">${label}</button>`,esc:String,
  openModal:(title,body,footer)=>{modal={title,body,footer};},closeModal:()=>{modal=null;rt.modal=null;},
  toast:()=>{},readable:()=>true,getState:f.getState,
  persist:()=>{f.drive.driveLocalSaved('user',JSON.stringify(f.getState()));return true;},
  async commitRestore(next,options){
   lastRestoreOptions=options||null;
   await new Promise(resolve=>setTimeout(resolve,2));
   restores.push({next,options});
   if(options?.reloadEditorSpeechId&&rt.view==='editor'&&rt.speechId===options.reloadEditorSpeechId){
    f.setState(next);f.drive.driveLocalSaved('drive',JSON.stringify(next));return true;
   }
   if(options?.preserveEditorSpeechId&&rt.view==='editor'&&rt.speechId===options.preserveEditorSpeechId){
    f.setState(next);f.drive.driveLocalSaved('drive',JSON.stringify(next));return true;
   }
   if(options?.preserveView&&['reader','home','agenda','categories','settings'].includes(rt.view)){
    f.setState(next);f.drive.driveLocalSaved('drive',JSON.stringify(next));return true;
   }
   rt.q=null;rt.view='home';rt.speechId=null;f.setState(next);f.drive.driveLocalSaved('drive',JSON.stringify(next));return true;
  }
 });
 ui.start();
 return {ui,rt,cardNode,draftNode,restores:()=>restores,lastOptions:()=>lastRestoreOptions,modal:()=>modal};
}

await check('Apple: retomada Cloudflare gerenciada dispara leitura sem aguardar GIS',async()=>{
 let resolveManaged;
 const managedPromise=new Promise(r=>{resolveManaged=r;});
 const authorization={managed:()=>true,canResume:()=>true,allowGesture:()=>false,acquire:()=>managedPromise,invalidate(){}};
 const f=fixture({linked:true,authorization});
 const fullRemote=clone(f.getState());fullRemote.speeches.push(makeSpeech('from-android','Do Android para iPhone\n'));
 await f.addRemote('from-android',JSON.stringify(fullRemote));
 try{
  const h=harnessFor(f);
  await new Promise(r=>setTimeout(r,20));
  assert.equal(h.restores().length,0);
  resolveManaged({access_token:'TEST_MEMORY_TOKEN_CF',expires_in:3600,scope:'https://www.googleapis.com/auth/drive.appdata'});
  await until(()=>h.restores().length===1);
  assert.equal(f.getState().speeches.length,2);
  assert.equal(f.getState().speeches[1].delta.ops[0].insert,'Do Android para iPhone\n');
 }finally{f.dispose();}
});

await check('Apple: foco e pageshow consultam Drive a partir de 15 segundos e mesclam parágrafos/notas',async()=>{
 const baseDoc=makeSpeech('prepared','Linha 1\nLinha 2\n',[{id:'n1',text:'Base'}]);
 const f=fixture();
 const origNow=Date.now;Date.now=()=>f.now();
 f.setState({schema:1,contentVersion:2,categories:[],speeches:[clone(baseDoc)],settings:{theme:'light'},vocabulary:[]});
 try{
  await f.action('connect');await f.send();
  const h=harnessFor(f);await until(()=>!f.status().busy);
  const localState=clone(f.getState());
  localState.speeches[0]=editDoc(baseDoc,'Linha 1 iPhone\nLinha 2\n',[{id:'n1',text:'Base'},{id:'n-ios',text:'Nota iOS'}]);
  f.setState(localState);f.drive.driveLocalSaved('user',JSON.stringify(localState));
  const remoteState=clone(localState);
  remoteState.speeches[0]=editDoc(baseDoc,'Linha 1\nLinha 2 Web\n',[{id:'n1',text:'Base'},{id:'n-web',text:'Nota Web'}]);
  await f.addRemote('web-edit',JSON.stringify(remoteState));
  f.advance(5000);f.win.dispatchEvent(new Event('focus'));await new Promise(r=>setTimeout(r,20));
  assert.equal(h.restores().length,0);
  f.advance(11000);f.win.dispatchEvent(new Event('pageshow'));
  await until(()=>h.restores().length===1&&!f.status().busy);
  const merged=f.getState().speeches[0];
  assert.equal(merged.delta.ops.map(o=>o.insert).join(''),'Linha 1 iPhone\nLinha 2 Web\n');
  assert(merged.presenterNotes.some(n=>n.id==='n-ios'));
  assert(merged.presenterNotes.some(n=>n.id==='n-web'));
  if(f.status().backupPending)assert.equal(f.status().lastAutoAttemptAt,0);
 }finally{Date.now=origNow;f.dispose();}
});

await check('Apple: parity runtime preserva editor/leitor no commitRestore e mostra aviso de rascunho no leitor',async()=>{
 const dom=new JSDOM('<main class="reader-shell"><header class="editor-top"><div class="editor-name"><span class="name"></span></div><button class="editor-save"><span>Salvar</span></button><span id="saveStatus"></span></header><article class="reader-paper"><div id="readerText"></div></article></main>',{url:'https://qa.invalid'});
 globalThis.window=dom.window;globalThis.document=dom.window.document;window.scrollTo=()=>{};
 try{
  const docA=makeSpeech('a','Texto A\n'),docB=makeSpeech('b','Texto B\n');
  let state={schema:1,contentVersion:2,speeches:[clone(docA),clone(docB)],categories:[],settings:{language:'pt-BR'},editorDrafts:[]},persisted=JSON.stringify(state);
  let renders=0;
  const c={rt:{view:'home',speechId:'a',q:{quill:true}},getState:()=>state,setState:n=>state=n,$:s=>document.querySelector(s),icon:n=>`<i data-i="${n}"></i>`,getDrive:()=>null,closeModal(){},render(){renders++;},keepAwake(){},toast(){},lock:()=>()=>{},syncCurrent(){},persist(){runtime.retain();persisted=JSON.stringify(state);return true;},async flush(){return true;}};
  const runtime=createEditorRuntime(c);
  await runtime.navigate('editor','a');
  runtime.getEditor().delta={ops:[{insert:'Rascunho aberto\n'}]};
  c.persist(true);
  const next=clone(state);next.speeches[1]=editDoc(docB,'Texto B atualizado\n');
  assert.equal(await runtime.commitRestore(next,{preserveView:true,preserveEditorSpeechId:'a'}),true);
  assert.equal(c.rt.view,'editor');assert.equal(runtime.getEditor().id,'a');
  assert.equal(state.speeches[1].delta.ops[0].insert,'Texto B atualizado\n');
  assert.equal(renders,1);
  c.rt.view='reader';c.rt.speechId='a';c.rt.q=null;
  runtime.syncReaderDraftNotice();
  const notice=document.querySelector('.reader-draft-notice');
  assert(notice&&notice.textContent.includes('rascunho'));
  const nextReader=clone(state);nextReader.speeches[0]=editDoc(docA,'Texto A confirmado\n');nextReader.editorDrafts=[];
  assert.equal(await runtime.commitRestore(nextReader,{preserveView:true}),true);
  assert.equal(c.rt.view,'reader');
  runtime.syncReaderDraftNotice();
  assert.equal(document.querySelector('.reader-draft-notice'),null);
 }finally{dom.window.close();}
});

await check('Apple: indicador de rascunho nos cards reflete editorDrafts',async()=>{
 const f=fixture();
 try{
  await f.action('connect');
  const h=harnessFor(f,{cardDom:true});
  await h.ui.refreshCards();assert.equal(h.draftNode.hidden,true);
  const s=f.getState(),draft=clone(s.speeches[0]);draft.delta={ops:[{insert:'Rascunho iOS\n'}]};
  retainEditorDraft(s,s.speeches[0],draft);
  await h.ui.refreshCards();assert.equal(h.draftNode.hidden,false);
  s.editorDrafts=[];
  await h.ui.refreshCards();assert.equal(h.draftNode.hidden,true);
 }finally{f.dispose();}
});

await check('Apple: sincroniza ao vivo com app aberto sem trocar foco e recarrega editor sem alterações locais',async()=>{
 const docA=makeSpeech('prepared','Texto iOS inicial\n');
 const f=fixture();
 const origNow=Date.now;Date.now=()=>f.now();
 f.setState({schema:1,contentVersion:2,categories:[],speeches:[clone(docA)],settings:{theme:'light'},vocabulary:[]});
 let liveTick=null,dirtyEditor=false,h;
 try{
  await f.action('connect');await f.send();
  h=harnessFor(f,{view:'agenda',hasOpenEditorChanges:()=>dirtyEditor,intervalHook:fn=>{liveTick=fn;}});
  await until(()=>typeof liveTick==='function'&&!f.status().busy);
  const remoteAgenda=clone(f.getState());remoteAgenda.speeches[0]=editDoc(docA,'Editado no PC\n');
  await f.addRemote('remote-ios-agenda',JSON.stringify(remoteAgenda));
  f.advance(16000);liveTick();
  await until(()=>h.restores().length===1);
  assert.equal(h.rt.view,'agenda');
  assert.deepEqual(h.lastOptions(),{preserveView:true});
  assert.equal(f.getState().speeches[0].delta.ops[0].insert,'Editado no PC\n');

  const checksHidden=f.events.filter(e=>e.kind==='check').length;
  f.doc.hidden=true;f.advance(20000);liveTick();await new Promise(r=>setTimeout(r,15));
  assert.equal(f.events.filter(e=>e.kind==='check').length,checksHidden);
  f.doc.hidden=false;

  h.rt.view='editor';h.rt.speechId='prepared';h.rt.q={quill:true};dirtyEditor=false;
  const remoteClean=clone(f.getState());remoteClean.speeches[0]=editDoc(docA,'Atualizado no editor iPhone\n');
  await f.addRemote('remote-ios-clean',JSON.stringify(remoteClean));
  f.advance(16000);liveTick();
  await until(()=>h.restores().length===2);
  assert.deepEqual(h.lastOptions(),{preserveView:true,reloadEditorSpeechId:'prepared'});
  assert.equal(f.getState().speeches[0].delta.ops[0].insert,'Atualizado no editor iPhone\n');
 }finally{h?.ui?.dispose();Date.now=origNow;f.dispose();}
});

console.log('TOTAL '+checks.length);
