// Shared defense in depth. No detector can guarantee finding all personal data.
export function redact(input:string):string {
 return input
 .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g,'[REDACTED PRIVATE KEY]')
 .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16})\b/g,'[REDACTED TOKEN]')
 .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[REDACTED JWT]')
 .replace(/((?:["']?)(?:password|passwd|secret|client_secret|api[_-]?key|access[_-]?token|authorization|cookie|csrf[_-]?token|nonce|email|phone|cardnumber|card_number|cvv|cvc)(?:["']?)\s*[:=]\s*)(["'`])[^"'`\r\n]*\2/gi,'$1"[REDACTED]"')
 .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,'[REDACTED EMAIL]')
 .replace(/\b(?:\d[ -]?){13,19}\b/g,(value)=> {const n=value.replace(/\D/g,''); let sum=0;for(let i=n.length-1,p=0;i>=0;i--,p++){let d=+n[i];if(p%2){d*=2;if(d>9)d-=9;}sum+=d;}return n.length>=13&&sum%10===0?'[REDACTED PAYMENT NUMBER]':value;});
}
export function publicUrl(input:string):string { const u=new URL(input);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('Only HTTP(S) URLs without credentials are supported');u.search='';u.hash='';return u.href; }
