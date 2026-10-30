import { createClassifiedSpeechGate } from './rehearsal-speech-gate.js';
import { createWebSpeechClassifier } from './rehearsal-web-classifier.js';
import { PcmFrameResampler } from './voice/pcm-resampler.js';

export function createRehearsalVad(options = {}) {
  const {
    mediaDevices = globalThis.navigator?.mediaDevices,
    AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext,
    AudioWorkletNodeClass = globalThis.AudioWorkletNode,
    createClassifier = () => createWebSpeechClassifier(),
    secureContext = globalThis.isSecureContext !== false,
    baseURL = typeof document !== 'undefined' ? new URL('./voice/v1.0.74/', document.baseURI).href : '',
    now = () => Date.now(),
    setIntervalFn = setInterval, clearIntervalFn = clearInterval,
    setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout,
    t = value => value
  } = options;
  let generation = 1, turn = 0, ctx, stream, source, capture, gain, resampler;
  let classifier, pending, workletReady, listening = false, sessionLossCallback, interval;
  let detachTrackListeners = () => {}, detachContextListener = () => {};

  function errorInfo(error) {
    const name=String(error?.name || error?.code || '');
    const info = /NotAllowed|PermissionDenied|Security/.test(name)
      ? ['permission-denied','Permita o microfone nos ajustes do navegador ou do sistema para usar o modo Automático. Continuando no modo Manual.']
      : /NotFound|DevicesNotFound|Overconstrained/.test(name)
        ? ['mic-unavailable','Nenhum microfone disponível foi encontrado. Continuando no modo Manual.']
        : /NotReadable|TrackStart|Abort|mic-busy/.test(name)
          ? ['mic-busy','O microfone está ocupado ou indisponível. Confira outros aplicativos e os ajustes do sistema. Continuando no modo Manual.']
          : /audio-blocked/.test(name)
            ? ['audio-blocked','Toque novamente em Automático para ativar o áudio neste dispositivo. Continuando no modo Manual.']
            : /insecure/.test(name)
              ? ['insecure-context','Abra o SePrepare pelo endereço HTTPS para usar o microfone. Continuando no modo Manual.']
              : ['audio-error','A detecção de fala não pôde ser iniciada. Continuando no modo Manual.'];
    return {code:info[0],message:t(info[1])};
  }
  function supported() {
    return secureContext && typeof mediaDevices?.getUserMedia === 'function' && typeof AudioContextClass === 'function';
  }
  function enabled(value) { for (const track of stream?.getAudioTracks?.() || []) track.enabled=value; }
  function disconnect() {
    if (capture?.port) { capture.port.onmessage=null; try {capture.port.postMessage({active:false,token:0});} catch {} }
    if (capture) capture.onaudioprocess=null;
    for (const node of [source,capture,gain]) { try {node?.disconnect();} catch {} }
    source=capture=gain=resampler=null;
  }
  function stopListening() {
    turn++;listening=false;
    if(interval!=null)clearIntervalFn(interval);interval=null;
    classifier?.stopTurn();
    enabled(false);disconnect();
  }
  function releaseStream() {
    detachTrackListeners();detachTrackListeners=()=>{};
    for (const track of stream?.getTracks?.() || []) { try {track.stop();} catch {} }
    stream=null;
  }
  function release() {
    generation++;stopListening();pending=null;
    releaseStream();
    detachContextListener();detachContextListener=()=>{};
    const previous=ctx;ctx=null;
    workletReady=null;
    try {Promise.resolve(previous?.close()).catch(()=>{});} catch {}
    classifier?.release();classifier=null;
    sessionLossCallback=null;
  }
  function lost(error) {
    const callback=sessionLossCallback;
    release();callback?.(errorInfo(error));
  }
  function later(ms) {return new Promise(resolve=>setTimeoutFn(resolve,ms));}
  async function acquire(myGeneration) {
    // Optional constraints: never force a device, sample rate or unsupported DSP setting.
    const attempts=[{audio:{channelCount:{ideal:1},echoCancellation:true,noiseSuppression:true,autoGainControl:false},video:false},
      {audio:{autoGainControl:false},video:false},{audio:true,video:false}];
    let last;
    for(let index=0;index<attempts.length;index++) {
      if(index)await later(index*100);
      if(myGeneration!==generation)return null;
      try {
        const candidate=await mediaDevices.getUserMedia(attempts[index]);
        if(myGeneration!==generation) {
          for(const track of candidate.getTracks())track.stop();
          return null;
        }
        if(candidate.getAudioTracks().some(track=>track.readyState!=='ended'))return candidate;
        for(const track of candidate.getTracks())track.stop();
        last={name:'NotReadableError'};
      } catch(error) {
        last=error;
        // A refusal is final: no automatic repeated requests for permission.
        if(/NotAllowed|PermissionDenied|Security/.test(error?.name || ''))break;
      }
    }
    throw last || Error('Microphone unavailable');
  }
  function ensureSession({onStreamLost}={}) {
    if(onStreamLost)sessionLossCallback=onStreamLost;
    if(!supported())return Promise.resolve({ok:false,...errorInfo({code:secureContext?'unsupported':'insecure'})});
    if(pending)return pending;
    const mine=generation;
    // Keep creation, resume AND getUserMedia in the originating user gesture, before any await.
    try {
      if(!ctx || ctx.state==='closed') {
        ctx=new AudioContextClass();
        const active=ctx;
        const stateChanged=()=>{if(listening&&active.state==='closed')lost({code:'stream-lost'});};
        active.addEventListener?.('statechange',stateChanged);
        detachContextListener=()=>active.removeEventListener?.('statechange',stateChanged);
      }
      if(ctx.state!=='running')Promise.resolve(ctx.resume()).catch(()=>{});
      classifier ||= createClassifier();
      const readyClassifier=classifier.ensure();
      // Attach a handler immediately while the browser's permission dialog can remain open.
      readyClassifier.catch(()=>{});
      const healthy=stream?.getAudioTracks?.().some(track=>track.readyState!=='ended');
      const mic=healthy?Promise.resolve(stream):acquire(mine);
      pending=(async()=>{
        try {
          const candidate=await mic;
          if(mine!==generation || !candidate)return {ok:false,code:'cancelled',message:''};
          if(candidate!==stream) {
            releaseStream();stream=candidate;enabled(false);
            const handlers=[];
            for(const track of stream.getAudioTracks()) {
              const ended=()=>{
                if(mine!==generation)return;
                // Safari can stop an idle muted track during narration. Reacquire at next user turn.
                if(!listening){releaseStream();return;}
                lost({code:'stream-lost'});
              };
              track.addEventListener?.('ended',ended);
              handlers.push(()=>track.removeEventListener?.('ended',ended));
            }
            detachTrackListeners=()=>handlers.forEach(fn=>fn());
          }
          await readyClassifier;
          if(mine!==generation)return {ok:false,code:'cancelled',message:''};
          if(ctx.state!=='running') {
            await Promise.race([Promise.resolve(ctx.resume()),later(700)]);
            if(mine!==generation)return {ok:false,code:'cancelled',message:''};
            if(ctx.state!=='running')throw {code:'audio-blocked'};
          }
          return {ok:true};
        } catch(error) {
          if(mine!==generation)return {ok:false,code:'cancelled',message:''};
          const info=errorInfo(error);release();return {ok:false,...info};
        } finally {if(mine===generation)pending=null;}
      })();
      return pending;
    } catch(error) {const info=errorInfo(error);release();return Promise.resolve({ok:false,...info});}
  }
  async function startListeningTurn({silenceSeconds=3,onStateChange,onSpeechComplete,onError}={}) {
    stopListening();
    const myTurn=turn, mine=generation;
    const prepared=await ensureSession({onStreamLost:onError});
    if(!prepared.ok){if(prepared.code!=='cancelled')onError?.(prepared);return {started:false,reason:prepared.code};}
    if(myTurn!==turn||mine!==generation)return {started:false,reason:'cancelled'};
    const gate=createClassifiedSpeechGate({silenceTargetMs:([2,3,5].includes(Number(silenceSeconds))?Number(silenceSeconds):3)*1000});
    const silenceTargetMs=([2,3,5].includes(Number(silenceSeconds))?Number(silenceSeconds):3)*1000;
    let lastData=now(),lastEmit=0,lastPhase='';
    const valid=()=>myTurn===turn&&mine===generation&&listening;
    const fail=error=>{if(valid())lost(error);};
    const frame=samples=>{
      if(valid()&&ctx.state==='running'&&!stream.getAudioTracks().some(track=>track.muted))classifier.push(samples,myTurn);
    };
    try {
      await classifier.startTurn(myTurn,probability=>{
        if(!valid())return;
        let status;
        try {status=gate.push({probability,dt:32});}catch{fail({code:'classifier-failed'});return;}
        lastData=now();
        if(status.complete){stopListening();onSpeechComplete?.();return;}
        if(status.phase!==lastPhase || now()-lastEmit>=180) {
          lastPhase=status.phase;lastEmit=now();
          onStateChange?.({...status,silenceTargetMs,silenceRemainingMs:Math.max(0,silenceTargetMs-status.silenceStreakMs)});
        }
      },fail);
      if(myTurn!==turn||mine!==generation)return {started:false,reason:'cancelled'};
      source=ctx.createMediaStreamSource(stream);
      if(ctx.audioWorklet && AudioWorkletNodeClass) {
        try {
          workletReady ||= ctx.audioWorklet.addModule(new URL('pcm-capture-worklet.js',baseURL));
          await workletReady;
          if(myTurn!==turn||mine!==generation)return {started:false,reason:'cancelled'};
          capture=new AudioWorkletNodeClass(ctx,'seprepare-speech-capture',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1]});
          capture.port.onmessage=({data})=>{if(data.type==='frame'&&data.token===myTurn)frame(data.samples);};
          capture.port.postMessage({active:true,token:myTurn});
        } catch {capture=null;}
      }
      if(!capture) {
        // Older Safari / restricted AudioWorklet: same classifier with legacy PCM capture, never RMS.
        if(typeof ctx.createScriptProcessor!=='function')throw Error('PCM capture unavailable');
        capture=ctx.createScriptProcessor(2048,1,1);
        resampler=new PcmFrameResampler(ctx.sampleRate,frame);
        capture.onaudioprocess=event=>{
          event.outputBuffer.getChannelData(0).fill(0);
          if(valid())resampler.push(event.inputBuffer.getChannelData(0));
        };
      }
      gain=ctx.createGain();gain.gain.value=0;
      source.connect(capture);capture.connect(gain);gain.connect(ctx.destination);
      listening=true;lastData=now();enabled(true);
      onStateChange?.({phase:'waiting-voice',hasStartedSpeaking:false,level:0,silenceTargetMs,silenceRemainingMs:silenceTargetMs});
      interval=setIntervalFn(()=>{if(valid()&&now()-lastData>2500)fail({code:'capture-stalled'});},500);
      return {started:true};
    } catch(error) {
      if(myTurn===turn&&mine===generation){const info=errorInfo(error);release();onError?.(info);}
      return {started:false,reason:'audio-error'};
    }
  }
  return {isSupported:supported,ensureSession,startListeningTurn,stopListening,release,
    isActive:()=>Boolean(stream),getBackend:()=>capture?.port?'worklet':capture?'script-processor':null};
}
