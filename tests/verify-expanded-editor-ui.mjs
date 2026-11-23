import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const {webkit}=await import(process.env.QA_PLAYWRIGHT||'../protection/node_modules/playwright/index.mjs');
import {createServer} from '../protection/serve.mjs';
import {newSpeech,ensureVersions,captureContentVersion} from '../sharing/core.js';

const root=fileURLToPath(new URL('..',import.meta.url));
const out=path.resolve(root,process.env.QA_OUTPUT||'tests/qa-output/expanded-editor');
fs.mkdirSync(out,{recursive:true});
const baseline=process.env.QA_BASELINE;
const oldApp=baseline?execFileSync('git',['show',`${baseline}:app.js`],{cwd:root,maxBuffer:8000000}):null;
const server=createServer({sourceForRequest:({url})=>url.pathname==='/app.js'?oldApp:null});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=process.env.QA_URL||`http://127.0.0.1:${server.address().port}`;
const browser=await webkit.launch({headless:true});
const profiles=[];
for(const language of ['pt-BR','en','es','ja'])for(const theme of ['light','dark']){
  profiles.push({id:`iphone-${language}-${theme}`,width:390,height:844,language,theme});
  profiles.push({id:`narrow-${language}-${theme}`,width:320,height:640,language,theme});
}
for(const [id,width,height,scale] of [['keyboard',390,440,1],['landscape',667,375,1],['ipad',820,1180,1],['ipad-landscape',1180,820,1],['large-text',390,844,1.3]]){
  profiles.push({id,width,height,scale,language:'pt-BR',theme:'dark'});
}
const selected=profiles.filter(p=>!process.env.QA_PROFILES||process.env.QA_PROFILES.split(',').includes(p.id));
const results=[];let success=false;
try{
  for(const profile of selected){
    const speech=newSpeech();speech.id='clean-editor-fixture';speech.title='Preparar uma apresentação';
    speech.delta={ops:[{insert:'Uma ideia bem preparada fica mais clara. ',attributes:{bold:true}},{insert:('Ensaiar ajuda a organizar as ideias e explicar com calma.\n\n').repeat(30)}]};
    ensureVersions(speech);captureContentVersion(speech);
    const context=await browser.newContext({viewport:{width:profile.width,height:profile.height},hasTouch:true,locale:profile.language,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_7 like Mac OS X) AppleWebKit/605.1.15 Version/17.7 Mobile/15E148 Safari/604.1',serviceWorkers:'block'});
    try{
      await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
      await context.addInitScript(({speech,profile})=>{
        const media=window.matchMedia.bind(window);window.matchMedia=query=>{const result=media(query);if(query.includes('display-mode: standalone'))Object.defineProperty(result,'matches',{value:true});return result;};
        Object.defineProperty(navigator,'platform',{value:'iPhone'});
        localStorage.setItem('seprepare-legal-notice-acknowledged','true');
        if(!localStorage.getItem('clean-editor-seeded')){
          localStorage.setItem('orador-state-v1',JSON.stringify({schema:1,contentVersion:2,speeches:[speech],categories:[],settings:{theme:profile.theme,language:profile.language},vocabulary:[]}));
          localStorage.setItem('clean-editor-seeded','1');
        }
      },{speech,profile});
      const page=await context.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(origin);await page.waitForFunction(()=>window.orador);await page.waitForTimeout(400);
      if(await page.locator('.modal [data-action="close-modal"]').count())await page.locator('.modal [data-action="close-modal"]').first().click();
      await page.locator('.speech-card [data-action="edit"]').first().click();
      await page.waitForFunction(()=>window.orador?.getEditor());
      if(profile.scale)await page.addStyleTag({content:`.editor-smart-actions .btn{font-size:${12*profile.scale}px!important}`});
      await page.evaluate(()=>document.fonts.ready);
      const before=await page.locator('.editor-scroll').boundingBox();
      await page.locator('.editor-scroll').evaluate(el=>{el.scrollTop=140;el.dispatchEvent(new Event('scroll'));});
      await page.waitForSelector('.editor-shell.editor-scrolled');
      await page.waitForTimeout(100);
      const expanded=await page.locator('.editor-scroll').boundingBox();
      const metrics=await page.evaluate(()=>{
        const actions=document.querySelector('.editor-smart-actions');
        return {headerVisible:!!document.querySelector('.editor-top').getClientRects().length,bodyWidth:document.documentElement.scrollWidth,viewport:innerWidth,rowHeight:actions.getBoundingClientRect().height,scrollWidth:actions.scrollWidth,clientWidth:actions.clientWidth,labels:[...actions.querySelectorAll('.btn')].map(button=>{
          const span=button.querySelector('span'),r=span.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(span);
          const lines=[...new Set([...range.getClientRects()].map(rect=>Math.round(rect.top)))];
          return {text:span.textContent,lines:lines.length,width:r.width,scrollWidth:span.scrollWidth,touchHeight:button.getBoundingClientRect().height};
        })};
      });
      await page.screenshot({path:path.join(out,profile.id+'-expanded.png')});
      if(!baseline){
        assert.equal(metrics.headerVisible,false,profile.id+' expanded header');
        assert(expanded.height>before.height,profile.id+' gained editing area');
        assert(metrics.bodyWidth<=metrics.viewport+1,profile.id+' page overflow');
        for(const label of metrics.labels){assert.equal(label.lines,1,profile.id+' label '+label.text);assert(label.scrollWidth<=label.width+1,profile.id+' clipped label');assert(label.touchHeight>=44,profile.id+' touch area');}
      }
      // Every action remains reachable in the row, including the last one.
      const review=page.locator('.editor-smart-actions [data-action="review"]');
      await review.scrollIntoViewIfNeeded();await review.click();await page.waitForSelector('.modal');
      await page.locator('.modal [data-action="close-modal"]').first().click();
      // The existing downward pull at the top restores header and save controls.
      await page.locator('.editor-scroll').evaluate(el=>{
        el.scrollTop=0;
        for(const [type,y] of [['touchstart',10],['touchmove',120],['touchend',120]]){
          const event=new Event(type,{bubbles:true});Object.defineProperty(event,'touches',{value:type==='touchend'?[]:[{clientY:y}]});el.dispatchEvent(event);
        }
      });
      await page.waitForSelector('.editor-shell:not(.editor-scrolled)');
      assert(await page.locator('.editor-top').isVisible());
      await page.evaluate(()=>window.orador.getEditor().insertText(0,'Edição preservada. ','user'));
      await page.locator('.editor-top [data-action="save-editor"]').click();
      await page.waitForFunction(()=>!!document.querySelector('.editor-top [data-action="present"]'));
      assert.equal(await page.evaluate(()=>window.orador.flushForUpdate()),true);
      await page.reload();await page.waitForFunction(()=>window.orador);
      assert(await page.evaluate(()=>window.orador.getState().speeches[0].delta.ops.some(op=>String(op.insert).includes('Edição preservada.'))));
      assert.deepEqual(errors,[],profile.id+' runtime errors');
      results.push({profile,...metrics,gainedHeight:expanded.height-before.height,savedAfterReload:true});
      console.log('PASS '+profile.id+' · '+Math.round(expanded.height-before.height)+' px recuperados');
    }finally{await context.close();}
  }
  success=true;
}finally{
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({success,engine:'WebKit',realIPhone:false,keyboard:'reduced viewport simulation',origin,baseline,results},null,2));
  await browser.close();await new Promise(resolve=>server.close(resolve));
}
