import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {readFileSync,writeFileSync} from 'node:fs';
const here=path.dirname(fileURLToPath(import.meta.url));
const result=await build({absWorkingDir:here,entryPoints:['entry.js'],write:false,bundle:true,format:'iife',minify:true,target:['safari15.4','chrome100'],legalComments:'eof'});
// Each existing entry point can also load from an older installed HTML shell.
// Inline the same guarded runtime so it never depends on a newly added asset.
const start='/* SEPREPARE LOCALE START */',end='/* SEPREPARE LOCALE END */';
const bootstrap=start+'if(!window.SPLocale){'+result.outputFiles[0].text+'}'+end+'\n';
for(const name of ['app.js','launch-gate.js']){
 const file=path.resolve(here,'..',name);
 let source=readFileSync(file,'utf8');const first=source.indexOf(start);
 if(first>=0){const last=source.indexOf(end,first);if(last<0)throw Error('Incomplete localization marker');source=source.slice(0,first)+source.slice(last+end.length).replace(/^\n/,'');}
 writeFileSync(file,bootstrap+source);
}
