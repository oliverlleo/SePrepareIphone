import assert from 'node:assert/strict';
import {createCloudflareAuthorization} from './cloudflare-authorization.js';
import {createIosAuthorization} from './ios-authorization.js';
import {fixture,until} from './drive-web-fixture.mjs';
const scope='https://www.googleapis.com/auth/drive.appdata',account='person@example.test';
let checks=0;const pass=label=>{checks++;console.log('PASS '+label);};
function fixtureBroker(){
 const values=new Map(),requests=[],codes=[];let session=false,failure='',late=null;
 const win={location:{origin:'https://iphone.example.test'},localStorage:{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)},sessionStorage:{getItem:()=>null,removeItem(){}},google:{accounts:{oauth2:{initCodeClient:options=>({requestCode(){codes.push(options);late=()=>options.callback({code:'FAKE_CODE'});queueMicrotask(late);}})}}},fetch:async(url,options)=>{
  requests.push({url,options});if(failure==='network')throw Error('offline');if(failure)return Response.json({error:failure},{status:401});
  if(url.endsWith('/config'))return Response.json({enabled:true,clientId:'test.apps.googleusercontent.com',scope,hasSession:session});
  if(url.endsWith('/logout')){session=false;return Response.json({ok:true});}
  session=true;return Response.json({access_token:'TEST_MEMORY_TOKEN_MANAGED',expires_in:3600,scope,email:account});
 }};
 return {win,values,requests,codes,setFailure:value=>{failure=value;},setSession:value=>{session=value;},late:()=>late?.()};
}
{
 const f=fixtureBroker(),broker=createCloudflareAuthorization({window:f.win});await broker.prepare();assert(broker.managed());assert(broker.status().reconnectSetupRequired);assert.equal(f.codes.length,0);const pending=broker.connect(account);assert.equal(f.codes.length,1);assert.equal(f.codes[0].login_hint,account);const result=await pending;assert.equal(result.email,account);assert(broker.status().automaticReconnect);const request=f.requests.at(-1);assert.equal(request.options.credentials,'same-origin');assert.equal(request.options.redirect,'error');assert.equal(request.options.headers['X-SePrepare-Request'],'drive-v1');assert(![...f.values.values()].some(value=>value.includes('TOKEN')));pass('Consentimento inicial começa no toque e mantém credenciais fora do armazenamento acessível ao aplicativo');
 f.win.google=undefined;await broker.renew(account);assert.equal(f.codes.length,1);assert(f.requests.at(-1).url.endsWith('/token'));broker.invalidate();await broker.renew(account);assert.equal(JSON.parse(f.requests.at(-1).options.body).force,true);await broker.renew(account);assert.equal(JSON.parse(f.requests.at(-1).options.body).force,false);pass('Reabertura e HTTP 401 usam a autorização protegida sem biblioteca Google ou nova janela');
 f.setFailure('network');await assert.rejects(broker.renew(account),{code:'network'});assert(broker.hasSession());f.setFailure('');await broker.renew(account);pass('Interrupção de rede mantém o vínculo e permite retomar automaticamente');
 f.setFailure('reauthorize');await assert.rejects(broker.renew(account),{code:'authorization'});assert(!broker.hasSession());assert(broker.status().reconnectSetupRequired);f.setFailure('');pass('Revogação real pede autorização explicitamente e não repete popups');
 await broker.disconnect();assert(!broker.hasSession());assert(!f.values.has('seprepare-drive-renewal-v1-logout'));assert(f.requests.at(-1).url.endsWith('/logout'));pass('Desconexão remove a sessão local protegida');
}
{
 const f=fixtureBroker(),broker=createCloudflareAuthorization({window:f.win});await broker.prepare();f.setFailure('network');await broker.disconnect();assert.equal(f.values.get('seprepare-drive-renewal-v1-logout'),'true');await assert.rejects(broker.connect(account),{code:'authorization-pending'});f.setFailure('');await broker.prepare(true);assert(!broker.status().authorizationLoading);assert(!f.values.has('seprepare-drive-renewal-v1-logout'));pass('Desconexão offline é concluída ao recuperar a rede antes de permitir outra conta');
}
{
 const f=fixtureBroker();f.setSession(true);const provider=createIosAuthorization({window:f.win});await provider.prepare();assert(provider.managed());assert(!provider.allowGesture());assert(provider.canResume(account));f.win.google=undefined;const result=await provider.acquire({mode:'silent',account});assert.equal(result.email,account);assert.equal(f.codes.length,0);provider.invalidate();await provider.acquire({mode:'silent',account});assert.equal(JSON.parse(f.requests.at(-1).options.body).force,true);pass('Provedor do iPhone retoma sem token de sessão e impede autorizações por toques comuns');
}
{
 let attempts=0;const authorization={managed:()=>true,canResume:()=>true,allowGesture:()=>false,acquire:async()=>{if(++attempts===1)throw Object.assign(Error('offline'),{code:'network'});return {access_token:'TEST_MEMORY_TOKEN_MANAGED',expires_in:3600,scope};}};
 const f=fixture({linked:true,authorization});await until(()=>attempts===1&&!f.status().authorizationPending);assert(f.status().connected);assert(!f.status().needsReconnect);f.doc.dispatchEvent(new Event('pointerdown'));assert.equal(attempts,1);const retry=[...f.scheduled.values()].find(row=>row.delay===10000);assert(retry);f.advance(10000);retry.fn();await until(()=>!f.status().needsAuthorization);assert.equal(attempts,2);assert.equal(f.oauth.requests.length,0);assert.equal(f.status().error,'');f.dispose();pass('Controlador repete falha temporária da autorização após dez segundos sem pedir interação');
}
{
 let attempts=0;const authorization={managed:()=>true,canResume:()=>true,allowGesture:()=>false,acquire:async()=>{attempts++;return {access_token:'TEST_MEMORY_TOKEN_MANAGED',expires_in:3600,scope};},invalidate(){}};
 const f=fixture({authorization});await f.action('connect');await f.send();f.getState().speeches[0].title='Nova alteração';await f.save();f.advance(10000);f.faults.unauthorized=1;await f.run();assert.equal(attempts,2);assert.equal(f.uploads(),2);assert(!f.status().needsAuthorization);assert.equal(f.oauth.requests.length,0);f.dispose();pass('Backup renova a autorização recusada e conclui o envio sem erro falso de conta desconectada');
}
console.log('TOTAL',checks,'verificações da reconexão gerenciada passaram.');
