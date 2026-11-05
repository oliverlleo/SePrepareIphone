import assert from 'node:assert/strict';
import {JSDOM} from '../qa/time-dom/node_modules/jsdom/lib/api.js';
import {mountRecordingPlayer} from './recording-player.js';
import {createRecordingText} from './recording-i18n.js';
const dom=new JSDOM('<div id="slot"></div>',{url:'https://example.invalid/'}),{window}=dom,slot=window.document.querySelector('#slot'),states=new WeakMap();
let ready=1,checks=0;const state=a=>states.get(a)||{paused:true,time:0};
Object.defineProperties(window.HTMLMediaElement.prototype,{duration:{get:()=>60},readyState:{get:()=>ready},paused:{get(){return state(this).paused;}},currentTime:{get(){return state(this).time;},set(time){states.set(this,{...state(this),time});this.dispatchEvent(new window.Event('timeupdate'));}}});
window.HTMLMediaElement.prototype.play=function(){states.set(this,{...state(this),paused:false});this.dispatchEvent(new window.Event('play'));return Promise.resolve();};
window.HTMLMediaElement.prototype.pause=function(){states.set(this,{...state(this),paused:true});this.dispatchEvent(new window.Event('pause'));};window.HTMLMediaElement.prototype.load=()=>{};
const check=(name,run)=>{run();checks++;console.log('PASS '+name);},t=createRecordingText(()=> 'pt-BR'),record={id:'rec-fixture-12345678',durationMs:30000};
let control;
try{
 control=mountRecordingPlayer({slot,url:'blob:test',record,t,icon:name=>`<svg data-icon="${name}"></svg>`,inline:true});
 check('A faixa usa um único transporte e oferece Outros áudios',()=>{assert.equal(slot.querySelectorAll('.rec-transport').length,1);assert(slot.querySelector('[data-action="recording-other-audios"]'));assert(control.audio.hidden);assert(!control.audio.controls);});
 await control.toggle();check('Reproduzir atualiza o estado e a ação de pausar',()=>{assert(!control.audio.paused);assert.equal(slot.querySelector('.rec-transport-toggle').getAttribute('aria-label'),'Pausar áudio');});
 const glyph=slot.querySelector('.rec-transport-toggle svg');for(let i=0;i<5;i++)control.audio.currentTime=i;
 check('A atualização do progresso preserva o botão sob o ponteiro',()=>assert.equal(slot.querySelector('.rec-transport-toggle svg'),glyph));
 await control.toggle();check('Pausar preserva a posição',()=>{assert(control.audio.paused);assert.equal(control.audio.currentTime,4);});
 const range=slot.querySelector('.rec-seek');range.value='15';range.dispatchEvent(new window.Event('input'));range.dispatchEvent(new window.Event('change'));
 check('A linha do tempo busca no áudio e anuncia a posição',()=>{assert.equal(control.audio.currentTime,15);assert.equal(range.value,'15');assert.match(range.getAttribute('aria-valuetext'),/00:15/);});
 control.seek(-50);assert.equal(control.audio.currentTime,0);control.seek(100);
 check('Avanço e retrocesso respeitam os limites reais do arquivo',()=>assert.equal(control.audio.currentTime,60));
 ready=0;control.seek(20);ready=1;control.audio.dispatchEvent(new window.Event('loadedmetadata'));
 check('Uma busca antes do carregamento é aplicada quando o áudio fica pronto',()=>assert.equal(control.audio.currentTime,20));
 const speed=slot.querySelector('select');speed.value='1.5';speed.dispatchEvent(new window.Event('change'));
 check('A seleção de velocidade atua sobre a reprodução',()=>assert.equal(control.audio.playbackRate,1.5));
 control.dispose();check('Fechar o transporte libera a fonte e pausa o áudio',()=>{assert(control.audio.paused);assert(!control.audio.hasAttribute('src'));});
 for(const language of ['pt-BR','en','es','ja']){control=mountRecordingPlayer({slot,url:'blob:test',record,t:createRecordingText(()=>language),icon:()=>'<svg></svg>'});assert(!slot.querySelector('[data-action="recording-other-audios"]'));assert(slot.querySelector('.rec-seek').getAttribute('aria-label'));control.dispose();}
 check('O transporte do modal evita atalhos duplicados nos quatro idiomas',()=>{});
}finally{control?.dispose();window.close();}
console.log(JSON.stringify({success:true,checks}));
