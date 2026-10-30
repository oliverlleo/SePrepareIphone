const MODE_KEY='seprepare-drive-renewal-v1',LOGOUT_KEY=MODE_KEY+'-logout';
const scope='https://www.googleapis.com/auth/drive.appdata';
const fault=(message,code)=>Object.assign(new Error(message),{code});
const messages={account:'A conta Google autorizada é diferente da conta vinculada.',offline_permission_required:'Autorize novamente o Google Drive para ativar a reconexão automática.',permission:'Autorize o acesso à área privada do Drive para continuar.',reauthorize:'Autorize novamente sua conta para continuar os backups.'};
export function createCloudflareAuthorization({window:win=window,onChange=()=>{},timeout=30000,interactiveTimeout=180000}={}){
 const fetcher=win.fetch.bind(win),storage=win.localStorage;
 let config=null,preparing=null,prepared=false,loading=false,generation=0,force=false,lastPreparedAt=0;
 const read=key=>{try{return storage.getItem(key);}catch{return null;}};
 const write=(key,value)=>{try{value?storage.setItem(key,value):storage.removeItem(key);}catch{}};
 const hinted=()=>read(MODE_KEY)==='cloudflare';
 const pendingLogout=()=>read(LOGOUT_KEY)==='true';
 const managed=()=>!!config?.enabled||hinted();
 async function request(name,value){
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),timeout);
  try{
   const response=await fetcher('/api/drive/'+name,{method:value===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:value===undefined?{Accept:'application/json'}:{Accept:'application/json','Content-Type':'application/json','X-SePrepare-Request':'drive-v1'},...(value===undefined?{}:{body:JSON.stringify(value)}),signal:abort.signal});
   if(name==='config'&&response.status===404)return {enabled:false};
   const raw=await response.text();if(raw.length>32768)throw fault('Não foi possível conferir a autorização do Drive.','network');let result;try{result=JSON.parse(raw);}catch{throw fault('Não foi possível conferir a autorização do Drive.','network');}
   if(!response.ok){
    if(result.error==='request_rejected')throw fault('A conexão do Drive precisa ser reaberta neste navegador. Toque em Conectar novamente.','authorization');
    if(result.error==='reauthorize'){if(config)config.hasSession=false;onChange();throw fault(messages.reauthorize,'authorization');}
    if(result.error==='account')throw fault(messages.account,'account');
    if(['offline_permission_required','permission'].includes(result.error))throw fault(messages[result.error],'authorization');
    throw fault('Não foi possível retomar o Google Drive agora. O aplicativo tentará novamente.','network');
   }
   return result;
  }catch(error){if(typeof error.code==='string')throw error;throw fault('Sem conexão com o Google Drive. Seus dados continuam salvos no aparelho.','network');}finally{clearTimeout(timer);}
 }
 function prepare(forceCheck=false){
  if(preparing)return preparing;if(prepared&&!forceCheck&&!pendingLogout()&&Date.now()-lastPreparedAt<60000)return Promise.resolve(config);loading=true;
  preparing=(async()=>{
   if(pendingLogout())try{await request('logout',{});write(LOGOUT_KEY,null);}catch{}
   const result=await request('config');
   if(typeof result.enabled!=='boolean'||result.enabled&&(!/^[A-Za-z0-9_.-]+\.apps\.googleusercontent\.com$/.test(result.clientId||'')||result.scope!==scope||typeof result.hasSession!=='boolean'))throw fault('Não foi possível conferir a autorização do Drive.','network');
   config=result;prepared=true;lastPreparedAt=Date.now();return result;
  })().finally(()=>{preparing=null;loading=false;onChange();});
  onChange();return preparing;
 }
 function accept(result,account){
  if(typeof result.access_token!=='string'||!result.access_token||result.access_token.length>8192||!Number.isFinite(Number(result.expires_in))||Number(result.expires_in)<=0||result.scope!==scope||typeof result.email!=='string'||!result.email.includes('@'))throw fault('Não foi possível conferir a autorização do Drive.','authorization');
  if(account&&result.email.toLowerCase()!==account.toLowerCase())throw fault(messages.account,'account');
  if(config)config.hasSession=true;write(MODE_KEY,'cloudflare');force=false;onChange();return result;
 }
 async function renew(account){
  const started=generation;
  if(pendingLogout())throw fault(messages.reauthorize,'authorization');
  const result=await request('token',{account,force});if(started!==generation)throw fault('A conta mudou durante a operação.','account');return accept(result,account);
 }
 function connect(account){
  if(pendingLogout())return Promise.reject(fault('Aguarde a conclusão da desconexão para conectar outra conta.','authorization-pending'));
  if(!prepared||!config?.enabled){void prepare().catch(()=>{});return Promise.reject(fault('A conexão está sendo preparada. Toque em Conectar novamente.','authorization-pending'));}
  const oauth=win.google?.accounts?.oauth2;if(!oauth?.initCodeClient)return Promise.reject(fault('A conexão Google ainda está carregando. Toque em Conectar novamente.','configuration'));
  const started=generation;
  return new Promise((resolve,reject)=>{
   let settled=false;const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value);};
   const timer=setTimeout(()=>finish(fault('Não foi possível concluir a autorização do Google. Tente novamente.','authorization-pending')),interactiveTimeout);
   try{
    oauth.initCodeClient({client_id:config.clientId,scope,include_granted_scopes:false,ux_mode:'popup',...(account?{login_hint:account}:{}),select_account:!account,
     callback:response=>{
      if(settled)return;if(started!==generation){finish(fault('A conta mudou durante a operação.','account'));return;}
      if(response?.error||!response?.code){finish(fault('Conexão cancelada.',response?.error==='access_denied'?'cancelled':'authorization'));return;}
      void request('exchange',{code:response.code,account}).then(result=>{if(started!==generation)throw fault('A conta mudou durante a operação.','account');if(!settled)finish(null,accept(result,account));}).catch(error=>finish(error));
     },error_callback:response=>finish(fault(response?.type==='popup_failed_to_open'?'O iPhone precisa autorizar a abertura da conexão Google.':'Conexão cancelada.',response?.type==='popup_failed_to_open'?'popup':'cancelled'))}).requestCode();
   }catch{finish(fault('Não foi possível autorizar sua conta Google.','configuration'));}
  });
 }
 function disconnect(){
  generation++;force=false;write(MODE_KEY,null);write(LOGOUT_KEY,'true');if(config)config.hasSession=false;onChange();
  return request('logout',{}).then(()=>write(LOGOUT_KEY,null)).catch(()=>{}).finally(onChange);
 }
 return {prepare,managed,connect,renew,disconnect,invalidate(){generation++;force=true;},enabled:()=>!!config?.enabled,hasSession:()=>!!config?.hasSession&&!pendingLogout(),isPrepared:()=>prepared,status:()=>({authorizationLoading:loading||pendingLogout(),automaticReconnect:!!config?.hasSession&&!pendingLogout(),reconnectSetupRequired:!!config?.enabled&&!config.hasSession,managedAuthorization:managed()})};
}
