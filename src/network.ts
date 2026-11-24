import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns/promises';
import {setTimeout as sleep} from 'node:timers/promises';
import {validateUrl, privateAddress, challenge} from './safety';
import {CaptureOptions} from '../shared/types';
export class Downloader {
 private last=0;
 constructor(private options:CaptureOptions,private signal:AbortSignal,private allowPrivate=false){}
 async get(input:string, origin?:string):Promise<{body:Buffer;type:string;url:string}>{
  let failure:unknown;
  for(let attempt=0;attempt<=this.options.retries;attempt++){try{return await this.request(input,origin,0);}catch(e:any){failure=e;if(this.signal.aborted||/challenge|restricted|Private|redirect|Query|credentials|Too large/i.test(e.message))throw e;if(attempt<this.options.retries)await sleep(500*2**attempt,undefined,{signal:this.signal});}}
  throw failure;
 }
 private async request(input:string,origin:string|undefined,redirects:number):Promise<{body:Buffer;type:string;url:string}>{
  this.signal.throwIfAborted();const u=await validateUrl(input,this.allowPrivate);
  if(origin){const initial=new URL(origin);if(u.hostname!==initial.hostname&&!this.options.allowedAssetHosts.includes(u.hostname))throw Error('External asset host not permitted: '+u.hostname);if(initial.protocol==='https:'&&u.protocol!=='https:')throw Error('HTTPS downgrade blocked');}
  await sleep(Math.max(0,this.options.delayMs-(Date.now()-this.last)),undefined,{signal:this.signal});this.last=Date.now();
  const reply=await new Promise<{status:number;headers:http.IncomingHttpHeaders;body:Buffer}>((resolve,reject)=>{
   const transport=u.protocol==='https:'?https:http;
   const request=transport.get(u,{signal:this.signal,headers:{'User-Agent':'WebSourceSync/0.1 (read-only frontend capture)','Accept-Encoding':'identity'},lookup:(hostname,opts:any,callback:any)=>{
    dns.lookup(hostname,{all:true}).then(records=>{if(!records.length||!this.allowPrivate&&records.some(r=>privateAddress(r.address)))throw Error('Private address blocked');const r=records[0];if(opts.all)callback(null,[r]);else callback(null,r.address,r.family);}).catch(callback);
   }},res=>{const chunks:Buffer[]=[];let bytes=0;res.on('data',chunk=>{bytes+=chunk.length;if(bytes>5*1024*1024){request.destroy(Error('Too large: resource exceeds 5 MB'));return;}chunks.push(chunk);});res.on('end',()=>resolve({status:res.statusCode||0,headers:res.headers,body:Buffer.concat(chunks)}));res.on('error',reject);});
   const timer=setTimeout(()=>request.destroy(Error('Request timeout')),this.options.timeoutMs);request.on('close',()=>clearTimeout(timer));request.on('error',reject);
  });
  if([301,302,303,307,308].includes(reply.status)){if(redirects>=5||!reply.headers.location)throw Error('Unsafe redirect chain');const next=new URL(reply.headers.location,u);if(next.origin!==u.origin)throw Error('Cross-origin redirect requires capturing the destination URL explicitly');return this.request(next.href,origin,redirects+1);}
  challenge(reply.status,reply.headers as Record<string,string>,reply.body.toString('utf8',0,16000));return {body:reply.body,type:String(reply.headers['content-type']||''),url:u.href};
 }
}
