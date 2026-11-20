import {prepareFileBackup} from './file-backup.js';

// The protected Apple host still owns IDB/OPFS and its write queue. Keep the
// dialog open until that queue verifies the same candidate in its real copies.
export async function importFileBackup(c){
 const data=c.rt.importBackup;if(!data||c.rt.importingBackup)return false;
 c.rt.importingBackup=true;let previous=null,staged=false,release=()=>{};
 try{
  if(!c.persist()||!await c.flush())throw Error('Não foi possível salvar o caderno atual.');
  if(c.isCurrent&& !c.isCurrent())return false;
  previous=c.getState();const result=prepareFileBackup(previous,data);
  c.prepare(result.state);const raw=JSON.stringify(result.state);
  c.rt.fileImportCommit=true;release=c.lock?.()||release;
  staged=true;
  if(!c.save(raw))throw Error('Não foi possível salvar a restauração. Seu caderno foi preservado.');
  c.setState(result.state);
  if(!await c.flush())throw Error('Não foi possível salvar a restauração. Seu caderno foi preservado.');
  staged=false;c.rt.importBackup=null;c.commit(raw);c.done(result.added);return true;
 }catch(error){
  if(staged){c.setState(previous);try{if(c.save(JSON.stringify(previous)))await c.flush();}catch{}}
  c.fail(error.message);return false;
 }finally{c.rt.fileImportCommit=false;c.rt.importingBackup=false;release();}
}

export function lockFileImport(){
 const block=event=>{event.preventDefault();event.stopImmediatePropagation();};
 const events=['click','keydown','input','beforeinput','submit'];
 for(const name of events)document.addEventListener(name,block,true);
 return ()=>{for(const name of events)document.removeEventListener(name,block,true);};
}
