import {spawnSync} from 'node:child_process';
import {setupRunner} from '../judge.mjs';
import fs from 'node:fs';
if(process.platform!=='linux')throw new Error('Codespaces setup requires Linux');
for(const executable of ['g++','clangd','cmake','ninja','gdb']){
 const r=spawnSync(executable,['--version'],{encoding:'utf8'});
 if(r.status!==0)throw new Error('Missing tool: '+executable);
 console.log(r.stdout.split('\n')[0]);
}
setupRunner();
// Runtime assets are shipped. No npm installation needed just to run the lab.
if(!fs.existsSync(new URL('../public/editor/editor.js',import.meta.url)))throw new Error('Missing prebuilt editor');
console.log('C++20 cloud workspace is ready. Keep port 3210 Private.');
