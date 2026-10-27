import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture,until} from './drive-web-fixture.mjs';
import {createDriveUI} from './drive-ui.js';
import {clone,captureContentVersion} from './core.js';
import {backupStateHash} from './drive-backup-state.js';
const checks=[];async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
const change=(f,value)=>{const state=clone(f.getState());state.speeches[0].delta={ops:[{insert:value+'\n'}]};captureContentVersion(state.speeches[0]);f.setState(state);return state;};
async function prepared(){const f=fixture();change(f,'1');await f.action('connect');await f.action('auto-read','false');await f.send();f.advance(10000);return f;}
function uiFor(f){
 globalThis.window=f.win;globalThis.document=f.doc;f.doc.documentElement={lang:'pt-BR'};f.doc.querySelectorAll=()=>[];
 let modal=null,restores=0;const rt={view:'settings',modal:null},shell={classList:{add(){}}};
 const ui=createDriveUI({native:{...f.drive,driveTakeOffer:()=>false},rt,$:s=>s==='.modal'?shell:s==='.modal-backdrop'?(modal?shell:null):null,icon:String,btn:(action,label)=>`<button data-action="${action}">${label}</button>`,esc:String,openModal:(title,body,footer)=>modal={title,body,footer},closeModal:()=>{modal=null;rt.modal=null;},toast:()=>{},readable:()=>true,getState:f.getState,persist:()=>{f.drive.driveLocalSaved('user',JSON.stringify(f.getState()));return true;},commitRestore:state=>{restores++;f.setState(state);f.drive.driveLocalSaved('manual-restore',JSON.stringify(state));return true;}});
 ui.start();ui.handle('drive-settings');return {ui,rt,modal:()=>modal,restores:()=>restores};
}
await check('Abrir e sair sem edição não gera envio; alteração real gera backup automático',async()=>{
 const f=await prepared();try{const before=f.uploads();await f.drive.driveLocalSaved('user',JSON.stringify(f.getState()));await f.run();assert.equal(f.uploads(),before);change(f,'12');await f.drive.driveLocalSaved('user',JSON.stringify(f.getState()));assert.equal(f.status().backupPending,true);assert([...f.scheduled.values()].some(item=>item.delay===0));await f.run();assert.equal(f.uploads(),before+1);const raw=JSON.parse(f.contents.get(f.remote[0].id)).state;assert.equal(JSON.parse(raw).speeches[0].delta.ops[0].insert,'12\n');assert.equal(f.status().backupPending,false);}finally{f.dispose();}
});
await check('Salvar sem raw e voltar ao aplicativo não reutilizam snapshot antigo',async()=>{
 const f=await prepared();try{await f.drive.driveLocalSaved('user',JSON.stringify(f.getState()));change(f,'12');await f.save();assert.equal(f.status().backupPending,true);await f.run();assert.equal(f.status().backupPending,false);f.advance(10000);change(f,'123');f.win.dispatchEvent(new Event('focus'));await until(()=>!f.status().backupPending&&!f.status().busy&&f.uploads()===3);assert.equal(JSON.parse(JSON.parse(f.contents.get(f.remote[0].id)).state).speeches[0].delta.ops[0].insert,'123\n');}finally{f.dispose();}
});
await check('Tela de salvar cópia envia 12 e dispositivo B recupera 12 sem conflito falso',async()=>{
 const a=await prepared(),b=await prepared();try{const h=uiFor(a);change(a,'12');await a.save();h.ui.handle('drive-backup');await until(()=>h.rt.modal==='drive-review');assert(!h.modal().body.includes('name="drivePolicy"'));const sent=a.uploads();h.ui.handle('drive-apply');await until(()=>a.uploads()===sent+1&&!a.status().busy);assert.equal(h.restores(),0);assert.equal(a.getState().speeches[0].delta.ops[0].insert,'12\n');const latest=a.remote[0],wire=JSON.parse(a.contents.get(latest.id)).state;assert.equal(JSON.parse(wire).speeches[0].delta.ops[0].insert,'12\n');
 // Both installations share the same document/version IDs from the common copy.
 const old=clone(JSON.parse(wire));old.speeches[0].delta={ops:[{insert:'1\n'}]};captureContentVersion(old.speeches[0]);b.setState(old);const baseline=await b.action('prepare-backup');await b.action('backup-confirm',JSON.stringify({ticket:baseline.payload.ticket,localHash:await import('./drive-core.js').then(m=>m.driveHash(JSON.stringify(old)))}));
 await b.addRemote('from-device-a',wire);const v=uiFor(b);v.ui.handle('drive-preview','from-device-a');await until(()=>v.rt.modal==='drive-review');assert(!v.modal().body.includes('name="drivePolicy"'));v.ui.handle('drive-apply');await until(()=>v.restores()===1);assert.equal(b.getState().speeches[0].delta.ops[0].insert,'12\n');await until(()=>!b.status().backupPending);assert.equal(await backupStateHash(b.getState()),await backupStateHash(wire));const before=b.uploads();await b.run();assert.equal(b.uploads(),before);
 }finally{a.dispose();b.dispose();}
});
await check('Edição durante envio continua pendente e a próxima cópia contém a alteração',async()=>{
 const f=await prepared();try{change(f,'12');await f.save();f.hooks.upload=async()=>{f.hooks.upload=null;change(f,'123');await f.save();};await f.run();assert.equal(f.status().backupPending,true);assert.equal(JSON.parse(JSON.parse(f.contents.get(f.remote[0].id)).state).speeches[0].delta.ops[0].insert,'12\n');f.advance(10000);await f.run();assert.equal(f.status().backupPending,false);assert.equal(JSON.parse(JSON.parse(f.contents.get(f.remote[0].id)).state).speeches[0].delta.ops[0].insert,'123\n');}finally{f.dispose();}
});
await check('Falha de envio não confirma nuvem; nova tentativa preserva o texto atual',async()=>{
 const f=await prepared();try{change(f,'12');await f.save();f.faults.uploads=1;const before=f.status().lastConfirmedHash;await f.run();assert(f.status().backupPending);assert.equal(f.status().lastConfirmedHash,before);assert.equal(f.getState().speeches[0].delta.ops[0].insert,'12\n');f.advance(10000);await f.run();assert.equal(f.status().backupPending,false);}finally{f.dispose();}
});
await check('Nova cópia remota durante confirmação volta à prévia sem recuperar texto local',async()=>{
 const f=await prepared();try{const h=uiFor(f);change(f,'12');await f.save();h.ui.handle('drive-backup');await until(()=>h.rt.modal==='drive-review');const other=clone(f.getState());other.speeches[0].delta={ops:[{insert:'Outro aparelho\n'}]};captureContentVersion(other.speeches[0]);await f.addRemote('new-head',JSON.stringify(other));h.ui.handle('drive-apply');await until(()=>f.events.some(e=>e.kind==='backup-confirm'&&e.payload?.mode==='backup-review'));assert.equal(h.rt.modal,'drive-review');assert.equal(h.restores(),0);assert.equal(f.getState().speeches[0].delta.ops[0].insert,'12\n');const before=f.uploads();h.ui.handle('drive-apply');await until(()=>f.uploads()===before+1&&!f.status().busy);assert.equal(h.restores(),0);assert.equal(JSON.parse(JSON.parse(f.contents.get(f.remote[0].id)).state).speeches[0].delta.ops[0].insert,'12\n');}finally{f.dispose();}
});
fs.writeFileSync(new URL('QA-backup-live-flow-1.0.66.json',import.meta.url),JSON.stringify({success:true,checks,realGoogle:false},null,2));
