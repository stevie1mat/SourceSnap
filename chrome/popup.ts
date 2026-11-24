import {redact,publicUrl} from '../shared/redact';
import {CaptureBundle} from '../shared/types';
const el=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const text=(id:string)=>el<HTMLInputElement>(id).value;
const checked=(id:string)=>el<HTMLInputElement>(id).checked;
const button=(id:string)=>el<HTMLButtonElement>(id);
let bundle:CaptureBundle|undefined,controller:AbortController|undefined;
const tabId=Number(new URL(location.href).searchParams.get('tab'));
const status=(s:string)=>{el('status').textContent=s;};
const lines=(id:string)=>text(id).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
void chrome.tabs.get(tabId).then(tab=>{el('target').textContent=tab.url?publicUrl(tab.url):'No accessible URL';}).catch(()=>status('Close this tab, open your website, then click the extension icon.'));
function scrub(markup:string,svg=false):string {
 const doc=new DOMParser().parseFromString(markup,svg?'image/svg+xml':'text/html');
 doc.querySelectorAll('iframe,object,embed,[data-websource-private],foreignObject').forEach(n=>n.remove());
 doc.querySelectorAll('input').forEach(n=>{n.removeAttribute('value');n.removeAttribute('checked');});doc.querySelectorAll('textarea,[contenteditable]').forEach(n=>n.textContent='');doc.querySelectorAll('option').forEach(n=>n.removeAttribute('selected'));
 doc.querySelectorAll('*').forEach(n=>{for(const attr of [...n.attributes]){if(/nonce|token|secret|password|authorization|cookie|^on/i.test(attr.name))n.removeAttribute(attr.name);else if(['src','href','action','poster'].includes(attr.name)){try{const u=new URL(attr.value,'https://placeholder.invalid');if(u.username||u.password)n.removeAttribute(attr.name);else if(u.search)n.setAttribute(attr.name,attr.value.startsWith('http')?publicUrl(u.href):u.pathname);}catch{n.removeAttribute(attr.name);}}}});
 if(svg)doc.querySelectorAll('script').forEach(n=>n.remove());
 return redact((svg?'':'<!DOCTYPE html>\n')+doc.documentElement.outerHTML);
}
// Runs in the isolated world. Never reads document.cookie, storage, request headers, or form properties.
export function readPage(){
 if(/Just a moment\.\.\.|Checking your browser/i.test(document.title)||document.querySelector('script[src*="/cdn-cgi/challenge-platform/"]'))throw Error('Cloudflare check is still active. Complete it normally before capture.');
 const root=document.documentElement.cloneNode(true) as HTMLElement;
 root.querySelectorAll('input').forEach(n=>{n.removeAttribute('value');n.removeAttribute('checked');});root.querySelectorAll('textarea,[contenteditable]').forEach(n=>n.textContent='');root.querySelectorAll('option').forEach(n=>n.removeAttribute('selected'));root.querySelectorAll('iframe,object,embed,[data-websource-private]').forEach(n=>n.remove());
 const assets:{url:string;kind:'css'|'js'|'image'|'svg'}[]=[];const add=(value:string|null,kind:'css'|'js'|'image')=>{if(!value)return;try{const u=new URL(value,document.baseURI);if(u.search||u.username||u.password||!['http:','https:'].includes(u.protocol))return;u.hash='';assets.push({url:u.href,kind:u.pathname.endsWith('.svg')?'svg':kind});}catch{}};
 root.querySelectorAll('script[src]').forEach(n=>add(n.getAttribute('src'),'js'));root.querySelectorAll('link[rel="stylesheet"]').forEach(n=>add(n.getAttribute('href'),'css'));root.querySelectorAll('img[src]').forEach(n=>add(n.getAttribute('src'),'image'));
 // Scrub sensitive attributes before serializing from the page context.
 root.querySelectorAll('*').forEach(n=>{for(const attr of [...n.attributes])if(/nonce|token|secret|password|authorization|cookie|^on/i.test(attr.name))n.removeAttribute(attr.name);});
 return {html:'<!DOCTYPE html>\n'+root.outerHTML,url:location.href,assets};
}
async function fetchLimited(url:string,signal:AbortSignal):Promise<{data:Uint8Array;type:string}>{
 const response=await fetch(url,{credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.any([signal,AbortSignal.timeout(20000)])});
 if(!response.ok||response.headers.get('cf-mitigated')==='challenge')throw Error('HTTP '+response.status+' or access challenge');const reader=response.body?.getReader();if(!reader)throw Error('Empty asset response');const chunks:Uint8Array[]=[];let size=0;try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>5*1024*1024)throw Error('Asset exceeds 5 MB');chunks.push(r.value);}}finally{await reader.cancel();}const data=new Uint8Array(size);let i=0;for(const chunk of chunks){data.set(chunk,i);i+=chunk.length;}return {data,type:response.headers.get('content-type')||''};
}
function base64(data:Uint8Array){let binary='';for(let i=0;i<data.length;i+=8192)binary+=String.fromCharCode(...data.subarray(i,i+8192));return btoa(binary);}
function hostAllowed(host:string){return !/^(localhost|.*\.localhost|.*\.local|127\..*|10\..*|192\.168\..*|169\.254\..*|0\..*|\[.*\])$/i.test(host)&&!/^172\.(1[6-9]|2\d|3[01])\./.test(host);}
function setBusy(busy:boolean){button('capture').disabled=busy;button('cancel').disabled=!busy;button('send').disabled=busy||!bundle;button('download').disabled=busy||!bundle;}
button('cancel').onclick=()=>controller?.abort();
button('capture').onclick=async()=>{
 if(!checked('authorized')){status('Confirm authorization and that this page contains no personal data.');return;}
 controller=new AbortController();const signal=controller.signal;bundle=undefined;setBusy(true);el('warnings').replaceChildren();
 try{
 const tab=await chrome.tabs.get(tabId);if(!tab.url)throw Error('No page URL');if(new URL(tab.url).search)throw Error('Open a clean page URL without query strings to avoid supporter identifiers.');const url=publicUrl(tab.url);const target=new URL(url);if(!hostAllowed(target.hostname))throw Error('Local/private network pages are not supported');
 const hosts=[target.hostname,...lines('hosts')];if(hosts.some(h=>!hostAllowed(h)||!/^[a-z0-9.-]+$/i.test(h)))throw Error('Enter public hostnames only, without schemes or paths');
 // Host permission is requested only by this explicit user action.
 const origins=[...new Set(hosts.map(h=>target.protocol+'//'+h+'/*'))];const granted=await chrome.permissions.request({origins});if(!granted)throw Error('Page and asset host permission was denied');
 const results=await chrome.scripting.executeScript({target:{tabId},func:readPage});const captured=results[0]?.result;if(!captured)throw Error('Cannot capture this page');if(publicUrl(captured.url)!==url)throw Error('Page navigated; reopen the capture tool');
 const next:CaptureBundle={version:1,url,html:scrub(captured.html),assets:[],warnings:[]};const queue=captured.assets.filter(a=>a.kind!=='image'||checked('images')).filter(a=>a.kind!=='svg'||checked('svg'));const seen=new Set<string>();let bytes=next.html.length;
 while(queue.length&&seen.size<100){signal.throwIfAborted();const a=queue.shift()!;if(seen.has(a.url))continue;seen.add(a.url);const u=new URL(a.url);if(!hosts.includes(u.hostname)||lines('exclude').some(x=>u.href.includes(x))){next.warnings.push('Skipped excluded or non-permitted asset: '+publicUrl(a.url));continue;}
 status('Capturing asset '+seen.size+': '+a.kind);try{const response=await fetchLimited(a.url,signal);bytes+=response.data.length;if(bytes>20*1024*1024)throw Error('Total capture exceeds 20 MB');const binary=a.kind==='image';if(binary&&!/^image\/(png|jpeg|gif|webp|avif|x-icon|vnd.microsoft.icon)/i.test(response.type))throw Error('Unsupported image type');let content=binary?base64(response.data):new TextDecoder().decode(response.data);
 if(!binary&&/Just a moment\.\.\.|\/cdn-cgi\/challenge-platform\//.test(content))throw Error('Cloudflare challenge; asset not captured');content=a.kind==='svg'?scrub(content,true):binary?content:redact(content);next.assets.push({...a,content,encoding:binary?'base64':'utf8'});
 if(a.kind==='css'){for(const m of content.matchAll(/(?:url\(\s*["']?([^\s)'";]+)["']?\s*\)|@import\s+["']([^"']+)["'])/g)){try{const child=new URL(m[1]||m[2],a.url);if(child.search||!['http:','https:'].includes(child.protocol))continue;const kind=/\.css$/i.test(child.pathname)?'css':/\.svg$/i.test(child.pathname)?'svg':'image';if(kind==='css'||kind==='svg'&&checked('svg')||kind==='image'&&checked('images'))queue.push({url:child.href,kind});}catch{}}}
 }catch(e:any){if(signal.aborted)throw e;next.warnings.push(publicUrl(a.url)+': '+e.message);if(bytes>20*1024*1024)break;}await new Promise(r=>setTimeout(r,500));}
 if(queue.length)next.warnings.push('Asset budget reached; some assets were not captured.');
 if(checked('raw')){try{const raw=await fetchLimited(url,signal);const source=new TextDecoder().decode(raw.data);if(/Just a moment\.\.\.|\/cdn-cgi\/challenge-platform\//.test(source))throw Error('Cloudflare blocked the HTTP source request');next.rawHtml=scrub(source);}catch(e:any){next.warnings.push('Original HTML unavailable: '+e.message);}}
 if(checked('screenshot')){const captureTab=await chrome.tabs.getCurrent();await chrome.scripting.executeScript({target:{tabId},func:()=>{const style=document.createElement('style');style.id='websource-screenshot-mask';style.textContent='input,textarea,select,[contenteditable],iframe,[data-websource-private]{visibility:hidden!important}';document.documentElement.append(style);}});try{await chrome.tabs.update(tabId,{active:true});await new Promise(r=>setTimeout(r,150));const current=await chrome.tabs.get(tabId);if(!current.active||publicUrl(current.url||'')!==url)throw Error('Page changed before screenshot');const data=await chrome.tabs.captureVisibleTab(current.windowId,{format:'png'});next.screenshot=data.split(',')[1];}finally{await chrome.scripting.executeScript({target:{tabId},func:()=>document.getElementById('websource-screenshot-mask')?.remove()});if(captureTab?.id)await chrome.tabs.update(captureTab.id,{active:true});}}
 signal.throwIfAborted();next.warnings.push('Loaded DOM capture only: frames, shadow DOM, runtime-loaded modules, srcset variants, and inaccessible assets may be missing. No backend or Engaging Networks editor configuration is captured.');
 if(JSON.stringify(next).length>25*1024*1024)throw Error('Capture exceeds transfer limit');bundle=next;status(`Captured HTML and ${bundle.assets.length} assets. Review ${bundle.warnings.length} notices before sending.`);for(const warning of bundle.warnings){const li=document.createElement('li');li.textContent=warning;el('warnings').append(li);}
 }catch(e:any){status(signal.aborted?'Capture cancelled':e.message);}finally{setBusy(false);controller=undefined;}
};
button('send').onclick=async()=>{if(!bundle)return;setBusy(true);try{const pair=JSON.parse(text('pair'));if(!Number.isInteger(pair.port)||pair.port<1024||pair.port>65535||!/^[a-f0-9]{64}$/.test(pair.token))throw Error('Invalid pairing code');status('Waiting for your import approval in VS Code…');const res=await fetch('http://127.0.0.1:'+pair.port+'/capture/'+text('slot'),{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+pair.token},body:JSON.stringify(bundle),credentials:'omit',redirect:'error',signal:AbortSignal.timeout(180000)});if(!res.ok)throw Error(await res.text());status('Imported into VS Code. Review the diff there before staging.');}catch(e:any){status('Transfer failed: '+e.message+'. You can download the JSON instead.');}finally{setBusy(false);}};
button('download').onclick=async()=>{if(!bundle)return;const url=URL.createObjectURL(new Blob([JSON.stringify(bundle)],{type:'application/json'}));try{await chrome.downloads.download({url,filename:'websource-'+text('slot')+'.json',saveAs:true});status('Capture download started. Import it from WebSource Sync in VS Code.');}catch(e:any){status(e.message);}finally{setTimeout(()=>URL.revokeObjectURL(url),60000);}};
