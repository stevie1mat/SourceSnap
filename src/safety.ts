import path from 'node:path';
import fs from 'node:fs/promises';
import dns from 'node:dns/promises';
import net from 'node:net';
export function relativeFile(p:string):string {
 if(!p||p.includes('\\')||p.includes('\0')||path.posix.isAbsolute(p)||p.split('/').some(x=>!x||x==='.'||x==='..'||x.toLowerCase()==='.git')||/[:\x00-\x1f]/.test(p))throw Error('Unsafe relative path: '+p);
 return p;
}
export async function safePath(root:string,relative:string):Promise<string>{
 relativeFile(relative); const base=await fs.realpath(root);let current=base;
 for(const part of relative.split('/')){current=path.join(current,part);try{const stat=await fs.lstat(current);if(stat.isSymbolicLink())throw Error('Symlinks are not allowed: '+relative);}catch(e:any){if(e.code!=='ENOENT')throw e;}}
 return current;
}
export function privateAddress(ip:string):boolean {
 if(ip.startsWith('::ffff:'))return privateAddress(ip.slice(7));
 if(net.isIPv4(ip)){const [a,b]=ip.split('.').map(Number);return a===0||a===10||a===127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a>=224||a===198&&(b===18||b===19);}
 return !ip.startsWith('2')&&!ip.startsWith('3');
}
export async function validateUrl(input:string,allowPrivate=false):Promise<URL>{
 const u=new URL(input);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.hash)throw Error('Use an HTTP(S) URL without credentials or fragments');
 if(u.search)throw Error('Query strings are disabled to avoid supporter identifiers and tokens. Use a clean page URL.');
 const host=u.hostname.replace(/^\[|\]$/g,'');const records=net.isIP(host)?[{address:host}]:await dns.lookup(host,{all:true});
 if(!records.length||!allowPrivate&&records.some(x=>privateAddress(x.address)))throw Error('Private, local, or reserved network targets are blocked');return u;
}
export function challenge(status:number,headers:Record<string,string>,body:string):void {
 if(headers['cf-mitigated']==='challenge'||/Just a moment\.\.\.|\/cdn-cgi\/challenge-platform\/|cf-chl-widget/i.test(body))throw Error('Cloudflare challenge detected. Open the page normally in Chrome and use the companion capture, or ask the hosting provider to permit capture traffic.');
 if(status===401||status===403)throw Error('Access restricted (HTTP '+status+'). Capture requires authorized access.');
 if(status<200||status>=300)throw Error('HTTP '+status);
}
