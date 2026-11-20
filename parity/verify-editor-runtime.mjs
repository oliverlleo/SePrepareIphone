import assert from 'node:assert/strict';import fs from 'node:fs';
import {JSDOM} from '../qa/time-dom/node_modules/jsdom/lib/api.js';
import {newSpeech,validState,clone} from '../protection/core.js';
import {createEditorRuntime} from './runtime.js';
const dom=new JSDOM('<header class="editor-top"><div class="editor-name"><span class="name"></span></div><button class="editor-save"><span>Salvar</span></button><span id="saveStatus"></span></header>',{url:'https://qa.invalid'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document});Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});window.scrollTo=()=>{};
const checks=[];async function test(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
function harness(){const doc=newSpeech();doc.id='editor-fixture';doc.title='original';let state=validState({schema:1,speeches:[doc],categories:[],settings:{language:'pt-BR'}}),stored=JSON.stringify(state),pending=stored,runtime;
 const c={rt:{view:'home',speechId:doc.id,q:null},getState:()=>state,setState:next=>state=next,$:selector=>document.querySelector(selector),icon:()=>'',getDrive:()=>null,closeModal(){},render(){runtime.mountEditor();},keepAwake(){},toast(){},lock:()=>()=>{},syncCurrent(){},persist(){runtime.prepareSave();runtime.retain();pending=JSON.stringify(state);runtime.observeSave(pending,true,'user');return true;},async flush(){if(c.hold)await c.hold;if(c.fail?.(JSON.parse(pending)))return false;stored=pending;return true;}};
 runtime=createEditorRuntime(c);return {runtime,c,state:()=>state,stored:()=>JSON.parse(stored),persist:()=>c.persist(true)};
}
await test('Apple: rascunho usa a fila local e mantém apresentação confirmada',async()=>{const h=harness();await h.runtime.navigate('editor');h.runtime.getEditor().title='draft';h.persist();await h.c.flush();assert.equal(h.stored().speeches[0].title,'original');assert.equal(h.stored().editorDrafts[0].document.title,'draft');});
await test('Apple: confirmação falha na fila, preserva apresentação e rascunho',async()=>{const h=harness();await h.runtime.navigate('editor');h.runtime.getEditor().title='draft';h.c.fail=state=>state.speeches[0].title==='draft';assert.equal(await h.runtime.confirm(),false);assert.equal(h.state().speeches[0].title,'original');assert.equal(h.runtime.getEditor().title,'draft');assert.equal(h.stored().editorDrafts[0].document.title,'draft');assert.equal(document.querySelector('.editor-save').dataset.action,'save-editor');});
await test('Apple: espera comprovante antes de habilitar Visualizar e impede confirmação dupla',async()=>{const h=harness();await h.runtime.navigate('editor');h.runtime.getEditor().title='draft';h.runtime.updateSaveButton();let release;h.c.hold=new Promise(r=>release=r);const confirming=h.runtime.confirm();assert.equal(await h.runtime.confirm(),false);assert(document.querySelector('.editor-save').disabled);assert.notEqual(document.querySelector('.editor-save').dataset.action,'present');release();assert(await confirming);assert.equal(h.stored().speeches[0].title,'draft');assert.equal(h.stored().editorDrafts.length,0);assert.equal(document.querySelector('.editor-save').dataset.action,'present');assert(!document.querySelector('.editor-save').disabled);});
await test('Apple: navegação bloqueada na falha mantém editor e texto em memória',async()=>{const h=harness();await h.runtime.navigate('editor');h.runtime.getEditor().title='draft';h.c.fail=()=>true;assert.equal(await h.runtime.navigate('reader'),false);assert.equal(h.c.rt.view,'editor');assert.equal(h.runtime.getEditor().title,'draft');});
await test('Apple: restaurar caderno não projeta o editor antigo nos dados recebidos',async()=>{const h=harness();await h.runtime.navigate('editor');h.runtime.getEditor().title='draft';const next=clone(h.state());next.speeches[0].title='restored';assert(await h.runtime.commitRestore(next));assert.equal(h.stored().speeches[0].title,'restored');assert.equal(h.c.rt.view,'home');assert.equal(h.runtime.getEditor(),null);});
await test('Apple: falha de restauração conserva base anterior e projeção editável',async()=>{const h=harness();await h.runtime.navigate('editor');h.runtime.getEditor().title='draft';const next=clone(h.state());next.speeches[0].title='restored';h.c.fail=state=>state.speeches[0].title==='restored';assert.equal(await h.runtime.commitRestore(next),false);assert.equal(h.state().speeches[0].title,'original');assert.equal(h.runtime.getEditor().title,'draft');});
await test('Apple: data de Agenda é salva sem confirmar o texto do rascunho',async()=>{
 const h=harness(),date=Date.UTC(2026,11,20,15);
 h.state().speeches[0].reminders=[10080,42];
 await h.runtime.navigate('editor');h.runtime.getEditor().title='draft';
 assert(await h.runtime.saveAgendaDate('editor-fixture',date));
 const saved=h.stored();
 assert.equal(saved.speeches[0].scheduledAt,date);
 assert.equal(saved.speeches[0].title,'original');
 assert.deepEqual(saved.speeches[0].reminders,[10080,42]);
 assert.equal(saved.editorDrafts[0].document.title,'draft');
 assert.equal(saved.editorDrafts[0].document.scheduledAt,date);
});
await test('Apple: falha ao alterar data mantém a Agenda e o rascunho anteriores',async()=>{
 const h=harness(),date=Date.UTC(2026,11,20,15),next=date+60000;
 await h.runtime.navigate('editor');h.runtime.getEditor().title='draft';
 assert(await h.runtime.saveAgendaDate('editor-fixture',date));
 h.c.fail=state=>state.speeches[0].scheduledAt===next;
 assert.equal(await h.runtime.saveAgendaDate('editor-fixture',next),false);
 assert.equal(h.stored().speeches[0].scheduledAt,date);
 assert.equal(h.runtime.getEditor().scheduledAt,date);
 assert.equal(h.state().editorDrafts[0].document.title,'draft');
 await h.runtime.navigate('agenda');
 assert(await h.runtime.saveAgendaDate('editor-fixture',0));
 assert.equal(h.stored().speeches[0].scheduledAt,0);
 assert.equal(h.stored().editorDrafts[0].document.scheduledAt,0);
});
fs.writeFileSync(new URL('./QA-editor-runtime.json',import.meta.url),JSON.stringify({success:true,checks,realIPhone:false},null,2));dom.window.close();
