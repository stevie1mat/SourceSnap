import {chromium} from 'playwright';
import {CaptureBundle,CaptureOptions} from '../shared/types';
import {Downloader} from './network';
import {challenge,validateUrl} from './safety';
import {downloadAssets} from './assets';
export async function capture(url:string,options:CaptureOptions,signal:AbortSignal,progress:(text:string)=>void,testAllowPrivate=false):Promise<CaptureBundle>{
 signal.throwIfAborted();await validateUrl(url,testAllowPrivate);const downloader=new Downloader(options,signal,testAllowPrivate);progress('Loading '+url);
 const bundle:CaptureBundle={version:1,url,html:'',assets:[],warnings:[]};
 if(options.mode==='http'){const response=await downloader.get(url);if(!/text\/html|application\/xhtml/i.test(response.type))throw Error('URL did not return HTML');bundle.html=response.body.toString('utf8');if(options.raw)bundle.rawHtml=bundle.html;if(options.screenshot)bundle.warnings.push('Screenshots require browser mode or Chrome capture.');}
 else{
 const browser=await chromium.launch({headless:true});const abort=()=>{void browser.close();};signal.addEventListener('abort',abort,{once:true});
 try{const context=await browser.newContext({serviceWorkers:'block',acceptDownloads:false});const page=await context.newPage();page.setDefaultTimeout(options.timeoutMs);
 await context.routeWebSocket('**/*',socket=>socket.close());
 let last=0;await context.route('**/*',async route=>{const req=route.request();try{
 if(signal.aborted||req.method()!=='GET'||!['document','stylesheet','script','image','font'].includes(req.resourceType())||req.resourceType()==='document'&&req.frame()!==page.mainFrame())return await route.abort();
 const u=await validateUrl(req.url(),testAllowPrivate);if(req.resourceType()==='document'){if(u.origin!==new URL(url).origin)return await route.abort();let parent=req.redirectedFrom(),count=0;while(parent){count++;parent=parent.redirectedFrom();}if(count>5||(!req.redirectedFrom()&&u.href!==new URL(url).href))return await route.abort();}if(u.origin!==new URL(url).origin&&!options.allowedAssetHosts.includes(u.hostname)||options.excludeUrls.some(x=>u.href.includes(x)))return await route.abort();
 await new Promise(r=>setTimeout(r,Math.max(0,options.delayMs-(Date.now()-last))));last=Date.now();const headers={...req.headers()};delete headers.authorization;delete headers.cookie;await route.continue({headers});
 }catch{await route.abort().catch(()=>{});}});
 await page.addInitScript(()=>{HTMLFormElement.prototype.submit=function(){};HTMLFormElement.prototype.requestSubmit=function(){};document.addEventListener('submit',event=>{event.preventDefault();event.stopImmediatePropagation();},true);});
 page.on('dialog',dialog=>void dialog.dismiss());page.on('popup',popup=>void popup.close());
 const response=await page.goto(url,{waitUntil:'load',timeout:options.timeoutMs});if(!response)throw Error('No page response');bundle.html=await page.content();challenge(response.status(),await response.allHeaders(),bundle.html);bundle.url=page.url();
 if(options.raw)bundle.rawHtml=await response.text();
 if(options.screenshot){await page.locator('input,textarea,select,[contenteditable],iframe,[data-websource-private]').evaluateAll(elements=>{for(const el of elements)(el as HTMLElement).style.visibility='hidden';});bundle.screenshot=(await page.screenshot({fullPage:true,timeout:options.timeoutMs})).toString('base64');}
 await context.close();bundle.warnings.push('Browser capture blocks form submissions, XHR/fetch, WebSockets, popups, and non-allowlisted hosts. Dynamic content may be incomplete.');
 }finally{signal.removeEventListener('abort',abort);await browser.close();}}
 signal.throwIfAborted();progress('Downloading assets');await downloadAssets(bundle,options,downloader,signal);return bundle;
}
