// Isolated HTTPS/WebKit flow. Google responses and iPad header variants are simulated.
import assert from 'node:assert/strict';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {webcrypto} from 'node:crypto';
import {devices} from 'playwright';
import {isolatedWebKit} from './test-network.mjs';
import {createDriveAuth,DRIVE_SCOPE,AUTH_COOKIE} from '../worker/drive-auth.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),dir=path.join(root,'tests/qa-output');fs.mkdirSync(dir,{recursive:true});
const key=path.join(dir,'ipad-auth-key.pem'),cert=path.join(dir,'ipad-auth-cert.pem');
if(!fs.existsSync(key)){
 const openssl=process.platform==='win32'?'C:/Program Files/Git/usr/bin/openssl.exe':'openssl';
 const result=spawnSync(openssl,['req','-x509','-newkey','rsa:2048','-keyout',key,'-out',cert,'-sha256','-days','2','-nodes','-subj','/CN=localhost']);assert.equal(result.status,0);
}
let origin,variant='',clock=Date.now(),renewals=0,exchanges=0,temporaryFailure=false,strictCookieHeaders=true;
const env={GOOGLE_CLIENT_ID:'test.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'FAKE_SECRET',DRIVE_AUTH_KEY:Buffer.alloc(32,15).toString('base64url')};
const auth=createDriveAuth({crypto:webcrypto,now:()=>clock,fetcher:async(url,options)=>{
 if(temporaryFailure)throw Error('simulated outage');
 if(url.includes('/about?'))return Response.json({user:{emailAddress:'person@example.test'}});
 const params=new URLSearchParams(options.body);params.get('grant_type')==='refresh_token'?renewals++:exchanges++;
 return Response.json({access_token:'FAKE_ACCESS_'+renewals,refresh_token:'FAKE_REFRESH',expires_in:3600,scope:DRIVE_SCOPE});
}});
const server=https.createServer({key:fs.readFileSync(key),cert:fs.readFileSync(cert)},async(req,res)=>{
 try{
  if(req.url==='/qa'){
   res.setHeader('Content-Type','text/html');res.end('<!doctype html><button id="connect">Conectar</button><script type="module" src="/client.js"></script>');return;
  }
  if(req.url==='/client.js'){
   res.setHeader('Content-Type','text/javascript');res.end(`import {createIosAuthorization} from '/protection/ios-authorization.js';
    const provider=createIosAuthorization({window});window.qa={prompts:0};localStorage.setItem('notebook-qa','PRESERVED');
    window.google={accounts:{oauth2:{initCodeClient:options=>({requestCode(){window.qa.prompts++;queueMicrotask(()=>options.callback({code:'FAKE_CODE'}));}})}}};
    window.qa.acquire=mode=>provider.acquire({mode,account:'person@example.test'});
    window.qa.invalidate=()=>provider.invalidate();
    document.querySelector('button').onclick=()=>{window.qa.acquire('user').then(()=>window.qa.connected=true).catch(e=>window.qa.error=e.code);};
    provider.prepare().then(()=>window.qa.ready=true);`);return;
  }
  if(req.url?.startsWith('/protection/')){
   const name=req.url.slice('/protection/'.length);assert(['ios-authorization.js','cloudflare-authorization.js'].includes(name));res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(root,'protection',name)));return;
  }
  if(req.url?.startsWith('/api/drive/')){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const headers=new Headers(req.headers);
   if(req.method==='POST'&&variant){headers.set('Sec-Fetch-Site','same-site');if(variant==='missing-origin'){headers.delete('Origin');headers.set('Referer',origin+'/qa');}}
   const response=await auth(new Request(origin+req.url,{method:req.method,headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})}),env);
   const set=response.headers.get('set-cookie');if(set)strictCookieHeaders&&=set.includes('SameSite=Strict');
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  res.writeHead(404);res.end();
 }catch{res.writeHead(500);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='https://127.0.0.1:'+server.address().port;env.APP_ORIGIN=origin;
const runner=await isolatedWebKit();const results=[];
try{
 for(const profile of ['iphone','ipad-same-site','ipad-missing-origin']){
  variant=profile==='iphone'?'':profile==='ipad-same-site'?'same-site':'missing-origin';
  const context=await runner.browser.newContext({...devices['iPhone 13'],...(profile==='iphone'?{}:{viewport:{width:1024,height:768},userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.7 Safari/605.1.15'}),ignoreHTTPSErrors:true});
  const beforeExchanges=exchanges;
  try{
   const page=await context.newPage();await page.goto(origin+'/qa');await page.waitForFunction(()=>window.qa?.ready);
   await page.locator('#connect').click();await page.waitForFunction(()=>window.qa.connected||window.qa.error);
   assert.equal(await page.evaluate(()=>window.qa.error),undefined);
   assert.equal(exchanges,beforeExchanges+1);
   const cookie=(await context.cookies()).find(c=>c.name===AUTH_COOKIE);assert(cookie?.httpOnly&&cookie.secure);assert(strictCookieHeaders);
   await page.reload();await page.waitForFunction(()=>window.qa?.ready);
   assert.equal(await page.evaluate(()=>window.qa.acquire('silent').then(r=>r.email)),'person@example.test');assert.equal(await page.evaluate(()=>window.qa.prompts),0);
   const before=renewals;clock+=3601000;
   await page.evaluate(()=>window.qa.acquire('silent'));assert.equal(renewals,before+1);
   await page.evaluate(()=>window.qa.invalidate());temporaryFailure=true;
   assert.equal(await page.evaluate(()=>window.qa.acquire('silent').catch(e=>e.code)),'network');temporaryFailure=false;
   await page.evaluate(()=>window.qa.acquire('silent'));assert.equal(await page.evaluate(()=>window.qa.prompts),0);
   assert.equal(await page.evaluate(()=>localStorage.getItem('notebook-qa')),'PRESERVED');
   results.push({profile,passed:true,encryptedHttpOnlyCookie:true,reloadWithoutPopup:true,expirationRenewed:true,networkRetryPreservesSession:true});
   console.log('PASS WebKit HTTPS: conexão, reabertura, expiração e recuperação de rede — '+profile);
  }finally{temporaryFailure=false;await context.close();}
 }
}finally{
 await runner.close();await new Promise(resolve=>server.close(resolve));
 fs.writeFileSync(path.join(dir,'ipad-auth-browser.json'),JSON.stringify({success:results.length===3,results,googleServices:'simulated',iPadHeaders:'simulated compatibility profiles',physicalIPad:false,physicalIPhone:false},null,2));
}
