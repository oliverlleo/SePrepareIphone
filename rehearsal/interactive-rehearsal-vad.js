import {sharedMicrophone} from '../recordings/shared-microphone.js';
import { createClassifiedSpeechGate } from './rehearsal-speech-gate.js';
import { createWebSpeechClassifier } from './rehearsal-web-classifier.js';
import { PcmFrameResampler } from './voice/pcm-resampler.js';

export function createRehearsalVad(options = {}) {
  const {
    mediaDevices = sharedMicrophone,
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
  let classifier, pending, workletReady, workletDisabled = false, listening = false, sessionLossCallback, interval;
  let detachTrackListeners = () => {}, detachContextListener = () => {};
  let audioSessionClaimed = false, previousSessionType = null;

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
  function promoteAudioSession() {
    try {
      const session = globalThis.navigator?.audioSession;
      if (!session) return;
      if (!audioSessionClaimed) {
        previousSessionType = (session.type === 'playback' || session.type === 'play-and-record') ? 'auto' : session.type;
        audioSessionClaimed = true;
      }
      if (session.type !== 'play-and-record') session.type = 'play-and-record';
    } catch {}
  }
  function restoreAudioSession() {
    try {
      const session = globalThis.navigator?.audioSession;
      const hasOtherMic = Boolean(mediaDevices?.activeLeases?.() > 0);
      if (audioSessionClaimed && session && !hasOtherMic && session.type === 'play-and-record') {
        session.type = previousSessionType || 'auto';
      }
    } catch {}
    audioSessionClaimed = false;
    previousSessionType = null;
  }
  function release() {
    generation++;stopListening();pending=null;
    releaseStream();
    detachContextListener();detachContextListener=()=>{};
    const previous=ctx;ctx=null;
    workletReady=null;
    workletDisabled=false;
    try {Promise.resolve(previous?.close()).catch(()=>{});} catch {}
    classifier?.release();classifier=null;
    sessionLossCallback=null;
    restoreAudioSession();
  }
  function lost(error) {
    const callback=sessionLossCallback;
    release();callback?.(errorInfo(error));
  }
  function later(ms) {return new Promise(resolve=>setTimeoutFn(resolve,ms));}
  function waitForTrackUnmute(targetStream, mine, maxMs) {
    const tracks=targetStream?.getAudioTracks?.()||[];
    if(!tracks.length || tracks.some(tr=>tr.readyState!=='ended'&&!tr.muted))return Promise.resolve(true);
    if(!tracks.some(tr=>tr.readyState!=='ended'))return Promise.resolve(false);
    return new Promise(resolve=>{
      let settled=false;
      let timer=null;
      const cleanups=[];
      const finish=()=>{
        if(settled)return;
        settled=true;
        if(timer!=null){clearTimeoutFn(timer);timer=null;}
        cleanups.forEach(fn=>fn());
        resolve(mine===generation && tracks.some(tr=>tr.readyState!=='ended'&&!tr.muted));
      };
      for(const tr of tracks) {
        if(tr.readyState==='ended')continue;
        const onUnmute=()=>finish();
        const onEnded=()=>{if(tracks.every(t2=>t2.readyState==='ended'))finish();};
        tr.addEventListener?.('unmute',onUnmute);
        tr.addEventListener?.('ended',onEnded);
        cleanups.push(()=>{tr.removeEventListener?.('unmute',onUnmute);tr.removeEventListener?.('ended',onEnded);});
      }
      if(!settled)timer=setTimeoutFn(finish,maxMs);
    });
  }
  async function resumeContext(mine) {
    if (!ctx || ctx.state === 'closed') return false;
    if (ctx.state === 'running') return true;
    for (const waitMs of [0, 150, 300, 500, 650]) {
      if (mine !== generation || !ctx || ctx.state === 'closed') return false;
      if (waitMs > 0) await later(waitMs);
      if (mine !== generation || !ctx || ctx.state === 'closed') return false;
      if (ctx.state === 'running') return true;
      try {
        await Promise.race([Promise.resolve(ctx.resume()).catch(() => {}), later(600)]);
      } catch {}
      if (mine !== generation || !ctx || ctx.state === 'closed') return false;
      if (ctx.state === 'running') return true;
    }
    return ctx?.state === 'running';
  }
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
      promoteAudioSession();
      if(!ctx || ctx.state==='closed') {
        ctx=new AudioContextClass();
        const active=ctx;
        const stateChanged=()=>{
          if(mine!==generation)return;
          if(active.state==='closed'){if(listening)lost({code:'stream-lost'});return;}
          if(listening&&(active.state==='suspended'||active.state==='interrupted')){
            try{Promise.resolve(active.resume()).catch(()=>{});}catch{}
          }
        };
        active.addEventListener?.('statechange',stateChanged);
        detachContextListener=()=>active.removeEventListener?.('statechange',stateChanged);
      }
      if(ctx.state!=='running')Promise.resolve(ctx.resume()).catch(()=>{});
      const liveTracks=stream?.getAudioTracks?.().filter(track=>track.readyState!=='ended')||[];
      const healthy=liveTracks.some(track=>!track.muted);
      const hasMutedLive=!healthy && liveTracks.length>0;
      if(!healthy && !hasMutedLive && stream)releaseStream();
      const mic=healthy?Promise.resolve(stream):hasMutedLive?null:acquire(mine);
      pending=(async()=>{
        try {
          let candidate=null;
          if(hasMutedLive && stream) {
            const unmuted=await waitForTrackUnmute(stream,mine,250);
            if(mine!==generation)return {ok:false,code:'cancelled',message:''};
            if(unmuted)candidate=stream;
            else {
              releaseStream();
              candidate=await acquire(mine);
            }
          } else {
            candidate=await mic;
          }
          if(mine!==generation || !candidate)return {ok:false,code:'cancelled',message:''};
          if(candidate!==stream && candidate.getAudioTracks().some(tr=>tr.muted)) {
            await waitForTrackUnmute(candidate,mine,900);
            if(mine!==generation) {
              for(const track of candidate.getTracks?.()||[]){try{track.stop();}catch{}}
              return {ok:false,code:'cancelled',message:''};
            }
          }
          promoteAudioSession();
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
          classifier ||= createClassifier();
          await classifier.ensure();
          if(mine!==generation)return {ok:false,code:'cancelled',message:''};
          if(ctx.state!=='running') {
            const running=await resumeContext(mine);
            if(mine!==generation)return {ok:false,code:'cancelled',message:''};
            if(!running)throw {code:'audio-blocked'};
          }
          return {ok:true};
        } catch(error) {
          if(mine!==generation)return {ok:false,code:'cancelled',message:''};
          console.warn('SePrepare VAD:',error?.code||error?.name||error);
          const info=errorInfo(error);release();return {ok:false,...info};
        } finally {if(mine===generation)pending=null;}
      })();
      return pending;
    } catch(error) {const info=errorInfo(error);release();return Promise.resolve({ok:false,...info});}
  }
  async function startListeningTurn({silenceSeconds=3,echoGuardMs=0,onStateChange,onSpeechComplete,onError}={}) {
    stopListening();
    const myTurn=turn, mine=generation;
    const prepared=await ensureSession({onStreamLost:onError});
    if(!prepared.ok){if(prepared.code!=='cancelled')onError?.(prepared);return {started:false,reason:prepared.code};}
    if(myTurn!==turn||mine!==generation)return {started:false,reason:'cancelled'};
    const gate=createClassifiedSpeechGate({silenceTargetMs:([2,3,5].includes(Number(silenceSeconds))?Number(silenceSeconds):3)*1000});
    const silenceTargetMs=([2,3,5].includes(Number(silenceSeconds))?Number(silenceSeconds):3)*1000;
    const guardMs=Math.max(0,Number(echoGuardMs)||0);
    let lastData=now(),lastEmit=0,lastPhase='',guardUntil=0,workletFrames=0,captureStartedAt=now();
    const valid=()=>myTurn===turn&&mine===generation&&listening;
    const fail=error=>{if(valid())lost(error);};
    const frame=samples=>{
      if(valid()&&ctx.state==='running'&&!stream.getAudioTracks().some(track=>track.muted))classifier.push(samples,myTurn);
    };
    const attachScriptProcessor=()=>{
      // Older Safari / restricted AudioWorklet: same classifier with legacy PCM capture, never RMS.
      if(typeof ctx.createScriptProcessor!=='function')throw Error('PCM capture unavailable');
      const node=ctx.createScriptProcessor(2048,1,1);
      resampler=new PcmFrameResampler(ctx.sampleRate,frame);
      node.onaudioprocess=event=>{
        event.outputBuffer.getChannelData(0).fill(0);
        if(valid())resampler.push(event.inputBuffer.getChannelData(0));
      };
      return node;
    };
    try {
      await classifier.startTurn(myTurn,probability=>{
        if(!valid())return;
        lastData=now();
        if(guardUntil) {
          if(now()<guardUntil)return;
          guardUntil=0;
        }
        let status;
        try {status=gate.push({probability,dt:32});}catch{fail({code:'classifier-failed'});return;}
        if(status.complete){stopListening();onSpeechComplete?.();return;}
        if(status.phase!==lastPhase || now()-lastEmit>=180) {
          lastPhase=status.phase;lastEmit=now();
          onStateChange?.({...status,silenceTargetMs,silenceRemainingMs:Math.max(0,silenceTargetMs-status.silenceStreakMs)});
        }
      },fail);
      if(myTurn!==turn||mine!==generation)return {started:false,reason:'cancelled'};
      if(ctx.state!=='running') {
        const running=await resumeContext(mine);
        if(myTurn!==turn||mine!==generation)return {started:false,reason:'cancelled'};
        if(!running)throw {code:'audio-blocked'};
      }
      // Enable the track before wiring the MediaStreamSource so WebKit AudioWorklet never binds to a disabled track.
      enabled(true);
      source=ctx.createMediaStreamSource(stream);
      if(!workletDisabled && ctx.audioWorklet && AudioWorkletNodeClass) {
        try {
          workletReady ||= ctx.audioWorklet.addModule(new URL('pcm-capture-worklet.js',baseURL)).catch(err=>{
            workletReady=null;
            throw err;
          });
          await workletReady;
          if(myTurn!==turn||mine!==generation)return {started:false,reason:'cancelled'};
          capture=new AudioWorkletNodeClass(ctx,'seprepare-speech-capture',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1]});
          capture.port.onmessage=({data})=>{
            if(data.type==='frame'&&data.token===myTurn){workletFrames++;frame(data.samples);}
          };
          capture.port.postMessage({active:true,token:myTurn});
        } catch {capture=null;}
      }
      if(!capture) {
        capture=attachScriptProcessor();
      }
      if(ctx.state!=='running') {
        const running=await resumeContext(mine);
        if(myTurn!==turn||mine!==generation)return {started:false,reason:'cancelled'};
        if(!running)throw {code:'audio-blocked'};
      }
      gain=ctx.createGain();gain.gain.value=0;
      source.connect(capture);capture.connect(gain);gain.connect(ctx.destination);
      listening=true;lastData=now();captureStartedAt=now();
      guardUntil=guardMs>0?now()+guardMs:0;
      onStateChange?.({phase:'waiting-voice',hasStartedSpeaking:false,level:0,silenceTargetMs,silenceRemainingMs:silenceTargetMs});
      interval=setIntervalFn(()=>{
        if(!valid())return;
        if(ctx&&(ctx.state==='suspended'||ctx.state==='interrupted')){
          try{Promise.resolve(ctx.resume()).catch(()=>{});}catch{}
        }
        const trackMuted=stream?.getAudioTracks?.().some(track=>track.muted);
        if(capture?.port && workletFrames===0 && !trackMuted && ctx?.state==='running' && now()-captureStartedAt>=1000) {
          try {
            if(typeof ctx.createScriptProcessor==='function') {
              workletDisabled=true;
              disconnect();
              enabled(true);
              source=ctx.createMediaStreamSource(stream);
              capture=attachScriptProcessor();
              gain=ctx.createGain();gain.gain.value=0;
              source.connect(capture);capture.connect(gain);gain.connect(ctx.destination);
              lastData=now();
              return;
            }
          } catch {}
        }
        if(now()-lastData>2500)fail({code:'capture-stalled'});
      },500);
      return {started:true};
    } catch(error) {
      if(myTurn===turn&&mine===generation){const info=errorInfo(error);release();onError?.(info);}
      return {started:false,reason:'audio-error'};
    }
  }
  return {isSupported:supported,ensureSession,startListeningTurn,stopListening,release,
    isActive:()=>Boolean(stream),getBackend:()=>capture?.port?'worklet':capture?'script-processor':null};
}
