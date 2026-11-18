import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {Miniflare,Response} from 'miniflare';

const require=createRequire(import.meta.url);
const root=fileURLToPath(new URL('..',import.meta.url));
const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
// The installed runtime can lag the deployment's compatibility date. Keep the
// deployed date unchanged and make the local runtime's limit visible.
const version=require('workerd/package.json').version;
const stamp=version.match(/\.(\d{4})(\d{2})(\d{2})\./);
assert(stamp,'workerd version must identify its supported date');
const runtimeDate=stamp.slice(1).join('-');
const compatibilityDate=[config.compatibility_date,runtimeDate].sort()[0];
if(compatibilityDate!==config.compatibility_date)console.log(`INFO Runtime local ${runtimeDate}; deploy mantém ${config.compatibility_date}.`);
const origin='https://iphone.example.test',scope='https://www.googleapis.com/auth/drive.appdata';
const tokenUrl='https://oauth2.googleapis.com/token',aboutUrl='https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,permissionId)';
const calls=[];
let redirectTarget='',googleFailure=false;
const mf=new Miniflare({
 compatibilityDate,modulesRoot:root,
 modules:[
  {type:'ESModule',path:fileURLToPath(new URL('../worker/index.mjs',import.meta.url))},
  {type:'ESModule',path:fileURLToPath(new URL('../worker/drive-auth.mjs',import.meta.url))}
 ],
 bindings:{APP_ORIGIN:origin,GOOGLE_CLIENT_ID:'test.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'FAKE_CLIENT_SECRET',DRIVE_AUTH_KEY:Buffer.alloc(32,7).toString('base64url')},
 // Native Workers fetch constructs the request before this interception. Node
 // fetch stubs alone missed the incompatible redirect mode in production.
 outboundService:async request=>{
  assert([tokenUrl,aboutUrl].includes(request.url),'OAuth credentials must never follow a redirect');
  calls.push(request.url);
  if(request.url===redirectTarget)return new Response(null,{status:302,headers:{Location:'https://untrusted.example.test/collect'}});
  if(request.url===aboutUrl){assert.equal(request.headers.get('Authorization'),'Bearer FAKE_RUNTIME_ACCESS');return Response.json({user:{emailAddress:'person@example.test'}});}
  const parameters=new URLSearchParams(await request.text());
  assert.equal(parameters.get('client_secret'),'FAKE_CLIENT_SECRET');
  assert(['authorization_code','refresh_token'].includes(parameters.get('grant_type')));
  if(googleFailure)return Response.json({error:'invalid_grant'},{status:400});
  return Response.json({access_token:'FAKE_RUNTIME_ACCESS',refresh_token:'FAKE_RUNTIME_REFRESH',expires_in:3600,scope,token_type:'Bearer'});
 }
});
const send=(name,body={},cookie='')=>mf.dispatchFetch(origin+'/api/drive/'+name,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-SePrepare-Request':'drive-v1',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
let checks=0;const pass=label=>{checks++;console.log('PASS '+label);};
try{
 const connected=await send('exchange',{code:'FAKE_CODE'});
 assert.equal(connected.status,200,await connected.clone().text());
 assert.equal((await connected.json()).email,'person@example.test');
 assert.deepEqual(calls,[tokenUrl,aboutUrl]);
 const protectedCookie=connected.headers.get('Set-Cookie');
 assert.match(protectedCookie,/Secure; HttpOnly; SameSite=Strict/);
 assert(!protectedCookie.includes('FAKE_'));
 let cookie=protectedCookie.split(';')[0];
 pass('Workers real troca código, identifica conta e emite cookie cifrado sem erro de redirect');
 const renewed=await send('token',{account:'person@example.test',force:true},cookie);
 assert.equal(renewed.status,200,await renewed.clone().text());
 assert.equal((await renewed.json()).access_token,'FAKE_RUNTIME_ACCESS');
 cookie=renewed.headers.get('Set-Cookie').split(';')[0];
 pass('Workers real renova a sessão existente sem novo consentimento');
 for(const url of [tokenUrl,aboutUrl]){
  redirectTarget=url;const before=calls.length;
  const rejected=await send('exchange',{code:'FAKE_CODE'},cookie);
  assert.equal(rejected.status,502);
  assert.deepEqual(await rejected.json(),{error:'invalid_google_response'});
  assert(!rejected.headers.has('Set-Cookie'));
  assert.equal(calls.length-before,url===tokenUrl?1:2);
 }
 redirectTarget='';
 assert.equal((await send('token',{force:true},cookie)).status,200);
 pass('Redirects do token e da identidade são rejeitados sem encaminhar credenciais ou apagar a sessão');
 googleFailure=true;const expired=await send('token',{force:true},cookie);
 assert.equal(expired.status,401);
 assert.deepEqual(await expired.json(),{error:'reauthorize'});
 assert.match(expired.headers.get('Set-Cookie'),/Max-Age=0/);
 pass('Workers real distingue revogação do Google de indisponibilidade da rede');
 console.log('TOTAL',checks,'verificações no runtime Workers passaram (Google simulado).');
}finally{await mf.dispose();}
