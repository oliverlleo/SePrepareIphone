// Quill emits editor-change even for silent changes. Reuse only the snapshot of
// this exact editor revision; document validation and version capture stay intact.
const snapshots=new WeakMap();
export function editorDelta(q){let entry=snapshots.get(q);if(!entry){entry={dirty:true,delta:null};snapshots.set(q,entry);q.on('editor-change',event=>{if(event==='text-change')entry.dirty=true;});}if(entry.dirty){entry.delta={ops:q.getContents().ops};entry.dirty=false;}return entry.delta;}
