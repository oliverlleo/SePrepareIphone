export const DRIVE_SCOPE='https://www.googleapis.com/auth/drive.appdata';
export const AUTH_COOKIE='__Host-seprepare-drive';
const TOKEN_URL='https://oauth2.googleapis.com/token';
const ABOUT_URL='https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,permissionId)';
const SESSION_MS=180*86400000,MAX_BODY=16384,MAX_COOKIE=3800;
const encoder=new TextEncoder(),decoder=new TextDecoder();
const fail=(status,code)=>Object.assign(new Error(code),{status,code});
const base64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
function unbase64(value){if(typeof value!=='string'||!/^[A-Za-z0-9_-]+$/.test(value))throw fail(401,'reauthorize');return Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-value.length%4)%4)),char=>char.charCodeAt(0));}
const email=value=>typeof value==='string'&&value.length<=254&&/^[^\s@]+@[^\s@]+$/.test(value)?value.toLowerCase():'';
const token=value=>typeof value==='string'&&value.length>0&&value.length<=8192?value:'';
const headers=()=>new Headers({'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store, max-age=0','Pragma':'no-cache','Expires':'0','Vary':'Cookie, Origin','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"});
const clearCookie=()=>AUTH_COOKIE+'=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0';
function configuration(env,origin){
 try{
  const expected=new URL(env.APP_ORIGIN);if(expected.protocol!=='https:'||expected.origin!==origin||expected.href!==expected.origin+'/')return null;
  if(!/^[A-Za-z0-9_.-]+\.apps\.googleusercontent\.com$/.test(env.GOOGLE_CLIENT_ID||'')||!token(env.GOOGLE_CLIENT_SECRET))return null;
  const raw=unbase64(env.DRIVE_AUTH_KEY);if(raw.length!==32)return null;
  return {origin:expected.origin,clientId:env.GOOGLE_CLIENT_ID,clientSecret:env.GOOGLE_CLIENT_SECRET,key:raw};
 }catch{return null;}
}
async function body(request){
 if(!request.body)return {};
 if(Number(request.headers.get('Content-Length'))>MAX_BODY)throw fail(413,'request_too_large');
 const reader=request.body.getReader();let length=0,parts=[];
 try{for(;;){const result=await reader.read();if(result.done)break;length+=result.value.byteLength;if(length>MAX_BODY){await reader.cancel();throw fail(413,'request_too_large');}parts.push(result.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
 try{const value=JSON.parse(decoder.decode(bytes));if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}catch{throw fail(400,'invalid_request');}
}
function csrf(request,origin){
 if(request.headers.get('Origin')!==origin||request.headers.get('X-SePrepare-Request')!=='drive-v1'||request.headers.get('Content-Type')?.split(';')[0].trim()!=='application/json')throw fail(403,'request_rejected');
 const site=request.headers.get('Sec-Fetch-Site');if(site&&site!=='same-origin'&&site!=='none')throw fail(403,'request_rejected');
}
export function createDriveAuth({fetcher=globalThis.fetch,now=Date.now,crypto=globalThis.crypto}={}){
 const json=(value,status=200,cookie='')=>{const h=headers();if(cookie)h.set('Set-Cookie',cookie);return new Response(JSON.stringify(value),{status,headers:h});};
 async function aes(config){return crypto.subtle.importKey('raw',config.key,'AES-GCM',false,['encrypt','decrypt']);}
 const aad=config=>encoder.encode('seprepare-drive-session-v1|'+config.origin+'|'+config.clientId);
 async function seal(value,config){
  const iv=crypto.getRandomValues(new Uint8Array(12)),encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(config)},await aes(config),encoder.encode(JSON.stringify(value)));
  return 'v1.'+base64(iv)+'.'+base64(new Uint8Array(encrypted));
 }
 async function session(request,config){
  const matches=(request.headers.get('Cookie')||'').split(';').map(part=>part.trim()).filter(part=>part.startsWith(AUTH_COOKIE+'='));if(matches.length!==1)return null;
  const value=matches[0].slice(AUTH_COOKIE.length+1);if(value.length>MAX_COOKIE)return null;
  try{
   const [version,iv,cipher,...rest]=value.split('.');if(version!=='v1'||rest.length)return null;const nonce=unbase64(iv);if(nonce.length!==12)return null;
   const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:nonce,additionalData:aad(config)},await aes(config),unbase64(cipher));
   const data=JSON.parse(decoder.decode(plain));if(data.v!==1||!email(data.email)||!token(data.refresh)||data.scope!==DRIVE_SCOPE||!Number.isFinite(data.until)||data.until<=now()||data.until>now()+SESSION_MS+60000||data.grantUntil&&data.grantUntil<=now())return null;
   if(data.access&&(!token(data.access)||!Number.isFinite(data.accessUntil)))return null;
   return data;
  }catch{return null;}
 }
 async function cookie(data,config){
  const current=now(),until=Math.min(current+SESSION_MS,data.grantUntil||Infinity),payload={...data,until};
  let value=await seal(payload,config);
  if(value.length>MAX_COOKIE&&payload.access){delete payload.access;delete payload.accessUntil;value=await seal(payload,config);}
  if(value.length>MAX_COOKIE)throw fail(502,'invalid_google_response');
  return AUTH_COOKIE+'='+value+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age='+Math.max(0,Math.floor((until-current)/1000));
 }
 async function google(url,options){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
  try{
   const response=await fetcher(url,{...options,redirect:'error',signal:controller.signal});
   if(Number(response.headers.get('Content-Length'))>32768)throw fail(502,'invalid_google_response');
   const raw=await response.text();if(encoder.encode(raw).length>32768)throw fail(502,'invalid_google_response');let value;try{value=JSON.parse(raw);}catch{throw fail(502,'invalid_google_response');}
   if(!response.ok){if(value?.error==='invalid_grant')throw fail(401,'reauthorize');if(value?.error==='invalid_client'||value?.error==='unauthorized_client')throw fail(503,'configuration');if(response.status===401||response.status===403)throw fail(403,'permission');throw fail(503,'temporarily_unavailable');}
   return value;
  }catch(error){if(error.status)throw error;throw fail(503,'temporarily_unavailable');}finally{clearTimeout(timeout);}
 }
 async function googleTokens(parameters,config){
  const result=await google(TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,...parameters}).toString()});
  if(!token(result.access_token)||!Number.isFinite(Number(result.expires_in))||Number(result.expires_in)<=0||result.token_type&&result.token_type.toLowerCase()!=='bearer')throw fail(502,'invalid_google_response');
  if(result.scope&&!String(result.scope).split(' ').includes(DRIVE_SCOPE))throw fail(403,'permission');
  if(result.refresh_token&&!token(result.refresh_token))throw fail(502,'invalid_google_response');
  return result;
 }
 const accessReply=(data,at=0)=>({access_token:data.access,expires_in:Math.max(1,Math.floor((data.accessUntil-now())/1000)),token_type:'Bearer',scope:DRIVE_SCOPE,email:data.email,drive_request_at:at});
 async function exchange(request,input,config){
  if(typeof input.code!=='string'||!input.code||input.code.length>8192)throw fail(400,'invalid_request');
  if(input.account&&!email(input.account))throw fail(400,'invalid_request');
  const result=await googleTokens({grant_type:'authorization_code',code:input.code,redirect_uri:config.origin},config),issuedAt=now();
  const about=await google(ABOUT_URL,{headers:{Authorization:'Bearer '+result.access_token,Accept:'application/json'}}),verified=email(about?.user?.emailAddress),verifiedAt=now();
  if(!verified)throw fail(502,'invalid_google_response');if(input.account&&email(input.account)!==verified)throw fail(409,'account');
  const old=await session(request,config),refresh=result.refresh_token||(old?.email===verified?old.refresh:'');if(!refresh)throw fail(409,'offline_permission_required');
  const grantSeconds=Number(result.refresh_token_expires_in),grantUntil=Number.isFinite(grantSeconds)&&grantSeconds>0?issuedAt+grantSeconds*1000:old?.refresh===refresh?old.grantUntil:0;
  const data={v:1,email:verified,scope:DRIVE_SCOPE,refresh,access:result.access_token,accessUntil:issuedAt+Math.min(Number(result.expires_in),86400)*1000,grantUntil:grantUntil||0};
  return json(accessReply(data,verifiedAt),200,await cookie(data,config));
 }
 async function renew(request,input,config){
  const data=await session(request,config);if(!data)return json({error:'reauthorize'},401,clearCookie());
  if(input.account&&email(input.account)!==data.email)throw fail(409,'account');
  if(input.force!==undefined&&typeof input.force!=='boolean')throw fail(400,'invalid_request');
  if(!input.force&&data.access&&data.accessUntil>now()+30000)return json(accessReply(data),200,await cookie(data,config));
  try{
   const result=await googleTokens({grant_type:'refresh_token',refresh_token:data.refresh},config);
   const grantSeconds=Number(result.refresh_token_expires_in),next={...data,refresh:result.refresh_token||data.refresh,access:result.access_token,accessUntil:now()+Math.min(Number(result.expires_in),86400)*1000,...(Number.isFinite(grantSeconds)&&grantSeconds>0?{grantUntil:now()+grantSeconds*1000}:{})};
   return json(accessReply(next),200,await cookie(next,config));
  }catch(error){if(error.code==='reauthorize')return json({error:'reauthorize'},401,clearCookie());throw error;}
 }
 return async function handle(request,env){
  const url=new URL(request.url),config=configuration(env,url.origin);
  if(url.pathname==='/api/drive/config'&&request.method==='GET')return json(config?{enabled:true,clientId:config.clientId,scope:DRIVE_SCOPE,hasSession:!!await session(request,config)}:{enabled:false});
  if(!['/api/drive/exchange','/api/drive/token','/api/drive/logout'].includes(url.pathname))return json({error:'not_found'},404);
  if(request.method!=='POST')return json({error:'method_not_allowed'},405);
  try{
   let origin;try{origin=new URL(env.APP_ORIGIN).origin;}catch{throw fail(503,'configuration');}
   if(url.origin!==origin)throw fail(403,'request_rejected');csrf(request,origin);const input=await body(request);
   if(url.pathname==='/api/drive/logout')return json({ok:true},200,clearCookie());
   if(!config)throw fail(503,'configuration');
   if(url.pathname==='/api/drive/exchange')return await exchange(request,input,config);
   return await renew(request,input,config);
  }catch(error){return json({error:error.status?error.code:'temporarily_unavailable'},error.status||503);}
 };
}
