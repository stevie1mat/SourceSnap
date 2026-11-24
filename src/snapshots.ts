import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {load} from 'cheerio';
import {CaptureBundle,CaptureFile,CaptureOptions,Snapshot,Change} from '../shared/types';
import {publicUrl} from '../shared/redact';
import {cleanHtml,cleanText,cleanSvg} from './sanitizer';
import {format} from './formatter';
import {assetName} from './assets';
import {relativeFile,safePath,challenge} from './safety';
export const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
export function validateBundle(b:any):asserts b is CaptureBundle {
 if(b?.version!==1||typeof b.url!=='string'||typeof b.html!=='string'||!Array.isArray(b.assets)||b.assets.length>500||!Array.isArray(b.warnings)||b.warnings.some((x:any)=>typeof x!=='string')||b.warnings.length>1000)throw Error('Invalid Chrome capture');
 if(new URL(b.url).search)throw Error('Capture URL must not contain a query string');publicUrl(b.url);challenge(200,{},b.html);
 if(b.rawHtml!==undefined&&typeof b.rawHtml!=='string'||b.screenshot!==undefined&&typeof b.screenshot!=='string')throw Error('Invalid capture content');
 const seen=new Set();for(const a of b.assets){if(!a||typeof a.url!=='string'||typeof a.content!=='string'||!['utf8','base64'].includes(a.encoding)||!['css','js','image','svg'].includes(a.kind))throw Error('Invalid asset');if(new URL(a.url).search)throw Error('Asset URLs must not contain query strings');publicUrl(a.url);if(seen.has(a.url))throw Error('Duplicate asset URL');seen.add(a.url);if(a.content.length>7*1024*1024)throw Error('Asset exceeds size limit');if(a.kind!=='image'&&a.encoding!=='utf8')throw Error('Text assets must be UTF-8');if(a.kind==='image'&&a.encoding!=='base64')throw Error('Images must be base64');}
}
export async function materialize(bundle:CaptureBundle,options:CaptureOptions):Promise<CaptureFile[]>{
 validateBundle(bundle);const files:CaptureFile[]=[];let html=cleanHtml(bundle.html,options);const $=load(html);
 const add=async(p:string,content:string,encoding:'utf8'|'base64'='utf8')=>{files.push({path:p,content:encoding==='utf8'?(p==='original.sanitized.html'?cleanText(content,options):await format(cleanText(content,options),p)):content,encoding});};
 for(const a of bundle.assets){if(options.excludeUrls.some(x=>a.url.includes(x))||a.kind==='image'&&!options.images||a.kind==='svg'&&!options.svg)continue;
 const name=assetName(a.url,a.kind);if(a.kind==='image'){const bytes=Buffer.from(a.content,'base64');if(!validImage(bytes))throw Error('Unrecognized binary image; refusing to save');await add(name,a.content,'base64');}else await add(name,a.kind==='svg'?cleanSvg(a.content,options):a.content);
 $('[src],[href]').each((_,el)=>{for(const attr of ['src','href']){const v=$(el).attr(attr);if(v){try{if(new URL(v,bundle.url).href===a.url)$(el).attr(attr,name);}catch{}}}});
 }
 $('style').each((i,el)=>{const content=$(el).html()||'';files.push({path:'inline/style-'+i+'.css',content:cleanText(content,options),encoding:'utf8'});});
 $('script:not([src])').each((i,el)=>{files.push({path:'inline/script-'+i+'.js',content:cleanText($(el).html()||'',options),encoding:'utf8'});});
 await add('index.html',$.html());
 if(options.raw&&bundle.rawHtml)await add('original.sanitized.html',cleanHtml(bundle.rawHtml,options));
 if(options.metadata)await add('metadata.json',JSON.stringify({url:publicUrl(bundle.url),title:$('title').text(),description:$('meta[name="description"]').attr('content')||'',assets:bundle.assets.map(a=>({url:publicUrl(a.url),file:assetName(a.url,a.kind)}))},null,2));
 if(options.screenshot&&bundle.screenshot){const bytes=Buffer.from(bundle.screenshot,'base64');if(bytes.length>10*1024*1024||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Invalid PNG screenshot');await add('screenshot.png',bundle.screenshot,'base64');}
 for(const file of files)if(file.encoding==='utf8'&&file.path!=='original.sanitized.html')file.content=await format(file.content,file.path);
 return files;
}
function validImage(b:Buffer){return b.subarray(0,8).toString('hex')==='89504e470d0a1a0a'||b[0]===255&&b[1]===216&&b[2]===255||b.subarray(0,3).toString()==='GIF'||b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP'||b.subarray(4,8).toString()==='ftyp'||b.subarray(0,4).toString('hex')==='00000100';}
export async function storeSnapshot(storage:string,entries:{folder:string;bundle:CaptureBundle;options:CaptureOptions}[],signal?:AbortSignal):Promise<Snapshot>{
 const id=randomUUID(), root=path.join(storage,'snapshots',id);await fs.mkdir(root,{recursive:true});const snapshot:Snapshot={id,root,files:{},warnings:[],created:new Date().toISOString()};
 try{for(const entry of entries){relativeFile(entry.folder);snapshot.warnings.push(...entry.bundle.warnings.map(x=>cleanText(x,entry.options)));for(const file of await materialize(entry.bundle,entry.options)){signal?.throwIfAborted();const rel=entry.folder+'/'+file.path;if(snapshot.files[rel])throw Error('Duplicate capture path');const dest=await safePath(root,rel);await fs.mkdir(path.dirname(dest),{recursive:true});const content=Buffer.from(file.content,file.encoding==='base64'?'base64':'utf8');await fs.writeFile(dest,content,{flag:'wx',mode:0o600});snapshot.files[rel]=sha(content);}}
 await fs.writeFile(path.join(root,'snapshot.json'),JSON.stringify(snapshot,null,2),{mode:0o600});return snapshot;
 }catch(e){await fs.rm(root,{recursive:true,force:true});throw e;}
}
export function compare(before:Snapshot|undefined,after:Snapshot):Change[]{return [...new Set([...Object.keys(before?.files||{}),...Object.keys(after.files)])].sort().filter(p=>before?.files[p]!==after.files[p]).map(p=>({path:p,status:!before?.files[p]?'added':!after.files[p]?'deleted':'modified',before:before?.files[p]?path.join(before.root,p):undefined,after:after.files[p]?path.join(after.root,p):undefined}));}
export function summary(changes:Change[]):string{return ['# WebSource Sync change summary','',...['added','modified','deleted'].map(s=>`${changes.filter(c=>c.status===s).length} ${s}`),'',...changes.map(c=>`- ${c.status}: ${c.path}`)].join('\n');}
