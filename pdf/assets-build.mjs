import {createRequire} from 'node:module';const require=createRequire(import.meta.url);
import {build} from 'esbuild';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
export async function buildPdfAssets(target){
 const source=here,out=path.resolve(here,target,'pdf');mkdirSync(out,{recursive:true});
 const common={absWorkingDir:here,bundle:true,minify:true,platform:'browser',target:['safari15.4','chrome85'],legalComments:'eof'};
 await build({...common,entryPoints:[path.join(source,'pdf-export-worker.js')],outfile:path.join(out,'export-worker.js'),format:'iife'});
 await build({...common,entryPoints:[path.join(source,'pdf-preview.js')],outfile:path.join(out,'preview.js'),format:'esm'});
 await build({...common,entryPoints:[require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')],outfile:path.join(out,'pdf.worker.js'),format:'esm'});
 for(const name of ['export-worker.js','preview.js','pdf.worker.js']){const file=path.join(out,name);writeFileSync(file,readFileSync(file,'utf8').replace(/[\t ]+$/gm,''));}
 const licenses=path.join(out,'licenses');mkdirSync(licenses,{recursive:true});
 for(const [pkg,file,name] of [['pdfmake','LICENSE','pdfmake-MIT.txt'],['pdfjs-dist','LICENSE','pdfjs-Apache-2.0.txt'],['@fontsource/lora','LICENSE','Lora-OFL.txt']]){const resolved=path.dirname(require.resolve(pkg+'/package.json'));copyFileSync(path.join(resolved,file),path.join(licenses,name));}
 copyFileSync(path.join(here,'pdf-Roboto-OFL.txt'),path.join(licenses,'Roboto-OFL.txt'));
 writeFileSync(path.join(licenses,'README.txt'),'PDF generation: pdfmake 0.3.13 (MIT), PDF.js 6.5.438 (Apache-2.0). Fonts: Roboto (SIL Open Font License), Lora (SIL Open Font License). Generated locally; no document content sent to external services.\n');
}
