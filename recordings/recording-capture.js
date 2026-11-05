import {sharedMicrophone} from './shared-microphone.js';
import {supportedRecordingMime} from './recording-core.js';
export function createBrowserRecordingCapture({store,Recorder=globalThis.MediaRecorder,microphone=sharedMicrophone,onInterruption=()=>{}}){
 let recorder,stream,id,index=0,pending=Promise.resolve(),closing=null,error=null,started=0,elapsed=0,paused=false,stopResolve;
 async function start(record){
  if(!Recorder)throw Error('Gravação de áudio indisponível neste navegador.');
  // Calling getUserMedia before the first await preserves the originating user gesture.
  const request=microphone.getUserMedia({audio:{channelCount:{ideal:1},echoCancellation:true,noiseSuppression:true},video:false});
  stream=await request;id=record.id;index=0;pending=Promise.resolve();closing=null;error=null;elapsed=0;paused=false;
  try{
   const mime=supportedRecordingMime(Recorder);recorder=new Recorder(stream,{...(mime?{mimeType:mime}:{}),audioBitsPerSecond:48000});
   await store.patch(id,{mime:recorder.mimeType||mime||'audio/webm'});
   recorder.ondataavailable=event=>{if(!event.data?.size)return;const n=index++;pending=pending.then(()=>store.append(id,n,event.data)).catch(reason=>{if(!error){error=reason;onInterruption('storage');}});};
   recorder.onerror=()=>{error||=Error('A captação de áudio foi interrompida.');onInterruption('capture');};
   recorder.onstop=()=>stopResolve?.();
   for(const track of stream.getAudioTracks())track.addEventListener('ended',()=>{if(!closing)onInterruption('capture');});
   started=performance.now();recorder.start(2000);return {mime:recorder.mimeType||mime||'audio/webm'};
  }catch(reason){for(const track of stream?.getTracks()||[])track.stop();stream=null;throw reason;}
 }
 function pause(){if(recorder?.state==='recording'){elapsed+=performance.now()-started;paused=true;try{recorder.requestData();recorder.pause();}catch{onInterruption('capture');}}}
 function resume(){if(recorder?.state==='paused'){started=performance.now();paused=false;try{recorder.resume();}catch{onInterruption('capture');}}}
 function finish(){
  if(closing)return closing;
  closing=(async()=>{const durationMs=Math.round(elapsed+(!paused?Math.max(0,performance.now()-started):0));if(recorder&&recorder.state!=='inactive'){let timeout;const stopped=new Promise(resolve=>{stopResolve=resolve;timeout=setTimeout(resolve,4000);});try{recorder.requestData();recorder.stop();}catch{}await stopped;clearTimeout(timeout);}for(const track of stream?.getTracks()||[])track.stop();stream=null;await pending;return {durationMs,error:error?.message};})();return closing;
 }
 return {start,pause,resume,finish};
}
export function createNativeRecordingBridge(native,eventTarget=window){
 const waiting=new Map();let sequence=0;
 eventTarget.addEventListener('nativeRecording',event=>{const row=waiting.get(event.detail?.requestId);if(!row)return;waiting.delete(event.detail.requestId);clearTimeout(row.timer);if(event.detail.error)row.reject(Error(event.detail.error));else row.resolve(event.detail.result);});
 function request(kind,id='',argument={}){const requestId='audio-'+Date.now()+'-'+(++sequence);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{waiting.delete(requestId);reject(Error('A operação de áudio demorou mais que o esperado.'));},180000);waiting.set(requestId,{resolve,reject,timer});try{native.recordingCommand(requestId,kind,id,JSON.stringify(argument));}catch(error){clearTimeout(timer);waiting.delete(requestId);reject(error);}});}
 async function permission(){if(native.hasMicPermission())return;await new Promise((resolve,reject)=>{const end=event=>{clearTimeout(timer);eventTarget.removeEventListener('nativeMicPermission',end);event.detail?.granted?resolve():reject(Error('Permita o microfone para gravar seu ensaio.'));};const timer=setTimeout(()=>{eventTarget.removeEventListener('nativeMicPermission',end);reject(Error('A permissão do microfone não foi concluída.'));},120000);eventTarget.addEventListener('nativeMicPermission',end);native.requestMicPermission();});}
 return {request,permission,url:id=>new URL('rehearsal-audio/'+encodeURIComponent(id),document.baseURI).href};
}
export function createNativeRecordingCapture(bridge){let id;return {async start(meta){id=meta.id;await bridge.permission();return bridge.request('start',id,meta);},pause(){return bridge.request('pause',id);},resume(){return bridge.request('resume',id);},finish(){return bridge.request('finish',id);}};}
