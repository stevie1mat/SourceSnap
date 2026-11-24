import fs from 'node:fs/promises';
import {parse} from 'csv-parse/sync';
import {defaults, ProjectConfig, Target} from '../shared/types';
import {relativeFile} from './safety';
import {publicUrl} from '../shared/redact';
export function newConfig():ProjectConfig {return {version:1,destination:'websource-captures',activeProfile:'Default',profiles:[{name:'Default',targets:[],options:{...defaults}}]};}
export function validateConfig(value:any):ProjectConfig {
 if(value?.version!==1||!Array.isArray(value.profiles)||!value.profiles.length)throw Error('Invalid project configuration');
 relativeFile(value.destination);if(value.destination.startsWith('-'))throw Error('Destination cannot start with -');
 const names=new Set();for(const p of value.profiles){if(typeof p.name!=='string'||names.has(p.name))throw Error('Profile names must be unique');names.add(p.name);if(!Array.isArray(p.targets)||p.targets.length>100)throw Error('Maximum 100 URLs per profile');const folders=new Set();for(const t of p.targets){if(publicUrl(t.url)!==t.url&&new URL(t.url).search)throw Error('Remove query strings from target URLs');relativeFile(t.folder);if(folders.has(t.folder))throw Error('Duplicate target folder');folders.add(t.folder);if(t.stagingUrl){publicUrl(t.stagingUrl);if(new URL(t.stagingUrl).search)throw Error('Remove query strings from staging URLs');}}
 for(const a of folders)for(const b of folders)if(a!==b&&String(a).startsWith(b+'/'))throw Error('Target folders must not overlap');
 p.options={...defaults,...p.options};const o=p.options;
 for(const key of ['images','svg','metadata','screenshot','raw'])if(typeof o[key]!=='boolean')throw Error('Invalid option '+key);
 if(!['http','browser'].includes(o.mode))throw Error('Invalid capture mode');
 for(const [key,min,max] of [['timeoutMs',1000,120000],['delayMs',100,60000],['retries',0,5],['maxAssets',0,500]] as const)if(!Number.isInteger(o[key])||o[key]<min||o[key]>max)throw Error('Invalid option '+key);
 for(const key of ['excludeUrls','removeSelectors','allowedAssetHosts'])if(!Array.isArray(o[key])||o[key].some((x:any)=>typeof x!=='string'))throw Error('Invalid option '+key);
 if(!Array.isArray(o.replacements))throw Error('Invalid replacements');for(const x of o.replacements){if(typeof x.pattern!=='string'||typeof x.replacement!=='string'||x.pattern.length>200)throw Error('Invalid replacement');new RegExp(x.pattern,'g');}
 }if(!names.has(value.activeProfile))throw Error('Unknown active profile');return value;
}
export async function loadConfig(file:string):Promise<ProjectConfig>{try{return validateConfig(JSON.parse(await fs.readFile(file,'utf8')));}catch(e:any){if(e.code==='ENOENT')return newConfig();throw e;}}
export function importUrls(text:string,csv=false):Target[]{
 const rows=csv?parse(text,{columns:true,skip_empty_lines:true,trim:true,bom:true}):text.split(/\r?\n/).filter(x=>x.trim()&&!x.trim().startsWith('#')).map(url=>({url:url.trim()}));
 return rows.map((r:any)=>{const url=publicUrl(r.url);if(new URL(r.url).search)throw Error('Remove query strings before import');return {url,folder:r.folder||new URL(url).hostname+'/'+Buffer.from(new URL(url).pathname).toString('hex').slice(0,120),...(r.stagingUrl?{stagingUrl:publicUrl(r.stagingUrl)}:{})};});
}
