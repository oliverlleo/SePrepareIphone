const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),worker=fs.readFileSync(path.join(root,'sw.js'),'utf8'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const build=/const BUILD_ID = '([^']+)'/.exec(worker)[1],previous='seprepare-app-shell-previous';
assert(html.includes('data-seprepare-build="'+build+'"'));
for(const value of html.matchAll(/\?v=([^"']+)/g))assert.equal(value[1],build);
assert(worker.includes('normalizeNavigationResponse'));
for(const name of ['app.js','launch-gate.js'])assert(fs.readFileSync(path.join(root,name),'utf8').startsWith('/* SEPREPARE LOCALE START */if(!window.SPLocale)'));
assert(!html.includes('src="locale.js'),'Installed older shells need no new runtime asset');
const base='https://ios.seprepareapp.com.br/',oldData='personal data remains outside caches';
function harness({fail='',foreign=false}={}){
 const handlers={},cacheMaps=new Map([[previous,new Map([['https://ios.seprepareapp.com.br/index.html',new Response('previous offline shell',{headers:{'Content-Type':'text/html'}})]])]]);let activated=false;
 const url=input=>new URL(typeof input==='string'?input:input.url,base).href;
 const fetch=async input=>{const address=url(input);if(fail&&address.includes(fail))throw Error('Interrupted download');let response=new Response(address===base?html:'static asset',{headers:{'Content-Type':address===base?'text/html':'text/javascript'}});Object.defineProperties(response,{url:{value:foreign?'https://example.invalid/':address},redirected:{value:address===base}});return response;};
 const caches={async keys(){return [...cacheMaps.keys()];},async delete(name){return cacheMaps.delete(name);},async open(name){if(!cacheMaps.has(name))cacheMaps.set(name,new Map());const map=cacheMaps.get(name);return {async match(input){return map.get(url(input))?.clone();},async put(input,response){map.set(url(input),response.clone());},async keys(){return [...map.keys()].map(value=>new Request(value));},async addAll(inputs){const downloaded=await Promise.all(inputs.map(async input=>[url(input),await fetch(input)]));for(const [key,response]of downloaded)map.set(key,response);}};}};
 class RelativeRequest extends Request{constructor(input,options){super(typeof input==='string'?url(input):input,options);}}
 const self={location:new URL(base+'sw.js'),navigator:{userAgent:'Mozilla/5.0 (iPhone) Mobile Safari'},addEventListener(name,fn){handlers[name]=fn;},skipWaiting(){activated=true;return Promise.resolve();},clients:{claim:async()=>{}},registration:{unregister:async()=>{}}};
 const context=vm.createContext({self,caches,fetch,Request:RelativeRequest,Response,Headers,URL,Set,setTimeout,clearTimeout,console});vm.runInContext(worker,context);
 return {context,handlers,cacheMaps,get activated(){return activated;},async install(){let job;handlers.install({waitUntil(promise){job=promise;}});await job;}};
}
(async()=>{
 let h=harness();await h.install();assert(h.activated);const cache=h.cacheMaps.get('seprepare-app-shell-'+build);assert(cache);const saved=cache.get(base+'index.html');assert(saved);assert.equal(saved.redirected,false);assert.equal(await saved.clone().text(),html);assert(h.cacheMaps.has(previous));
 console.log('PASS Redirected HTML is normalized; complete versioned shell is cached before activation.');
 const offline=await vm.runInContext('normalizeNavigationResponse(response)',Object.assign(h.context,{response:saved.clone()}));assert.equal(await offline.text(),html);
 const foreign=harness({foreign:true});await assert.rejects(()=>foreign.install());assert(!foreign.activated);assert(foreign.cacheMaps.has(previous));
 const failed=harness({fail:'app.js'});await assert.rejects(()=>failed.install());assert(!failed.activated);assert(failed.cacheMaps.has(previous));assert.equal(await failed.cacheMaps.get(previous).get(base+'index.html').text(),'previous offline shell');
 assert(!/indexedDB\.(?:deleteDatabase|open)|localStorage\.(?:clear|removeItem)/.test(worker));
 console.log('PASS Failed/cross-origin download cannot activate a partial update or delete the previous offline shell.');
 console.log('PASS Locale runtime is self-contained in existing entry points; notebook storage is untouched.');
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
