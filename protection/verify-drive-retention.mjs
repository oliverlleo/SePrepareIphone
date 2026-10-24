import assert from 'node:assert/strict';
import {createBrowserDrive} from './browser-drive.js';
import {newSpeech} from './core.js';
import {driveHash} from './drive-core.js';

const DAY=86400000,KEY='seprepare-drive-web-v1';
let checks=0;
const pass=message=>{checks++;console.log('PASS',message);};
async function fixture(count=0){
 const win=new EventTarget(),doc=new EventTarget(),values=new Map(),callbacks=[];
 win.navigator={onLine:true};doc.hidden=false;doc.hasFocus=()=>true;
 let now=1800000000000,sequence=0,requestId=0,state={schema:1,speeches:[newSpeech()],categories:[],settings:{theme:'light'},vocabulary:[]};
 state.speeches[0].title='Texto local';state.speeches[0].timer.active=false;state.speeches[0].delta={ops:[{insert:'Texto, formatação e notas continuam locais.\n',attributes:{bold:true}}]};
 const storage={fail:false,getItem:k=>values.get(k)||null,setItem(k,v){if(this.fail)throw Error('Storage unavailable');values.set(k,v);},removeItem:k=>values.delete(k)};
 const remote=[],contents=new Map(),calls=[],deleted=[];
 const envelope=async raw=>JSON.stringify({format:'seprepare-drive-backup',backupSchema:1,sha256:await driveHash(raw),state:raw});
 const metadata=async(id,time,raw)=>({id,name:'Backup pessoal.json',createdTime:new Date(time).toISOString(),appProperties:{seprepareBackup:'1',hash:await driveHash(raw),items:String(JSON.parse(raw).speeches.length),at:String(9000000000000-time)}});
 const previous=JSON.stringify({...state,speeches:[{...state.speeches[0],title:'Texto anterior'}]});
 for(let i=count;i>0;i--){const id='old'+i;remote.push(await metadata(id,now-100000+i,previous));contents.set(id,await envelope(previous));}
 const f={mode:'',pageSize:3,remote,contents,calls,deleted,values,storage,now:()=>now,advance:ms=>{now+=ms;},getState:()=>state,setState:value=>{state=value;},ids:()=>new Set(remote.map(f=>f.id))};
 const fetch=async(address,options)=>{
  calls.push({address,options});assert.equal(options.headers.Authorization,'Bearer TOKEN_SOMENTE_MEMORIA');assert(!address.includes('TOKEN_SOMENTE_MEMORIA'));
  const url=new URL(address),id=url.pathname.split('/').at(-1),method=options.method;
  if(url.pathname.endsWith('/about'))return Response.json({user:{emailAddress:'pessoa@example.test'}});
  if(method==='POST'){
   if(f.mode==='upload-failure')return new Response('{}',{status:503});
   const raw=options.body.split('Content-Type: application/json; charset=UTF-8\r\n\r\n')[2].split('\r\n--')[0],backup=JSON.parse(raw),id='saved'+(++sequence);
   assert.equal(backup.sha256,await driveHash(backup.state));const file=await metadata(id,now+sequence,backup.state);
   if(f.mode!=='new-not-visible')remote.unshift(file);contents.set(id,raw);
   if(f.mode==='edit-during-upload'){
    state.speeches[0].title='Texto alterado durante envio';
    drive.driveLocalSaved();
   }
   if(f.mode==='storage-after-upload')storage.fail=true;
   return Response.json(file);
  }
  if(method==='DELETE'){
   deleted.push(id);
   if(f.mode==='delete-failure')return new Response('{}',{status:503});
   if(f.mode==='delete-unauthorized')return new Response('{}',{status:401});
   const at=remote.findIndex(file=>file.id===id);if(at>=0)remote.splice(at,1);contents.delete(id);
   return new Response(null,{status:f.mode==='already-deleted'?404:204});
  }
  if(url.searchParams.has('alt'))return new Response(contents.get(id)||'{}');
  assert.equal(url.searchParams.get('spaces'),'appDataFolder');assert(url.searchParams.get('q').includes("key='seprepareBackup' and value='1'"));
  const latest=url.searchParams.get('pageSize')==='1',start=Number(url.searchParams.get('pageToken'))||0,size=latest?1:f.pageSize;
  if(!latest&&(f.mode==='list-failure'||f.mode==='page-failure'&&start>0))return new Response('{}',{status:503});
  const result={files:latest?remote.slice().sort((a,b)=>Date.parse(b.createdTime)-Date.parse(a.createdTime)).slice(0,1):remote.slice(start,start+size)};
  if(!latest&&start+size<remote.length)result.nextPageToken=String(start+size);
  if(!latest&&f.mode==='incomplete')result.incompleteSearch=true;
  if(!latest&&f.mode==='repeated-page')result.nextPageToken='0';
  return Response.json(result);
 };
 const identity={hasGrantedAllScopes:()=>true,initTokenClient:options=>({requestAccessToken:()=>queueMicrotask(()=>options.callback({access_token:'TOKEN_SOMENTE_MEMORIA',expires_in:86400,scope:options.scope}))})};
 const drive=createBrowserDrive({getState:()=>structuredClone(state),saveState:()=>true,environment:{requestGap:0,window:win,document:doc,storage,fetch,identity,now:()=>now,setInterval:fn=>{callbacks.push(fn);return {unref(){}};},clearInterval(){}}});
 const action=(kind,argument='')=>new Promise(resolve=>{const id=String(++requestId),listener=e=>{if(e.detail.kind===kind&&e.detail.requestId===id){win.removeEventListener('nativeDrive',listener);resolve(e.detail);}};win.addEventListener('nativeDrive',listener);drive.driveAction(kind,id,argument);});
 const send=async(enable=false)=>{const preview=await action('prepare-backup',enable?' {"enable":true}':'');assert(!preview.error,preview.error);return action('backup-confirm',JSON.stringify({ticket:preview.payload.ticket,localHash:await driveHash(JSON.stringify(state))}));};
 const automatic=()=>new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Automatic send did not complete')),2000),listener=e=>{if(e.detail.kind==='automatic'){clearTimeout(timeout);win.removeEventListener('nativeDrive',listener);resolve(e.detail);}};win.addEventListener('nativeDrive',listener);callbacks[0]();});
 Object.assign(f,{drive,action,send,automatic,tick:()=>callbacks[0](),status:()=>JSON.parse(drive.driveStatus()),dispose:()=>drive.dispose()});
 assert.equal((await action('connect')).status.connected,true);return f;
}

for(const count of [0,3,4,12]){
 const f=await fixture(count),original=structuredClone(f.getState()),result=await f.send();
 assert(!result.error,result.error);assert.equal(f.remote.length,Math.min(count+1,4));assert(f.ids().has('saved1'));assert(!f.status().backupCleanupPending);assert.deepEqual(f.getState(),original);
 if(count===4)assert(f.ids().has('old1'));
 if(count===12){assert.equal(f.deleted.length,9);assert(f.ids().has('old1'));}
 pass(`${count} cópias anteriores: envio confirmado mantém até quatro e preserva checkpoints distribuídos no tempo`);f.dispose();
}
{
 const f=await fixture(5);await f.action('list');await f.action('restore','old5');assert.equal(f.deleted.length,0);assert.equal(f.remote.length,5);f.dispose();pass('Conectar, listar e restaurar não removem cópias');
}
{
 const f=await fixture(1005);f.pageSize=100;const result=await f.action('list');assert.equal(result.files.length,1005);assert.equal(f.deleted.length,0);f.dispose();pass('Listagem paginada completa ultrapassa mil cópias sem truncar silenciosamente');
}
{
 const f=await fixture(5);f.remote.reverse();const result=await f.send();assert(!result.error);assert.equal(f.deleted.length,2);assert(f.ids().has('old1'));f.dispose();pass('Ordenação usa criação do Drive, mesmo com lista fora de ordem e relógio at divergente');
}
for(const mode of ['list-failure','page-failure','incomplete','repeated-page','new-not-visible']){
 const f=await fixture(4);f.mode=mode;const result=await f.send();assert(!result.error,result.error);assert.equal(result.payload.saved.id,'saved1');assert.equal(f.deleted.length,0);assert(f.status().backupCleanupPending);f.dispose();pass(`${mode}: backup válido e limpeza adiada sem exclusões`);
}
for(const type of ['marker','date','duplicate','invalid-id']){
 const f=await fixture(4),last=f.remote.at(-1);
 if(type==='marker')last.appProperties.seprepareBackup='other';if(type==='date')last.createdTime='bad-date';if(type==='duplicate')f.remote.push({...last});if(type==='invalid-id')last.id='../outside';
 const result=await f.send();assert(!result.error,result.error);assert.equal(f.deleted.length,0);assert(f.status().backupCleanupPending);f.dispose();pass(`Metadado ${type} impede exclusão de qualquer cópia`);
}
{
 const f=await fixture(4);f.mode='upload-failure';const result=await f.send();assert(result.error);assert.equal(f.deleted.length,0);assert.equal(f.remote.length,4);assert.equal(f.status().lastBackupAt,0);f.dispose();pass('Falha no upload preserva todas as cópias anteriores');
}
{
 const f=await fixture(4);f.mode='storage-after-upload';assert((await f.send()).error);assert.equal(f.remote.length,5);assert.equal(f.deleted.length,0);f.storage.fail=false;f.dispose();pass('Falha ao persistir registro do envio não remove backups');
}
{
 const f=await fixture(4);f.mode='delete-failure';const result=await f.send(true);assert(!result.error);assert.equal(f.remote.length,5);assert(f.status().backupCleanupPending);assert(f.ids().has('saved1'));
 f.mode='';f.advance(DAY+1);await f.action('connect');const posts=f.calls.filter(c=>c.options.method==='POST').length;await f.automatic();assert.equal(f.remote.length,4);assert(!f.status().backupCleanupPending);assert.equal(f.calls.filter(c=>c.options.method==='POST').length,posts);f.dispose();pass('Falha na limpeza não invalida envio; automático posterior retoma sem duplicar conteúdo idêntico');
}
{
 const f=await fixture(4);f.mode='delete-unauthorized';const result=await f.send();assert(!result.error);assert(f.status().backupCleanupPending);assert(f.status().needsReconnect);assert(f.ids().has('saved1'));assert.equal(f.calls.filter(c=>c.options.method==='POST').length,1);f.dispose();pass('Token expirado durante exclusão preserva upload e pede reconexão, sem repetir o envio');
}
{
 const f=await fixture(4);f.mode='already-deleted';assert(!(await f.send()).error);assert.equal(f.remote.length,4);assert(!f.status().backupCleanupPending);f.dispose();pass('HTTP 404 durante limpeza é idempotente quando outra sessão já removeu a cópia');
}
{
 const f=await fixture(7),raw=JSON.stringify(f.getState()),hash=await driveHash(raw);f.remote[0].appProperties.hash=hash;f.contents.set(f.remote[0].id,JSON.stringify({format:'seprepare-drive-backup',backupSchema:1,sha256:hash,state:raw}));const result=await f.send();assert(result.payload.saved.unchanged);assert.equal(f.calls.filter(c=>c.options.method==='POST').length,0);assert.equal(f.remote.length,4);f.dispose();pass('Confirmar backup já idêntico limpa o acúmulo sem criar outra cópia');
}
{
 const f=await fixture(4);await f.send(true);f.getState().speeches[0].title='Editado depois';f.advance(DAY+1);await f.action('connect');f.advance(10001);const result=await f.automatic();assert(!result.error,result.error);assert.equal(f.remote.length,4);assert(f.ids().has('saved2'));assert(f.ids().has('old1'));f.dispose();pass('Envio automático novo também mantém quatro cópias e preserva o conteúdo local');
}
{
 const f=await fixture(4);f.getState().speeches=[];const result=await f.send(true);assert(result.payload.saved.empty);assert.equal(f.deleted.length,0);assert.equal(f.remote.length,4);f.dispose();pass('Ativar envios com caderno vazio não envia nem limpa as cópias úteis existentes');
}
{
 const f=await fixture(4);await f.send();assert(!JSON.stringify([...f.values]).includes('TOKEN_SOMENTE_MEMORIA'));assert(f.calls.every(c=>!String(c.options.body||'').includes('TOKEN_SOMENTE_MEMORIA')));assert(f.calls.filter(c=>c.options.method==='DELETE').every(c=>c.options.credentials==='omit'&&c.options.redirect==='error'));assert.equal(JSON.parse(f.values.get(KEY)).data.backupCleanupPending,false);f.dispose();pass('Tokens ficam só em memória/cabeçalho; nenhuma nova permissão ou persistência de credenciais');
}
console.log(`TOTAL ${checks} verificações da retenção de backups web passaram.`);
