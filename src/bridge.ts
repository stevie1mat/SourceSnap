import http from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {CaptureBundle} from '../shared/types';
import {validateBundle} from './snapshots';
export class Bridge {
 private server?:http.Server;private busy=false;private token=randomBytes(32).toString('hex');
 async start(receive:(bundle:CaptureBundle,slot:'before'|'after')=>Promise<void>):Promise<{port:number;token:string}>{
 if(this.server)throw Error('Bridge already started');this.server=http.createServer(async(req,res)=>{
 const origin=req.headers.origin||'';if(!/^chrome-extension:\/\/[a-p]{32}$/.test(origin)){res.writeHead(403).end();return;}
 res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Private-Network','true');res.setHeader('Cache-Control','no-store');
 if(req.method==='OPTIONS'){res.writeHead(204).end();return;}
 const auth=req.headers.authorization||'';const expected='Bearer '+this.token;
 if(!/^Bearer [a-f0-9]{64}$/.test(auth)||!timingSafeEqual(Buffer.from(auth),Buffer.from(expected))){res.writeHead(401).end('Pairing expired or invalid');return;}
 if(req.method!=='POST'||!['/capture/before','/capture/after'].includes(req.url||'')||req.headers['content-type']!=='application/json'){res.writeHead(400).end('Invalid request');return;}
 if(this.busy){res.writeHead(409).end('A capture is already awaiting review');return;}this.busy=true;
 try{const chunks:Buffer[]=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>25*1024*1024){res.writeHead(413).end('Capture exceeds 25 MB');req.destroy();return;}chunks.push(chunk);}
 const bundle=JSON.parse(Buffer.concat(chunks).toString('utf8'));validateBundle(bundle);await receive(bundle,req.url==='/capture/before'?'before':'after');res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({ok:true}));
 }catch(e:any){res.writeHead(400).end(String(e.message||'Capture rejected').slice(0,300));}finally{this.busy=false;}
 });this.server.headersTimeout=10000;this.server.requestTimeout=30000;this.server.timeout=180000;
 await new Promise<void>((resolve,reject)=>{this.server!.once('error',reject);this.server!.listen(0,'127.0.0.1',()=>resolve());});return {port:(this.server.address() as any).port,token:this.token};
 }
 dispose(){this.server?.closeAllConnections();this.server?.close();this.server=undefined;this.token=randomBytes(32).toString('hex');}
}
