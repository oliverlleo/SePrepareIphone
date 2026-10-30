import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createDriveAuth,DRIVE_SCOPE} from '../worker/drive-auth.mjs';
import {createCloudflareAuthorization} from './cloudflare-authorization.js';
const origin='https://apple.example.test';
const env={APP_ORIGIN:origin,GOOGLE_CLIENT_ID:'test.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'FAKE_SECRET',DRIVE_AUTH_KEY:Buffer.alloc(32,11).toString('base64url')};
let requests=0,cookie='';
const handle=createDriveAuth({crypto:webcrypto,fetcher:async url=>{
 requests++;return url.includes('/about?')?Response.json({user:{emailAddress:'person@example.test'}}):Response.json({access_token:'FAKE_ACCESS',refresh_token:'FAKE_REFRESH',expires_in:3600,scope:DRIVE_SCOPE});
}});
async function post(name,overrides={},remove=[]){
 const headers=new Headers({Origin:origin,'X-SePrepare-Request':'drive-v1','Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...overrides});
 for(const key of remove)headers.delete(key);
 return handle(new Request(origin+'/api/drive/'+name,{method:'POST',headers,body:JSON.stringify(name==='exchange'?{code:'FAKE_CODE'}:{account:'person@example.test'})}),env);
}
let checks=0;function pass(label){checks++;console.log('PASS '+label);}
const exchange=await post('exchange');assert.equal(exchange.status,200);cookie=exchange.headers.get('set-cookie').split(';')[0];
assert.equal((await post('token',{'Sec-Fetch-Site':'same-origin'})).status,200);pass('iPhone: sessão existente com Origin e same-origin continua funcionando');
assert.equal((await post('token',{'Sec-Fetch-Site':'same-site'})).status,200);pass('Origem exata aceita metadado same-site sem bloquear a retomada');
for(const site of ['same-origin','same-site',null]) {
 const headers={Referer:origin+'/index.html?source=pwa',...(site?{'Sec-Fetch-Site':site}:{})};
 assert.equal((await post('token',headers,['Origin'])).status,200);
 pass('PWA sem Origin valida Referer exato e cabeçalho próprio ('+(site||'metadado ausente')+')');
}
for(const scenario of [
 {headers:{Origin:'null',Referer:origin+'/'}},
 {headers:{Origin:'https://evil.example.test',Referer:origin+'/'}},
 {headers:{Origin:origin+'.evil.test'}},
 {headers:{Referer:'https://evil.example.test/'},remove:['Origin']},
 {headers:{Referer:origin+'/','Sec-Fetch-Site':'cross-site'},remove:['Origin']},
 {headers:{'Sec-Fetch-Site':'cross-site'}},
 {headers:{Referer:origin+'/'},remove:['Origin','X-SePrepare-Request']},
 {headers:{'Content-Type':'text/plain'}},
 {headers:{},remove:['Origin','Referer']}
]) {
 const before=requests;assert.equal((await post('token',scenario.headers,scenario.remove)).status,403);assert.equal(requests,before);
}
pass('Requisições estrangeiras, opacas, sem prova de origem ou sem cabeçalho próprio continuam recusadas antes do Google');
assert.equal((await post('token',{'Sec-Fetch-Site':'same-origin'})).status,200);pass('Tentativas recusadas não invalidam o cookie do iPhone');
{
 let error='request_rejected';const storage=new Map();
 const win={location:{origin},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},fetch:async url=>
  url.endsWith('/config')?Response.json({enabled:true,hasSession:true,clientId:env.GOOGLE_CLIENT_ID,scope:DRIVE_SCOPE}):Response.json({error},{status:403})};
 const broker=createCloudflareAuthorization({window:win});await broker.prepare();
 await assert.rejects(broker.renew('person@example.test'),e=>e.code==='authorization');
 assert(broker.hasSession());pass('Rejeição da requisição não vira falha temporária de rede nem apaga a sessão protegida');
 error='temporarily_unavailable';await assert.rejects(broker.renew('person@example.test'),e=>e.code==='network');pass('Indisponibilidade real mantém repetição automática já usada pelo iPhone');
}
console.log('TOTAL',checks,'verificações da compatibilidade iPad/iPhone');
