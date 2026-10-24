import assert from 'node:assert/strict';
import {createBrowserDrive} from './browser-drive.js';
import {newSpeech,ensureVersions,captureContentVersion} from './core.js';
import {driveHash} from './drive-core.js';
export const DRIVE_KEY='seprepare-drive-web-v1';
export async function until(predicate){for(let i=0;i<200;i++){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,2));}throw Error('Estado esperado não foi atingido.');}
export function fixture({linked=false,values=new Map(),requestGap=0,silentError=false,indexedDB,cache,locks,canWrite,authorization}={}){
 let clock=1800000000000,sequence=0,state={schema:1,contentVersion:2,speeches:[],categories:[],settings:{theme:'light'},vocabulary:[]},tick=()=>{},requestId=0;
 const document=newSpeech();document.id='prepared';document.title='Texto local';document.delta={ops:[{insert:'Conteúdo preservado.\n'}]};ensureVersions(document);captureContentVersion(document);state.speeches.push(document);
 if(linked)values.set(DRIVE_KEY,JSON.stringify({version:1,data:{connected:true,email:'pessoa@example.test'}}));
 const win=new EventTarget(),doc=new EventTarget();win.navigator={onLine:true,...(locks?{locks}:{})};doc.hidden=false;doc.hasFocus=()=>true;
 const storage={fail:false,getItem:key=>values.get(key)||null,setItem(key,value){if(this.fail)throw Error('Quota');values.set(key,value);},removeItem:key=>values.delete(key)};
 const events=[],calls=[],remote=[],contents=new Map(),scheduled=new Map(),faults={lists:0,uploads:0,unauthorized:0,quota:false},hooks={};
 win.addEventListener('nativeDrive',event=>events.push(event.detail));
 const oauth={silentError,email:'pessoa@example.test',grant:true,cancel:false,requests:[],initTokenClient(options){return {requestAccessToken(override={}){oauth.requests.push({options,override});if(oauth.hold)return;queueMicrotask(()=>oauth.cancel?options.error_callback({type:'popup_closed'}):override.prompt==='none'&&oauth.silentError?options.callback({error:'interaction_required'}):options.callback({access_token:'TEST_MEMORY_TOKEN_'+oauth.requests.length,expires_in:3600,scope:options.scope}));}};},hasGrantedAllScopes:()=>oauth.grant};
 const fetch=async(address,options)=>{
  calls.push({address,options,at:clock});assert.match(options.headers.Authorization,/^Bearer TEST_MEMORY_TOKEN_/);assert(!address.includes('TEST_MEMORY_TOKEN_'));
  const url=new URL(address),method=options.method,id=url.pathname.split('/').at(-1);
  if(url.pathname.endsWith('/about')){await hooks.account?.();return Response.json({user:{emailAddress:oauth.email}});}
  if(faults.abort){faults.abort=false;throw new DOMException('The operation was aborted.','AbortError');}
  if(faults.unauthorized){faults.unauthorized--;return Response.json({error:{errors:[{reason:'authError'}]}},{status:401});}
  if(method==='POST'){
   if(faults.uploads){faults.uploads--;throw Error('Offline');}
   if(faults.quota)return Response.json({error:{errors:[{reason:'storageQuotaExceeded'}]}},{status:403});
   const chunks=options.body.split('Content-Type: application/json; charset=UTF-8\r\n\r\n'),meta=JSON.parse(chunks[1].split('\r\n--')[0]),envelope=JSON.parse(chunks[2].split('\r\n--')[0]);
   assert.equal(envelope.sha256,await driveHash(envelope.state));
   const file={id:'saved-'+(++sequence),createdTime:new Date(clock).toISOString(),appProperties:meta.appProperties};remote.unshift(file);contents.set(file.id,JSON.stringify(envelope));await hooks.upload?.(file,envelope.state);return Response.json(file);
  }
  if(method==='DELETE'){const index=remote.findIndex(file=>file.id===id);if(index<0)return new Response('',{status:404});remote.splice(index,1);contents.delete(id);return new Response(null,{status:204});}
  if(url.searchParams.has('alt'))return new Response(contents.get(id)||'{}');
  if(faults.lists){faults.lists--;throw Error('Offline');}
  const latest=url.searchParams.get('pageSize')==='1';if(!latest)await hooks.cleanup?.();
  return Response.json({files:latest?remote.slice(0,1):remote});
 };
 const drive=createBrowserDrive({canWrite,getState:()=>structuredClone(state),saveState:()=>!storage.fail,environment:{window:win,document:doc,storage,identity:oauth,fetch,now:()=>clock,requestGap,sleep:async ms=>{clock+=ms;},...(authorization?{authorization}:{}),...(indexedDB?{indexedDB}:{}),...(cache?{receiptCache:cache}:{}),setInterval:fn=>{tick=fn;return {unref(){}};},clearInterval(){},setTimeout:(fn,delay)=>{const key={unref(){}};scheduled.set(key,{fn,delay});return key;},clearTimeout:key=>scheduled.delete(key)}});
 const action=(kind,argument='')=>new Promise(resolve=>{const id=String(++requestId),listener=event=>{if(event.detail.kind===kind&&event.detail.requestId===id){win.removeEventListener('nativeDrive',listener);resolve(event.detail);}};win.addEventListener('nativeDrive',listener);drive.driveAction(kind,id,argument);});
 const status=()=>JSON.parse(drive.driveStatus());
 const run=async()=>{const before=events.length;await drive.driveRunPending();return events.slice(before).findLast(event=>event.kind==='automatic')||{skipped:true,status:status()};};
 const send=async()=>{const result=await action('prepare-backup');assert(!result.error,result.error);return action('backup-confirm',JSON.stringify({ticket:result.payload.ticket,localHash:await driveHash(JSON.stringify(state))}));};
 const addRemote=async(id,raw,extras={})=>{const hash=await driveHash(raw);remote.unshift({id,createdTime:new Date(clock).toISOString(),appProperties:{seprepareBackup:'1',hash,at:String(clock),...extras}});contents.set(id,JSON.stringify({format:'seprepare-drive-backup',backupSchema:1,sha256:hash,state:raw}));};
 return {drive,win,doc,values,storage,events,calls,remote,contents,oauth,faults,hooks,scheduled,action,status,run,send,addRemote,advance:ms=>{clock+=ms;},now:()=>clock,tick:()=>tick(),getState:()=>state,setState:value=>{state=value;},save:()=>drive.driveLocalSaved(),uploads:()=>calls.filter(call=>call.options.method==='POST').length,dispose:()=>drive.dispose()};
}
