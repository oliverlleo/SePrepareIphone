import assert from 'node:assert/strict';
import {newSpeech,validState,clone} from './core.js';
import {prepareFileBackup} from './file-backup.js';
import {importFileBackup} from './file-backup-ui.js';
function state(prefix,categories=0){const doc=newSpeech();doc.id=prefix;return validState({schema:1,speeches:[doc],categories:Array.from({length:categories},(_,i)=>({id:prefix+i,name:prefix+i})),settings:{},vocabulary:[]});}
function harness(local,incoming){
 let current=clone(local),stored=JSON.stringify(local),pending=null,failSave=false,failFlush=false,preflight=true,closed=false,hold=null,commits=0;
 const rt={importBackup:incoming},notices=[];
 const c={rt,getState:()=>current,setState:s=>{current=s;},persist:()=>preflight,isCurrent:()=>!closed,prepare:()=>{},
  save(raw){if(failSave&&raw!==JSON.stringify(local))return false;pending=raw;return true;},
  async flush(){if(hold){const wait=hold;hold=null;await wait;}if(pending){stored=pending;pending=null;if(failFlush){failFlush=false;return false;}}return stored===JSON.stringify(current);},
  commit(){commits++;},done:n=>notices.push('success:'+n),fail:message=>notices.push(message),lock:()=>()=>{}};
 return {c,rt,notices,run:()=>importFileBackup(c),state:()=>current,read:()=>JSON.parse(stored),commits:()=>commits,failSave:()=>{failSave=true;},failFlush:()=>{failFlush=true;},preflightFail:()=>{preflight=false;},close:()=>{closed=true;},hold(){let release;hold=new Promise(r=>{release=r;});return release;},retry:()=>{failSave=false;}};
}
const checks=[];async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
await check('Apple: 300 categorias persistem e reabrem',async()=>{const h=harness(state('local',299),state('remote',1));assert(await h.run());assert.equal(h.read().categories.length,300);validState(h.read());});
await check('Apple: 301 categorias não mudam nenhuma cópia',async()=>{const local=state('local',300),h=harness(local,state('remote',1));assert.equal(await h.run(),false);assert.deepEqual(h.state(),local);assert.deepEqual(h.read(),local);});
await check('Apple: confirmação assíncrona precede sucesso',async()=>{const h=harness(state('local'),state('remote')),release=h.hold(),job=h.run();assert.equal(h.commits(),0);assert(!h.notices.length);assert.equal(await h.run(),false);release();assert(await job);assert.equal(h.commits(),1);assert.equal(h.read().speeches.length,2);});
await check('Apple: falha síncrona preserva arquivo e permite nova tentativa',async()=>{const local=state('local'),h=harness(local,state('remote'));h.failSave();assert.equal(await h.run(),false);assert.deepEqual(h.read(),local);assert(h.rt.importBackup);h.retry();assert(await h.run());assert.equal(await h.run(),false);assert.equal(h.read().speeches.length,2);});
await check('Apple: confirmação parcial falha e restaura a base',async()=>{const local=state('local'),h=harness(local,state('remote'));h.failFlush();assert.equal(await h.run(),false);assert.deepEqual(h.state(),local);assert.deepEqual(h.read(),local);assert.equal(h.commits(),0);assert(!h.notices.some(n=>n.startsWith('success:')));assert(h.rt.importBackup);});
await check('Apple: falha da edição pendente não começa a mesclagem',async()=>{const local=state('local'),h=harness(local,state('remote'));h.preflightFail();assert.equal(await h.run(),false);assert.deepEqual(h.read(),local);});
await check('Apple: cancelar durante a espera não grava candidato',async()=>{const local=state('local'),h=harness(local,state('remote')),release=h.hold(),job=h.run();h.close();release();assert.equal(await job,false);assert.deepEqual(h.read(),local);});
await check('Apple: planejamento preserva os dois originais',()=>{const local=state('local'),remote=state('remote'),before=[JSON.stringify(local),JSON.stringify(remote)];prepareFileBackup(local,remote);assert.deepEqual([JSON.stringify(local),JSON.stringify(remote)],before);});
console.log(JSON.stringify({success:true,checks,realIPhone:false,storage:'simulated async confirmation; protected host checked separately'}));
