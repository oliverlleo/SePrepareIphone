import {canonicalContent} from './content-index.js';
const snapshot=d=>({type:d.type||'speech',title:d.title,subtitle:d.subtitle,delta:d.delta,presenterNotes:d.presenterNotes||[],...(d.type==='part'?{partFormat:2,participants:d.participants}: {})});
// Only a newly generated, redundant undo checkpoint is removed. Existing
// untagged history and snapshots of genuinely different text stay untouched.
export function pruneRedundantCheckpoints(doc){if(!doc?.history?.at(-1)?.automaticCheckpoint)return;const current=canonicalContent(snapshot(doc));while(doc.history.at(-1)?.automaticCheckpoint&&canonicalContent(snapshot(doc.history.at(-1)))===current)doc.history.pop();}
