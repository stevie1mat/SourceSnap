import {build} from 'esbuild';
import {mkdir,copyFile} from 'node:fs/promises';
await mkdir('dist/chrome',{recursive:true});
await build({entryPoints:['src/extension.ts'],bundle:true,platform:'node',format:'cjs',outfile:'dist/extension.js',external:['vscode','playwright'],sourcemap:true});
// Playwright must remain a real package to find its driver and browser installation.
await mkdir('dist/node_modules',{recursive:true});
const {cp}=await import('node:fs/promises');
for(const name of ['playwright','playwright-core']) await cp('node_modules/'+name,'dist/node_modules/'+name,{recursive:true});
await build({entryPoints:['chrome/popup.ts'],bundle:true,platform:'browser',format:'iife',outfile:'dist/chrome/popup.js'});
for(const file of ['manifest.json','popup.html','popup.css','background.js']) await copyFile('chrome/'+file,'dist/chrome/'+file);

await build({entryPoints:['test/vscode-host.ts'],bundle:true,platform:'node',format:'cjs',outfile:'dist/vscode-test.js',external:['vscode']});
