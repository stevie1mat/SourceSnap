import * as vscode from 'vscode';
import fs from 'node:fs/promises';
import path from 'node:path';
import {Sidebar} from './sidebar';
import {Bridge} from './bridge';
import {GitService} from './git';
import {loadConfig,validateConfig,newConfig,importUrls} from './config';
import {capture} from './capture';
import {compare,summary,storeSnapshot,validateBundle,sha} from './snapshots';
import {ProjectConfig,Snapshot,Change,CaptureBundle} from '../shared/types';
import {safePath,relativeFile} from './safety';
import {publicUrl} from '../shared/redact';
export function activate(context:vscode.ExtensionContext){
 const controller=new Controller(context);context.subscriptions.push(controller,vscode.window.registerWebviewViewProvider('websource.sidebar',controller.sidebar),vscode.commands.registerCommand('websource.open',()=>vscode.commands.executeCommand('workbench.view.extension.websource')),vscode.commands.registerCommand('websource.import',()=>controller.action({action:'importCapture'})));
}
class Controller {
 sidebar:Sidebar;private repo='';private config:ProjectConfig=newConfig();private before?:Snapshot;private after?:Snapshot;private comparison='snapshots';private staged:string[]=[];private stagedHashes:Record<string,string>={};private stagedHead='';private bridge?:Bridge;private active?:AbortController;private busy=false;private storage:string;
 constructor(private context:vscode.ExtensionContext){this.storage=context.globalStorageUri.fsPath;this.sidebar=new Sidebar(context.extensionUri,m=>this.action(m),()=>void this.refresh());}
 dispose(){this.active?.abort();this.bridge?.dispose();}
 private git(){if(!this.repo)throw Error('Select a Git repository first');return new GitService(this.repo,this.config.destination);}
 private profile(){return this.config.profiles.find(p=>p.name===this.config.activeProfile)!;}
 private async configPath(){return safePath(this.repo,'.websource-sync.config.json');}
 private async save(){if(!this.repo)throw Error('Select a Git repository first');validateConfig(this.config);await fs.writeFile(await this.configPath(),JSON.stringify(this.config,null,2)+'\n');}
 private async read(){if(this.repo)this.config=await loadConfig(await this.configPath());}
 private async changes():Promise<Change[]>{return this.after?compare(this.comparison==='repository'?await this.git().repositorySnapshot():this.before,this.after):[];}
 private status(text:string){this.sidebar.send({type:'status',text,busy:this.busy});}
 private async refresh(){try{const changes=await this.changes();const branch=this.repo?await this.git().git.branchLocal():undefined;this.sidebar.send({type:'state',repo:this.repo,config:this.config,branches:branch?.all||[],branch:branch?.current||'',changes,summary:changes.length+' changed files',snapshots:`Before: ${this.before?.created||'—'} | After: ${this.after?.created||'—'}`,warnings:[...new Set([...(this.before?.warnings||[]),...(this.after?.warnings||[])])],staged:this.staged.length?`${this.staged.length-1} reviewed capture files staged`:'No capture files staged this session.'});}catch(e:any){this.status(e.message);}}
 private async persist(){await this.context.workspaceState.update('websource:'+this.repo,{before:this.before?.id,after:this.after?.id});}
 private async restore(){const state=this.context.workspaceState.get<any>('websource:'+this.repo)||{};const load=async(id?:string)=>{if(!id||! /^[a-f0-9-]{36}$/.test(id))return undefined;try{const root=path.join(this.storage,'snapshots',id);const s=JSON.parse(await fs.readFile(path.join(root,'snapshot.json'),'utf8')) as Snapshot;s.root=root;for(const [p,h] of Object.entries(s.files)){const f=await safePath(root,p);if(sha(await fs.readFile(f))!==h)throw Error('Snapshot changed');}return s;}catch{return undefined;}};this.before=await load(state.before);this.after=await load(state.after);}
 private apply(m:any){if(typeof m.urls!=='string')return;const p=this.profile();const urls=importUrls(m.urls);p.targets=urls.map(t=>p.targets.find(old=>old.url===t.url)||t);if(typeof m.destination==='string')this.config.destination=m.destination;if(m.mode)p.options.mode=m.mode;if(m.options)Object.assign(p.options,m.options);validateConfig(this.config);}
 async action(m:any):Promise<void>{
 if(!m||typeof m.action!=='string')return;
 if(m.action==='cancel'){this.active?.abort();return;}
 if(m.action==='ready'){await this.refresh();return;}
 if(this.busy)throw Error('Wait for the current operation or cancel capture first');
 this.busy=true;this.status('Working…');try{
 if(m.comparison)this.comparison=m.comparison;
 switch(m.action){
 case 'repository':{const pick=await vscode.window.showOpenDialog({canSelectFolders:true,canSelectFiles:false,canSelectMany:false,openLabel:'Select repository root'});if(!pick)return;const root=await fs.realpath(pick[0].fsPath);const git=new GitService(root,'websource-captures');await git.verify();this.repo=root;this.config=await loadConfig(await this.configPath());this.staged=[];await this.restore();break;}
 case 'save':this.apply(m);await this.save();break;
 case 'profile':this.config.activeProfile=m.profile;validateConfig(this.config);await this.save();break;
 case 'newProfile':{const name=await vscode.window.showInputBox({prompt:'Profile name',validateInput:n=>!n.trim()||this.config.profiles.some(p=>p.name===n)?'Enter a unique name':undefined});if(name){this.config.profiles.push({name,targets:[],options:{...this.profile().options}});this.config.activeProfile=name;await this.save();}break;}
 case 'config':await this.save();await vscode.window.showTextDocument(vscode.Uri.file(await this.configPath()));break;
 case 'importUrls':{const files=await vscode.window.showOpenDialog({canSelectMany:false,filters:{'URL lists':['csv','txt']}});if(files){this.profile().targets.push(...importUrls(await fs.readFile(files[0].fsPath,'utf8'),files[0].fsPath.endsWith('.csv')));await this.save();}break;}
 case 'before':case 'after':case 'environments':this.apply(m);await this.save();await this.read();await this.capture(m.action);break;
 case 'bridge':{this.git();this.apply(m);await this.save();this.bridge?.dispose();this.bridge=new Bridge();const pair=await this.bridge.start((b,s)=>this.receive(b,s));const pairing=JSON.stringify({port:pair.port,token:pair.token});await vscode.env.clipboard.writeText(pairing);await vscode.window.showInformationMessage('Chrome pairing copied. Paste it into the companion extension. It expires when disconnected or VS Code closes. The bridge accepts captures only after your review.');break;}
 case 'stopBridge':this.bridge?.dispose();this.bridge=undefined;break;
 case 'importCapture':{this.git();await this.read();const files=await vscode.window.showOpenDialog({canSelectMany:false,filters:{'WebSource capture':['json']}});if(!files)return;const stat=await fs.stat(files[0].fsPath);if(stat.size>25*1024*1024)throw Error('Capture exceeds 25 MB');const bundle=JSON.parse(await fs.readFile(files[0].fsPath,'utf8'));const slot=await vscode.window.showQuickPick(['before','after'],{placeHolder:'Import as which snapshot?'});if(slot)await this.importBundle(bundle,slot as 'before'|'after');break;}
 case 'diff':{const c=(await this.changes()).find(c=>c.path===m.path);if(!c)throw Error('Change no longer available');await fs.mkdir(this.storage,{recursive:true});const empty=path.join(this.storage,'empty');await fs.writeFile(empty,'');await vscode.commands.executeCommand('vscode.diff',vscode.Uri.file(c.before||empty),vscode.Uri.file(c.after||empty),`${c.status}: ${c.path}`,{preview:true});break;}
 case 'summary':{const doc=await vscode.workspace.openTextDocument({content:summary(await this.changes()),language:'markdown'});await vscode.window.showTextDocument(doc);break;}
 case 'checkout':{if(this.staged.length)throw Error('Commit the staged capture before switching branches');if(await this.confirm('Switch to branch '+m.branch+'?','Switch'))await this.git().checkout(m.branch);break;}
 case 'stage':{
 if(!this.after)throw Error('Capture After first');if(this.comparison!=='repository')throw Error('Choose Repository → After to review exactly what will be staged');if(this.staged.length)throw Error('Commit the reviewed capture or unstage it in Source Control, then restart this extension before staging another selection');
 const changes=await this.changes();const selected=Array.isArray(m.selected)?m.selected:[];if(!selected.length)throw Error('Select files to stage');for(const p of selected)if(!changes.some(c=>c.path===p))throw Error('Invalid file selection');
 if(await this.confirm('Write and stage '+selected.length+' selected capture files?\n'+selected.join('\n')+'\nIncludes the capture ownership manifest.','Stage')){this.staged=await this.git().stage(this.after,changes,selected);this.stagedHead=(await this.git().git.revparse(['HEAD']).catch(()=>'' )).trim();this.stagedHashes={};for(const p of this.staged){try{this.stagedHashes[p]=sha(await fs.readFile(await safePath(this.repo,p)));}catch(e:any){if(e.code==='ENOENT')this.stagedHashes[p]='deleted';else throw e;}}}break;}
 case 'commit':{if(!this.staged.length)throw Error('Stage reviewed capture files first');for(const p of this.staged){let h='deleted';try{h=sha(await fs.readFile(await safePath(this.repo,p)));}catch(e:any){if(e.code!=='ENOENT')throw e;}if(h!==this.stagedHashes[p])throw Error('Files changed since review. Do not commit until reviewed again.');}const head=(await this.git().git.revparse(['HEAD']).catch(()=>'' )).trim();if(head!==this.stagedHead)throw Error('Branch history changed since staging');if(await this.confirm('Commit only these capture paths?\n'+this.staged.join('\n')+'\n\nMessage: '+m.message,'Commit')){const hash=await this.git().commit(String(m.message||''),this.staged);this.staged=[];void vscode.window.showInformationMessage('Capture committed: '+hash.slice(0,12));}break;}
 case 'push':{const g=this.git();const branch=(await g.git.branchLocal()).current;const remote=await g.git.raw(['config','--get',`branch.${branch}.remote`]).catch(()=> '');if(!remote.trim())throw Error('Configure an upstream branch using Git before pushing');const ahead=await g.git.raw(['log','--oneline','@{upstream}..HEAD']);if(await this.confirm('Push '+branch+' to '+remote.trim()+'? This pushes all outgoing commits on this branch.\n'+ahead,'Push'))await g.push();break;}
 case 'refresh':await this.read();break;
 }
 }catch(e:any){this.status('Failed: '+e.message);throw e;}finally{this.busy=false;await this.refresh();this.status(this.active?.signal.aborted?'Capture cancelled':'Ready');}}
 private confirm(detail:string,button:string){return vscode.window.showWarningMessage(detail,{modal:true},button).then(v=>v===button);}
 private async capture(kind:string){
 const targets=this.profile().targets;if(!targets.length)throw Error('Add at least one URL');if(kind==='environments'&&targets.some(t=>!t.stagingUrl))throw Error('Every target needs a stagingUrl mapping');this.active=new AbortController();const signal=this.active.signal;const options=this.profile().options;
 try{await vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title:'WebSource Sync',cancellable:true},async(progress,token)=>{const subscription=token.onCancellationRequested(()=>this.active?.abort());try{const run=async(staging:boolean)=>{const entries=[];for(let i=0;i<targets.length;i++){signal.throwIfAborted();const t=targets[i];const b=await capture(staging?t.stagingUrl!:t.url,options,signal,text=>progress.report({message:`${i+1}/${targets.length}: ${text}`}));entries.push({folder:t.folder,bundle:b,options});}return storeSnapshot(this.storage,entries,signal);};
 if(kind==='environments'){const before=await run(true),after=await run(false);this.before=before;this.after=after;}else{const snap=await run(false);if(kind==='before')this.before=snap;else this.after=snap;}await this.persist();}finally{subscription.dispose();}});}finally{this.active=undefined;}}
 private async receive(bundle:CaptureBundle,slot:'before'|'after'){
 if(this.busy)throw Error('VS Code is busy; retry after the current operation');this.busy=true;try{await this.read();await this.importBundle(bundle,slot);}finally{this.busy=false;await this.refresh();this.status('Ready');}}
 private async importBundle(bundle:CaptureBundle,slot:'before'|'after'){
 validateBundle(bundle);const url=publicUrl(bundle.url);const target=this.profile().targets.find(t=>publicUrl(t.url)===url||t.stagingUrl&&publicUrl(t.stagingUrl)===url);if(!target)throw Error('Add this exact page URL to the active profile before importing');
 if(!await this.confirm(`Import ${slot.toUpperCase()} capture for ${url}?\n${bundle.assets.length} assets, ${bundle.warnings.length} warnings.\nCapture is sanitized again and saved outside Git. Review screenshots and source before staging.`,'Import'))throw Error('Import cancelled');
 const snap=await storeSnapshot(this.storage,[{folder:target.folder,bundle,options:this.profile().options}]);const previous=slot==='before'?this.before:this.after;
 // Retain other mapped URLs when bulk captures arrive one page at a time.
 if(previous){for(const[p,h]of Object.entries(previous.files)){if(p.startsWith(target.folder+'/'))continue;const source=await safePath(previous.root,p);if(sha(await fs.readFile(source))!==h)throw Error('Prior snapshot integrity check failed');const dest=await safePath(snap.root,p);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.copyFile(source,dest);snap.files[p]=h;}snap.warnings.push(...previous.warnings);await fs.writeFile(path.join(snap.root,'snapshot.json'),JSON.stringify(snap,null,2));}
 if(slot==='before')this.before=snap;else this.after=snap;await this.persist();
 }
}
