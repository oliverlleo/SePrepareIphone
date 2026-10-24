import assert from 'node:assert/strict';
import https from 'node:https';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {webcrypto} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {devices} from 'playwright';
import {isolatedWebKit} from './test-network.mjs';
import {createServer} from './serve.mjs';
import {createDriveAuth,AUTH_COOKIE,DRIVE_SCOPE} from '../worker/drive-auth.mjs';
import {newSpeech,ensureVersions,captureContentVersion} from './core.js';
const root=fileURLToPath(new URL('..',import.meta.url)),qa=path.join(root,'tests/qa-output');mkdirSync(qa,{recursive:true});
const key=path.join(qa,'localhost-key.pem'),cert=path.join(qa,'localhost-cert.pem');
if(!existsSync(key)||!existsSync(cert)){
 const openssl=process.platform==='win32'?'C:\\Program Files\\Git\\usr\\bin\\openssl.exe':'openssl';
 const result=spawnSync(openssl,['req','-x509','-newkey','rsa:2048','-keyout',key,'-out',cert,'-sha256','-days','2','-nodes','-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1,DNS:localhost'],{encoding:'utf8'});if(result.status!==0)throw Error('Unable to create local QA certificate: '+result.stderr);
}
let time=1800000000000,origin,renewals=0,exchanges=0,serverFailure=false,refuseAccess=false,uploads=0,success=false;
const remote=[],authCalls=[],browserCalls=[],checks=[],errors=[],check=message=>{checks.push(message);console.log('PASS '+message);};
const env={GOOGLE_CLIENT_ID:'test.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'FAKE_SERVER_CLIENT_SECRET',DRIVE_AUTH_KEY:Buffer.alloc(32,9).toString('base64url')};
const auth=createDriveAuth({crypto:webcrypto,now:()=>time,fetcher:async(url,options)=>{
 authCalls.push({url,at:time});if(serverFailure)throw Error('Simulated outage');
 if(url.includes('/about?'))return Response.json({user:{emailAddress:'teste@example.test'}});
 const params=new URLSearchParams(options.body);if(params.get('grant_type')==='refresh_token')renewals++;else exchanges++;
 return Response.json({access_token:'FAKE_SERVER_ACCESS_'+renewals,refresh_token:'FAKE_SERVER_REFRESH_SECRET',expires_in:3600,scope:DRIVE_SCOPE,token_type:'Bearer'});
}});
const assets=createServer(),server=https.createServer({key:readFileSync(key),cert:readFileSync(cert)},async(req,res)=>{
 if(!req.url.startsWith('/api/drive/')){assets.emit('request',req,res);return;}
 try{const chunks=[];for await(const part of req)chunks.push(part);const response=await auth(new Request(origin+req.url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})}),env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch{res.writeHead(500);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='https://127.0.0.1:'+server.address().port;env.APP_ORIGIN=origin;
const {browser,close:closeBrowser}=await isolatedWebKit();
try{
 const context=await browser.newContext({...devices['iPhone 13'],locale:'pt-BR',ignoreHTTPSErrors:true});
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 await context.exposeBinding('__driveMockRequest',async(_source,address,options)=>{
  const url=new URL(address);browserCalls.push({url:address,at:time});if(refuseAccess&&!url.pathname.endsWith('/about')){refuseAccess=false;return {status:401,json:{error:{errors:[{reason:'authError'}]}}};}
  if(url.pathname.endsWith('/about'))return {json:{user:{emailAddress:'teste@example.test'}}};
  if(options.method==='POST'){
   const chunks=options.body.split('Content-Type: application/json; charset=UTF-8\r\n\r\n'),meta=JSON.parse(chunks[1].split('\r\n--')[0]);
   const file={id:'renewal-upload-'+(++uploads),createdTime:new Date(Number(meta.appProperties.at)).toISOString(),appProperties:meta.appProperties};remote.unshift(file);return {json:file};
  }
  if(options.method==='DELETE')return {status:204};
  return {json:{files:url.searchParams.get('pageSize')==='1'?remote.slice(0,1):remote}};
 });
 const speech=newSpeech();speech.id='renewal-speech';speech.title='Reconexão do iPhone';speech.delta={ops:[{insert:'Texto fictício preservado.\n'}]};ensureVersions(speech);captureContentVersion(speech);
 const state={schema:1,contentVersion:2,speeches:[speech],categories:[],settings:{theme:'light',language:'pt-BR',onlineReview:false},vocabulary:[]};
 await context.addInitScript(({state})=>{
  const realFetch=window.fetch.bind(window);window.fetch=async(input,options={})=>{const address=typeof input==='string'?input:input.url;if(new URL(address,location.href).hostname!=='www.googleapis.com')return realFetch(input,options);const result=await window.__driveMockRequest(address,{method:options.method,body:options.body});return new Response(result.status===204?null:JSON.stringify(result.json||{}),{status:result.status||200,headers:{'Content-Type':'application/json'}});};
  Object.defineProperty(navigator,'platform',{value:'iPhone'});window.__ENABLE_SW_IN_TEST__=true;localStorage.setItem('seprepare-legal-notice-acknowledged','true');
  if(!localStorage.getItem('qa-renewal-seed')){localStorage.setItem('orador-state-v1',JSON.stringify(state));localStorage.setItem('seprepare-drive-web-v1',JSON.stringify({version:1,data:{offerSeen:true}}));localStorage.setItem('qa-renewal-seed','true');}
  window.__driveQA={prompts:[],events:[]};window.addEventListener('nativeDrive',event=>{window.__driveQA.events.push(event.detail);window.__driveQA.status=event.detail.status;});
  if(!localStorage.getItem('qa-no-gis'))window.google={accounts:{oauth2:{initCodeClient:options=>({requestCode(){window.__driveQA.prompts.push('code');queueMicrotask(()=>options.callback({code:'FAKE_ONE_TIME_CODE'}));}})}}};
  const match=window.matchMedia.bind(window);window.matchMedia=query=>{const result=match(query);if(query.includes('display-mode: standalone'))Object.defineProperty(result,'matches',{value:true});return result;};
 },{state});
 let page;
 const open=async()=>{page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.clock.install({time:new Date(time)});await page.goto(origin);await page.waitForFunction(()=>window.orador,{},{timeout:20000});await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now()+100)));};
 const advance=async predicate=>{for(let i=0;i<70;i++){await new Promise(resolve=>setTimeout(resolve,400));if(await page.evaluate(predicate))return;time+=10000;await page.clock.fastForward(10000);await new Promise(resolve=>setTimeout(resolve,400));}console.error(JSON.stringify({status:await page.evaluate(()=>window.__driveQA),authCalls,browserCalls,errors}));throw Error('Renewal state not reached: '+predicate);};
 const idle=()=>advance(()=>window.__driveQA.status&&window.__driveQA.status.connected&&!window.__driveQA.status.busy&&!window.__driveQA.status.backupPending&&!window.__driveQA.status.needsAuthorization);
 await open();await advance(()=>window.__driveQA.status&&!window.__driveQA.status.authorizationLoading);await page.locator('[data-action="nav"][data-view="settings"]').click();await page.locator('[data-action="drive-connect"]').first().click();await idle();assert.equal(exchanges,1);assert.equal(uploads,1);assert.equal(await page.evaluate(()=>window.__driveQA.prompts.length),1);
 const cookies=await context.cookies(origin),saved=cookies.find(row=>row.name===AUTH_COOKIE);assert(saved?.httpOnly&&saved.secure);assert(!saved.value.includes('FAKE_'));assert(!(await page.evaluate(()=>document.cookie)).includes(AUTH_COOKIE));assert(!await page.evaluate(()=>[...Object.values(localStorage),...Object.values(sessionStorage)].some(value=>String(value).includes('FAKE_SERVER_'))));assert(browserCalls[0].at-authCalls.find(row=>row.url.includes('/about?')).at>=10000);check('WebKit HTTPS: primeira autorização usa o serviço real de teste e respeita o intervalo de dez segundos após identificar a conta');
 await page.evaluate(()=>{localStorage.setItem('qa-no-gis','true');sessionStorage.clear();return window.orador.flushForUpdate();});await page.reload();await page.waitForFunction(()=>window.orador);await idle();assert.equal(exchanges,1);assert.equal(renewals,0);assert.equal(await page.evaluate(()=>typeof window.google),'undefined');assert.equal(await page.evaluate(()=>window.__driveQA.prompts.length),0);assert.equal(await page.evaluate(()=>window.orador.getState().speeches[0].title),'Reconexão do iPhone');check('WebKit HTTPS: recarregar sem sessão temporária retoma o Drive sem sessionStorage, biblioteca Google ou interação');
 time+=3601000;await page.clock.fastForward(3601000);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await advance(()=>window.__driveQA.status&&!window.__driveQA.status.needsAuthorization);assert.equal(renewals,1);assert.equal(exchanges,1);check('WebKit HTTPS: expiração após uma hora renova a autorização sem janela de login');
 refuseAccess=true;await page.locator('[data-action="nav"][data-view="home"]').click();await page.locator('.speech-card [data-action="edit"]').first().click();await page.evaluate(()=>window.orador.getEditor().insertText(0,'Edição após recusa do Google. ','user'));await page.locator('[data-action="save-editor"]').click();await advance(()=>window.__driveQA.status.backupPending);await idle();assert.equal(renewals,2);assert.equal(uploads,2);assert.equal(await page.evaluate(()=>window.__driveQA.status.needsReconnect),false);check('WebKit HTTPS: recusa de acesso renova o token e conclui o backup sem aviso falso de desconexão');
 serverFailure=true;time+=3601000;await page.clock.fastForward(3601000);await advance(()=>window.__driveQA.status&&!window.__driveQA.status.authorizationPending);assert.equal(await page.evaluate(()=>window.__driveQA.status.connected),true);assert.equal(exchanges,1);serverFailure=false;await idle();assert.equal(renewals,3);assert.equal(await page.evaluate(()=>window.__driveQA.prompts.length),0);check('WebKit HTTPS: serviço indisponível mantém a conta e tenta novamente automaticamente');
 await page.evaluate(()=>{window.__logoutDone=false;window.addEventListener('nativeDrive',event=>{if(event.detail.kind==='disconnect')window.__logoutDone=true;});});
 if(await page.evaluate(()=>['reader','editor'].includes(window.orador.getRuntime().view)))await page.locator('[data-action="back"]:visible').first().click();if(await page.evaluate(()=>window.orador.getRuntime().view==='reader'))await page.locator('[data-action="back"]:visible').first().click();await page.locator('[data-action="nav"][data-view="settings"]').click();await page.locator('[data-action="drive-settings"]').first().click();await page.locator('[data-action="drive-disconnect-confirm"]').click();await page.locator('[data-action="drive-disconnect"]').click();await advance(()=>window.__driveQA.status&&!window.__driveQA.status.connected&&!window.__driveQA.status.authorizationLoading);assert(!(await context.cookies(origin)).some(row=>row.name===AUTH_COOKIE));assert.equal(exchanges,1);assert.equal(await page.evaluate(()=>window.orador.getState().speeches.length),1);check('WebKit HTTPS: desconectar apaga o cookie protegido e conserva os discursos no iPhone');
 assert.deepEqual(errors,[]);await context.close();success=true;
}finally{
 writeFileSync(path.join(root,'QA-drive-iphone-renewal-1.0.56.json'),JSON.stringify({success,passed:checks.length,checks,errors,engine:'WebKit',transport:'HTTPS',googleServices:'simulated',realIPhone:false},null,2));await closeBrowser();await new Promise(resolve=>server.close(resolve));
}
