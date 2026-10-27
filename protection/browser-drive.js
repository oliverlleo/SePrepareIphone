import * as SPLocale from './i18n.js';
import {validState} from './core.js';
import {driveHash} from './drive-core.js';
import {backupStateHash,backupDocumentHash,backupContentIndex} from './drive-backup-state.js';
import {DRIVE_BACKUP_GAP,driveRetryDelay,driveBackupDue,retainedDriveCopies,createDriveReceiptCache} from './browser-drive-state.js';

export const BROWSER_DRIVE_CLIENT_ID='4184165315-bjgek38jqbhjb2v8bggfh9ib7f84n33k.apps.googleusercontent.com';
const SCOPE='https://www.googleapis.com/auth/drive.appdata';
const SCOPES=[SCOPE];
const KEY='seprepare-drive-web-v1',RECOVERY_KEY=KEY+'-recovery';
const LIMIT=12000000,WIRE_LIMIT=26000000,READ_GAP=900000;
const API='https://www.googleapis.com/drive/v3',UPLOAD='https://www.googleapis.com/upload/drive/v3';
const fields='id,name,createdTime,size,appProperties';
const query="trashed = false and appProperties has { key='seprepareBackup' and value='1' }";
const byteLength=text=>new TextEncoder().encode(text).length;
const copy=value=>JSON.parse(JSON.stringify(value));
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,200}$/.test(id);
const defaults=()=>({connected:false,email:'',autoBackup:true,autoRead:true,lastAutoAttemptAt:0,lastBackupFinishedAt:0,lastChangeAt:0,lastChangeOrigin:'internal',backupPending:false,pendingSinceAt:0,backupRetryAt:0,backupFailures:0,backupBlocked:false,blockedReason:'',lastConfirmedAt:0,lastConfirmedHash:'',observedHash:'',lastCleanupAttemptAt:0,needsReview:false,hasRemote:false,backupCleanupPending:false,lastBackupAt:0,lastReadAt:0,lastRestoredAt:0,lastReadOutcome:'',lastCheckedAt:0,lastCheckAttemptAt:0,lastReadId:'',lastUploadedId:'',lastUploadHash:'',approvedRemoteId:'',offerSeen:false});
const failure=(message,code='backup')=>Object.assign(new Error(message),{code});
let lastValidatedRaw=null;
function validateRaw(raw){
 if(raw===lastValidatedRaw)return JSON.parse(raw);
 if(typeof raw!=='string'||byteLength(raw)>LIMIT)throw failure('O caderno ultrapassa o tamanho permitido.');
 let state;try{state=JSON.parse(raw);validState(copy(state));lastValidatedRaw=raw;}catch{throw failure(SPLocale.t('Este arquivo não é um backup compatível do SePrepare.'));}return state;
}
function snapshot(raw,now){
 const state=validateRaw(raw);
 const pause=value=>{const t=value.timer;if(!t||typeof t!=='object')return;let elapsed=Math.max(0,Math.trunc(Number(t.elapsedMs)||0));if(t.running)elapsed+=Math.max(0,now-(Math.trunc(Number(t.startedAt))||now));t.elapsedMs=elapsed;t.running=false;t.startedAt=0;t.active=elapsed>0;};
 for(const speech of state.speeches){pause(speech);for(const version of speech.versions||[])pause(version);}return JSON.stringify(state);
}
function validateIndex(value){
 if(!value||typeof value!=='object')throw failure(SPLocale.t('Conferência inválida.'));
 for(const [kind,limit] of [['documents',2000],['categories',300]]){const rows=value[kind];if(!rows||typeof rows!=='object'||Array.isArray(rows)||Object.keys(rows).length>limit)throw failure(SPLocale.t('Conferência inválida.'));for(const [id,hash] of Object.entries(rows))if(id.length>1000||typeof hash!=='string'||!/^[a-f0-9]{64}$/.test(hash))throw failure(SPLocale.t('Conferência inválida.'));}
}
function loadRecord(raw){
 if(!raw)return {data:defaults(),baseline:null,pending:null,confirmation:null,recentUploads:[]};
 const record=JSON.parse(raw),data=record?.data;
 if(record?.version!==1||!data||typeof data!=='object')throw failure(SPLocale.t('As preferências do Drive não puderam ser lidas. Reconecte sua conta.'),'storage');
 const safe=defaults();
 for(const name of Object.keys(safe)){if(data[name]===undefined)continue;if(typeof data[name]!==typeof safe[name]||(typeof safe[name]==='number'&&(!Number.isFinite(data[name])||data[name]<0)))throw failure(SPLocale.t('As preferências do Drive estão inválidas. Reconecte sua conta.'),'storage');safe[name]=data[name];}
 if(safe.connected&&!/^[^\s@]+@[^\s@]+$/.test(safe.email))throw failure(SPLocale.t('As preferências do Drive estão inválidas. Reconecte sua conta.'),'storage');
 let baseline=null,pending=null;
 if(record.baseline)try{validateIndex(record.baseline.local);validateIndex(record.baseline.remote);if(record.baseline.account===safe.email&&validId(record.baseline.id))baseline=record.baseline;}catch{}
 if(record.pending)try{const p=record.pending;if(p.account===safe.email&&validId(p.id)){validateRaw(p.state);pending=p;}}catch{}
 let confirmation=null;
 if(record.confirmation?.account===safe.email&&validId(record.confirmation.id))try{
  const candidate=record.confirmation;validateIndex({documents:candidate.documents,categories:{}});
  if(/^[a-f0-9]{64}$/.test(candidate.hash)&&/^[a-f0-9]{64}$/.test(candidate.wireHash))confirmation=candidate;
 }catch{}
 const recentUploads=(Array.isArray(record.recentUploads)?record.recentUploads:[]).filter(row=>validId(row.id)&&/^[a-f0-9]{64}$/.test(row.hash)).slice(0,16);
 return {data:safe,baseline,pending,confirmation,recentUploads,cleanupAnchor:record.cleanupAnchor||null};
}

/** Browser-only bridge for the existing Android Drive UI. No token or client secret is persisted. */
export function createBrowserDrive({getState,saveState,canWrite=()=>true,environment={}}={}){
 const win=environment.window||window,doc=environment.document||document,storage=environment.storage||localStorage;
 const fetcher=environment.fetch||globalThis.fetch.bind(globalThis),now=environment.now||Date.now;
 const interval=environment.setInterval||globalThis.setInterval.bind(globalThis),clear=environment.clearInterval||globalThis.clearInterval.bind(globalThis);
 const identity=()=>environment.identity||win.google?.accounts?.oauth2;
 let record,error='',errorCode='',busy=false,connecting=false,token='',expiresAt=0,ticket=null,disposed=false,gisLoading=null;
 let resuming=false,resumeTask=null,silentTried=false,gestureTried=false,forcedReconnect=false,authorizationVersion=0;
 let authorizationRetryAt=0,authorizationFailures=0,authorizationTimer=null;
 const later=environment.setTimeout||globalThis.setTimeout.bind(globalThis),cancelLater=environment.clearTimeout||globalThis.clearTimeout.bind(globalThis);
 const sleep=environment.sleep||(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
 const sourceCache=environment.receiptCache||createDriveReceiptCache(environment.indexedDB||globalThis.indexedDB);
 let source=null,lastReadSource=null,sourceReady=Promise.resolve(),confirmationTask=Promise.resolve(),contentTask=null,contentVersion=0,backupTimer=null,networkQueue=Promise.resolve(),checkedRaw='',checkedHash='',committedRaw=null,pendingOrigin='internal';
 try{record=loadRecord(storage.getItem(KEY));}catch(e){record={data:defaults(),baseline:null,pending:null,confirmation:null,recentUploads:[]};error=e.message||SPLocale.t('Não foi possível ler as preferências do Drive.');errorCode='storage';}
 const data=()=>record.data;
 const tokenValid=()=>!!token&&now()<expiresAt;
 // Uma página visível pode continuar o backup mesmo quando outra janela recebe o foco.
 const active=()=>!disposed&&!doc.hidden&&canWrite();
 const due=()=>driveBackupDue(data());
 function stateRaw(){if(committedRaw!==null)return committedRaw;const state=getState(),raw=typeof state==='string'?state:JSON.stringify(state);if(raw!==checkedRaw)validateRaw(raw);return raw;}
 function localSaved(origin='user',raw=null){if(typeof raw==='string')committedRaw=raw;pendingOrigin=['user','drive','shared-import','manual-restore','local-configuration','internal','migration'].includes(origin)?origin:'internal';contentVersion++;return observe();}
 function observe(){
  if(!data().connected||disposed||!canWrite())return Promise.resolve();if(contentTask)return contentTask;
  contentTask=(async()=>{
   let changed=false;
   for(;;){const version=contentVersion,account=data().email,raw=stateRaw(),index=await backupContentIndex(raw),hash=index.stateHash;
    if(disposed||account!==data().email)return;checkedRaw=raw;checkedHash=hash;
    const pending=index.hasProtectedData&&hash!==data().lastConfirmedHash;
    if(hash!==data().observedHash||pending!==data().backupPending||pendingOrigin!==data().lastChangeOrigin){const since=pending?(data().backupPending?data().pendingSinceAt:now()):0;commit({observedHash:hash,lastChangeOrigin:pendingOrigin,backupPending:pending,pendingSinceAt:since,lastChangeAt:now(),...(!pending?{backupRetryAt:0,backupFailures:0,backupBlocked:false,blockedReason:''}:{})});changed=true;}
    if(version===contentVersion)break;
   }
   if(changed)emit('status');
  })().catch(e=>{fail(e);emit('status');}).finally(()=>{contentTask=null;schedule();});return contentTask;
 }
 function schedule(){
  if(backupTimer!==null){cancelLater(backupTimer);backupTimer=null;}
  if(disposed||busy||!active()||!data().connected||!data().autoBackup||!data().backupPending||data().needsReview||data().backupBlocked)return;
  const target=due();backupTimer=later(()=>{backupTimer=null;startAuthorization();void automatic();},Math.max(0,target-now()));backupTimer?.unref?.();
 }
 function transient(e){return ['network','drive','rate-limit','authorization-pending'].includes(e.code);}
 function backgroundFailure(e){fail(e);const failures=data().backupFailures+1;try{commit({backupFailures:failures,backupRetryAt:now()+driveRetryDelay(failures),backupBlocked:!transient(e),blockedReason:transient(e)?'':e.code||'storage'});}catch{}}
 function commit(patch={},extras={}){const next={...record,...extras,data:{...data(),...patch}};try{storage.setItem(KEY,JSON.stringify({version:1,...next}));}catch{throw failure(SPLocale.t('Não foi possível salvar as preferências do Drive neste navegador. Exporte um backup para liberar espaço.'),'storage');}record=next;}
 function status(){const missing=data().connected&&!tokenValid();return {...data(),...environment.authorization?.status?.(),browserDrive:true,readOnly:!canWrite(),busy,nextBackupAt:data().autoBackup?due():0,backupIndexReady:!!record.confirmation,needsAuthorization:missing,authorizationPending:missing&&resuming,needsReconnect:missing&&(forcedReconnect||['authorization','popup','account','cancelled'].includes(errorCode)),error,errorCode};}
 function emit(kind,requestId='',extras={}){win.dispatchEvent(new CustomEvent('nativeDrive',{detail:{kind,requestId,status:status(),...extras}}));}
 function invalidate(){authorizationVersion++;environment.authorization?.invalidate?.();token='';expiresAt=0;ticket=null;}
 function fail(e){if(e.code==='authorization-pending'){error='';errorCode='';return;}error=typeof e.code==='string'?e.message:SPLocale.t('Não foi possível acessar o Google Drive. Verifique sua conexão e tente novamente.');errorCode=typeof e.code==='string'?e.code:'network';if(['authorization','account','popup','cancelled'].includes(errorCode)){forcedReconnect=true;if(errorCode==='authorization')invalidate();}}
 function localRaw(){if(saveState&&saveState()===false)throw failure(SPLocale.t('Não foi possível salvar o caderno antes do backup.'),'storage');const state=getState(),raw=typeof state==='string'?state:JSON.stringify(state);validateRaw(raw);return raw;}
 function requireToken(){if(!data().connected&&!connecting||!tokenValid())throw failure(SPLocale.t('Reconecte sua conta Google para continuar nesta sessão.'),'authorization');return token;}
 async function readText(response,limit){
  const declared=Number(response.headers?.get('content-length'))||0;if(declared>limit)throw failure(SPLocale.t('O backup ultrapassa o tamanho permitido.'));
  if(!response.body?.getReader){const value=await response.text();if(byteLength(value)>limit)throw failure(SPLocale.t('O backup ultrapassa o tamanho permitido.'));return value;}
  const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let size=0,text='';
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw failure(SPLocale.t('O backup ultrapassa o tamanho permitido.'));text+=decoder.decode(value,{stream:true});}return text+decoder.decode();}catch(e){try{await reader.cancel();}catch{}throw e;}finally{reader.releaseLock();}
 }
 async function rawRequest(url,{method='GET',body,contentType,limit=1000000,missingOK=false}={}){
  const usedToken=requireToken(),controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);
  try{
   const response=await fetcher(url,{method,headers:{Authorization:'Bearer '+usedToken,Accept:'application/json',...(contentType?{'Content-Type':contentType}:{})},body,cache:'no-store',credentials:'omit',redirect:'error',signal:controller.signal});
   if(missingOK&&response.status===404)return '';
   if(!response.ok){let reason='';try{const parsed=JSON.parse(await readText(response,64000));reason=parsed.error?.errors?.[0]?.reason||parsed.error?.status||'';}catch{}if(response.status===401)throw Object.assign(failure(SPLocale.t('A autorização do Google expirou. Reconecte sua conta para continuar.'),'authorization'),{httpStatus:401});if(['insufficientPermissions','PERMISSION_DENIED'].includes(reason))throw failure(SPLocale.t('Autorize o acesso à área privada do Drive para continuar.'),'authorization');if(response.status===429||response.status===408||response.status>=500||['rateLimitExceeded','userRateLimitExceeded','backendError'].includes(reason))throw failure(SPLocale.t('Não foi possível acessar o Drive agora. Tente novamente.'),'rate-limit');if(reason==='storageQuotaExceeded')throw failure(SPLocale.t('Sua conta Google está sem espaço para novos backups.'),'quota');if(['accessNotConfigured','SERVICE_DISABLED'].includes(reason))throw failure(SPLocale.t('A API do Google Drive precisa ser habilitada no projeto Google desta conexão.'),'configuration');throw failure(SPLocale.t('Não foi possível acessar o Drive agora. Tente novamente.'),'drive');}
   if(response.status===204)return '';return await readText(response,limit);
  }catch(e){if(typeof e.code==='string')throw e;throw failure(SPLocale.t('Sem conexão com o Google Drive. Seus dados continuam salvos no navegador.'),'network');}finally{clearTimeout(timeout);}
 }
 async function queuedRequest(url,options,account=data().email){
  const execute=async()=>{
   if(disposed)throw failure('Operação do Drive interrompida.');if(account!==data().email)throw failure('A conta mudou durante a operação.','account');
   return rawRequest(url,options);
  };
  const work=()=>win.navigator?.locks?.request?win.navigator.locks.request('seprepare-drive-http',execute):execute();
  const result=networkQueue.catch(()=>{}).then(work);networkQueue=result.catch(()=>{});return result;
 }
 async function request(url,options={}){
  const account=data().email,guard=async()=>{if(account!==data().email)throw failure('A conta mudou durante a operação.','account');const result=await queuedRequest(url,options,account);if(account!==data().email)throw failure('A conta mudou durante a operação.','account');return result;};
  try{return await guard();}catch(e){
   if(e.httpStatus!==401||options.retryAuth===false)throw e;
   invalidate();silentTried=false;
   if(!await resumeAuthorization('silent'))throw failure('A conta está vinculada. O backup aguarda a renovação do acesso.','authorization-pending');
   try{return await guard();}catch(repeated){if(repeated.httpStatus===401)invalidate();throw repeated;}
  }
 }
 async function accountEmail(){const result=JSON.parse(await request(API+'/about?fields=user(emailAddress,permissionId)',{limit:64000,retryAuth:false})),email=String(result.user?.emailAddress||'').toLowerCase();if(!/^[^\s@]+@[^\s@]+$/.test(email))throw failure(SPLocale.t('Não foi possível identificar sua conta Google.'),'account');environment.authorization?.confirm?.({email,accessToken:token});return email;}
 async function files(latestOnly=false){
  let all=[],page='';const pages=new Set();
  do{
   const params=new URLSearchParams({spaces:'appDataFolder',q:query,fields:(latestOnly?'':'nextPageToken,incompleteSearch,')+'files('+fields+')',orderBy:'createdTime desc',pageSize:latestOnly?'1':'100'});if(page)params.set('pageToken',page);
   const result=JSON.parse(await request(API+'/files?'+params));if(!Array.isArray(result.files))throw failure(SPLocale.t('O Drive retornou uma lista de backups inválida.'));
   for(const item of result.files){if(!validId(item?.id))throw failure(SPLocale.t('O Drive retornou uma identificação de backup inválida.'));all.push(item);}
   page=latestOnly?'':result.nextPageToken||'';
   if(result.incompleteSearch||all.length>10000||typeof page!=='string'||page.length>1000||page&&pages.has(page))throw failure(SPLocale.t('Não foi possível conferir a lista completa dos backups.'));
   if(page)pages.add(page);
  }while(page);return latestOnly?(all[0]||null):all;
 }
 async function keepNewestBackups(savedId){
  const listed=await files(),anchor=record.cleanupAnchor;
  if(!anchor||anchor.receiptId!==savedId)throw failure('A limpeza será retomada após conferir a cópia salva.');
  const cutoff=Date.parse(anchor.createdTime),known=new Set(record.recentUploads.map(row=>row.id));
  const preserve=listed.filter(file=>file.id!==savedId&&file.id!==anchor.id&&!known.has(file.id)&&(!anchor.id||!Number.isFinite(cutoff)||Date.parse(file.createdTime)>=cutoff)).map(file=>file.id);
  const selection=retainedDriveCopies(listed,savedId,preserve);
  for(const file of selection.remove)await request(API+'/files/'+file.id,{method:'DELETE',missingOK:true,limit:64000});
 }
 async function cleanupBackups(savedId){
  try{commit({backupCleanupPending:true,lastCleanupAttemptAt:now()});}catch{return;}
  try{await keepNewestBackups(savedId);commit({backupCleanupPending:false});}catch(e){if(e.code==='authorization')fail(e);}
 }
 async function download(id,meta=null){
  if(!validId(id))throw failure(SPLocale.t('Backup inválido.'));const raw=await request(API+'/files/'+id+'?alt=media',{limit:WIRE_LIMIT});
  let envelope;try{envelope=JSON.parse(raw);}catch{throw failure(SPLocale.t('O backup está incompleto ou foi alterado. Seus dados locais foram preservados.'));}
  if(envelope.format!=='seprepare-drive-backup'||envelope.backupSchema!==1||typeof envelope.state!=='string')throw failure(SPLocale.t('Formato de backup não reconhecido.'));
  const state=envelope.state;if(byteLength(state)>LIMIT||!(/^[a-f0-9]{64}$/.test(envelope.sha256||''))||await driveHash(state)!==envelope.sha256||meta?.appProperties?.hash&&meta.appProperties.hash!==envelope.sha256)throw failure(SPLocale.t('O backup está incompleto ou foi alterado. Seus dados locais foram preservados.'));validateRaw(state);return state;
 }
 function deviceId(){let id=storage.getItem(KEY+'-device');if(!/^[a-f0-9-]{36}$/.test(id||'')){id=crypto.randomUUID();storage.setItem(KEY+'-device',id);}return id;}
 async function remember(id,raw,at,uploaded=false,normalization=null){
  const account=data().email,index=await backupContentIndex(raw),rawSemanticHash=index.stateHash,wireHash=await driveHash(raw),state=validateRaw(raw);
  const lookup={categories:new Map(state.categories.map(row=>[row.id,row])),drafts:new Map((state.editorDrafts||[]).map(row=>[row.speechId,row]))};

  const currentRaw=stateRaw(),currentIndex=await backupContentIndex(currentRaw),current=currentIndex.stateHash;if(disposed||account!==data().email)return;
  const normalized=normalization?.normalizedRemoteHash===current&&normalization?.localStateHash===current,hash=normalized?current:rawSemanticHash,documents=normalized?currentIndex.documents:index.documents,syncDocuments=normalized?currentIndex.syncDocuments:index.syncDocuments;
  const confirmation={account,id,at,hash,wireHash,documents,syncDocuments,aligned:current===hash,signatureFormat:3,rawSemanticHash,normalizationHash:normalized?current:null,requiresNormalization:!!index.legacy&&!normalized&&!uploaded};
  const recentUploads=uploaded?[{id,hash:wireHash},...record.recentUploads.filter(row=>row.id!==id)].slice(0,16):record.recentUploads;
  commit({lastConfirmedHash:hash,lastConfirmedAt:at,hasRemote:true,observedHash:current,backupPending:current!==hash,pendingSinceAt:current===hash?0:data().pendingSinceAt||now(),backupRetryAt:0,backupFailures:0,backupBlocked:false,blockedReason:'',...(uploaded?{lastBackupAt:at,lastBackupFinishedAt:now(),lastUploadedId:id,lastUploadHash:wireHash,approvedRemoteId:id,needsReview:false,backupCleanupPending:true}:{})},{confirmation,recentUploads,...(uploaded?{pending:null}:{})});
  source={account,id,at,hash,state:raw};void sourceCache.save(source).catch(()=>{});
  emit('backup-confirmed');
 }
 async function recognized(latest){
  const receipt=record.confirmation,wire=latest.appProperties?.hash||'',origin=latest.appProperties?.origin||'';
  let own=record.recentUploads.some(row=>row.id===latest.id&&(!wire||wire===row.hash)),contradicted=false;
  if(receipt?.id===latest.id&&wire&&wire!==receipt.wireHash)contradicted=true;
  if(record.recentUploads.some(row=>row.id===latest.id&&wire&&wire!==row.hash))contradicted=true;
  if(origin&&origin===deviceId()&&!contradicted)own=true;if(contradicted)own=false;
  const sameId=receipt?.id===latest.id&&(!wire||receipt.wireHash===wire),sameBytes=receipt&&wire&&receipt.wireHash===wire;
  if(receipt?.requiresNormalization&&sameId)return false;
  if(!sameId&&!sameBytes&&!own)return false;
  if(!sameId||receipt?.signatureFormat!==3){await sourceReady;const raw=sameBytes&&source?.id===receipt.id?source.state:await download(latest.id,latest);await remember(latest.id,raw,Number(latest.appProperties?.at)||Date.parse(latest.createdTime)||now());}
  commit({approvedRemoteId:latest.id,lastReadId:latest.id,needsReview:false},{pending:null});return true;
 }
 async function upload(state,reviewed=null){
  const createdAt=now(),hash=await driveHash(state),count=validateRaw(state).speeches.length;
  const meta={name:'SePrepare-'+createdAt+'.json',parents:['appDataFolder'],appProperties:{seprepareBackup:'1',at:String(createdAt),items:String(count),hash,origin:deviceId(),contentHash:await backupStateHash(state)}},envelope={format:'seprepare-drive-backup',backupSchema:1,createdAt,sha256:hash,state};
  const boundary='seprepare_'+crypto.randomUUID().replaceAll('-',''),body='--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(meta)+'\r\n--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(envelope)+'\r\n--'+boundary+'--\r\n';
  const result=JSON.parse(await request(UPLOAD+'/files?uploadType=multipart&fields='+encodeURIComponent(fields),{method:'POST',body,contentType:'multipart/related; boundary='+boundary,limit:100000}));if(!validId(result.id))throw failure(SPLocale.t('O envio terminou sem uma confirmação válida. Confira seus backups antes de tentar novamente.'));
  await remember(result.id,state,createdAt,true);commit({},{cleanupAnchor:{receiptId:result.id,id:reviewed?.id||'',createdTime:reviewed?.createdTime||''}});await cleanupBackups(result.id);return result;
 }
 function loadGIS(){
  if(identity())return Promise.resolve();if(gisLoading)return gisLoading;
  if(!active()||win.navigator?.onLine===false)return Promise.resolve();
  gisLoading=new Promise(resolve=>{let script=doc.querySelector?.('script[data-seprepare-google-identity]');if(!script){script=doc.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.defer=true;script.dataset.seprepareGoogleIdentity='true';doc.head.appendChild(script);}const done=()=>{gisLoading=null;resolve();};script.addEventListener('load',done,{once:true});script.addEventListener('error',done,{once:true});});return gisLoading;
 }
 function authorize(mode='user'){
  if(environment.authorization){
   const generation=authorizationVersion;
   return environment.authorization.acquire({mode,account:data().connected?data().email:'',clientId:BROWSER_DRIVE_CLIENT_ID,scopes:SCOPES}).then(response=>{
    if(disposed||generation!==authorizationVersion)throw failure('A conta mudou durante a operação.','account');
    const seconds=Number(response?.expires_in);if(!response?.access_token||!Number.isFinite(seconds)||seconds<=0||!SCOPES.every(scope=>String(response.scope||'').split(' ').includes(scope)))throw failure('Autorize o acesso à área privada do Drive para continuar.','authorization');
    token=response.access_token;expiresAt=now()+Math.min(seconds,86400)*1000-1000;
   });
  }
  const oauth=identity();if(!oauth?.initTokenClient){void loadGIS();return Promise.reject(failure(SPLocale.t('A conexão Google ainda está carregando. Verifique a internet e toque em Conectar novamente.'),'configuration'));}
  const knownAccount=data().connected?data().email:'',generation=authorizationVersion;
  return new Promise((resolve,reject)=>{
   let settled=false;const finish=error=>{if(settled)return;settled=true;cancelLater(timeout);error?reject(error):resolve();};
   const timeout=later(()=>finish(failure('Não foi possível concluir a autorização do Google. Tente novamente.','authorization-pending')),30000);timeout?.unref?.();
   try{
    const client=oauth.initTokenClient({client_id:BROWSER_DRIVE_CLIENT_ID,scope:SCOPES.join(' '),include_granted_scopes:false,
     callback:response=>{
      if(settled)return;if(disposed||generation!==authorizationVersion){finish(failure('A conta mudou durante a operação.','account'));return;}
      if(response?.error){finish(failure(response.error==='access_denied'?SPLocale.t('Conexão cancelada.'):SPLocale.t('Não foi possível autorizar sua conta Google.'),response.error==='access_denied'?'cancelled':'authorization'));return;}
      const granted=typeof oauth.hasGrantedAllScopes==='function'?oauth.hasGrantedAllScopes(response,...SCOPES):SCOPES.every(scope=>String(response.scope||'').split(' ').includes(scope));
      const seconds=Number(response?.expires_in);if(!response?.access_token||!granted||!Number.isFinite(seconds)||seconds<=0){finish(failure(SPLocale.t('Autorize o acesso à área privada do Drive para continuar.'),'authorization'));return;}
      token=response.access_token;expiresAt=now()+Math.min(seconds,86400)*1000-1000;finish();
     },error_callback:response=>finish(failure(response?.type==='popup_failed_to_open'?SPLocale.t('Permita a janela de conexão do Google e tente novamente.'):SPLocale.t('Conexão cancelada.'),response?.type==='popup_failed_to_open'?'popup':'cancelled'))});
    client.requestAccessToken({prompt:mode==='silent'?'none':knownAccount?'':'select_account',...(knownAccount?{login_hint:knownAccount}:{})});
   }catch{finish(failure(SPLocale.t('Não foi possível autorizar sua conta Google.'),'configuration'));}
  });
 }
 // Renova somente a conta previamente vinculada, mesmo se o Google devolver outra sessão.
 async function renewAuthorization(mode='user'){
  const expected=data().email.toLowerCase();
  await authorize(mode);
  try{
   const email=await accountEmail();
   if(email!==expected||data().email.toLowerCase()!==expected)throw failure(SPLocale.t('A conta Google autorizada é diferente da conta conectada. Use a conta anterior ou desconecte para trocar de conta.'),'account');
   if(data().blockedReason==='authorization')commit({backupBlocked:false,blockedReason:'',backupRetryAt:0});
   silentTried=false;gestureTried=false;forcedReconnect=false;authorizationRetryAt=0;authorizationFailures=0;if(authorizationTimer!==null){cancelLater(authorizationTimer);authorizationTimer=null;}
  }catch(e){invalidate();throw e;}
 }
 // A tentativa com prompt:none não abre seletor/consentimento. Sem autorização silenciosa,
 // o primeiro gesto do usuário pode liberar a renovação com prompt:'' e login_hint.
 function resumeAuthorization(mode='silent'){
  if(disposed||!data().connected||tokenValid()||!active()||win.navigator?.onLine===false)return Promise.resolve(false);
  if(resumeTask)return resumeTask;
  if(mode==='silent'?silentTried:gestureTried)return Promise.resolve(false);
  if(!environment.authorization?.canResume?.(data().email)&&!identity()?.initTokenClient)return Promise.resolve(false);
  if(mode==='silent')silentTried=true;else gestureTried=true;
  resuming=true;emit('authorization');
  const attempt=renewAuthorization(mode==='silent'?'silent':'user').then(()=>{
   error='';errorCode='';silentTried=false;gestureTried=false;return true;
  }).catch(e=>{
   // Não apresentar erro vermelho quando o Google apenas requer interação.
   if(environment.authorization?.managed?.()&&transient(e)){
    silentTried=false;authorizationRetryAt=now()+driveRetryDelay(++authorizationFailures);scheduleAuthorizationRetry();
   }else if(mode!=='silent'||environment.authorization?.managed?.())fail(e);
   return false;
  }).finally(()=>{
   resuming=false;resumeTask=null;emit('authorization');
   if(tokenValid()){schedule();void automatic();}
  });
  resumeTask=attempt;return attempt;
 }
 function scheduleAuthorizationRetry(){
  if(authorizationTimer!==null||!active()||!authorizationRetryAt)return;
  authorizationTimer=later(()=>{authorizationTimer=null;startAuthorization();},Math.max(0,authorizationRetryAt-now()));authorizationTimer?.unref?.();
 }
 function startAuthorization(){
  if(environment.authorization?.managed?.()&&!environment.authorization.canResume(data().email))return;
  if(authorizationRetryAt>now()){scheduleAuthorizationRetry();return;}
  if(disposed||!data().connected||tokenValid()||!active()||win.navigator?.onLine===false||silentTried||resumeTask||forcedReconnect&&data().blockedReason==='authorization')return;
  if(environment.authorization?.canResume?.(data().email)||identity()?.initTokenClient){void resumeAuthorization('silent');return;}
  void loadGIS().then(()=>{if(!disposed&&identity()?.initTokenClient)void resumeAuthorization('silent');});
 }
 function onUserGesture(event){
  if(environment.authorization?.allowGesture?.()===false)return;
  if(event.type==='keydown'&&(event.repeat||event.ctrlKey||event.altKey||event.metaKey))return;
  if(event.target?.closest?.('input,textarea,select,[contenteditable="true"]'))return;
  if(disposed||!data().connected||tokenValid()||!silentTried||gestureTried||resumeTask||!active()||win.navigator?.onLine===false)return;
  // Chamado sincronicamente no gesto: o navegador pode permitir abrir a janela do Google.
  void resumeAuthorization('gesture');
 }
 async function preflight(latest,enable=false){
  await sourceReady;const account=data().email,cached=latest&&source?.account===account&&source.id===latest.id&&record.confirmation?.wireHash===latest.appProperties?.hash?source.state:null;
  const payload={mode:'backup-review',ticket:crypto.randomUUID(),id:latest?.id||'',at:Number(latest?.appProperties?.at)||0,state:latest?(cached||await download(latest.id,latest)):null,enable,account};
  ticket={value:payload.ticket,head:payload.id,at:now(),enable,account,remoteState:payload.state};commit({hasRemote:!!latest});return payload;
 }
 async function stage(latest,beforeBackup=false){
  if(await recognized(latest))return null;
  const d=data(),cached=record.pending,wire=latest.appProperties?.hash||'';
  const payload=cached?.id===latest.id&&cached.account===d.email&&(!wire||wire===cached.sourceHash)?{...cached}:{id:latest.id,state:await download(latest.id,latest),sourceHash:wire,automatic:true,account:d.email,at:Number(latest.appProperties?.at)||0};
  payload.reason=beforeBackup||!d.autoRead?'before-backup':'read';commit(d.autoBackup||beforeBackup?{needsReview:true}:{},{pending:payload});return payload;
 }
 async function confirm(argument){
  let consent;try{consent=JSON.parse(argument);}catch{throw failure(SPLocale.t('Confirmação inválida. Confira o backup novamente.'));}
  const t=ticket,elapsed=t?now()-t.at:-1;if(!t||!consent.ticket||consent.ticket!==t.value||t.account!==data().email||elapsed<0||elapsed>600000)throw failure(SPLocale.t('A confirmação expirou. Toque em Fazer backup agora para conferir novamente.'));
  const raw=localRaw();if(await driveHash(raw)!==consent.localHash)throw failure(SPLocale.t('O caderno mudou. Confira o backup novamente antes de enviar.'));
  const latest=await files(true);if((latest?.id||'')!==t.head)return preflight(latest,t.enable);
  if(raw!==localRaw())throw failure(SPLocale.t('O caderno mudou. Confira o backup novamente antes de enviar.'));
  const state=snapshot(raw,now()),empty=!JSON.parse(state).speeches.length;if(empty&&!t.enable&&!consent.emptyApproved)throw failure(SPLocale.t('Confirme primeiro se deseja guardar um caderno vazio.'));
  const unchanged=latest&&(latest.appProperties?.hash===await driveHash(state)||t.remoteState&&await backupStateHash(t.remoteState)===await backupStateHash(state));
  if(!(empty&&t.enable)&&!unchanged){
   const completed=data().lastBackupFinishedAt||data().lastBackupAt||0,wait=completed?Math.max(0,completed+DRIVE_BACKUP_GAP-now()):0;
   if(wait){await sleep(wait);if(disposed)throw failure('Operação do Drive interrompida.');if(t.account!==data().email)throw failure('A conta mudou durante a operação.','account');return confirm(argument);}
  }
  ticket=null;let saved;if(empty&&t.enable)saved={empty:true};else if(unchanged){saved={unchanged:true};await remember(latest.id,t.remoteState||state,Number(latest.appProperties?.at)||now());commit({},{cleanupAnchor:{receiptId:latest.id,id:latest.id,createdTime:latest.createdTime||''}});await cleanupBackups(latest.id);}else saved=await upload(state,latest);
  commit({approvedRemoteId:saved.id||latest?.id||'',needsReview:false,...(t.enable?{autoBackup:true}:{})},{pending:null});await observe();return {saved,enabled:t.enable};
 }
 async function perform(kind,argument){
  if(kind==='connect'){
   await authorize();
   // Verify the account through Drive; a pending account never receives data.
   const previous=record;let email;connecting=true;
   try{
    // Pending edits may be observed while Google responds. Keep the saved
    // account valid until identity and remote state have both been checked.
    email=await accountEmail();
    const previousEmail=previous.data.connected?previous.data.email.toLowerCase():'';
    if(previousEmail&&email!==previousEmail)throw failure(SPLocale.t('A conta Google autorizada é diferente da conta conectada. Use a conta anterior ou desconecte para trocar de conta.'),'account');
    const latest=await files(true),same=email===previous.data.email.toLowerCase();record=same?previous:{data:{...defaults(),autoBackup:previous.data.autoBackup,autoRead:previous.data.autoRead,offerSeen:true},baseline:null,pending:null,confirmation:null,recentUploads:[]};
    commit({email,connected:true,hasRemote:!!latest,lastCheckedAt:now(),...(data().blockedReason==='authorization'?{backupBlocked:false,blockedReason:'',backupRetryAt:0}:{})});silentTried=false;gestureTried=false;forcedReconnect=false;error='';errorCode='';
    await observe();return {payload:latest?await stage(latest,!data().autoRead):null};
   }catch(e){record=previous;invalidate();throw e;}finally{connecting=false;}
  }
  if(kind==='disconnect'){
   const oldToken=token,oldAccount=data().email,managed=environment.authorization?.managed?.();const next={data:{...defaults(),autoBackup:data().autoBackup,autoRead:data().autoRead,offerSeen:true},baseline:null,pending:null,confirmation:null,recentUploads:[]};
   try{storage.setItem(KEY,JSON.stringify({version:1,...next}));}catch{throw failure(SPLocale.t('Não foi possível desconectar neste navegador. Tente novamente.'),'storage');}
   record=next;source=null;lastReadSource=null;checkedRaw='';checkedHash='';void sourceCache.remove(oldAccount).catch(()=>{});forcedReconnect=false;invalidate();try{storage.removeItem(RECOVERY_KEY);}catch{}if(managed){void environment.authorization.disconnect().catch(()=>{});}else try{if(oldToken)identity()?.revoke?.(oldToken,()=>{});}catch{}return {};
  }
  if(!data().connected)throw failure(SPLocale.t('Conecte sua conta Google primeiro.'),'account');
  if(kind==='auto-backup'){if(argument!=='false')throw failure(SPLocale.t('Confira o backup existente antes de ativar os envios automáticos.'),'confirmation');commit({autoBackup:false});return {};}
  if(kind==='auto-read'){commit({autoRead:argument==='true'});return {};}
  if(kind==='check'){
   const last=data().lastCheckAttemptAt,t=now();if(!active()||!data().autoRead||last&&t>=last&&t-last<READ_GAP)return {payload:{skipped:true}};
   if(!tokenValid()&&resumeTask)await resumeTask;
   if(!tokenValid())return {payload:{skipped:true}};
   requireToken();commit({lastCheckAttemptAt:t});
  }else if(!tokenValid()&&['list','restore','prepare-backup','backup-confirm'].includes(kind)){
   if(resumeTask)await resumeTask;
   if(!tokenValid())await renewAuthorization('user');
  }else requireToken();
  let result={};
  if(kind==='list')result={files:await files()};
  else if(kind==='restore'){lastReadSource={id:argument,state:await download(argument),automatic:false,account:data().email};result={payload:lastReadSource};}
  else if(kind==='prepare-backup'){localRaw();let options;try{options=argument?JSON.parse(argument):{};}catch{throw failure(SPLocale.t('Opção de backup inválida.'));}result={payload:await preflight(await files(true),options.enable===true)};}
  else if(kind==='backup-confirm')result={payload:await confirm(argument)};
  else if(kind==='check'){const latest=await files(true);commit({hasRemote:!!latest});result={payload:latest?await stage(latest):null};}
  commit({lastCheckedAt:now()});return result;
 }
 async function run(kind,id,argument=''){
  if(!['connect','disconnect','auto-backup','auto-read','check','list','restore','prepare-backup','backup-confirm'].includes(kind))return;
  if(!canWrite()){emit(kind,id,{error:SPLocale.t('Outra aba está editando este caderno.'),errorCode:'storage'});return;}
  if(busy){emit(kind,id,{error:kind==='check'?'':SPLocale.t('Aguarde a operação atual.'),errorCode:'busy'});return;}
  busy=true;error='';errorCode='';emit('progress',id);
  try{const result=await perform(kind,argument);busy=false;error='';errorCode='';emit(kind,id,{...result,error:'',errorCode:''});}catch(e){
   busy=false;fail(e);
   if(kind==='backup-confirm'&&data().autoBackup&&transient(e)){try{commit({lastAutoAttemptAt:now(),backupPending:true,pendingSinceAt:data().pendingSinceAt||now()});backgroundFailure(e);}catch{}}
   emit(kind,id,{error,errorCode});
  }finally{schedule();}
 }
 async function automatic(){
  if(busy||!active()||win.navigator?.onLine===false||!data().connected||!tokenValid()||!data().autoBackup)return;
  await confirmationTask;await observe();
  if(busy||disposed||!active()||!tokenValid()||data().needsReview||data().backupBlocked)return;
  const cleanupOnly=!data().backupPending&&data().backupCleanupPending&&now()-data().lastCleanupAttemptAt>=60000;
  if(!cleanupOnly&&(!data().backupPending||now()<due()))return;
  busy=true;let payload=null;emit('progress');
  try{
   commit({lastAutoAttemptAt:now()});const latest=await files(true),head=latest?.id||'';
   if(!active()||!tokenValid())return;
   if(latest&&!await recognized(latest)&&head!==data().approvedRemoteId){payload=await stage(latest,!data().autoRead);return;}
   const raw=localRaw(),state=snapshot(raw,now()),index=await backupContentIndex(state),hash=index.stateHash;
   if(index.hasProtectedData&&(!latest||hash!==data().lastConfirmedHash)){
    const current=await files(true);if(!active()||!tokenValid())return;
    if((current?.id||'')!==head){if(current)payload=await stage(current,!data().autoRead);return;}
    if(raw!==stateRaw())return;await upload(state,current);
   }else if(latest&&data().backupCleanupPending)await cleanupBackups(head);
   commit({lastCheckedAt:now()});error='';errorCode='';
  }catch(e){backgroundFailure(e);}
  finally{busy=false;emit('automatic','',{payload,error,errorCode});schedule();}
 }
 function completeRead(raw){try{
  if(!canWrite())return false;
  if(typeof raw!=='string'||raw.length>1000000)return false;const receipt=JSON.parse(raw),d=data();
  if(!d.connected||receipt.account!==d.email||!validId(receipt.id)||!['restored','current','kept-local'].includes(receipt.outcome))return false;validateIndex(receipt.local);validateIndex(receipt.remote);
  const incoming=record.pending?.id===receipt.id&&record.pending.account===d.email?record.pending:lastReadSource?.id===receipt.id&&lastReadSource.account===d.email?lastReadSource:null;
  commit({lastReadId:receipt.id,lastReadAt:now(),lastReadOutcome:receipt.outcome,...(receipt.outcome==='restored'?{lastRestoredAt:now()}:{}),...(incoming?{needsReview:false,approvedRemoteId:receipt.id}:{})},{baseline:{account:d.email,id:receipt.id,local:receipt.local,remote:receipt.remote},...(incoming?{pending:null}:{})});
  if(incoming){confirmationTask=remember(incoming.id,incoming.state,incoming.at||now(),false,receipt).then(()=>observe()).catch(fail);}else void observe();return true;
 }catch(e){fail(e);return false;}}
 const onForeground=()=>{if(active()){startAuthorization();void observe();schedule();void automatic();}else schedule();};
 const onStorage=event=>{
  if(event.key!==KEY||event.storageArea&&event.storageArea!==storage)return;
  try{const next=loadRecord(event.newValue),changedAccount=next.data.email!==data().email;
   if(changedAccount){invalidate();source=null;lastReadSource=null;silentTried=false;gestureTried=false;forcedReconnect=false;checkedRaw='';checkedHash='';}
   record=next;emit('status');onForeground();
  }catch(e){fail(e);emit('status');}
 };
 // Não invalidar o token ao navegar: ele já tem expiração e pode ser reutilizado ao voltar pelo BFCache.
 doc.addEventListener('visibilitychange',onForeground);doc.addEventListener('pointerdown',onUserGesture,true);doc.addEventListener('keydown',onUserGesture,true);win.addEventListener('focus',onForeground);win.addEventListener('online',onForeground);win.addEventListener('storage',onStorage);win.addEventListener('pageshow',onForeground);
 if(data().connected&&record.confirmation){const account=data().email,receipt=record.confirmation;sourceReady=sourceCache.load(account).then(async saved=>{if(!disposed&&data().email===account&&record.confirmation?.id===receipt.id&&saved?.account===account&&saved.id===receipt.id&&typeof saved.state==='string'&&await driveHash(saved.state)===receipt.wireHash){if(receipt.signatureFormat!==3)await remember(saved.id,saved.state,saved.at||receipt.at);else if(await backupStateHash(saved.state)===(receipt.rawSemanticHash||receipt.hash)){source=saved;emit('status');}}}).catch(()=>{});}
 const timer=interval(()=>{startAuthorization();void automatic();},60000);timer?.unref?.();onForeground();
 return {browserDrive:true,driveResume:onForeground,driveAuthorizationChanged:()=>{emit('authorization');onForeground();},preloadGis:()=>{void loadGIS();},driveLocalSaved:localSaved,driveRunPending:automatic,driveBackupIndex:()=>JSON.stringify(record.confirmation?{...record.confirmation,uploaded:record.confirmation.id===data().lastUploadedId}:{}),driveRestoreBase:()=>JSON.stringify(source?.account===data().email?source:{}),driveStatus:()=>JSON.stringify(status()),driveAction:(kind,id,argument)=>{void run(kind,id,argument);},driveTakeOffer:()=>{if(!canWrite()||data().offerSeen)return false;try{commit({offerSeen:true});return true;}catch(e){fail(e);return false;}},drivePending:()=>JSON.stringify(record.pending?.account===data().email?record.pending:{}),driveReadBaseline:()=>JSON.stringify(record.baseline?.account===data().email?record.baseline:{}),drivePrepareRestore:()=>{if(!canWrite())return false;try{storage.setItem(RECOVERY_KEY,localRaw());return true;}catch(e){fail(e.code?e:failure(SPLocale.t('Não foi possível guardar sua cópia de recuperação.'),'storage'));return false;}},driveCompleteRead:completeRead,driveAckRead:id=>{try{if(!canWrite()||!data().connected||!validId(id))return false;const match=record.pending?.id===id,before=match&&record.pending.reason==='before-backup';commit({lastReadId:id,lastReadAt:now(),lastReadOutcome:'checked',...(before?{needsReview:false,approvedRemoteId:id}:{})},match?{pending:null}:{});return true;}catch{return false;}},dispose:()=>{disposed=true;invalidate();if(authorizationTimer!==null)cancelLater(authorizationTimer);if(backupTimer!==null)cancelLater(backupTimer);clear(timer);doc.removeEventListener('visibilitychange',onForeground);doc.removeEventListener('pointerdown',onUserGesture,true);doc.removeEventListener('keydown',onUserGesture,true);win.removeEventListener('focus',onForeground);win.removeEventListener('online',onForeground);win.removeEventListener('storage',onStorage);win.removeEventListener('pageshow',onForeground);}};
}

