import fs from 'node:fs';import assert from 'node:assert/strict';
import {JSDOM} from '../qa/time-dom/node_modules/jsdom/lib/api.js';
const source=fs.readFileSync(new URL('../audio-parity.js',import.meta.url),'utf8'),checks=[];
function harness({paused=false,ipad=false,ios=true,empty=false,unavailable=false,pending=false,language='pt-BR',voices,audioSession,withAudioCtx=false,activeMicLeases=0,captureAllTimers=false,savedVoice='',savedAudioLanguage='',speechText='Texto do discurso.'}={}){
 const timers=[],shortTimers=[],shortDelays=[];const dom=new JSDOM('<div class="modal"><div class="modal-body"></div></div>',{url:'https://audio.test/',runScripts:'outside-only'}),w=dom.window,log=[],utterances=[],toasts=[],settings={language,voice:savedVoice,audioLanguage:savedAudioLanguage,rate:1};let inGesture=true,clock=0;
 w.setTimeout=(fn,ms)=>{if(ms>=4500){timers.push(fn);return timers.length;}if(captureAllTimers){const id=100+shortTimers.length;shortDelays.push({id,fn,ms,cleared:false});shortTimers.push(fn);return id;}return 0;};
 w.clearTimeout=id=>{for(const item of shortDelays)if(item.id===id)item.cleared=true;};
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
 w.eval(source);const audio={state:'idle',text:'',offset:0,speechId:null};const api=w.SePrepareAudio.create({audio,now:()=>clock,getSettings:()=>settings,setVoices(){},icon:()=>'<svg></svg>',getSpeech:()=>({id:'fixture',text:speechText}),isReader:()=>false,sync(){},toast:msg=>toasts.push(msg),noSpeechMessage:()=>''});
 w.document.querySelector('.modal-body').innerHTML=api.settingsHTML()+'<button class="btn secondary" data-action="install-voices"><svg></svg><span>Instalar ou gerenciar vozes</span></button>';api.bindSettings();
 return {w,dom,api,timers,shortTimers,shortDelays,synth,log,utterances,toasts,settings,audio,ctxLog,advance:ms=>{clock+=ms;},label:()=>w.document.querySelector('#audioTestLabel').textContent,close:()=>dom.window.close()};
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
for(const language of ['pt-BR','en','es','ja'])check('Dica discreta de Modo Silencioso aparece no iPhone em '+language,()=>{
 const h=harness({language});
 try{
  const settingsHint=h.w.document.querySelector('.audio-silent-hint');
  assert(settingsHint&&settingsHint.textContent.trim().length>15);
  const progressDom=new JSDOM(h.api.progressHTML());
  const progressHint=progressDom.window.document.querySelector('.audio-silent-hint');
  assert(progressHint&&progressHint.textContent.trim()===settingsHint.textContent.trim());
  progressDom.window.close();
 }finally{h.close();}
});
check('iPad em modo desktop recebe a mesma ajuda Apple',()=>{const h=harness({ipad:true});try{const b=h.w.document.querySelector('[data-action=install-voices]');b.click();assert.equal(b.getAttribute('aria-expanded'),'true');assert(h.w.document.querySelector('.audio-silent-hint'));}finally{h.close();}});
check('Navegador Windows preserva a ação de gerenciamento existente e não mostra dica de iPhone',()=>{const h=harness({ios:false});try{let legacy=0;h.w.document.addEventListener('click',()=>legacy++);h.w.document.querySelector('[data-action=install-voices]').click();assert.equal(legacy,1);assert.equal(h.w.document.querySelector('.audio-silent-hint'),null);assert(!h.api.progressHTML().includes('audio-silent-hint'));}finally{h.close();}});
check('unlock({forRecording:true}) muda para play-and-record, suspende AudioContext de leitura e não cria playback concorrente',()=>{
 const session={type:'playback'};
 const h=harness({paused:true,audioSession:session,withAudioCtx:true,captureAllTimers:true});
 try{
  h.api.unlock({forRecording:true});
  assert.equal(session.type,'play-and-record');
  assert.equal(h.ctxLog.created,0);
  assert.equal(h.utterances.length,1);
  assert.equal(h.utterances[0].volume,0);
  h.utterances[0].onend();
  h.synth.speaking=false;h.synth.pending=false;

  session.type='auto';
  h.api.preview();
  assert.equal(session.type,'playback');
  assert.equal(h.ctxLog.created,1);
  h.utterances[1].onend();
  h.api.unlock({forRecording:true});
  assert.equal(session.type,'play-and-record');
  assert.equal(h.ctxLog.suspended,1);

  h.api.speakSegment({text:'Turno do parceiro em modo automático.',locale:'pt-BR',onEnd(){}});
  assert.equal(session.type,'play-and-record');
  assert.equal(h.ctxLog.created,1);
  h.utterances[2].onend();
  h.shortTimers.forEach(fn=>fn());
  assert.equal(session.type,'play-and-record');
 }finally{h.close();}
});
check('Padrão ignora voz salva de outro idioma, prioriza voz localizada mais realista e respeita escolha manual no idioma',()=>{
 const mixed=[
  {name:'Joana',lang:'pt-PT',localService:true,default:true,voiceURI:'com.apple.voice.compact.pt-PT.Joana'},
  {name:'Luciana',lang:'pt-BR',localService:true,default:true,voiceURI:'com.apple.voice.compact.pt-BR.Luciana'},
  {name:'Luciana (Aprimorada)',lang:'pt-BR',localService:true,default:false,voiceURI:'com.apple.voice.enhanced.pt-BR.Luciana'},
  {name:'Felipe (Aprimorado)',lang:'pt-BR',localService:true,default:false,voiceURI:'com.apple.voice.enhanced.pt-BR.Felipe'},
  {name:'Felipe',lang:'pt-BR',localService:true,default:false,voiceURI:'com.apple.voice.compact.pt-BR.Felipe'},
  {name:'Samantha (Enhanced)',lang:'en-US',localService:true,default:false,voiceURI:'com.apple.voice.enhanced.en-US.Samantha'}
 ];
 const staleWrongLang=harness({voices:mixed,language:'pt-BR',savedVoice:'Samantha (Enhanced)',savedAudioLanguage:'en-US'});
 try{
  assert.equal(staleWrongLang.w.document.querySelector('#voiceName').value,'');
  staleWrongLang.api.play();
  assert.equal(staleWrongLang.utterances[0].lang,'pt-BR');
  assert.equal(staleWrongLang.utterances[0].voice.voiceURI,'com.apple.voice.enhanced.pt-BR.Felipe');
  staleWrongLang.api.preview();
  assert.equal(staleWrongLang.utterances[1].voice.voiceURI,'com.apple.voice.enhanced.pt-BR.Felipe');
 }finally{staleWrongLang.close();}

 const tiered=[
  {name:'Rafael',lang:'pt-BR',localService:true,default:true,voiceURI:'com.apple.voice.compact.pt-BR.Rafael'},
  {name:'Felipe (Aprimorado)',lang:'pt-BR',localService:true,default:false,voiceURI:'com.apple.voice.enhanced.pt-BR.Felipe'},
  {name:'Siri (Voz 1)',lang:'pt-BR',localService:true,default:false,voiceURI:'com.apple.ttsbundle.siri_pt-BR_1'},
  {name:'Luciana (Premium)',lang:'pt-BR',localService:true,default:false,voiceURI:'com.apple.voice.premium.pt-BR.Luciana'}
 ];
 const topTier=harness({voices:tiered,language:'pt-BR'});
 try{
  topTier.api.play();
  assert.equal(topTier.utterances[0].voice.voiceURI,'com.apple.voice.premium.pt-BR.Luciana');
  const names=[...topTier.w.document.querySelectorAll('#voiceName option')].map(o=>o.textContent);
  assert.deepEqual(names,['Automática (idioma do aplicativo)','Luciana (Premium) · pt-BR','Felipe (Aprimorado) · pt-BR','Rafael · pt-BR']);
 }finally{topTier.close();}

 const siriVsCompact=harness({voices:[tiered[0],tiered[2]],language:'pt-BR'});
 try{
  siriVsCompact.api.play();
  assert.equal(siriVsCompact.utterances[0].voice.voiceURI,'com.apple.voice.compact.pt-BR.Rafael');
 }finally{siriVsCompact.close();}

 const winNeural=harness({ios:false,language:'pt-BR',voices:[
  {name:'Microsoft Daniel',lang:'pt-BR',localService:true,default:true,voiceURI:'daniel'},
  {name:'Microsoft Thalita Online (Natural)',lang:'pt-BR',localService:false,default:false,voiceURI:'thalita-natural'}
 ]});
 try{
  winNeural.api.play();
  assert.equal(winNeural.utterances[0].voice.name,'Microsoft Daniel');
  const winBothCloud=harness({ios:false,language:'pt-BR',voices:[
   {name:'Microsoft Francisca',lang:'pt-BR',localService:false,default:true,voiceURI:'francisca'},
   {name:'Microsoft Thalita Online (Natural)',lang:'pt-BR',localService:false,default:false,voiceURI:'thalita-natural'}
  ]});
  try{
   winBothCloud.api.play();
   assert.equal(winBothCloud.utterances[0].voice.name,'Microsoft Thalita Online (Natural)');
  }finally{winBothCloud.close();}
 }finally{winNeural.close();}

 const manualOk=harness({voices:tiered,language:'pt-BR',savedVoice:'Rafael',savedAudioLanguage:'pt-BR'});
 try{
  manualOk.api.play();
  assert.equal(manualOk.utterances[0].voice.name,'Rafael');
 }finally{manualOk.close();}
});
check('Aviso de qualidade da voz aparece apenas no iPhone quando usa voz compacta e se oculta quando voz realista está ativa',()=>{
 const compactOnly=[{name:'Luciana',lang:'pt-BR',localService:true,default:true,voiceURI:'com.apple.voice.compact.pt-BR.Luciana'}];
 for(const language of ['pt-BR','en','es','ja']){
  const h=harness({language,voices:[{name:'Compact',lang:language==='en'?'en-US':language==='es'?'es-ES':language==='ja'?'ja-JP':'pt-BR',localService:true,default:true,voiceURI:'com.apple.voice.compact.test'}]});
  try{
   const q=h.w.document.querySelector('#audioQualityHint');
   assert(q&&!q.hidden&&q.textContent.trim().length>20);
  }finally{h.close();}
 }
 const withEnhanced=harness({voices:[...compactOnly,{name:'Felipe (Aprimorado)',lang:'pt-BR',localService:true,default:false,voiceURI:'com.apple.voice.enhanced.pt-BR.Felipe'}]});
 try{
  const select=withEnhanced.w.document.querySelector('#voiceName');
  const q=withEnhanced.w.document.querySelector('#audioQualityHint');
  assert(q&&q.hidden);
  select.value='Luciana\u001fpt-BR';
  select.dispatchEvent(new withEnhanced.w.Event('change'));
  assert.equal(q.hidden,false);
  assert(q.textContent.includes('Automática'));
  select.value='';
  select.dispatchEvent(new withEnhanced.w.Event('change'));
  assert.equal(q.hidden,true);
 }finally{withEnhanced.close();}
 const win=harness({ios:false,voices:compactOnly});
 try{assert.equal(win.w.document.querySelector('#audioQualityHint'),null);}finally{win.close();}
});
check('Leitura empacota trechos curtos no iPhone em uma única fala sem quebras de linha, sanitiza símbolos, preserva frases até 185 chars no iPhone e pausa entre parágrafos no desktop',()=>{
 const shortMulti='Introdução\n\n...\n\n•\n\n---\n\n• Primeiro ponto — com <atenção> natural... Fim.';
 const hShort=harness({speechText:shortMulti,captureAllTimers:true});
 try{
  hShort.api.play();
  assert.equal(hShort.utterances.length,1);
  assert.equal(hShort.utterances[0].text,'Introdução. Primeiro ponto, com atenção natural... Fim.');
  assert.equal(hShort.audio.text,shortMulti);
 }finally{hShort.close();}

 const iosSentence='A preparação cuidadosa de uma apresentação ajuda quem fala a manter o ritmo calmo e dar ênfase às ideias principais com muita clareza até concluir o raciocínio.';
 assert(iosSentence.length>150&&iosSentence.length<=185);
 const speech=shortMulti+'\n\n'+iosSentence;
 const h=harness({speechText:speech,captureAllTimers:true});
 try{
  h.api.play();
  assert.equal(h.utterances.length,1);
  assert.equal(h.utterances[0].text,'Introdução. Primeiro ponto, com atenção natural... Fim.');
  h.utterances[0].onend();
  const p1=h.shortDelays.at(-1);
  assert(p1&&p1.ms===0&&!p1.cleared);
  p1.fn();
  assert.equal(h.utterances.length,2);
  assert.equal(h.utterances[1].text,iosSentence);

  h.api.stopPreview();
  h.api.pause();
  h.audio.offset=0;
  h.api.play();
  const countBeforePause=h.utterances.length;
  h.utterances.at(-1).onend();
  const pendingPause=h.shortDelays.at(-1);
  assert(!pendingPause.cleared);
  h.api.pause();
  assert.equal(pendingPause.cleared,true);
  pendingPause.fn();
  assert.equal(h.utterances.length,countBeforePause);
 }finally{h.close();}

 const longIosSentence='A preparação cuidadosa de uma apresentação ajuda quem fala a manter o ritmo calmo, dar ênfase às ideias principais com clareza e responder às necessidades reais de cada pessoa presente na reunião sem perder o fio até o fim.';
 assert(longIosSentence.length>205&&longIosSentence.length<=250);
 const hSplitIos=harness({speechText:longIosSentence,captureAllTimers:true});
 try{
  hSplitIos.api.play();
  assert.equal(hSplitIos.utterances.length,1);
  assert(hSplitIos.utterances[0].text.length<185&&hSplitIos.utterances[0].text.endsWith(','));
 }finally{hSplitIos.close();}

 const onlyPunct=harness({speechText:'... \n\n --- \n\n •',captureAllTimers:true});
 try{
  onlyPunct.api.play();
  assert.equal(onlyPunct.utterances.length,0);
  assert.equal(onlyPunct.audio.state,'finished');
 }finally{onlyPunct.close();}

 const win=harness({ios:false,speechText:'Introdução\n\n'+longIosSentence,captureAllTimers:true});
 try{
  win.api.play();
  assert.equal(win.utterances[0].text,'Introdução.');
  win.utterances[0].onend();
  const pWin=win.shortDelays.at(-1);
  assert(pWin&&pWin.ms>=250);
  pWin.fn();
  assert.equal(win.utterances[1].text,longIosSentence);
 }finally{win.close();}
});
check('iPhone recupera fila travada após troca de bloco sem bloquear voz que já funcionou',()=>{
 const firstPara='Bloco inicial completo com duração suficiente para separar os trechos da leitura.';
 const secondPara='Segundo bloco longo que vem logo em seguida e testa a recuperação automática na troca.';
 const speech=firstPara+'\n\n'+secondPara;

 const recover=harness({pending:true,speechText:speech,captureAllTimers:true});
 try{
  recover.api.play();
  assert.equal(recover.utterances.length,1);
  recover.utterances[0].onstart();
  recover.utterances[0].onend();
  recover.shortDelays.at(-1).fn();
  assert.equal(recover.utterances.length,2);
  const watchdog2200=recover.shortDelays.filter(d=>d.ms===2200).at(-1);
  assert(watchdog2200);
  watchdog2200.fn();
  assert.equal(recover.toasts.length,0);
  const retry100=recover.shortDelays.filter(d=>d.ms===100).at(-1);
  assert(retry100);
  retry100.fn();
  assert.equal(recover.utterances.length,3);
  assert.equal(recover.utterances[2].voice.voiceURI,'fixture');
  recover.utterances[2].onstart();
  recover.utterances[2].onend();
  assert.equal(recover.audio.state,'finished');
  assert.equal(recover.toasts.length,0);
 }finally{recover.close();}

 const keepVoice=harness({pending:true,speechText:speech,captureAllTimers:true});
 try{
  keepVoice.api.play();
  keepVoice.utterances[0].onstart();
  keepVoice.utterances[0].onend();
  keepVoice.shortDelays.at(-1).fn();
  keepVoice.shortDelays.filter(d=>d.ms===2200).at(-1).fn();
  keepVoice.shortDelays.filter(d=>d.ms===100).at(-1).fn();
  keepVoice.timers.at(-1)();
  assert.equal(keepVoice.toasts.length,1);
  keepVoice.api.play();
  assert.equal(keepVoice.utterances.at(-1).voice.voiceURI,'fixture');
 }finally{keepVoice.close();}
});
check('speakSegment empacota falas curtas no iPhone sem quebras de linha, recupera troca travada, pausa no desktop e cancelSegment limpa timer',()=>{
 const shortSeg=harness({captureAllTimers:true});
 try{
  let ended=0;
  shortSeg.api.speakSegment({text:'Primeira fala\n\nSegunda fala.',locale:'pt-BR',onEnd:()=>ended++});
  assert.equal(shortSeg.utterances.length,1);
  assert.equal(shortSeg.utterances[0].text,'Primeira fala. Segunda fala.');
  shortSeg.utterances[0].onend();
  assert.equal(ended,1);
 }finally{shortSeg.close();}

 const longTurn='Primeira frase longa o suficiente para completar um trecho antes da mudança de bloco.\n\n'+
  'Segunda frase também longa para garantir dois blocos separados durante o ensaio interativo.';
 const h=harness({captureAllTimers:true});
 try{
  let ended=0;
  const reqId=h.api.speakSegment({text:longTurn,locale:'pt-BR',onEnd:()=>ended++});
  assert.equal(h.utterances.length,1);
  h.utterances[0].onend();
  const p=h.shortDelays.at(-1);
  assert(p&&p.ms===0&&!p.cleared);
  h.api.cancelSegment(reqId);
  assert.equal(p.cleared,true);
  p.fn();
  assert.equal(h.utterances.length,1);
  assert.equal(ended,0);
 }finally{h.close();}

 const segRecover=harness({pending:true,captureAllTimers:true});
 try{
  let ended=0,errors=0;
  segRecover.api.speakSegment({text:longTurn,locale:'pt-BR',onEnd:()=>ended++,onError:()=>errors++});
  segRecover.utterances[0].onstart();
  segRecover.advance(1000);
  segRecover.utterances[0].onend();
  segRecover.shortDelays.at(-1).fn();
  segRecover.shortDelays.filter(d=>d.ms===2200).at(-1).fn();
  segRecover.shortDelays.filter(d=>d.ms===100).at(-1).fn();
  assert.equal(segRecover.utterances.length,3);
  segRecover.utterances[2].onstart();
  segRecover.advance(1000);
  segRecover.utterances[2].onend();
  assert.equal(ended,1);
  assert.equal(errors,0);
 }finally{segRecover.close();}

 const win=harness({ios:false,captureAllTimers:true});
 try{
  win.api.speakSegment({text:'Primeira fala.\n\nSegunda fala.',locale:'pt-BR'});
  win.utterances[0].onend();
  const pWin=win.shortDelays.at(-1);
  assert(pWin&&pWin.ms>=250);
 }finally{win.close();}
});
check('Voz compacta padrão (super-compact default) vence compacta secundária e perde para voz Aprimorada',()=>{
 const voices=[
  {name:'Felipe',lang:'pt-BR',localService:true,default:false,voiceURI:'com.apple.voice.compact.pt-BR.Felipe'},
  {name:'Luciana',lang:'pt-BR',localService:true,default:true,voiceURI:'com.apple.voice.super-compact.pt-BR.Luciana'}
 ];
 const hCompact=harness({voices,language:'pt-BR'});
 try{
  hCompact.api.play();
  assert.equal(hCompact.utterances[0].voice.name,'Luciana');
 }finally{hCompact.close();}

 const hEnhanced=harness({voices:[...voices,{name:'Felipe (Aprimorado)',lang:'pt-BR',localService:true,default:false,voiceURI:'com.apple.voice.enhanced.pt-BR.Felipe'}],language:'pt-BR'});
 try{
  hEnhanced.api.play();
  assert.equal(hEnhanced.utterances[0].voice.name,'Felipe (Aprimorado)');
 }finally{hEnhanced.close();}
});
check('speakSegment ignora onend de utterance cancelada durante recuperação e não pula o turno',()=>{
 const h=harness({pending:true,captureAllTimers:true});
 try{
  let ended=0,errors=0;
  h.synth.cancel=function(){
   h.log.push('cancel');
   const u=h.utterances.at(-1);
   this.speaking=false;this.pending=false;
   u?.onend?.();
  };
  h.api.speakSegment({text:'Fala com recuperação segura.',locale:'pt-BR',onEnd:()=>ended++,onError:()=>errors++});
  assert.equal(h.utterances.length,1);
  h.shortDelays.filter(d=>d.ms===2200).at(-1).fn();
  assert.equal(ended,0,'Não deve concluir o turno quando synth.cancel dispara onend na utterance descartada');
  h.shortDelays.filter(d=>d.ms===100).at(-1).fn();
  assert.equal(h.utterances.length,2);
  h.utterances[1].onstart();
  h.advance(1000);
  h.utterances[1].onend();
  assert.equal(ended,1);
  assert.equal(errors,0);
 }finally{h.close();}
});
check('Chunk 0 no iOS tenta fallback seguro para system-default e nunca bane a única voz pt-BR para pt-PT',()=>{
 const voices=[
  {name:'Eddy',lang:'pt-BR',localService:true,default:false,voiceURI:'com.apple.eloquence.pt-BR.Eddy'},
  {name:'Siri Voz 1',lang:'pt-BR',localService:true,default:false,voiceURI:'com.apple.ttsbundle.siri_pt-BR_1'},
  {name:'Luciana',lang:'pt-BR',localService:true,default:true,voiceURI:'com.apple.voice.compact.pt-BR.Luciana'},
  {name:'Joana',lang:'pt-PT',localService:true,default:false,voiceURI:'com.apple.voice.compact.pt-PT.Joana'}
 ];
 const hFallback=harness({pending:true,voices,language:'pt-BR',captureAllTimers:true});
 try{
  let ended=0,errors=0;
  hFallback.api.speakSegment({text:'Primeira fala.',locale:'pt-BR',onEnd:()=>ended++,onError:()=>errors++});
  assert.equal(hFallback.utterances[0].voice.name,'Luciana');
  hFallback.shortDelays.filter(d=>d.ms===2200).at(-1).fn();
  hFallback.shortDelays.filter(d=>d.ms===100).at(-1).fn();
  assert.equal(hFallback.utterances.length,2);
  assert.equal(hFallback.utterances[1].voice,undefined);
  assert.equal(hFallback.utterances[1].lang,'pt-BR');
  hFallback.utterances[1].onstart();
  hFallback.advance(1000);
  hFallback.utterances[1].onend();
  assert.equal(ended,1);
  assert.equal(errors,0);
 }finally{hFallback.close();}

 const hNoBlacklist=harness({pending:true,voices,language:'pt-BR',captureAllTimers:true});
 try{
  const errs=[];
  hNoBlacklist.api.speakSegment({text:'Falha total transitória.',locale:'pt-BR',onError:e=>errs.push(e.code)});
  hNoBlacklist.shortDelays.filter(d=>d.ms===2200).at(-1).fn();
  hNoBlacklist.shortDelays.filter(d=>d.ms===100).at(-1).fn();
  hNoBlacklist.timers.at(-1)();
  assert.deepEqual(errs,['startup-timeout']);
  hNoBlacklist.api.speakSegment({text:'Nova tentativa.',locale:'pt-BR'});
  assert.equal(hNoBlacklist.utterances.at(-1).voice.name,'Luciana');
  assert.notEqual(hNoBlacklist.utterances.at(-1).voice?.name,'Joana');
 }finally{hNoBlacklist.close();}
});
check('Transição encadeada Fala 1 -> Fala 2 dentro de onEnd no iOS evita cancel() e aguarda pausa limpa de 60 ms',()=>{
 const h=harness({captureAllTimers:true});
 try{
  let turn2Ended=0;
  h.api.speakSegment({
   text:'Fala um do parceiro.',
   locale:'pt-BR',
   onEnd:()=>{
    h.api.speakSegment({text:'Fala dois do parceiro.',locale:'pt-BR',onEnd:()=>turn2Ended++});
   }
  });
  assert.equal(h.utterances.length,1);
  h.log.length=0;
  h.utterances[0].onend();
  assert.equal(h.log.includes('cancel'),false);
  assert.equal(h.utterances.length,1);
  const pause60=h.shortDelays.filter(d=>d.ms===60).at(-1);
  assert(pause60&&!pause60.cleared);
  pause60.fn();
  assert.equal(h.utterances.length,2);
  assert.equal(h.utterances[1].text,'Fala dois do parceiro.');
  h.utterances[1].onend();
  assert.equal(turn2Ended,1);
 }finally{h.close();}
});
check('startUtterance ignora onerror(canceled) ao recuperar chunk travado no iOS',()=>{
 const h=harness({pending:true,captureAllTimers:true,speechText:'Leitura que recupera sem abortar.'});
 try{
  h.synth.cancel=function(){
   h.log.push('cancel');
   const u=h.utterances.at(-1);
   this.speaking=false;this.pending=false;
   u?.onerror?.({error:'canceled'});
  };
  h.api.play();
  assert.equal(h.utterances.length,1);
  h.shortDelays.filter(d=>d.ms===2200).at(-1).fn();
  assert.equal(h.toasts.length,0);
  h.shortDelays.filter(d=>d.ms===100).at(-1).fn();
  assert.equal(h.utterances.length,2);
  h.utterances[1].onstart();
  h.utterances[1].onend();
  assert.equal(h.audio.state,'finished');
  assert.equal(h.toasts.length,0);
 }finally{h.close();}
});
check('iOS detecta onend silencioso sem onstart e tenta novamente em vez de pular a fala do parceiro',()=>{
 const h=harness({pending:true,captureAllTimers:true});
 try{
  let ended=0,errors=0;
  h.api.speakSegment({text:'Esta é uma fala completa do parceiro.',locale:'pt-BR',onEnd:()=>ended++,onError:()=>errors++});
  assert.equal(h.utterances.length,1);
  h.utterances[0].onend();
  assert.equal(ended,0);
  assert.equal(errors,0);
  const retry350=h.shortDelays.filter(d=>d.ms===350).at(-1);
  assert(retry350&&!retry350.cleared);
  retry350.fn();
  assert.equal(h.utterances.length,2);
  assert.equal(h.utterances[1].voice.voiceURI,'fixture');
  h.utterances[1].onstart();
  h.advance(1000);
  h.utterances[1].onend();
  assert.equal(ended,1);
  assert.equal(errors,0);
 }finally{h.close();}
});
check('iOS detecta onstart+onend instantâneo sem áudio, tenta fallback e pausa como not-allowed sem banir voz pt-BR',()=>{
 const voices=[
  {name:'Luciana',lang:'pt-BR',localService:true,default:true,voiceURI:'com.apple.voice.compact.pt-BR.Luciana'},
  {name:'Felipe',lang:'pt-BR',localService:true,default:false,voiceURI:'com.apple.voice.compact.pt-BR.Felipe'}
 ];
 const h=harness({pending:true,voices,language:'pt-BR',captureAllTimers:true});
 try{
  let ended=0;const errs=[];
  h.api.speakSegment({text:'Fala do parceiro que não pode ser pulada em silêncio.',locale:'pt-BR',onEnd:()=>ended++,onError:e=>errs.push(e.code)});
  h.utterances[0].onstart();
  h.advance(20);
  h.utterances[0].onend();
  assert.equal(ended,0);
  h.shortDelays.filter(d=>d.ms===350).at(-1).fn();
  assert.equal(h.utterances.length,2);
  assert.equal(h.utterances[1].voice.name,'Luciana');
  h.utterances[1].onstart();
  h.advance(30);
  h.utterances[1].onend();
  assert.equal(ended,0);
  h.shortDelays.filter(d=>d.ms===450).at(-1).fn();
  assert.equal(h.utterances.length,3);
  assert.equal(h.utterances[2].voice.name,'Felipe');
  h.utterances[2].onstart();
  h.advance(15);
  h.utterances[2].onend();
  assert.equal(ended,0);
  assert.deepEqual(errs,['not-allowed']);
  h.api.speakSegment({text:'Nova tentativa na mesma voz.',locale:'pt-BR'});
  assert.equal(h.utterances.at(-1).voice.name,'Luciana');
 }finally{h.close();}
});
check('speakSegment respeita settleMs de 350 ms no iOS após microfone e fala sincronamente fora do iOS ou com settleMs 0',()=>{
 const hIOS=harness({captureAllTimers:true});
 try{
  hIOS.api.speakSegment({text:'Fala após permissão do microfone.',locale:'pt-BR',settleMs:350});
  assert.equal(hIOS.utterances.length,0);
  const d350=hIOS.shortDelays.filter(d=>d.ms===350).at(-1);
  assert(d350&&!d350.cleared);
  d350.fn();
  assert.equal(hIOS.utterances.length,1);
 }finally{hIOS.close();}

 const hDesktop=harness({ios:false,captureAllTimers:true});
 try{
  hDesktop.api.speakSegment({text:'Fala desktop imediata.',locale:'pt-BR',settleMs:350});
  assert.equal(hDesktop.utterances.length,1);
 }finally{hDesktop.close();}

 const hSync=harness({captureAllTimers:true});
 try{
  hSync.api.speakSegment({text:'Fala manual imediata.',locale:'pt-BR',settleMs:0});
  assert.equal(hSync.utterances.length,1);
 }finally{hSync.close();}
});
