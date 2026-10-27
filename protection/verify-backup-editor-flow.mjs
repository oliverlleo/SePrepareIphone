import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createDriveUI} from './drive-ui.js';
import {newSpeech,clone,ensureVersions,captureContentVersion} from './core.js';
import {driveIndex,driveHash} from './drive-core.js';
import {backupContentIndex} from './drive-backup-state.js';
const checks=[],failures=[];
const wait=async predicate=>{for(let i=0;i<200;i++){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,2));}throw Error('Operação não terminou.');};
async function check(name,fn){try{await fn();checks.push(name);console.log('PASS '+name);}catch(e){failures.push(name+': '+e.message);console.error('FAIL '+name+': '+e.stack);}}
const first=newSpeech();first.id='cross-device';first.delta={ops:[{insert:'1\n'}]};ensureVersions(first);captureContentVersion(first);
const base={schema:1,contentVersion:2,categories:[],speeches:[first],settings:{},vocabulary:[]};
const text=value=>{const state=clone(base);state.speeches[0].delta={ops:[{insert:value+'\n'}]};captureContentVersion(state.speeches[0]);return state;};
const ledger=async(local,remote=local)=>({account:'person@example.test',id:'common',local:await driveIndex(local),remote:await driveIndex(remote)});
function harness(initial,baseline=null){
 let state=clone(initial),modal=null,receipt=null,restores=0,prepares=0,status={connected:true,email:'person@example.test',busy:false,autoRead:false,autoBackup:true,lastCheckAttemptAt:Date.now()},ack=null;
 const actions=[],notices=[],card={dataset:{driveDocument:'cross-device'},isConnected:true,setAttribute(key,value){this[key]=value;}};
 const win=new EventTarget(),doc=new EventTarget();doc.hidden=false;doc.documentElement={lang:'pt-BR'};doc.querySelectorAll=()=>[card];globalThis.window=win;globalThis.document=doc;
 const shell={classList:{add(){}}},empty={checked:false};
 const rt={view:'settings',modal:null},native={driveStatus:()=>JSON.stringify(status),driveAction:(kind,id,arg)=>actions.push({kind,id,arg}),driveTakeOffer:()=>false,drivePending:()=>'',driveReadBaseline:()=>JSON.stringify(baseline||{}),driveBackupIndex:()=>JSON.stringify(receipt||{}),drivePrepareRestore:()=>{prepares++;return true;},driveCompleteRead:raw=>{ack=JSON.parse(raw);return true;}};
 const ui=createDriveUI({native,rt,$:selector=>selector==='.modal'?shell:selector==='.modal-backdrop'?(modal?shell:null):selector==='#driveEmptyApproved'?empty:null,icon:name=>name,btn:(action,label)=>`<button data-action="${action}">${label}</button>`,esc:String,openModal:(title,body,footer)=>{modal={title,body,footer};},closeModal:()=>{modal=null;rt.modal=null;},toast:value=>notices.push(value),getState:()=>state,persist:()=>true,readable:()=>true,commitRestore:value=>{restores++;state=value;return true;}});
 ui.start();ui.handle('drive-settings');
 const event=(kind,payload)=>{const last=actions.at(-1);win.dispatchEvent(new CustomEvent('nativeDrive',{detail:{kind,requestId:last?.id||'',status,payload}}));};
 return {ui,rt,native,card,actions,notices,event,getState:()=>state,setState:value=>state=value,getModal:()=>modal,getRestores:()=>restores,getPrepares:()=>prepares,getAck:()=>ack,setReceipt:value=>receipt=value,empty};
}
await check('Salvar uma cópia nunca recupera um texto antigo antes de enviar',async()=>{
 const current=text('12'),h=harness(current,await ledger(current,text('0')));h.ui.handle('drive-backup');h.event('prepare-backup',{mode:'backup-review',ticket:'t1',id:'remote',account:'person@example.test',state:JSON.stringify(base)});
 await wait(()=>h.rt.modal==='drive-review'||h.actions.some(a=>a.kind==='backup-confirm'));
 if(!h.actions.some(a=>a.kind==='backup-confirm'))h.ui.handle('drive-apply');
 await wait(()=>h.getRestores()>0||h.actions.some(a=>a.kind==='backup-confirm'));
 assert.equal(h.getRestores(),0);assert.equal(h.getPrepares(),0);assert.equal(h.getState().speeches[0].delta.ops[0].insert,'12\n');
 const sent=JSON.parse(h.actions.find(a=>a.kind==='backup-confirm').arg);assert.equal(sent.localHash,await driveHash(JSON.stringify(current)));
});
await check('Recuperação manual unilateral usa a base comum sem inventar conflito',async()=>{
 const h=harness(base,await ledger(base));h.ui.handle('drive-preview','newer');h.event('restore',{id:'newer',account:'person@example.test',state:JSON.stringify(text('12'))});
 await wait(()=>h.rt.modal==='drive-review');assert(!h.getModal().body.includes('name="drivePolicy"'));h.ui.handle('drive-apply');await wait(()=>h.getAck());assert.equal(h.getState().speeches[0].delta.ops[0].insert,'12\n');assert.equal(h.getState().speeches[0].versions.length,1);
});
await check('Edições concorrentes continuam pedindo escolha e preservam as duas versões',async()=>{
 const h=harness(text('Local'),await ledger(base));h.ui.handle('drive-preview','concurrent');h.event('restore',{id:'concurrent',account:'person@example.test',state:JSON.stringify(text('Remoto'))});await wait(()=>h.rt.modal==='drive-review');assert(h.getModal().body.includes('name="drivePolicy"'));h.ui.handle('drive-apply');await wait(()=>h.getAck());const d=h.getState().speeches[0];assert.equal(d.delta.ops[0].insert,'Local\n');assert(d.versions.some(v=>v.delta.ops[0].insert==='Remoto\n'));
});
await check('Indicador só fica salvo para o conteúdo exato da edição confirmada',async()=>{
 const h=harness(base),index=await backupContentIndex(base);h.setReceipt({account:'person@example.test',documents:index.documents});await h.ui.refreshCards();assert(h.card.className.endsWith('saved'));h.setState(text('12'));await h.ui.refreshCards();assert(h.card.className.endsWith('pending'));h.setReceipt({account:'person@example.test',documents:(await backupContentIndex(h.getState())).documents});await h.ui.refreshCards();assert(h.card.className.endsWith('saved'));
});
await check('Caderno vazio exige autorização para envio manual e não recupera por engano',async()=>{
 const empty={...clone(base),speeches:[]},h=harness(empty);h.ui.handle('drive-backup');h.event('prepare-backup',{mode:'backup-review',ticket:'empty',id:'remote',account:'person@example.test',state:JSON.stringify(base)});await wait(()=>h.rt.modal==='drive-review');h.ui.handle('drive-apply');await new Promise(resolve=>setTimeout(resolve,15));assert(!h.actions.some(a=>a.kind==='backup-confirm'));assert.equal(h.getRestores(),0);h.empty.checked=true;h.ui.handle('drive-apply');await wait(()=>h.actions.some(a=>a.kind==='backup-confirm'));assert.equal(h.getState().speeches.length,0);
});
await check('Edição após a prévia exige nova confirmação e envia somente o novo snapshot',async()=>{
 const h=harness(text('12'));h.ui.handle('drive-backup');h.event('prepare-backup',{mode:'backup-review',ticket:'changed',id:'remote',account:'person@example.test',state:JSON.stringify(base)});await wait(()=>h.rt.modal==='drive-review');h.setState(text('123'));h.ui.handle('drive-apply');await new Promise(resolve=>setTimeout(resolve,15));assert(!h.actions.some(a=>a.kind==='backup-confirm'));assert.equal(h.getRestores(),0);h.ui.handle('drive-apply');await wait(()=>h.actions.some(a=>a.kind==='backup-confirm'));assert.equal(JSON.parse(h.actions.find(a=>a.kind==='backup-confirm').arg).localHash,await driveHash(JSON.stringify(h.getState())));assert.equal(h.getState().speeches[0].delta.ops[0].insert,'123\n');
});
fs.writeFileSync(new URL('QA-backup-editor-flow-1.0.66.json',import.meta.url),JSON.stringify({success:!failures.length,checks,failures,realGoogle:false},null,2));
if(failures.length)process.exitCode=1;
