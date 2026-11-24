import {load} from 'cheerio';
import {createHash} from 'node:crypto';
import {CaptureBundle, CaptureOptions} from '../shared/types';
import {Downloader} from './network';
export function assetName(url:string,kind:string):string {return 'assets/'+createHash('sha256').update(url).digest('hex').slice(0,24)+'.'+(kind==='image'?(new URL(url).pathname.match(/\.(png|jpe?g|webp|gif|ico|avif)$/i)?.[1]||'bin'):kind);}
export function discover(html:string,url:string,options:CaptureOptions):{url:string;kind:'css'|'js'|'image'|'svg'}[]{
 const $=load(html);const results:any[]=[];const add=(src:string|undefined,kind:string)=>{if(!src)return;try{const u=new URL(src,url);if(u.search||u.username||u.password||!['http:','https:'].includes(u.protocol))return;u.hash='';if(options.excludeUrls.some(x=>u.href.includes(x)))return;results.push({url:u.href,kind:u.pathname.endsWith('.svg')?'svg':kind});}catch{}};
 $('link[rel="stylesheet"]').each((_,el)=>add($(el).attr('href'),'css'));$('script[src]').each((_,el)=>add($(el).attr('src'),'js'));
 if(options.images||options.svg)$('img[src],source[src],image[href]').each((_,el)=>{const src=$(el).attr('src')||$(el).attr('href');if(src&&(options.images||/\.svg(?:$|\?)/i.test(src)))add(src,'image');});
 return results.filter(x=>x.kind!=='svg'||options.svg);
}
export async function downloadAssets(bundle:CaptureBundle,options:CaptureOptions,downloader:Downloader,signal:AbortSignal):Promise<void>{
 const queue=discover(bundle.html,bundle.url,options);const seen=new Set(bundle.assets.map(x=>x.url));let bytes=bundle.assets.reduce((n,a)=>n+a.content.length,0);
 while(queue.length&&seen.size<options.maxAssets){signal.throwIfAborted();const item=queue.shift()!;if(seen.has(item.url))continue;seen.add(item.url);
 try{const result=await downloader.get(item.url,bundle.url);if(bytes+result.body.length>20*1024*1024)throw Error('Capture asset budget exceeded (20 MB)');bytes+=result.body.length;
 const binary=item.kind==='image';if(binary&&!/^image\/(png|jpeg|gif|webp|avif|x-icon|vnd.microsoft.icon)/i.test(result.type))throw Error('Unsupported image content type');
 const content=result.body.toString(binary?'base64':'utf8');bundle.assets.push({...item,content,encoding:binary?'base64':'utf8'});
 if(item.kind==='css'){for(const match of content.matchAll(/(?:url\(\s*["']?([^\s)'";]+)["']?\s*\)|@import\s+["']([^"']+)["'])/g)){try{const u=new URL(match[1]||match[2],item.url);if(u.search||options.excludeUrls.some(x=>u.href.includes(x)))continue;const kind=/\.css$/i.test(u.pathname)?'css':/\.svg$/i.test(u.pathname)?'svg':'image';if(kind==='css'||kind==='svg'&&options.svg||kind==='image'&&options.images)queue.push({url:u.href,kind});}catch{}}}
 }catch(e:any){if(signal.aborted)throw e;bundle.warnings.push(item.url+': '+e.message);}}
 if(queue.length)bundle.warnings.push('Asset limit reached; some dependencies were not captured.');
}
