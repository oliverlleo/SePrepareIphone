import fs from 'node:fs';import assert from 'node:assert/strict';
import {JSDOM} from '../qa/time-dom/node_modules/jsdom/lib/api.js';
const source=fs.readFileSync(new URL('../audio-parity.js',import.meta.url),'utf8'),checks=[];
function harness({paused=false,ipad=false,ios=true,empty=false,unavailable=false,pending=false,language='pt-BR',voices,audioSession,withAudioCtx=false,activeMicLeases=0,captureAllTimers=false}={}){
 const timers=[],shortTimers=[];const dom=new JSDOM('<div class="modal"><div class="modal-body"></div></div>',{url:'https://audio.test/',runScripts:'outside-only'}),w=dom.window,log=[],utterances=[],toasts=[],settings={language,voice:'',audioLanguage:'',rate:1};let inGesture=true;
 w.setTimeout=(fn,ms)=>{if(ms>=4500){timers.push(fn);return timers.length;}if(captureAllTimers){shortTimers.push(fn);return 100+shortTimers.length;}return 0;};
 w.clearTimeout=()=>{};
 w.matchMedia=()=>({matches:false});Object.defineProperty(w.navigator,'userAgent',{value:ios?(ipad?'Mozilla/5.0 Macintosh AppleWebKit Safari':'Mozilla/5.0 iPhone AppleWebKit Safari'):'Windows Chrome'});Object.defineProperty(w.navigator,'platform',{value:ipad?'MacIntel':ios?'iPhone':'Win32'});Object.defineProperty(w.navigator,'maxTouchPoints',{value:ipad?5:1});
 if(audioSession)Object.defineProperty(w.navigator,'audioSession',{value:audioSession,configurable:true});
 const ctxLog={created:0,resumed:0,suspended:0,started:0};
 if(withAudioCtx){
  w.AudioContext=class{
   constructor(){this.state='suspended';this.destination={};ctxLog.created++;}
   resume(){this.state='running';ctxLog.resumed++;return Promise.resolve();}
   suspend(){this.state='suspended';ctxLog.suspended++;return Promise.resolve();}
   createBuffer(){return {};}
   createBufferSource(){return {buffer:null,connect(){},start(){ctxLog.started++;}};}
  };
 }
 if(activeMicLeases>0){w[Symbol.for('SePrepare.sharedMicrophone')]={activeLeases:()=>activeMicLeases};}
 const defaultVoices=[{name:'Local PT',lang:'pt-BR',localService:true,default:true,voiceURI:'fixture'}];
 const synth={paused,speaking:false,pending:false,getVoices:()=>empty?[]:(voices||defaultVoices),addEventListener(){},cancel(){log.push('cancel');this.speaking=false;this.pending=false;},resume(){log.push('resume');this.paused=false;},speak(u){log.push({action:'speak',inGesture});utterances.push(u);this.pending=true;if(!this.paused&&!pending){this.pending=false;this.speaking=true;u.onstart?.();}}};
 Object.defineProperty(w,'speechSynthesis',{value:unavailable?undefined:synth});w.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
 w.eval(source);const audio={state:'idle',text:'',offset:0,speechId:null};const api=w.SePrepareAudio.create({audio,getSettings:()=>settings,setVoices(){},icon:()=>'<svg></svg>',getSpeech:()=>({id:'fixture',text:'Texto do discurso.'}),isReader:()=>false,sync(){},toast:msg=>toasts.push(msg),noSpeechMessage:()=>''});
 w.document.querySelector('.modal-body').innerHTML=api.settingsHTML()+'<button class="btn secondary" data-action="install-voices"><svg></svg><span>Instalar ou gerenciar vozes</span></button>';api.bindSettings();
 return {w,dom,api,timers,shortTimers,synth,log,utterances,toasts,settings,audio,ctxLog,label:()=>w.document.querySelector('#audioTestLabel').textContent,close:()=>dom.window.close()};
}
function check(name,fn){fn();checks.push(name);console.log('PASS '+name);}
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
check('iPhone promove audioSession para playback e ativa AudioContext no teste, leitura e ensaio, restaurando ao finalizar',()=>{
 const session={type:'auto'};
 const h=harness({audioSession:session,withAudioCtx:true,captureAllTimers:true});
 try{
  h.api.preview();
  assert.equal(session.type,'playback');
  assert.equal(h.ctxLog.resumed,1);
  assert.equal(h.ctxLog.started,1);
  assert.equal(h.utterances[0].voice.voiceURI,'fixture');
  h.utterances[0].onend();
  h.shortTimers.at(-1)();
  assert.equal(session.type,'auto');
  assert.equal(h.ctxLog.suspended,1);

  h.api.play();
  assert.equal(session.type,'playback');
  assert.equal(h.ctxLog.resumed,2);
  assert.equal(h.utterances[1].text,'Texto do discurso.');
  h.api.pause();
  h.shortTimers.at(-1)();
  assert.equal(session.type,'auto');

  h.api.speakSegment({text:'Fala do ensaio.',locale:'pt-BR',onEnd(){}});
  assert.equal(session.type,'playback');
  h.utterances[2].onend();
  h.shortTimers.at(-1)();
  assert.equal(session.type,'auto');
 }finally{h.close();}
});
check('Sessão de áudio respeita microfone ativo e modo play-and-record sem sobrescrever',()=>{
 const sessionA={type:'play-and-record'};
 const hA=harness({audioSession:sessionA,withAudioCtx:true,activeMicLeases:1});
 try{
  hA.api.speakSegment({text:'Turno.',locale:'pt-BR'});
  assert.equal(sessionA.type,'play-and-record');
  assert.equal(hA.ctxLog.created,0);
 }finally{hA.close();}

 const sessionB={type:'play-and-record'};
 const hB=harness({audioSession:sessionB,withAudioCtx:true});
 try{
  hB.api.preview();
  assert.equal(sessionB.type,'play-and-record');
 }finally{hB.close();}
});
check('Lista de vozes filtra idioma, remove vozes de efeito e Eloquence, e prioriza voz aprimorada',()=>{
 const bloated=[
  {name:'Eddy (Portuguese (Brazil))',lang:'pt-BR',localService:true,default:false,voiceURI:'com.apple.eloquence.pt-BR.Eddy'},
  {name:'Flo (Portuguese (Brazil))',lang:'pt-BR',localService:true,default:false,voiceURI:'com.apple.eloquence.pt-BR.Flo'},
  {name:'Grandma (Portuguese (Brazil))',lang:'pt-BR',localService:true,default:false,voiceURI:'com.apple.eloquence.pt-BR.Grandma'},
  {name:'Luciana',lang:'pt-BR',localService:true,default:true,voiceURI:'com.apple.voice.compact.pt-BR.Luciana'},
  {name:'Luciana (Enhanced)',lang:'pt-BR',localService:true,default:false,voiceURI:'com.apple.voice.enhanced.pt-BR.Luciana'},
  {name:'Felipe',lang:'pt-BR',localService:true,default:false,voiceURI:'com.apple.voice.compact.pt-BR.Felipe'},
  {name:'Joana',lang:'pt-PT',localService:true,default:false,voiceURI:'com.apple.voice.compact.pt-PT.Joana'},
  {name:'Albert',lang:'en-US',localService:true,default:false,voiceURI:'com.apple.speech.synthesis.voice.albert'},
  {name:'Boing',lang:'en-US',localService:true,default:false,voiceURI:'com.apple.speech.synthesis.voice.boing'},
  {name:'Zarvox',lang:'en-US',localService:true,default:false,voiceURI:'com.apple.speech.synthesis.voice.zarvox'},
  {name:'Samantha',lang:'en-US',localService:true,default:true,voiceURI:'com.apple.voice.compact.en-US.Samantha'},
  {name:'Kyoko',lang:'ja-JP',localService:true,default:false,voiceURI:'com.apple.voice.compact.ja-JP.Kyoko'}
 ];
 const h=harness({voices:bloated});
 try{
  const options=[...h.w.document.querySelectorAll('#voiceName option')].map(o=>o.textContent);
  assert.deepEqual(options,[
   'Automática (idioma do aplicativo)',
   'Luciana (Enhanced) · pt-BR',
   'Felipe · pt-BR',
   'Joana · pt-PT'
  ]);
  const catalog=h.api.getAvailableVoices('pt-BR');
  assert.deepEqual([...catalog.voices].map(v=>v.name),['Luciana (Enhanced)','Felipe','Joana']);
  assert([...catalog.voices].every(v=>v.label.includes(' · ')&&!v.label.includes(' ? ')));
  assert.deepEqual([...catalog.allVoices].map(v=>v.name),['Samantha','Kyoko','Luciana (Enhanced)','Felipe','Joana']);

  h.api.preview();
  assert.equal(h.utterances[0].voice.voiceURI,'com.apple.voice.enhanced.pt-BR.Luciana');
  assert.equal(h.utterances[0].volume,1);
  assert.equal(h.utterances[0].pitch,1);
  h.utterances[0].onend();

  h.api.play();
  assert.equal(h.utterances[1].voice.voiceURI,'com.apple.voice.enhanced.pt-BR.Luciana');

  h.api.speakSegment({text:'Bom dia.',locale:'pt-BR'});
  assert.equal(h.utterances[2].voice.voiceURI,'com.apple.voice.enhanced.pt-BR.Luciana');
 }finally{h.close();}
});
check('speakSegment detecta travamento pós-início e unlock aquece o sintetizador em silêncio',()=>{
 const session={type:'auto'};
 const h=harness({paused:true,audioSession:session,withAudioCtx:true});
 try{
  h.api.unlock();
  assert.equal(session.type,'playback');
  assert.equal(h.ctxLog.resumed,1);
  assert.equal(h.synth.paused,false);
  assert.equal(h.utterances.length,1);
  assert.equal(h.utterances[0].volume,0);
  h.utterances[0].onend();
  h.synth.speaking=false;h.synth.pending=false;

  let errCode='';
  h.api.speakSegment({text:'Trecho travado.',locale:'pt-BR',onError:e=>{errCode=e.code;}});
  assert(h.timers.length>0);
  h.timers.at(-1)();
  assert.equal(errCode,'startup-timeout');
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
