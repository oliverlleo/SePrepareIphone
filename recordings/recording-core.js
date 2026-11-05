export const RECORDING_SCHEMA=1;
export const RECORDING_MAX_BYTES=128*1024*1024;
export const recordingId=()=> 'rec-'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
export const validRecordingId=value=>typeof value==='string'&&/^rec-[a-zA-Z0-9-]{8,80}$/.test(value);
export const audioExtension=mime=>/mp4/.test(mime)?'m4a':/wav/.test(mime)?'wav':/aac/.test(mime)?'aac':/ogg/.test(mime)?'ogg':'webm';
export function supportedRecordingMime(Recorder){
 for(const type of ['audio/mp4;codecs=mp4a.40.2','audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'])if(Recorder?.isTypeSupported?.(type))return type;
 return '';
}
export async function recordingHash(blob){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');}
export const recordingSnapshotHash=snapshot=>recordingHash(new Blob([JSON.stringify(snapshot,(key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(name=>[name,value[name]])):value)]));
export function validRecording(meta){
 return meta?.schema===1&&validRecordingId(meta.id)&&typeof meta.speechId==='string'&&meta.speechId.length<=200&&typeof meta.versionId==='string'&&meta.versionId.length<=200&&typeof meta.snapshotId==='string'&&/^[a-f0-9]{64}$/.test(meta.snapshotId)&&Number.isFinite(meta.createdAt)&&Number.isFinite(meta.durationMs)&&meta.durationMs>=0&&['recording','ready','deleted','failed'].includes(meta.status)&&Number.isFinite(meta.bytes)&&meta.bytes>=0&&meta.bytes<=RECORDING_MAX_BYTES&&(['recording','failed','deleted'].includes(meta.status)||(/^[a-f0-9]{64}$/.test(meta.sha256||'')&&meta.bytes>0))&&['speech','part'].includes(meta.type)&&typeof meta.title==='string'&&meta.title.length<=1000;
}
export function groupRecordings(records,{type='all',query=''}={}){
 const fold=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase(),q=fold(query),groups=new Map();
 for(const r of records){if(r.status==='deleted'||r.status==='failed'||type!=='all'&&r.type!==type||q&&!fold(r.title+' '+r.versionName).includes(q))continue;
  let doc=groups.get(r.speechId);if(!doc){doc={id:r.speechId,title:r.title,type:r.type,bytes:0,count:0,at:0,versions:new Map()};groups.set(r.speechId,doc);}
  let version=doc.versions.get(r.versionId);if(!version){version={id:r.versionId,name:r.versionName,bytes:0,count:0,at:0,records:[]};doc.versions.set(r.versionId,version);}
  const bytes=r.localAvailable?Number(r.bytes)||0:0;doc.bytes+=bytes;doc.count++;doc.at=Math.max(doc.at,r.createdAt);version.bytes+=bytes;version.count++;version.at=Math.max(version.at,r.createdAt);version.records.push(r);
 }
 return [...groups.values()].sort((a,b)=>b.at-a.at).map(doc=>({...doc,versions:[...doc.versions.values()].sort((a,b)=>b.at-a.at).map(version=>({...version,records:version.records.sort((a,b)=>b.createdAt-a.createdAt)}))}));
}
export function remoteRecording(local,remote,account){
 if(!validRecording(remote))throw Error('Gravação inválida.');
 if(local?.status==='deleted')return {...local,cloud:{...local.cloud,[account]:{...local.cloud?.[account],...remote.receipt,...(remote.status==='deleted'?{deleted:true}:{})}}};
 if(remote.status==='deleted')return {...local,...remote,localAvailable:false,cloud:{...(local?.cloud||{}),[account]:{...(local?.cloud?.[account]||{}),...remote.receipt,deleted:true}},snapshot:undefined};
 return {...remote,...(local||{}),cloud:{...(local?.cloud||{}),[account]:{...remote.receipt,hash:remote.sha256}},localAvailable:!!local?.localAvailable,snapshot:undefined};
}
