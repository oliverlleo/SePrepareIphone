import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {devices} from 'playwright';
import {isolatedWebKit} from './test-network.mjs';
import {createServer} from './serve.mjs';
import {newSpeech,ensureVersions,captureContentVersion} from './core.js';
const root=fileURLToPath(new URL('..',import.meta.url)),base=process.env.UPGRADE_BASE||'4a75aa42cf5384a3833b6e9d9652cbb92a04e577',oldFiles=new Map();
for(const file of ['index.html','app.js','launch-gate.js','sw.js','drive.css'])oldFiles.set('/'+file,execFileSync('git',['show',base+':'+file],{cwd:root,maxBuffer:5000000}));
const oldBuild=/data-seprepare-build="([^"]+)/.exec(oldFiles.get('/index.html').toString())[1],newBuild=/data-seprepare-build="([^"]+)/.exec(readFileSync(path.join(root,'index.html'),'utf8'))[1];
let release='old';const server=createServer({sourceForRequest:({url})=>release==='old'?oldFiles.get(url.pathname==='/'?'/index.html':url.pathname):null});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const {browser,close:closeBrowser}=await isolatedWebKit();const context=await browser.newContext({...devices['iPhone 13'],locale:'pt-BR'}),screens=path.join(root,'tests/qa-output/drive-iphone');mkdirSync(screens,{recursive:true});
const checks=[],errors=[];let success=false;
const document=newSpeech();document.id='legacy-real-upgrade';document.title='Meu discurso antes da atualização';document.delta={ops:[{insert:'Texto preservado da instalação anterior.\n',attributes:{bold:true}}]};ensureVersions(document);captureContentVersion(document);
const state={schema:1,contentVersion:2,speeches:[document],categories:[],settings:{theme:'light',language:'pt-BR'},vocabulary:['SePrepare']};
const check=message=>{checks.push(message);console.log('PASS',message);};
try{
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 await context.addInitScript(({state})=>{
  Object.defineProperty(navigator,'platform',{value:'iPhone'});window.__ENABLE_SW_IN_TEST__=true;
  const match=window.matchMedia.bind(window);window.matchMedia=query=>{const result=match(query);if(query.includes('display-mode: standalone'))Object.defineProperty(result,'matches',{value:true});return result;};
  localStorage.setItem('seprepare-legal-notice-acknowledged','true');
  if(!localStorage.getItem('qa-legacy-upgrade')){localStorage.setItem('orador-state-v1',JSON.stringify(state));localStorage.setItem('seprepare-web-drive-v1',JSON.stringify({connected:true,email:'pessoa@example.test',autoBackup:false,autoRead:false,frequencyDays:30,offerSeen:true}));localStorage.setItem('qa-legacy-upgrade','true');}
  window.__qaPrompts=[];window.google={accounts:{oauth2:{hasGrantedAllScopes:()=>true,initTokenClient:options=>({requestAccessToken:overrides=>{window.__qaPrompts.push(overrides||{});queueMicrotask(()=>options.callback({access_token:'LEGACY_FAKE_ACCESS',expires_in:3600,scope:options.scope}));}})}}};
  const realFetch=window.fetch.bind(window);window.fetch=async(input,options)=>{const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.hostname!=='www.googleapis.com')return realFetch(input,options);if(url.pathname.endsWith('/userinfo'))return Response.json({email:'pessoa@example.test'});if(url.pathname.endsWith('/about'))return Response.json({user:{emailAddress:'pessoa@example.test'}});return Response.json({files:[]});};
 },{state});
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.clock.install({time:new Date('2026-10-24T12:00:00Z')});
 await page.goto(origin);await page.waitForFunction(()=>window.orador);assert.equal(await page.locator('html').getAttribute('data-seprepare-build'),oldBuild);
 await Promise.race([page.evaluate(()=>navigator.serviceWorker.ready),new Promise((_,reject)=>setTimeout(()=>reject(Error('Legacy service worker not ready')),15000))]);
 await page.locator('.speech-card [data-action="edit"]').click();await page.evaluate(()=>window.orador.getEditor().insertText(0,'Última edição antes de atualizar. ','user'));await page.locator('[data-action="save-editor"]').click();
 if(await page.evaluate(()=>['editor','part'].includes(window.orador.getRuntime().view)))await page.locator('[data-action="back"]').first().click();
 if(await page.evaluate(()=>window.orador.getRuntime().view!=='home'))await page.locator('[data-action="nav"][data-view="home"]').click();
 assert.equal(await page.evaluate(()=>window.orador.flushForUpdate()),true);const before=await page.evaluate(()=>window.orador.getState());
 assert(before.speeches[0].delta.ops.some(op=>String(op.insert).startsWith('Última edição')));check('Versão antiga real inicia, edita e confirma a gravação na memória do PWA.');
 await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now()+100)));release='new';
 await page.evaluate(()=>{window.dispatchEvent(new Event('online'));window.dispatchEvent(new Event('focus'));});
 let upgraded=false;
 for(let attempt=0;attempt<60;attempt++){
  try{if(await page.locator('html').getAttribute('data-seprepare-build')===newBuild&&await page.evaluate(()=>!!window.orador)){upgraded=true;break;}await page.clock.fastForward(10000);}catch(error){if(!/destroyed|navigation|context/i.test(error.message))throw error;}
  await new Promise(resolve=>setTimeout(resolve,150));
 }
 if(!upgraded){console.error('UPGRADE DEBUG',JSON.stringify({errors,htmlBuild:await page.locator('html').getAttribute('data-seprepare-build'),body:(await page.locator('body').innerText()).slice(-2000),registrations:await page.evaluate(async()=>(await navigator.serviceWorker.getRegistrations()).map(r=>({active:r.active?.state,installing:r.installing?.state,waiting:r.waiting?.state})))},null,2));throw Error('Automatic installed update did not finish');}
 const after=await page.evaluate(()=>window.orador.getState());assert.deepEqual(after.speeches,before.speeches);assert.deepEqual(after.categories,before.categories);assert.deepEqual(after.vocabulary,before.vocabulary);check('Atualização automática recebe o novo shell e preserva os discursos, versões e a última edição.');
 const prefs=await page.evaluate(()=>JSON.parse(localStorage.getItem('seprepare-drive-web-v1')));assert.equal(prefs.data.email,'pessoa@example.test');assert.equal(prefs.data.connected,true);assert.equal(prefs.data.autoBackup,false);assert.equal(prefs.data.autoRead,false);check('Migração conserva a conta antiga e respeita os dois controles explicitamente desligados.');
 const uploads=await page.evaluate(()=>navigator.serviceWorker.getRegistrations());assert(uploads.length);await context.setOffline(true);await page.reload();await page.waitForFunction(()=>window.orador);assert.deepEqual((await page.evaluate(()=>window.orador.getState())).speeches,before.speeches);assert.equal(await page.locator('[data-drive-document]').count(),1);await page.screenshot({path:path.join(screens,'upgrade-preserved-offline.png')});check('Após atualizar, a nova versão reabre offline com o caderno e a nuvem no card.');
 const offlineWorker=await page.evaluate(async()=>{const response=await fetch('./content-index-worker.js');return {status:response.status,type:response.headers.get('Content-Type')};});
 assert.equal(offlineWorker.status,200);assert.match(offlineWorker.type,/javascript/);check('Worker de indexação sem query de versão usa o código da versão atual também offline.');
 assert.deepEqual(errors,[]);success=true;
}finally{
 writeFileSync(path.join(root,'QA-drive-iphone-upgrade-1.0.56.json'),JSON.stringify({success,checks,errors,engine:'WebKit',realIPhone:false,realServiceWorker:true,googleServices:'simulated'},null,2));await closeBrowser();await new Promise(resolve=>server.close(resolve));
}
