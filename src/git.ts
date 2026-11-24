import fs from 'node:fs/promises';
import path from 'node:path';
import {simpleGit, SimpleGit} from 'simple-git';
import {Snapshot,Change} from '../shared/types';
import {safePath,relativeFile} from './safety';
import {sha} from './snapshots';
import {redact} from '../shared/redact';
interface Ownership {version:1;files:Record<string,string>}
export class GitService {
 readonly git:SimpleGit;
 constructor(readonly root:string,readonly destination:string){relativeFile(destination);this.git=simpleGit(root,{maxConcurrentProcesses:1});}
 async verify(){if((await this.git.revparse(['--show-toplevel'])).trim()!==await fs.realpath(this.root))throw Error('Select the root of an existing Git repository');await safePath(this.root,this.destination);}
 async ownership():Promise<Ownership>{
 const file=await safePath(this.root,this.destination+'/.websource-sync.json');try{const value=JSON.parse(await fs.readFile(file,'utf8'));if(value.version!==1||!value.files||typeof value.files!=='object')throw Error('Invalid ownership manifest');for(const [p,h]of Object.entries(value.files)){relativeFile(p);if(typeof h!=='string'||!/^[a-f0-9]{64}$/.test(h))throw Error('Invalid ownership hash');}return value;}catch(e:any){if(e.code==='ENOENT')return {version:1,files:{}};throw e;}}
 async repositorySnapshot():Promise<Snapshot>{await this.verify();const owned=await this.ownership();const snapshot:Snapshot={id:'repository',root:path.join(this.root,this.destination),files:{},warnings:[],created:''};for(const p of Object.keys(owned.files)){try{snapshot.files[p]=sha(await fs.readFile(await safePath(this.root,this.destination+'/'+p)));}catch(e:any){if(e.code!=='ENOENT')throw e;}}return snapshot;}
 async stage(snapshot:Snapshot,changes:Change[],selected:string[]):Promise<string[]>{
 await this.verify();if(!selected.length)throw Error('Select capture files first');const owned=await this.ownership();const plan=selected.map(p=>{const c=changes.find(c=>c.path===p);if(!c)throw Error('Stale file selection');return c;});
 // Validate the whole selection before changing anything.
 for(const c of plan){const file=await safePath(this.root,this.destination+'/'+c.path);try{const data=await fs.readFile(file);if(!owned.files[c.path])throw Error('Refusing to overwrite unrelated file: '+c.path);if(sha(data)!==owned.files[c.path])throw Error('Captured repository file was edited locally: '+c.path);}catch(e:any){if(e.code!=='ENOENT')throw e;}
 if(c.after){const data=await fs.readFile(c.after);if(sha(data)!==snapshot.files[c.path])throw Error('Snapshot integrity check failed');if(/\.(html|css|js|json|svg)$/.test(c.path)&&redact(data.toString('utf8'))!==data.toString('utf8'))throw Error('Sensitive data detected before staging: '+c.path);}}
 const marker=this.destination+'/.websource-sync.json';const status=await this.git.status();const affected=new Set([...plan.map(c=>this.destination+'/'+c.path),marker]);if(status.files.some(f=>affected.has(f.path)&&f.index!==' '&&f.index!=='?'))throw Error('Selected capture files already have staged changes. Commit or unstage those changes first.');
 const backups=new Map<string,Buffer|undefined>();const paths=plan.map(c=>this.destination+'/'+c.path);paths.push(marker);
 for(const p of paths){try{backups.set(p,await fs.readFile(await safePath(this.root,p)));}catch(e:any){if(e.code!=='ENOENT')throw e;backups.set(p,undefined);}}
 try{for(const c of plan){const target=await safePath(this.root,this.destination+'/'+c.path);if(c.after){await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(c.after,target);owned.files[c.path]=snapshot.files[c.path];}else{await fs.rm(target,{force:true});delete owned.files[c.path];}}
 const markerPath=await safePath(this.root,marker);await fs.mkdir(path.dirname(markerPath),{recursive:true});await fs.writeFile(markerPath,JSON.stringify(owned,null,2)+'\n');await this.git.add(['--',...paths]);return paths;
 }catch(e){for(const[p,data]of backups){const target=await safePath(this.root,p);if(data)await fs.writeFile(target,data);else await fs.rm(target,{force:true});}await this.git.raw(['reset','--',...paths]).catch(()=>{});throw e;}
 }
 async commit(message:string,paths:string[]):Promise<string>{
 if(!message.trim()||message.length>2000||!paths.length)throw Error('A commit message and reviewed staged files are required');await this.verify();const status=await this.git.status();
 for(const p of paths){relativeFile(p);if(!p.startsWith(this.destination+'/'))throw Error('Commit path outside capture folder');await safePath(this.root,p);const s=status.files.find(f=>f.path===p);if(s&&s.working_dir!==' ')throw Error('Selected file changed after staging. Review and stage again.');}
 // --only prevents including pre-existing staged work from elsewhere in the repository.
 await this.git.raw(['commit','--only','-m',message,'--',...paths]);return (await this.git.revparse(['HEAD'])).trim();
 }
 async branches():Promise<string[]>{return (await this.git.branchLocal()).all;}
 async checkout(branch:string):Promise<void>{if(!(await this.branches()).includes(branch))throw Error('Select an existing local branch');if(!(await this.git.status()).isClean())throw Error('Branch changes require a clean working tree');await this.git.checkout(branch);}
 async push():Promise<void>{const branch=(await this.git.branchLocal()).current;if(!branch||branch==='HEAD')throw Error('Select a branch before pushing');await this.git.push();}
}
