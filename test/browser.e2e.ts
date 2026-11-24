import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {Bridge} from '../src/bridge';
import {CaptureBundle} from '../shared/types';
async function main(){
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'websource-chrome-'));
const ext=path.join(temp,'extension');await fs.cp('dist/chrome',ext,{recursive:true});
// Pre-grant only the deterministic fixture origin in the disposable test build.
const manifest=JSON.parse(await fs.readFile(path.join(ext,'manifest.json'),'utf8'));manifest.host_permissions.push('https://fixture.example.test/*');await fs.writeFile(path.join(ext,'manifest.json'),JSON.stringify(manifest));
const context=await chromium.launchPersistentContext(path.join(temp,'profile'),{headless:false,executablePath:process.env.WEBSOURCE_TEST_CHROMIUM||undefined,args:['--disable-extensions-except='+ext,'--load-extension='+ext]});
let received:CaptureBundle|undefined;let slot='';const bridge=new Bridge();
try{
 await context.route('https://fixture.example.test/**',async route=>{const pathname=new URL(route.request().url()).pathname;if(pathname==='/main.css')await route.fulfill({contentType:'text/css',body:'body { color: rgb(10,20,30); }'});else if(pathname==='/main.js')await route.fulfill({contentType:'application/javascript',body:'window.fixtureLoaded = true;'});else await route.fulfill({contentType:'text/html',body:'<!DOCTYPE html><html><head><title>Capture fixture</title><link rel="stylesheet" href="/main.css"></head><body><h1>Public content</h1><input value="DO-NOT-CAPTURE"><textarea>PRIVATE-FORM</textarea><script src="/main.js"></script><script>const api_key="should-redact";</script></body></html>'});});
 const target=await context.newPage();await target.goto('https://fixture.example.test/page');
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');const id=new URL(worker.url()).hostname;
 const targetId=await worker.evaluate(async()=>{const tabs=await chrome.tabs.query({url:'https://fixture.example.test/*'});return tabs[0].id;});assert.ok(targetId);
 const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`chrome-extension://${id}/popup.html?tab=${targetId}`);await page.locator('#authorized').check();await page.locator('#capture').click();await page.waitForFunction(()=>document.getElementById('status')?.textContent?.startsWith('Captured HTML'),{},{timeout:30000});
 assert.match(await page.locator('#status').innerText(),/2 assets/);
 const pair=await bridge.start(async(bundle,s)=>{received=bundle;slot=s;});await page.locator('#pair').fill(JSON.stringify(pair));await page.locator('#slot').selectOption('after');await page.locator('#send').click();await page.waitForFunction(()=>document.getElementById('status')?.textContent?.startsWith('Imported into VS Code'),{},{timeout:10000});
 assert.equal(slot,'after');assert.ok(received);assert.ok(!received.html.includes('DO-NOT-CAPTURE'));assert.ok(!received.html.includes('PRIVATE-FORM'));assert.ok(!received.html.includes('should-redact'));assert.equal(received.assets.length,2);assert.equal(errors.length,0,errors.join('\n'));
 await fs.mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/chrome-capture-reviewed.png',fullPage:true});
 // Download button must create a usable capture, not a placeholder.
 const downloadEvent=page.waitForEvent('download');await page.locator('#download').click();const download=await downloadEvent;const downloaded=JSON.parse(await fs.readFile((await download.path())!,'utf8'));assert.equal(downloaded.version,1);assert.equal(downloaded.assets.length,2);
 console.log('Chrome E2E passed: real extension DOM capture, form redaction, CSS/JS downloads, authenticated bridge transfer, JSON download, no runtime errors.');
}finally{bridge.dispose();await context.close();await fs.rm(temp,{recursive:true,force:true});}

}
main().catch(e=>{console.error(e);process.exitCode=1;});
