import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createDriveAuth,DRIVE_SCOPE,AUTH_COOKIE} from '../worker/drive-auth.mjs';
const origin='https://iphone.example.test',env={APP_ORIGIN:origin,GOOGLE_CLIENT_ID:'test.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'FAKE_CLIENT_SECRET',DRIVE_AUTH_KEY:Buffer.alloc(32,7).toString('base64url')};
let time=1800000000000,calls=[],failure='',refresh='FAKE_REFRESH_SECRET',access='FAKE_ACCESS_1',scope=DRIVE_SCOPE,identity='person@example.test',cookie='';
const handle=createDriveAuth({crypto:webcrypto,now:()=>time,fetcher:async(url,options)=>{
 calls.push({url,options});if(failure==='network')throw Error('FAKE_PRIVATE_ERROR');
 if(failure)return Response.json({error:failure,error_description:'FAKE_PRIVATE_ERROR'},{status:400});
 if(url.includes('/about?'))return Response.json({user:{emailAddress:identity}});
 return Response.json({access_token:access,expires_in:3600,token_type:'Bearer',scope,...(refresh?{refresh_token:refresh}:{})});
}});
function req(name,value={},overrides={}){const method=name==='config'?'GET':'POST';return new Request(origin+'/api/drive/'+name,{method,headers:{Origin:origin,'X-SePrepare-Request':'drive-v1','Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...overrides},...(method==='POST'?{body:JSON.stringify(value)}:{})});}
async function send(name,value,config=env,headers){const response=await handle(req(name,value,headers),config),data=await response.json();return {response,data,set:response.headers.get('Set-Cookie')};}
let checks=0;const pass=label=>{checks++;console.log('PASS '+label);};
{
 const r=await send('config',{},{});assert.deepEqual(r.data,{enabled:false});assert(!r.set);assert(!JSON.stringify(r.data).includes(env.GOOGLE_CLIENT_SECRET));pass('Configuração incompleta não expõe segredos nem anuncia renovação disponível');
}
{
 for(const headers of [{Origin:'https://evil.test'},{'X-SePrepare-Request':''},{'Content-Type':'text/plain'},{'Sec-Fetch-Site':'cross-site'}])assert.equal((await send('exchange',{code:'code'},env,headers)).response.status,403);
 assert.equal(calls.length,0);assert.equal((await handle(new Request(origin+'/api/drive/token'),env)).status,405);assert.equal((await handle(new Request(origin+'/api/drive/unknown'),env)).status,404);pass('Origem, cabeçalho, conteúdo e método rejeitam requisições indevidas antes de acessar o Google');
}
{
 assert.equal((await send('exchange',{code:'x'.repeat(17000)})).response.status,413);assert.equal((await send('exchange',[])).response.status,400);assert.equal((await send('exchange',{code:''})).response.status,400);assert.equal(calls.length,0);pass('Entrada inválida e corpo excessivo são limitados');
}
{
 const r=await send('exchange',{code:'FAKE_ONE_TIME_CODE'});assert.equal(r.response.status,200);assert.equal(r.data.email,identity);assert.equal(r.data.access_token,access);assert.equal(r.data.drive_request_at,time);
 assert(!JSON.stringify(r.data).includes(refresh));assert(!r.set.includes(refresh));assert(!r.set.includes(access));assert.match(r.set,/Path=\/; Secure; HttpOnly; SameSite=Strict; Max-Age=/);assert.match(r.set,new RegExp('^'+AUTH_COOKIE+'=v1\\.'));assert.match(r.response.headers.get('Cache-Control'),/no-store/);assert(!r.response.headers.has('Access-Control-Allow-Origin'));
 const params=new URLSearchParams(calls[0].options.body);assert.equal(params.get('redirect_uri'),origin);assert.equal(params.get('client_secret'),env.GOOGLE_CLIENT_SECRET);assert.equal(params.get('grant_type'),'authorization_code');cookie=r.set.split(';')[0];pass('Código de uso único confirma a conta e cria cookie cifrado, HttpOnly e restrito à origem');
}
{
 const before=calls.length,r=await send('token',{account:identity});assert.equal(r.response.status,200);assert.equal(calls.length,before);assert.equal((await send('config')).data.hasSession,true);pass('Reabertura aproveita a autorização válida sem outra chamada ao Google');
}
{
 const before=calls.length;assert.equal((await send('token',{account:'other@example.test'})).response.status,409);assert.equal(calls.length,before);assert.equal((await send('token',{force:'true'})).response.status,400);pass('Conta divergente e parâmetro de renovação inválido não alteram o vínculo');
}
{
 access='FAKE_ACCESS_2';refresh='FAKE_REFRESH_ROTATED';const r=await send('token',{account:identity,force:true});assert.equal(r.data.access_token,access);const params=new URLSearchParams(calls.at(-1).options.body);assert.equal(params.get('grant_type'),'refresh_token');assert.equal(params.get('refresh_token'),'FAKE_REFRESH_SECRET');cookie=r.set.split(';')[0];
 time+=3600001;refresh='';const renewed=await send('token',{account:identity});assert.equal(renewed.response.status,200);assert.equal(new URLSearchParams(calls.at(-1).options.body).get('refresh_token'),'FAKE_REFRESH_ROTATED');cookie=renewed.set.split(';')[0];pass('Expiração e recusa HTTP 401 renovam o acesso e preservam a rotação da autorização');
}
{
 failure='network';const r=await send('token',{force:true});assert.equal(r.response.status,503);assert(!r.set);assert(!JSON.stringify(r.data).includes('FAKE_'));failure='';assert.equal((await send('token',{force:true})).response.status,200);pass('Falha transitória conserva a autorização e permite tentar novamente sem login');
}
{
 const valid=cookie;cookie=cookie.slice(0,-8)+'AAAAAAAA';assert.equal((await send('token',{})).response.status,401);cookie=valid;
 assert.equal((await send('token',{}, {...env,DRIVE_AUTH_KEY:Buffer.alloc(32,8).toString('base64url')})).response.status,401);
 assert.equal((await send('token',{}, {...env,GOOGLE_CLIENT_ID:'different.apps.googleusercontent.com'})).response.status,401);assert.equal((await send('config')).data.hasSession,true);pass('Cookie adulterado, chave diferente e outro cliente Google não reutilizam a credencial');
}
{
 identity='other@example.test';refresh='OTHER_REFRESH';const r=await send('exchange',{code:'other',account:'person@example.test'});assert.equal(r.response.status,409);assert(!r.set);identity='person@example.test';pass('Autorização de outra conta não substitui silenciosamente a conta vinculada');
}
{
 refresh='';const old=cookie;cookie='';const r=await send('exchange',{code:'missing-refresh'});assert.equal(r.response.status,409);assert.equal(r.data.error,'offline_permission_required');assert(!r.set);cookie=old;const reused=await send('exchange',{code:'repeat-same-account',account:identity});assert.equal(reused.response.status,200);pass('Ausência de autorização durável exige consentimento, mas a mesma conta pode manter a autorização existente');
}
{
 scope='unrelated';assert.equal((await send('token',{force:true})).response.status,403);scope=DRIVE_SCOPE;failure='invalid_client';const r=await send('token',{force:true});assert.equal(r.response.status,503);assert(!r.set);failure='';pass('Permissão insuficiente e configuração Google inválida não são confundidas com desconexão do usuário');
}
{
 const before=calls.length,r=await send('logout',{});assert.equal(r.response.status,200);assert.match(r.set,/Max-Age=0/);assert.equal(calls.length,before);pass('Desconexão elimina apenas a sessão deste PWA, sem revogar PC ou Android');
}
{
 failure='invalid_grant';const r=await send('token',{force:true});assert.equal(r.response.status,401);assert.match(r.set,/Max-Age=0/);failure='';pass('Revogação real do Google exige nova autorização e remove o cookie inválido');
}
{
 time+=181*86400000;const r=await send('token',{});assert.equal(r.response.status,401);pass('Credencial vencida não permanece válida indefinidamente');
}
console.log('TOTAL',checks,'verificações da autorização protegida passaram.');
