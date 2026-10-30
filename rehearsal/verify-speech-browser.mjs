import assert from 'node:assert/strict';
import { createRehearsalVad } from './interactive-rehearsal-vad.js';
import { createClassifiedSpeechGate } from './rehearsal-speech-gate.js';
import { PcmFrameResampler } from './voice/pcm-resampler.js';
let checks=0;
function check(name,run){run();checks++;console.log('PASS '+name);}
function harness(extra={}) {
 const log=[];let result,ended,interval,now=0,capture,requests=0,closed=0;
 const tracks=[];
 function track(){const t={enabled:true,readyState:'live',stop(){this.readyState='ended';},addEventListener(type,fn){if(type==='ended')ended=fn;},removeEventListener(){}};tracks.push(t);return t;}
 const classifier={ensure:async()=>{},async startTurn(token,fn){result=fn;},push(){},stopTurn(){result=null;},release(){result=null;log.push('release');}};
 class Context {
  constructor(){this.state='suspended';this.sampleRate=48000;this.destination={};log.push('context');}
  async resume(){this.state='running';log.push('resume');}
  async close(){closed++;this.state='closed';}
  createMediaStreamSource(){return {connect(){},disconnect(){}};}
  createGain(){return {gain:{value:0},connect(){},disconnect(){}};}
  createScriptProcessor(){capture={connect(){},disconnect(){}};return capture;}
 }
 const options={baseURL:'https://unit.test/voice/v1.0.74/',createClassifier:()=>classifier,AudioContextClass:Context,AudioWorkletNodeClass:null,
  mediaDevices:{async getUserMedia(c){requests++;log.push(['gum',c]);const t=track();return {getAudioTracks:()=>[t],getTracks:()=>[t]};}},
  now:()=>now,setIntervalFn:fn=>{interval=fn;return 1;},clearIntervalFn:()=>{interval=null;},...extra};
 return {options,log,tracks,classifier,Context,get requests(){return requests;},get closed(){return closed;},
  speak(p,ms=32){for(let i=0;i<ms;i+=32){now+=32;result?.(p);}},stall(){now+=2600;interval?.();},end(){ended?.();},get capture(){return capture;}};
}
for(const rate of [8000,16000,44100,48000]) {
 let count=0;const resampler=new PcmFrameResampler(rate,frame=>{count++;assert.equal(frame.length,512);assert(frame.every(x=>Math.abs(x-.25)<1e-5));});
 for(let at=0;at<rate*2;at+=137)resampler.push(new Float32Array(Math.min(137,rate*2-at)).fill(.25));
 check('Reamostragem '+rate+' Hz conserva quadros e leituras parciais',()=>assert.equal(count,62));
}
{
 const h=harness();const vad=createRehearsalVad(h.options);const permission=vad.ensureSession();
 check('AudioContext, resume e pedido do microfone começam antes do primeiro await',()=>assert.deepEqual(h.log.slice(0,3).map(x=>Array.isArray(x)?x[0]:x),['context','resume','gum']));
 assert((await permission).ok);let done=0,errors=0;
 await vad.startListeningTurn({silenceSeconds:2,onSpeechComplete:()=>done++,onError:()=>errors++});
 check('Captura alternativa usa o mesmo classificador de fala',()=>assert.equal(vad.getBackend(),'script-processor'));
 h.speak(.01,8000);check('Ruído não inicia a fala',()=>assert.equal(done,0));
 h.speak(.95,480);h.speak(.01,2016);check('Pausa na fala conclui a vez sem exigir silêncio total',()=>assert.equal(done,1));
 check('Escuta silenciada antes da próxima narração',()=>assert.equal(h.tracks[0].enabled,false));
 await vad.startListeningTurn({onError:()=>errors++});h.stall();
 check('Interrupção da captura não é interpretada como silêncio',()=>assert.equal(errors,1));
 check('Captura interrompida libera microfone e contexto',()=>assert(h.closed>0&&h.tracks.every(t=>t.readyState==='ended')));
 vad.release();
}
{
 let calls=0;
 const h=harness({mediaDevices:{async getUserMedia(c){calls++;if(typeof c.audio==='object')throw {name:'NotReadableError'};const t={enabled:true,readyState:'live',stop(){}};return {getAudioTracks:()=>[t],getTracks:()=>[t]};}},setTimeoutFn:fn=>{fn();return 1;}});
 const vad=createRehearsalVad(h.options);assert((await vad.ensureSession()).ok);
 check('Falha do processamento de áudio tenta constraints reduzidas e por fim áudio simples',()=>assert.equal(calls,3));vad.release();
}
{
 let calls=0;const h=harness({mediaDevices:{async getUserMedia(){calls++;throw {name:'NotAllowedError'};}}});
 const vad=createRehearsalVad(h.options);const res=await vad.ensureSession();
 check('Permissão negada é respeitada, sem repetir solicitações',()=>{assert.equal(calls,1);assert.equal(res.code,'permission-denied');});
}
{
 let resolveMic;const lateTrack={readyState:'live',stop(){this.readyState='ended';}};
 const h=harness({mediaDevices:{getUserMedia:()=>new Promise(resolve=>{resolveMic=resolve;})}});
 const vad=createRehearsalVad(h.options);const pending=vad.ensureSession();vad.release();
 resolveMic({getAudioTracks:()=>[lateTrack],getTracks:()=>[lateTrack]});
 const res=await pending;
 check('Cancelar durante a permissão descarta e fecha o microfone recebido depois',()=>{assert.equal(res.code,'cancelled');assert.equal(lateTrack.readyState,'ended');});
}
{
 const h=harness();const vad=createRehearsalVad(h.options);let error=0;
 await vad.startListeningTurn({onError:()=>error++});vad.stopListening();h.end();
 check('Safari encerrando uma faixa inativa durante narração não perde o turno',()=>assert.equal(error,0));
 await vad.startListeningTurn({onError:()=>error++});
 check('O microfone encerrado é readquirido no próximo turno',()=>assert.equal(h.requests,2));
 h.end();check('Perda do microfone em uso é informada para preservar o turno no Manual',()=>assert.equal(error,1));vad.release();
}
{
 const h=harness({secureContext:false});const vad=createRehearsalVad(h.options);const result=await vad.ensureSession();
 check('Origem insegura não pede permissão e orienta abrir HTTPS',()=>{assert.equal(result.code,'insecure-context');assert.equal(h.requests,0);});
}
{
 const h=harness();let pushed=0,errors=0;h.classifier.push=()=>pushed++;
 const vad=createRehearsalVad(h.options);await vad.startListeningTurn({onError:()=>errors++});
 const input=new Float32Array(1536).fill(.2),output=new Float32Array(1536).fill(.5);
 const event={inputBuffer:{getChannelData:()=>input},outputBuffer:{getChannelData:()=>output}};
 h.capture.onaudioprocess(event);
 check('A captura entrega somente quadros completos de PCM ao classificador',()=>assert.equal(pushed,1));
 check('O áudio capturado nunca retorna aos alto-falantes',()=>assert(output.every(value=>value===0)));
 h.tracks[0].muted=true;h.capture.onaudioprocess(event);
 check('Microfone silenciado pelo sistema não inventa quadros de silêncio',()=>assert.equal(pushed,1));
 h.stall();check('Bloqueio persistente do áudio preserva a vez no modo Manual',()=>assert.equal(errors,1));vad.release();
}
{
 const h=harness({AudioWorkletNodeClass:class{constructor(){throw Error('Worklet restricted');}}});
 class Context extends h.Context{constructor(){super();this.audioWorklet={addModule:async()=>{}};}}
 h.options.AudioContextClass=Context;
 const vad=createRehearsalVad(h.options);await vad.startListeningTurn();
 check('Falha de AudioWorklet mantém a detecção de fala pela captura alternativa',()=>assert.equal(vad.getBackend(),'script-processor'));vad.release();
}
{
 const h=harness();let modules=0;
 class Context extends h.Context{constructor(){super();this.audioWorklet={addModule:async()=>{modules++;}};}}
 class Worklet{constructor(){this.port={onmessage:null,postMessage(){}};}connect(){}disconnect(){}}
 h.options.AudioContextClass=Context;h.options.AudioWorkletNodeClass=Worklet;
 const vad=createRehearsalVad(h.options);await vad.startListeningTurn();vad.stopListening();await vad.startListeningTurn();
 check('AudioWorklet permanece disponível para turnos seguintes sem registrar o módulo duas vezes',()=>{assert.equal(modules,1);assert.equal(vad.getBackend(),'worklet');});vad.release();
}
{
 const h=harness();class Context extends h.Context{async resume(){this.state='interrupted';}}
 h.options.AudioContextClass=Context;h.options.setTimeoutFn=fn=>{fn();return 1;};
 const vad=createRehearsalVad(h.options);const res=await vad.ensureSession();
 check('Safari com áudio interrompido pede novo toque, sem fingir que está escutando',()=>assert.equal(res.code,'audio-blocked'));vad.release();
}
{
 const h=harness({createClassifier:()=>({ensure:async()=>{throw Error('offline asset missing');},release(){},stopTurn(){}})});
 const vad=createRehearsalVad(h.options);const result=await vad.ensureSession();
 check('Modelo indisponível não ativa detector por volume',()=>{assert.equal(result.ok,false);assert.equal(vad.isActive(),false);});
}
for(const seconds of [2,3,5]) {
 const gate=createClassifiedSpeechGate({silenceTargetMs:seconds*1000});
 for(let i=0;i<100;i++)gate.push({probability:.01});
 for(let i=0;i<15;i++)gate.push({probability:.95});
 let result;
 for(let i=0;i<Math.ceil(seconds*1000/32)+15;i++)result=gate.push({probability:i%7===0?.9:.01});
 check('Ruídos isolados não reiniciam nem congelam a pausa de '+seconds+' s',()=>assert.equal(result.complete,true));
}
console.log(`OK ${checks} verificações da captura e detecção de fala no navegador`);
