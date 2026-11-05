import {validRecording,remoteRecording,recordingHash,recordingSnapshotHash} from './recording-core.js';
export function createRecordingSync({store,transport,account,readBlob,removeLocal,onChange=()=>{}}){
 let busy=null;
 async function sync(){if(busy)return busy;busy=run().finally(()=>{busy=null;onChange();});return busy;}
 async function run(){const owner=account();if(!owner||!transport)throw Error('Conecte o Google Drive em Ajustes para proteger as gravações.');const same=()=>{if(owner!==account())throw Error('A conta do Drive mudou.');};
  const remote=await transport.list(),seen=new Map();same();
  for(const row of remote){const value=await transport.read(row.id);same();if(!validRecording(value))throw Error('O Drive retornou uma gravação inválida.');const old=seen.get(value.id);if(!old||Number(value.updatedAt||value.createdAt)>Number(old.data.updatedAt||old.data.createdAt))seen.set(value.id,{file:row,data:value});}
  for(const {file,data}of seen.values()){
   const local=await store.getRecord(data.id),receipt={metaId:file.id,audioId:data.audioFileId,snapshotFileId:data.snapshotFileId,hash:data.sha256};
   if(data.status==='deleted'){if(local?.localAvailable)await removeLocal(local);await store.saveRecord(remoteRecording(local,{...data,receipt},owner));}
   else if(local?.status!=='deleted')await store.saveRecord(remoteRecording(local,{...data,receipt},owner));
  }
  for(const record of await store.list()){same();const receipt=record.cloud?.[owner],remoteRow=seen.get(record.id);
   if(record.status==='deleted'){
    if(receipt?.deleted)continue;
    if(!receipt?.metaId&&!remoteRow)continue;const tombstone={...record,status:'deleted',deletedAt:record.deletedAt||Date.now(),updatedAt:record.deletedAt||Date.now(),cloud:undefined,localAvailable:false,storage:undefined};
    await transport.putMeta(tombstone,receipt?.metaId||remoteRow?.file.id);same();if(receipt?.audioId)await transport.removeAudio(receipt.audioId);await store.patch(record.id,{cloud:{...record.cloud,[owner]:{...receipt,deleted:true}}});continue;
   }
   if(record.status!=='ready'||!record.localAvailable||receipt?.hash===record.sha256)continue;
   const snapshot=await store.snapshot(record.snapshotId);if(!snapshot)throw Error('O texto deste ensaio não foi encontrado.');const snapshotFile=await transport.putSnapshot(record.snapshotId,snapshot);same();
   const audio=transport.uploadNative&&record.storage==='native'?await transport.uploadNative(record):await transport.upload(record,await readBlob(record));same();
   const latest=await store.getRecord(record.id);same();
   if(latest?.status==='deleted'){
    const deleted={...latest,cloud:undefined,storage:undefined,localAvailable:false,audioFileId:audio.id,snapshotFileId:snapshotFile.id};
    const saved=await transport.putMeta(deleted,receipt?.metaId||remoteRow?.file.id);same();await transport.removeAudio(audio.id);same();await store.patch(record.id,{cloud:{...latest.cloud,[owner]:{metaId:saved.id,audioId:audio.id,snapshotFileId:snapshotFile.id,hash:record.sha256,deleted:true}}});continue;
   }
   const metadata={...record,cloud:undefined,localAvailable:false,storage:undefined,audioFileId:audio.id,snapshotFileId:snapshotFile.id,updatedAt:record.updatedAt||record.createdAt};
   const saved=await transport.putMeta(metadata,receipt?.metaId||remoteRow?.file.id);same();await store.patch(record.id,{cloud:{...record.cloud,[owner]:{metaId:saved.id,audioId:audio.id,snapshotFileId:snapshotFile.id,hash:record.sha256}}});onChange();
  }
 }
 async function download(record){const owner=account(),receipt=record.cloud?.[owner];if(!owner||!receipt?.audioId)throw Error('Esta gravação não tem uma cópia disponível nesta conta.');let snapshot=await store.snapshot(record.snapshotId);if(!snapshot){snapshot=await transport.snapshot(receipt.snapshotFileId);if(await recordingSnapshotHash(snapshot)!==record.snapshotId)throw Error('Texto do ensaio inválido.');}
  if(transport.downloadNative){await transport.downloadNative(receipt.audioId,record);if(owner!==account())throw Error('A conta do Drive mudou.');await store.saveSnapshot(record.snapshotId,snapshot);const current=await store.getRecord(record.id);if(current?.status==='deleted'){await removeLocal({...record,storage:'native',localAvailable:true});throw Error('Gravação excluída.');}await store.patch(record.id,{storage:'native',localAvailable:true});}else{const data=await transport.download(receipt.audioId,record);if(owner!==account())throw Error('A conta do Drive mudou.');await store.saveDownload(record,snapshot,data);}onChange();return store.getRecord(record.id);
 }
 return {sync,download,isBusy:()=>!!busy};
}
