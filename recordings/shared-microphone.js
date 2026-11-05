// One hardware capture; independent clones keep a paused speech detector from muting a recording.
export function createSharedMicrophone(devices=globalThis.navigator?.mediaDevices){
 let root=null,pending=null;const leases=new Set();
 function cleanup(){if(leases.size||pending)return;for(const track of root?.getTracks?.()||[])track.stop();root=null;}
 async function getUserMedia(constraints){
  if(!devices?.getUserMedia)throw new DOMException('Microphone unavailable','NotFoundError');
  if(!root?.getAudioTracks?.().some(track=>track.readyState==='live')){
   if(!pending)pending=devices.getUserMedia(constraints).then(stream=>(root=stream)).finally(()=>{pending=null;});
   await pending;
  }
  const stream=root.clone(),lease={stream};leases.add(lease);let remaining=stream.getTracks().length;
  for(const track of stream.getTracks()){
   const original=track.stop.bind(track);let stopped=false;
   const release=()=>{if(stopped)return;stopped=true;if(--remaining===0){leases.delete(lease);cleanup();}};
   track.stop=()=>{original();release();};track.addEventListener('ended',release,{once:true});
  }
  return stream;
 }
 return {getUserMedia,activeLeases:()=>leases.size};
}
const key=Symbol.for('SePrepare.sharedMicrophone');
export const sharedMicrophone=globalThis[key]||(globalThis[key]=createSharedMicrophone());
