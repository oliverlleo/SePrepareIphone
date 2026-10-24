import {createCloudflareAuthorization} from './cloudflare-authorization.js';
const KEY='seprepare-web-drive-token-v1';
const fault=(message,code)=>Object.assign(new Error(message),{code});
// Preserve the iPhone's bounded, tab-scoped credential during a reload/BFCache
// return. A refresh token is never written to browser storage.
export function createIosAuthorization({window:win=window,storage=win.sessionStorage,now=Date.now,timeout=30000,onChange=()=>{},backend=true}={}){
 let generation=0;
 const broker=backend&&win.location?.origin?createCloudflareAuthorization({window:win,onChange,timeout}):null;
 function invalidate(){generation++;broker?.invalidate();try{storage.removeItem(KEY);}catch{}}
 function cached(account){
  if(!account)return null;
  try{const value=JSON.parse(storage.getItem(KEY)||'null');if(value&&typeof value.token==='string'&&value.token&&value.token.length<=8192&&Number.isFinite(value.expiresAt)&&value.expiresAt>now()+15000&&value.expiresAt<=now()+86400000&&(!value.account||value.account.toLowerCase()===account.toLowerCase()))return {access_token:value.token,expires_in:(value.expiresAt-now())/1000,scope:'https://www.googleapis.com/auth/drive.appdata'};}catch{}
  return null;
 }
 function acquire(options){
  const {mode,account}=options;
  if(broker&&!broker.isPrepared()){
   const existing=cached(account);if(existing&&mode!=='user')return Promise.resolve(existing);
   if(mode!=='user')return broker.prepare().then(()=>acquire(options));
   void broker.prepare().catch(()=>{});return Promise.reject(fault('A conexão está sendo preparada. Toque em Conectar novamente.','authorization-pending'));
  }
  if(broker?.managed()){
   if(mode==='user'&&broker.enabled()&&!broker.hasSession())return broker.connect(account).then(result=>{try{storage.removeItem(KEY);}catch{}return result;});
   const existing=cached(account);if(existing)return Promise.resolve(existing);
   return broker.renew(account);
  }
  return legacyAcquire(options);
 }
 function legacyAcquire({mode,account,clientId,scopes}){
  const existing=cached(account);if(existing)return Promise.resolve(existing);
  const oauth=win.google?.accounts?.oauth2;if(!oauth?.initTokenClient)return Promise.reject(fault('A conexão Google ainda está carregando.','configuration'));
  const started=generation;
  return new Promise((resolve,reject)=>{
   let settled=false;
   const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value);};
   const timer=setTimeout(()=>finish(fault('Não foi possível concluir a autorização do Google. Tente novamente.','authorization-pending')),timeout);
   try{
    const client=oauth.initTokenClient({client_id:clientId,scope:scopes.join(' '),include_granted_scopes:false,
     callback:response=>{
      if(settled)return;if(started!==generation){finish(fault('A conta mudou durante a operação.','account'));return;}
      if(response?.error){finish(fault(response.error==='access_denied'?'Conexão cancelada.':'A autorização do Google precisa ser renovada.',response.error==='access_denied'?'cancelled':'authorization'));return;}
      const granted=typeof oauth.hasGrantedAllScopes==='function'?oauth.hasGrantedAllScopes(response,...scopes):scopes.every(scope=>String(response.scope||'').split(' ').includes(scope));
      if(!response?.access_token||!granted||!Number.isFinite(Number(response.expires_in))||Number(response.expires_in)<=0){finish(fault('Autorize o acesso à área privada do Drive para continuar.','authorization'));return;}
      try{storage.setItem(KEY,JSON.stringify({token:response.access_token,account:account||'',expiresAt:now()+Math.min(Number(response.expires_in),86400)*1000-1000}));}catch{}
      finish(null,response);
     },error_callback:response=>finish(fault(response?.type==='popup_failed_to_open'?'O iPhone precisa autorizar a abertura da conexão Google.':'Conexão cancelada.',response?.type==='popup_failed_to_open'?'popup':'cancelled'))});
    // Keep the first interactive request synchronous with the user's gesture.
    client.requestAccessToken({prompt:mode==='silent'?'none':account?'':'select_account',...(account?{login_hint:account}:{})});
   }catch{finish(fault('Não foi possível autorizar sua conta Google.','configuration'));}
  });
 }
 function confirm({email,accessToken}){
  try{const value=JSON.parse(storage.getItem(KEY)||'null');if(value?.token===accessToken){value.account=email.toLowerCase();storage.setItem(KEY,JSON.stringify(value));}}catch{}
 }
 return {acquire,invalidate,confirm,prepare:force=>broker?.prepare(force)||Promise.resolve(),managed:()=>!!broker&&(broker.managed()||!broker.isPrepared()),allowGesture:()=>!broker||(broker.isPrepared()&&!broker.managed()),disconnect:()=>{generation++;try{storage.removeItem(KEY);}catch{}return broker?.disconnect()||Promise.resolve();},status:()=>broker?.status()||{},canResume:account=>!!cached(account)||!!broker&&(!broker.isPrepared()||broker.hasSession()||broker.managed()&&!broker.enabled())};
}
