import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
let healthy=false;
try{const r=await fetch('http://127.0.0.1:3210/api/health',{signal:AbortSignal.timeout(1500)});healthy=r.ok&&(await r.json()).app==='cpp-runtime-lab';}catch{}
if(!healthy){
 fs.mkdirSync('.runtime',{recursive:true});
 const output=fs.openSync('.runtime/codespaces-server.log','a');
 const child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:'3210'},detached:true,stdio:['ignore',output,output]});
 child.unref();fs.closeSync(output);
 for(let i=0;i<40;i++){
  await new Promise(r=>setTimeout(r,500));
  try{const r=await fetch('http://127.0.0.1:3210/api/health',{signal:AbortSignal.timeout(1500)});if(r.ok&&(await r.json()).app==='cpp-runtime-lab'){healthy=true;break;}}catch{}
 }
}
if(!healthy)throw new Error('Learning server failed to start; check .runtime/codespaces-server.log');
console.log('Runtime Lab ready: http://127.0.0.1:3210/');
console.log('Open the forwarded port 3210. Visibility must remain Private.');
