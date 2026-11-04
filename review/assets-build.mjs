import {build} from 'esbuild';
import {readFileSync,writeFileSync,readdirSync,mkdirSync,cpSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const here=path.dirname(fileURLToPath(import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const write=(name,data)=>{mkdirSync(path.dirname(name),{recursive:true});writeFileSync(name,data);};
export async function buildReviewAssets({sourceDir,outDir,packDir,includePacks=true}){
 sourceDir=path.resolve(sourceDir);outDir=path.resolve(outDir);packDir=path.resolve(packDir);
 const bundled=await build({absWorkingDir:here,entryPoints:['ja-engine.js'],bundle:true,minify:true,format:'iife',platform:'browser',target:['safari15.4','chrome85'],inject:['browser-process.js'],alias:{path:'path-browserify','node:assert':'assert'},define:{'process.env.NODE_ENV':'"production"'},legalComments:'eof',write:false});
 const engine=bundled.outputFiles[0].text.replace(/[\t ]+$/gm,''),enginePath='review-runtime/ja-'+sha(engine).slice(0,16)+'.js';write(path.join(outDir,enginePath),engine);
 const packs={},prefix='review-packs/v1.0.88';
 for(const code of ['en','es','ja']){
  const base=code==='ja'?path.join(here,'node_modules/kuromoji/dict'):path.join(here,'node_modules/dictionary-'+code);
  const names=code==='ja'?readdirSync(base).filter(n=>n.endsWith('.gz')).sort():['index.aff','index.dic'];
  const files=[];
  for(const name of names){const data=readFileSync(path.join(base,name)),file={name,path:prefix+'/'+code+'/'+name,bytes:data.length,sha256:sha(data)};files.push(file);write(path.join(packDir,file.path),data);}
  const notice=code==='ja'?readFileSync(path.join(here,'node_modules/kuromoji/NOTICE.md')):readFileSync(path.join(base,'license'));
  const file={name:'LICENSE.txt',path:prefix+'/'+code+'/LICENSE.txt',bytes:notice.length,sha256:sha(notice)};files.push(file);write(path.join(packDir,file.path),notice);
  packs[code]={version:'1.0.88',bytes:files.reduce((n,f)=>n+f.bytes,0),files};
 }
 write(path.join(sourceDir,'review-packs-manifest.js'),'// Generated from pinned upstream packages; integrity is checked before activation.\nexport const REVIEW_PACKS='+JSON.stringify(packs,null,2)+';\nexport const JAPANESE_ENGINE='+JSON.stringify(enginePath)+';\n');
 if(includePacks&&path.resolve(packDir)!==path.resolve(outDir))cpSync(path.join(packDir,'review-packs'),path.join(outDir,'review-packs'),{recursive:true});
 const licenses=path.join(outDir,'licenses/review');mkdirSync(licenses,{recursive:true});
 for(const dir of readdirSync(path.join(here,'node_modules'),{withFileTypes:true}).filter(n=>n.isDirectory()&&!n.name.startsWith('.'))){
  const dirs=dir.name.startsWith('@')?readdirSync(path.join(here,'node_modules',dir.name)).map(n=>dir.name+'/'+n):[dir.name];
  for(const pkg of dirs)for(const name of readdirSync(path.join(here,'node_modules',pkg)))if(/^(license|copying|notice)/i.test(name))try{const data=readFileSync(path.join(here,'node_modules',pkg,name),'utf8').replace(/[\t ]+$/gm,'');write(path.join(licenses,pkg.replaceAll('/','-')+'-'+name),data.trimEnd()+'\n');}catch{}
 }
 write(path.join(licenses,'README.txt'),'Offline review packs\nEnglish: dictionary-en 4.0.0 (MIT AND BSD).\nSpanish: dictionary-es 4.0.0, distributed under MPL-1.1; unmodified dictionary sources accompany review-packs/v1.0.88/es/.\nJapanese: textlint-rule-preset-japanese 10.0.4 / textlint 15.8.0 (MIT), Kuromoji 0.1.2 (Apache-2.0), IPADIC (see kuromoji NOTICE).\nDownloaded data is optional and stored separately from the notebook.\nSources: https://github.com/wooorm/dictionaries and https://github.com/textlint-ja/textlint-rule-preset-japanese and https://github.com/takuyaa/kuromoji.js\n');
 await build({entryPoints:[path.join(sourceDir,'review-international-worker.js')],outfile:path.join(outDir,'review-international-worker.js'),bundle:true,minify:true,format:'iife',target:['safari15.4','chrome85'],external:['./spell/dist/Hunspell.js'],legalComments:'eof'});
 return {packs,enginePath};
}
