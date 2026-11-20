import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {devices} from '../protection/node_modules/playwright/index.mjs';
import {isolatedWebKit} from '../protection/test-network.mjs';
import {createServer} from '../protection/serve.mjs';
import {newSpeech,validState} from '../protection/core.js';

const server=createServer();
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=process.env.QA_ORIGIN||'http://127.0.0.1:'+server.address().port;
const output=process.env.QA_OUTPUT||'tests/qa-output/apple-sheets';
await mkdir(output,{recursive:true});
const {browser,close}=await isolatedWebKit();
const results=[];
const profileSizes=(process.env.QA_SIZES||'320x568,390x844,844x390,834x1194').split(',');
try{
 for(const size of profileSizes)for(const language of ['pt-BR','en','es','ja']){
  const [width,height]=size.split('x').map(Number),tablet=width===834;
  const context=await browser.newContext({...devices[tablet?'iPad Pro 11':'iPhone 13'],viewport:{width,height},locale:language,serviceWorkers:'block',reducedMotion:'reduce'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const fixture=newSpeech();fixture.id='apple-sheet-fixture';
  fixture.title='Preparação de teste — título comprido para conferir a largura';
  fixture.delta={ops:[{insert:'Texto de teste.\n'}]};fixture.reminders=[10080,42];
  const initial=validState({schema:1,speeches:[fixture],categories:[],settings:{language,theme:['es','ja'].includes(language)?'dark':'light'},vocabulary:[]});
  await context.addInitScript(({initial,tablet})=>{
   if(!localStorage.getItem('apple-sheets-fixture'))localStorage.setItem('orador-state-v1',JSON.stringify(initial));
   localStorage.setItem('apple-sheets-fixture','1');
   localStorage.setItem('seprepare-ui-language',initial.settings.language);
   localStorage.setItem('seprepare-legal-notice-acknowledged','true');
   localStorage.setItem('seprepare-drive-web-v1',JSON.stringify({version:1,data:{offerSeen:true}}));
   Object.defineProperty(navigator,'platform',{get:()=>tablet?'MacIntel':'iPhone'});
   Object.defineProperty(navigator,'standalone',{get:()=>true});
   if(tablet)Object.defineProperty(navigator,'maxTouchPoints',{get:()=>5});
   const match=window.matchMedia.bind(window);window.matchMedia=q=>{const result=match(q);if(q.includes('display-mode: standalone'))Object.defineProperty(result,'matches',{value:true});return result;};
   window.qaFiles=[];
   const blobs=new Map(),createObjectURL=URL.createObjectURL.bind(URL);
   URL.createObjectURL=blob=>{const url=createObjectURL(blob);blobs.set(url,blob);return url;};
   const click=HTMLAnchorElement.prototype.click;
   HTMLAnchorElement.prototype.click=function(){
    if(!/\.(ics|json)$/.test(this.download))return click.call(this);
    const record={name:this.download,content:''};window.qaFiles.push(record);
    blobs.get(this.href)?.text().then(content=>{record.content=content;});
   };
  },{initial,tablet});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  page.setDefaultTimeout(12000);
  const modal=page.locator('.modal');
  const action=name=>modal.locator('[data-action="'+name+'"]').first();
  const nav=async view=>{await page.locator('.bottom-nav [data-view="'+view+'"]').click();};
  const speech=()=>page.evaluate(()=>window.orador.getState().speeches.find(item=>item.id==='apple-sheet-fixture'));
  const translated=(value)=>page.evaluate(key=>window.SPLocale.t(key),value);
  const checkLayout=async label=>{
   const enlarge=await page.addStyleTag({content:'.apple-simple-sheet .help,.apple-simple-sheet .btn,.apple-simple-sheet .sheet-option span,.apple-simple-sheet label{font-size:1.25rem;line-height:1.55}'});
   assert(await modal.evaluate(element=>{
    const body=element.querySelector('.modal-body');
    const field=element.querySelector('#scheduleDate');
    const panel=element.querySelector('.apple-simple-sheet');
    return panel&&body.scrollWidth<=body.clientWidth+1&&panel.scrollWidth<=panel.clientWidth+1&&(!field||field.getBoundingClientRect().right<=body.getBoundingClientRect().right+1);
   }));
   if(language==='pt-BR'||width===320)await page.screenshot({path:path.join(output,label+'-'+size+'-'+language+'.png')});
   await enlarge.evaluate(element=>element.remove());
  };
  try{
   await page.goto(origin);await page.waitForFunction(()=>window.orador);
   await nav('agenda');
   const agendaHelp=await translated('Adicione uma data para ver suas próximas apresentações aqui.');
   await page.locator('#viewContent .empty p').filter({hasText:agendaHelp}).waitFor();
   await page.locator('[data-action=choose-schedule]:visible').first().click();
   await action('schedule').click();
   assert.equal(await modal.locator('input').count(),1);
   assert.equal(await modal.locator('#modalTitle').textContent(),await translated('Adicionar à Agenda'));
   await checkLayout('agenda');
   await action('save-schedule').click();
   assert.equal((await speech()).scheduledAt,0);
   const date=modal.locator('#scheduleDate');
   await date.fill('2032-09-21T19:17');
   await action('pwa-export-ics').click();
   await page.waitForFunction(()=>window.qaFiles.some(file=>file.name.endsWith('.ics')&&file.content.includes('BEGIN:VEVENT')));
   assert.equal((await speech()).scheduledAt,0);
   const timestamp=await date.evaluate(input=>new Date(input.value).getTime());
   const exported=await page.evaluate(()=>window.qaFiles.find(file=>file.name.endsWith('.ics')).content);
   assert(exported.includes('DTSTART:'+new Date(timestamp).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')));
   await action('save-schedule').click();
   await page.locator('.agenda-day').waitFor();
   assert.equal((await speech()).scheduledAt,timestamp);
   assert.deepEqual((await speech()).reminders,[10080,42]);
   await page.reload();await page.waitForFunction(()=>window.orador);
   assert.equal((await speech()).scheduledAt,timestamp);
   await nav('agenda');await page.locator('.agenda-day [data-action=schedule]').click();
   assert.equal(await modal.locator('#scheduleDate').inputValue(),'2032-09-21T19:17');
   await action('clear-schedule').click();
   await page.locator('[data-action=choose-schedule]:visible').first().waitFor();
   assert.equal((await speech()).scheduledAt,0);
   await nav('settings');await page.locator('[data-settings-id=memory]').click();
   await action('pwa-memory-vault').click();
   const memoryTitle=await translated('Memória do aparelho');
   await modal.locator('#modalTitle').filter({hasText:memoryTitle}).waitFor();
   assert(!/IndexedDB|OPFS|navigator\.storage|38,3 GB/.test(await modal.textContent()));
   await action('pwa-save-device-file').click();
   await page.waitForFunction(()=>window.qaFiles.some(file=>file.name.endsWith('.json')&&file.content.includes('apple-sheet-fixture')));
   await action('pwa-snapshot-preview').waitFor();
   await checkLayout('memory');
   await action('pwa-snapshot-preview').click();
   await action('pwa-apply-snapshot').waitFor();
   assert.equal(await modal.locator('[name=pwaRestorePolicy]:checked').getAttribute('value'),'both');
   assert.deepEqual(errors,[]);
   results.push({size,language,success:true});
   console.log('PASS',size,language,'Agenda, ICS, reabertura e cópias');
  }catch(error){
   await page.screenshot({path:path.join(output,'failure-'+size+'-'+language+'.png')});
   results.push({size,language,success:false,error:String(error),pageErrors:errors});
   if(errors.length)console.error(errors);
   throw error;
  }finally{await context.close();}
 }
}finally{
 await close();
 await new Promise(resolve=>server.close(resolve));
 await writeFile(path.join(output,'results.json'),JSON.stringify({success:results.length===profileSizes.length*4&&results.every(row=>row.success),realDevice:false,results},null,2));
}
