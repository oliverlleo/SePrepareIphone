import {mergeDeletionTombstones} from './sync-deletions.js';
export function mergeImportedMetadata(state,incoming,ids,categories,newId){
 const copy=x=>JSON.parse(JSON.stringify(x)),drafts=new Map((state.editorDrafts||[]).map(row=>[row.speechId,row]));
 for(const source of incoming.editorDrafts||[]){let id=ids.get(source.speechId)||source.speechId,row=copy(source);const existing=drafts.get(id);
  if(existing&&JSON.stringify(existing.document)!==JSON.stringify(source.document)){
   const original=incoming.speeches.find(d=>d.id===source.speechId)||source.document,doc=copy(original);id=newId();doc.id=id;doc.categoryId=categories.get(doc.categoryId)||doc.categoryId||'';state.speeches.push(doc);
  }
  row.speechId=id;row.document.id=id;row.document.categoryId=categories.get(row.document.categoryId)||row.document.categoryId||'';drafts.set(id,row);
 }
 if(drafts.size||state.editorDrafts)state.editorDrafts=[...drafts.values()];
 const tombstones=mergeDeletionTombstones(state.deletionTombstones,incoming.deletionTombstones).filter(row=>!state.speeches.some(d=>d.id===row.id)&&!drafts.has(row.id));
 if(tombstones.length||state.deletionTombstones)state.deletionTombstones=tombstones;
}
