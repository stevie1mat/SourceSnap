import {load} from 'cheerio';
import {redact} from '../shared/redact';
import {CaptureOptions} from '../shared/types';
export function cleanHtml(html:string,options:CaptureOptions):string {
 const $=load(html);$('input').removeAttr('value').removeAttr('checked');$('textarea').empty();$('option').removeAttr('selected');$('[contenteditable]').empty();
 $('iframe,object,embed').remove();$('meta[http-equiv="set-cookie" i]').remove();
 $('[data-websource-private],[autocomplete="cc-number"]').remove();
 for(const selector of options.removeSelectors)$(selector).remove();
 $('*').each((_,el)=>{const node=$(el);for(const [key,value] of Object.entries((el as any).attribs||{}) as [string,string][]){if(/nonce|token|secret|password|authorization|cookie|^on/i.test(key))node.removeAttr(key);else if(['href','src','action','data-src','poster'].includes(key)){try{const u=new URL(value,'https://placeholder.invalid');if(u.username||u.password){node.removeAttr(key);continue;}if(u.search){u.search='';u.hash='';node.attr(key,value.startsWith('http')?u.href:u.pathname);}}catch{node.removeAttr(key);}}}});
 let result=redact($.html());for(const x of options.replacements)result=result.replace(new RegExp(x.pattern,'g'),x.replacement);return result;
}
export function cleanText(text:string,options:CaptureOptions):string {let result=redact(text);for(const x of options.replacements)result=result.replace(new RegExp(x.pattern,'g'),x.replacement);return result;}

export function cleanSvg(svg:string,options:CaptureOptions):string {const $=load(svg,{xmlMode:true});$('script,foreignObject,iframe,object,embed').remove();$('*').each((_,el)=>{for(const key of Object.keys((el as any).attribs||{}))if(/^on|nonce|token|secret/i.test(key))$(el).removeAttr(key);});return cleanText($.xml(),options);}
