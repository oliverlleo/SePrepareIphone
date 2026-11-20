import fs from 'node:fs';import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {JSDOM} from '../qa/time-dom/node_modules/jsdom/lib/api.js';
const source=fs.readFileSync(new URL('../audio-parity.js',import.meta.url),'utf8'),checks=[];
function harness({paused=false,ipad=false,ios=true,empty=false,unavailable=false,pending=false,language='pt-BR',localVoice}={}){
 const timers=[];const dom=new JSDOM('<div class="modal"><div class="modal-body"></div></div>',{url:'https://audio.test/',runScripts:'outside-only'}),w=dom.window,log=[],utterances=[],toasts=[],settings={language,voice:'',audioLanguage:'',rate:1};let inGesture=true;
 w.setTimeout=(fn,ms)=>{if(ms>=4500)timers.push(fn);return timers.length;};w.clearTimeout=()=>{};
 w.matchMedia=()=>({matches:false});Object.defineProperty(w.navigator,'userAgent',{value:ios?(ipad?'Mozilla/5.0 Macintosh AppleWebKit Safari':'Mozilla/5.0 iPhone AppleWebKit Safari'):'Windows Chrome'});Object.defineProperty(w.navigator,'platform',{value:ipad?'MacIntel':ios?'iPhone':'Win32'});Object.defineProperty(w.navigator,'maxTouchPoints',{value:ipad?5:1});
 const synth={paused,speaking:false,pending:false,getVoices:()=>empty?[]:[{name:'Local PT',lang:'pt-BR',localService:true,default:true,voiceURI:'fixture'}],addEventListener(){},cancel(){log.push('cancel');this.speaking=false;this.pending=false;},resume(){log.push('resume');this.paused=false;},speak(u){log.push({action:'speak',inGesture});utterances.push(u);this.pending=true;if(!this.paused&&!pending){this.pending=false;this.speaking=true;u.onstart?.();}}};
 Object.defineProperty(w,'speechSynthesis',{value:unavailable?undefined:synth});w.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
 if(localVoice)w.SePrepareLocalVoice={create:()=>localVoice};
 w.eval(source);const audio={state:'idle',text:'',offset:0,speechId:null};const api=w.SePrepareAudio.create({audio,getSettings:()=>settings,setVoices(){},icon:()=>'<svg></svg>',getSpeech:()=>({id:'fixture',text:'Texto do discurso.'}),isReader:()=>false,sync(){},toast:msg=>toasts.push(msg),noSpeechMessage:()=>''});
 w.document.querySelector('.modal-body').innerHTML=api.settingsHTML()+'<button class="btn secondary" data-action="install-voices"><svg></svg><span>Instalar ou gerenciar vozes</span></button>';api.bindSettings();
 return {w,dom,api,timers,synth,log,utterances,toasts,settings,audio,label:()=>w.document.querySelector('#audioTestLabel').textContent,close:()=>dom.window.close()};
}
function check(name,fn){fn();checks.push(name);console.log('PASS '+name);}
check('Os dados de voz preservam os bytes gzip após checkout',()=>{
 const folder=new URL('../voice/local-v0.2.1/espeak-ng-data/',import.meta.url);
 const manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',folder),'utf8'));
 for(const file of [manifest.core,...['pt','en','es','ja'].map(language=>manifest.dictionaries[language])]){
  const decoded=gunzipSync(fs.readFileSync(new URL(file.file,folder)));
  assert.equal(decoded.length,file.size);
 }
});
check('Botão só anuncia teste iniciado após o evento real do sintetizador',()=>{const h=harness({pending:true});try{h.api.preview();assert.equal(h.label(),'Iniciando teste…');h.utterances[0].onstart();assert.equal(h.label(),'Parar teste');h.api.preview();assert.equal(h.label(),'Testar voz');}finally{h.close();}});
check('Ausência de início encerra a espera e permite tentar novamente',()=>{const h=harness({pending:true});try{h.api.preview();assert(h.timers.length);h.timers.at(-1)();assert.equal(h.label(),'Testar voz');assert(h.toasts.length);h.api.preview();assert.equal(h.utterances.length,2);}finally{h.close();}});
check('Exceção ao solicitar voz restaura o teste sem travar o botão',()=>{const h=harness();try{h.synth.speak=()=>{throw Error('simulated');};h.api.preview();assert.equal(h.label(),'Testar voz');assert(h.toasts.length);}finally{h.close();}});
check('Fila pausada é retomada sincronamente antes de testar a voz',()=>{const h=harness({paused:true});try{h.api.preview();assert.equal(h.synth.paused,false);assert(h.synth.speaking);assert(h.log.indexOf('resume')<h.log.findIndex(x=>x.action==='speak'));assert(h.log.find(x=>x.action==='speak').inGesture);}finally{h.close();}});
check('Teste usa o texto e velocidade do formulário sem salvar os ajustes',()=>{const h=harness();try{h.w.document.querySelector('#voicePreviewText').value='Frase de teste.';h.w.document.querySelector('#voiceRate').value='1.5';h.api.preview();assert.equal(h.utterances[0].text,'Frase de teste.');assert.equal(h.utterances[0].rate,1.5);assert.equal(h.settings.rate,1);}finally{h.close();}});
check('Parar e testar de novo não deixa callback antigo encerrar o novo teste',()=>{const h=harness();try{h.api.preview();const old=h.utterances[0];h.api.preview();h.api.preview();const label=h.label();old.onend();assert.equal(h.label(),label);assert.equal(h.utterances.length,2);}finally{h.close();}});
check('Erro de permissão encerra o estado de teste e mostra orientação',()=>{const h=harness();try{h.api.preview();h.utterances[0].onerror({error:'not-allowed'});assert.equal(h.label(),'Testar voz');assert(h.toasts.length);}finally{h.close();}});
check('iPhone sem lista de vozes usa o idioma do sistema',()=>{const h=harness({empty:true});try{h.api.preview();assert.equal(h.utterances.length,1);assert.equal(h.utterances[0].lang,'pt-BR');}finally{h.close();}});
check('Indisponibilidade do sintetizador restaura o botão e informa erro',()=>{const h=harness({unavailable:true});try{h.api.preview();assert.equal(h.label(),'Testar voz');assert(h.toasts.length);}finally{h.close();}});
check('Ensaio também recupera fila pausada antes de narrar um trecho',()=>{const h=harness({paused:true});try{let started=false;h.api.speakSegment({text:'Trecho de teste.',locale:'pt-BR',onStart:()=>started=true});assert(started);assert(!h.synth.paused);}finally{h.close();}});
check('Botões ficam no mesmo grupo, sem duplicação após nova ligação',()=>{const h=harness();try{h.api.bindSettings();const groups=h.w.document.querySelectorAll('.audio-settings-actions');assert.equal(groups.length,1);assert.equal(groups[0].querySelectorAll('button').length,2);}finally{h.close();}});
check('Automática usa voz instalada do idioma em vez de depender da resolução do sistema',()=>{
 const h=harness();
 try{h.api.preview();assert.equal(h.utterances[0].voice.voiceURI,'fixture');assert.equal(h.utterances[0].lang,'pt-BR');}finally{h.close();}
});
check('Automática no Apple usa saída local no teste e na leitura, mesmo sem sintetizador do sistema',()=>{
 const played=[];
 const h=harness({unavailable:true,localVoice:{play:utterance=>played.push(utterance),stop(){}}});
 try{
  h.api.preview();
  assert.equal(h.label(),'Iniciando teste…');
  played[0].onstart();
  assert.equal(h.label(),'Parar teste');
  played[0].onend();
  assert.equal(h.label(),'Testar voz');
  h.api.play();
  assert.equal(played[1].lang,played[0].lang);
  assert.equal(played[1].text,'Texto do discurso.');
  played[1].onstart();
  played[1].onboundary({charIndex:6});
  h.api.pause();
  assert.equal(h.audio.state,'paused');
  h.api.play();
  assert.equal(played[2].text,'do discurso.');
  assert.equal(h.utterances.length,0);
 }finally{h.close();}
});
check('Uma voz escolhida manualmente ainda é reproduzida pelo sintetizador Apple',()=>{
 const h=harness({localVoice:{play(){throw Error('wrong engine');},stop(){}}});
 try{
  h.w.document.querySelector('#voiceName').value='Local PT\u001fpt-BR';
  h.api.preview();
  assert.equal(h.utterances[0].voice.voiceURI,'fixture');
  h.utterances[0].onend();
  h.api.saveSettings();
  h.api.play();
  assert.equal(h.utterances[1].voice.voiceURI,'fixture');
 }finally{h.close();}
});
check('Conclusão permite repetir o teste no mesmo botão, sem gravar preferência',()=>{
 const h=harness();
 try{
  h.api.preview();h.utterances[0].onend();
  assert.equal(h.label(),'Testar voz');
  assert.deepEqual([...h.w.document.querySelectorAll('.audio-settings-actions button')].map(button=>button.dataset.action),['test-voice','install-voices']);
  h.api.preview();
  assert.equal(h.utterances.length,2);assert.equal(h.utterances[1].voice.voiceURI,'fixture');
  assert.equal(h.settings.voice,'');
 }finally{h.close();}
});
check('Teste sem fim, mesmo após iniciar, limpa a fila e libera nova tentativa',()=>{
 const h=harness();
 try{
  h.api.preview();assert.equal(h.label(),'Parar teste');h.timers.at(-1)();
  assert.equal(h.label(),'Testar voz');assert.equal(h.synth.speaking,false);assert(h.toasts.length);
  h.api.preview();assert.equal(h.utterances.length,2);
 }finally{h.close();}
});
for(const language of ['pt-BR','en','es','ja'])check('Ajuda Apple legível e acessível: '+language,()=>{const h=harness({language});try{let legacy=0;h.w.document.addEventListener('click',()=>legacy++);const button=h.w.document.querySelector('[data-action=install-voices]');button.click();assert.equal(legacy,0);assert.equal(button.getAttribute('aria-expanded'),'true');const help=h.w.document.getElementById(button.getAttribute('aria-controls'));assert(!help.hidden);assert(help.textContent.length>15);button.click();assert(help.hidden);}finally{h.close();}});
check('iPad em modo desktop recebe a mesma ajuda Apple',()=>{const h=harness({ipad:true});try{const b=h.w.document.querySelector('[data-action=install-voices]');b.click();assert.equal(b.getAttribute('aria-expanded'),'true');}finally{h.close();}});
check('Navegador Windows preserva a ação de gerenciamento existente',()=>{const h=harness({ios:false});try{let legacy=0;h.w.document.addEventListener('click',()=>legacy++);h.w.document.querySelector('[data-action=install-voices]').click();assert.equal(legacy,1);}finally{h.close();}});
