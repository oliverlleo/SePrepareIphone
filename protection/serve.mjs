import http from 'node:http';
import path from 'node:path';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const types={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.webmanifest':'application/manifest+json','.html':'text/html','.css':'text/css','.png':'image/png','.woff2':'font/woff2','.wasm':'application/wasm','.bin':'application/octet-stream','.txt':'text/plain'};
export function createServer({sourceForRequest}={}){return http.createServer(async(req,res)=>{
  try{
    const requested=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    let file=path.resolve(root,'.'+requested);
    if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    if((await stat(file)).isDirectory())file=path.join(file,'index.html');
    const body=await sourceForRequest?.({url:new URL(req.url,'http://localhost'),file})??await readFile(file);res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
    res.setHeader('Cache-Control','no-cache');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
    res.setHeader('Cross-Origin-Opener-Policy','same-origin-allow-popups');res.end(body);
  }catch{res.writeHead(404);res.end('Arquivo não encontrado.');}
});}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT)||4173;createServer().listen(port,'127.0.0.1',()=>console.log(`Local: http://127.0.0.1:${port}`));
}
