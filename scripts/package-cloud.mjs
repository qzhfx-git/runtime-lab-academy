// Deliberate allowlist. Never copy personal databases, runtime files, or credentials.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),release=path.join(root,'release'),out=path.join(release,'runtime-lab-cloud');
const sourceFiles=[
 'academy-foundations.mjs','academy-language.mjs','academy-systems.mjs','academy.mjs','advanced-curriculum.mjs',
 'curriculum.json','curriculum.mjs','depth-foundations.mjs','depth-language.mjs','depth-systems.mjs',
 'engineering-service.mjs','engineering-templates.mjs','evaluation.mjs','gdb-service.mjs','judge.mjs',
 'language-service.mjs','project-bundle.mjs','server-access.mjs','server.mjs','studies-catalog.mjs',
 'study-models.mjs','study-projects.mjs','study-schema.mjs','workspace-schema.mjs',
 'engineering-test.mjs','language-test.mjs','engineering-language-test.mjs',
 'CLOUD-LAB.md','package.json','package-lock.json','.gitignore',
 'bridge.mjs','bridge-data.json','bridge-README.md','start-bridge.ps1','check-environment.ps1','install-language-tools.ps1'
];
await fs.rm(out,{recursive:true,force:true});await fs.mkdir(out,{recursive:true});
for(const file of sourceFiles)await fs.copyFile(path.join(root,file),path.join(out,file));
for(const folder of ['public','native','editor-src','scripts','.github','.devcontainer'])await fs.cp(path.join(root,folder),path.join(out,folder),{recursive:true});
await fs.copyFile(path.join(root,'CLOUD-LAB.md'),path.join(out,'README.md'));
// Keep package scripts executable in the distributed subset.
const manifest=JSON.parse(await fs.readFile(path.join(out,'package.json'),'utf8'));
manifest.scripts={start:'node server.mjs','build:editor':'node editor-src/build.mjs','build:portal':'node scripts/build-portal.mjs','test:cloud':manifest.scripts['test:cloud'],'test:engineering':'node engineering-test.mjs','test:language':'node language-test.mjs','test:engineering-language':'node engineering-language-test.mjs','preview:portal':'node scripts/preview-portal.mjs'};
await fs.writeFile(path.join(out,'package.json'),JSON.stringify(manifest,null,2)+'\n');
const entries=[];
async function walk(dir){for(const item of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())await walk(file);else{const data=await fs.readFile(file);entries.push({path:path.relative(out,file).replaceAll('\\','/'),bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});}}}
await walk(out);
if(entries.some(e=>/(^|\/)(\.data|\.runtime|node_modules|\.env|\.git)(\/|$)|\.(sqlite|log|pem)$/i.test(e.path)))throw Error('Private file found in release');
await fs.writeFile(path.join(release,'cloud-package-manifest.json'),JSON.stringify({created:new Date().toISOString(),files:entries},null,2));
console.log(`Sanitized deployment source: ${out}\n${entries.length} files; ${(entries.reduce((n,e)=>n+e.bytes,0)/1048576).toFixed(2)} MiB. Personal records and runtime output excluded.`);
