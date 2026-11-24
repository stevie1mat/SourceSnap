import * as vscode from 'vscode';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {format} from '../src/formatter';
export async function run(){
 const extension=vscode.extensions.getExtension('websource-sync.websource-sync');assert.ok(extension,'Development extension must be discovered');await extension.activate();assert.equal(extension.isActive,true);const commands=await vscode.commands.getCommands(true);assert.ok(commands.includes('websource.open'));assert.ok(commands.includes('websource.import'));await vscode.commands.executeCommand('websource.open');
 const css=await format('body{color:red}', 'test.css');assert.match(css,/body \{\n/);const html=await format('<div><span>hi</span></div>','test.html');assert.ok(html.endsWith('\n'));
 const root=process.env.WEBSOURCE_HOST_TEST_ROOT;if(!root)throw Error('Missing test root');await fs.writeFile(path.join(root,'before.html'),'<p>Before</p>');await fs.writeFile(path.join(root,'after.html'),'<p>After</p>');await vscode.commands.executeCommand('vscode.diff',vscode.Uri.file(path.join(root,'before.html')),vscode.Uri.file(path.join(root,'after.html')),'WebSource native diff test');assert.ok(vscode.window.tabGroups.all.some(g=>g.tabs.some(t=>t.input instanceof vscode.TabInputTextDiff)));
 await fs.writeFile(path.join(root,'result.json'),JSON.stringify({activation:true,commands:true,sidebar:true,nativeDiff:true,bundledPrettier:true},null,2));
}
