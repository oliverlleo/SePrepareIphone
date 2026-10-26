export const searchableText=delta=>(delta?.ops||[]).map(op=>typeof op.insert==='string'?op.insert:'\uFFFC').join('');
export function findTextMatches(text,query,{caseSensitive=false,wholeWord=false}={}){
 if(!query)return [];
 const literal=query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),pattern=new RegExp(literal,caseSensitive?'gu':'giu'),matches=[];
 for(const match of text.matchAll(pattern)){
  const index=match.index,length=match[0].length;
  if(match[0].includes('\uFFFC'))continue;
  if(wholeWord&&(/[\p{L}\p{M}\p{N}_]$/u.test(text.slice(Math.max(0,index-2),index))||/^[\p{L}\p{M}\p{N}_]/u.test(text.slice(index+length,index+length+2))))continue;
  matches.push({index,length});
 }
 return matches;
}
// Create one Quill Delta for the complete replacement operation. Original
// attributes travel with their characters; one updateContents means one undo.
export function replacementEdit(q,matches,replacement,Delta,insertion){
 let edit=new Delta(),cursor=0;
 for(const match of matches){edit=edit.retain(match.index-cursor).delete(match.length).concat(insertion(q,match.index,match.length,replacement,Delta));cursor=match.index+match.length;}
 return edit;
}
