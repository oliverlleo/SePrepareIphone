import http from 'node:http';
import {webkit} from 'playwright';
// WebKit's service-worker requests can bypass Playwright route interception.
// Deny outbound connections at the browser's test-only proxy as well.
export async function isolatedWebKit(){
 const proxy=http.createServer((_request,response)=>{response.writeHead(403);response.end('External network disabled in QA');});
 proxy.on('connect',(_request,socket)=>{socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');});
 await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
 try{
  const browser=await webkit.launch({headless:true,proxy:{server:'http://127.0.0.1:'+proxy.address().port,bypass:'127.0.0.1,localhost'}});
  return {browser,close:async()=>{await browser.close();await new Promise(resolve=>proxy.close(resolve));}};
 }catch(error){await new Promise(resolve=>proxy.close(resolve));throw error;}
}
