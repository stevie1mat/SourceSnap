export interface CaptureOptions { mode: 'http'|'browser'; images: boolean; svg: boolean; metadata: boolean; screenshot: boolean; raw: boolean; timeoutMs: number; delayMs: number; retries: number; maxAssets: number; excludeUrls: string[]; removeSelectors: string[]; replacements: {pattern:string; replacement:string}[]; allowedAssetHosts: string[]; }
export interface Target {url:string; folder:string; stagingUrl?:string}
export interface Profile {name:string; targets:Target[]; options:CaptureOptions}
export interface ProjectConfig {version:1; destination:string; activeProfile:string; profiles:Profile[]}
export interface CaptureFile {path:string; content:string; encoding:'utf8'|'base64'}
export interface CaptureBundle {version:1; url:string; html:string; rawHtml?:string; assets:{url:string; content:string; encoding:'utf8'|'base64'; kind:'css'|'js'|'image'|'svg'}[]; screenshot?:string; warnings:string[]}
export interface Snapshot {id:string; root:string; files:Record<string,string>; warnings:string[]; created:string}
export interface Change {path:string; status:'added'|'modified'|'deleted'; before?:string; after?:string}
export const defaults:CaptureOptions={mode:'http',images:false,svg:false,metadata:true,screenshot:false,raw:false,timeoutMs:20000,delayMs:500,retries:2,maxAssets:100,excludeUrls:['google-analytics','googletagmanager','doubleclick','facebook.net'],removeSelectors:[],replacements:[],allowedAssetHosts:[]};
