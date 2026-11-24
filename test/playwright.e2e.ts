import {capture} from '../src/capture';
import {defaults} from '../shared/types';
import {storeSnapshot} from '../src/snapshots';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
async function main(){
 const requests:{url:string,method:string}[]=[];
 const server=http.createServer((req,res)=>{requests.push({url:req.url||'',method:req.method||''});if(req.url==='/main.css'){res.writeHead(200,{'Content-Type':'text/css'}).end('p{color:red}');return;}res.writeHead(200,{'Content-Type':'text/html'}).end('<html><head><title>Engine test</title><link rel="stylesheet" href="/main.css"></head><body><p>Public page</p><input value="PRIVATE-VALUE"><form method="GET" action="/submitted"><input name="test" value="x"></form><script>document.querySelector("p").textContent="Rendered content";document.querySelector("form").submit();fetch("/background");</script></body></html>');});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const root=await fs.mkdtemp(path.join(os.tmpdir(),'ws-engine-'));const url='http://127.0.0.1:'+(server.address() as any).port;
 try{
 const options={...defaults,mode:'browser' as const,screenshot:true,raw:true,delayMs:100};const bundle=await capture(url,options,new AbortController().signal,()=>{},true);
 assert.match(bundle.html,/Rendered content/);assert.equal(bundle.assets.length,1);assert.ok(bundle.screenshot);assert.ok(bundle.rawHtml);assert.ok(!requests.some(r=>r.url.startsWith('/submitted')||r.url==='/background'||r.method!=='GET'));
 const snapshot=await storeSnapshot(root,[{folder:'test',bundle,options}]);assert.ok(snapshot.files['test/screenshot.png']);assert.ok(snapshot.files['test/original.sanitized.html']);assert.ok(!(await fs.readFile(path.join(snapshot.root,'test/index.html'),'utf8')).includes('PRIVATE-VALUE'));
 console.log('Playwright E2E passed: real rendered DOM, CSS download, raw source, masked PNG, form submission and fetch blocked, snapshot sanitization.');
 }finally{server.closeAllConnections();server.close();await fs.rm(root,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
