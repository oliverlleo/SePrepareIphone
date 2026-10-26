import {plain} from './core.js';
export function styledInsertion(q,at,length,replacement,Delta){
  const source=q.getContents(at,length),old=plain(source);const styles=[];for(const op of source.ops)if(typeof op.insert==='string')for(let i=0;i<op.insert.length;i++)styles.push(op.attributes);
  const n=old.length,m=replacement.length,aligned=new Array(m);
  if(n<=300&&m<=300){const dp=Array.from({length:n+1},()=>new Uint16Array(m+1));for(let i=0;i<=n;i++)dp[i][0]=i;for(let j=0;j<=m;j++)dp[0][j]=j;for(let i=1;i<=n;i++)for(let j=1;j<=m;j++)dp[i][j]=Math.min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+(old[i-1]===replacement[j-1]?0:1));let i=n,j=m;while(j>0){if(i>0&&dp[i][j]===dp[i-1][j-1]+(old[i-1]===replacement[j-1]?0:1)){aligned[j-1]=styles[i-1];i--;j--;}else if(i>0&&dp[i][j]===dp[i-1][j]+1)i--;else{aligned[j-1]=styles[Math.max(0,i-1)];j--;}}}else for(let j=0;j<m;j++)aligned[j]=styles[Math.min(n-1,j)];
  const insert=new Delta();for(let i=0;i<m;i++)insert.insert(replacement[i],aligned[i]);return insert;
}
