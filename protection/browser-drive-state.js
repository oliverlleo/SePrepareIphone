export const DRIVE_REQUEST_GAP=10000;
export const driveRetryDelay=failures=>Math.min(900000,DRIVE_REQUEST_GAP*2**Math.min(7,Math.max(0,failures-1)));
export const driveBackupDue=data=>data.backupPending?Math.max(data.pendingSinceAt+DRIVE_REQUEST_GAP,data.lastAutoAttemptAt+DRIVE_REQUEST_GAP,data.backupRetryAt):0;

// Use Drive's creation times, not an untrusted device clock. Frequent edits must
// leave useful recovery points instead of replacing the whole history in seconds.
export function retainedDriveCopies(list,savedId,preserve=[]){
 const ids=new Set(),ordered=list.map(file=>{
  const time=Date.parse(file.createdTime);
  if(!/^[A-Za-z0-9_-]{1,200}$/.test(file.id)||ids.has(file.id)||file.appProperties?.seprepareBackup!=='1'||!Number.isFinite(time))throw Error('A lista dos backups precisa ser conferida novamente.');
  ids.add(file.id);return {file,time};
 });
 if(!ids.has(savedId))throw Error('O novo backup ainda não apareceu na lista do Drive.');
 ordered.sort((a,b)=>b.time-a.time||(a.file.id===b.file.id?0:a.file.id===savedId?-1:b.file.id===savedId?1:a.file.id.localeCompare(b.file.id)));
 const kept=new Set([savedId,ordered[0].file.id,...preserve.filter(id=>ids.has(id))]),newest=ordered[0].time;
 if(kept.size>4)throw Error('Há novas cópias de outros aparelhos para conferir antes de limpar o histórico.');
 for(const age of [3600000,86400000,604800000]){
  if(kept.size>=4)break;
  const candidate=ordered.find(row=>row.time<=newest-age);if(candidate)kept.add(candidate.file.id);
 }
 while(kept.size<Math.min(4,ordered.length)){
  let candidate=null,distance=-1;
  for(const row of ordered){if(kept.has(row.file.id))continue;const gap=Math.min(...ordered.filter(other=>kept.has(other.file.id)).map(other=>Math.abs(row.time-other.time)));if(gap>distance){candidate=row;distance=gap;}}
  if(!candidate)break;kept.add(candidate.file.id);
 }
 return {kept,remove:ordered.slice().reverse().filter(row=>!kept.has(row.file.id)).map(row=>row.file)};
}

// Full confirmed snapshots belong in IndexedDB alongside the notebook, rather
// than duplicating large texts in the small localStorage preferences record.
// The synchronous receipt index remains usable even if this optional cache fails.
export function createDriveReceiptCache(factory=globalThis.indexedDB){
 let writes=Promise.resolve();
 function access(mode,account,value){
  if(!factory)return Promise.resolve(null);
  return new Promise((resolve,reject)=>{
   let db,settled=false;const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timeout);db?.close();error?reject(error):resolve(result);};
   const timeout=setTimeout(()=>finish(Error('Cache do Drive indisponível.')),5000);timeout?.unref?.();
   let request;try{request=factory.open('seprepare-drive-receipts-v1',1);}catch(error){finish(error);return;}
   request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('receipts'))request.result.createObjectStore('receipts');};
   request.onerror=()=>finish(request.error);request.onblocked=()=>finish(Error('Cache do Drive ocupado.'));
   request.onsuccess=()=>{
    db=request.result;if(settled){db.close();return;}
    try{const tx=db.transaction('receipts',mode==='get'?'readonly':'readwrite'),store=tx.objectStore('receipts');
     const operation=mode==='get'?store.get(account):mode==='put'?store.put(value,account):store.delete(account);let result=null;
     operation.onsuccess=()=>{result=operation.result||null;};tx.oncomplete=()=>finish(null,result);tx.onerror=()=>finish(tx.error);tx.onabort=()=>finish(tx.error||Error('Cache do Drive interrompido.'));
    }catch(error){finish(error);}
   };
  });
 }
 return {load:account=>writes.then(()=>access('get',account)),save:value=>{const next=writes.catch(()=>{}).then(()=>access('put',value.account,value));writes=next;return next;},remove:account=>{const next=writes.catch(()=>{}).then(()=>access('delete',account));writes=next;return next;}};
}
