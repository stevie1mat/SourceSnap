import {mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
await mkdir('artifacts',{recursive:true});
execFileSync('zip',['-r','../../artifacts/websource-sync-chrome-0.1.0.zip','.'],{cwd:'dist/chrome',stdio:'inherit'});
