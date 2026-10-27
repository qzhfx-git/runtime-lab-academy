import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {curriculum} from '../curriculum.mjs';
import {fixture} from '../judge.mjs';
import {engineeringTemplates} from '../engineering-templates.mjs';
import {studies,studyCourses} from '../studies-catalog.mjs';
import {studyStageDefinitions,studyReferenceFiles} from '../study-projects.mjs';
import {projectBundle} from '../project-bundle.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'dist-portal');
const repository=process.env.GITHUB_REPOSITORY||process.argv.find(a=>a.startsWith('--repository='))?.split('=')[1]||'';
const cloudConfig=JSON.parse(await fs.readFile(path.join(root,'cloud-lab-config.json'),'utf8'));
const defaultCodespace=repository===cloudConfig.repository?cloudConfig.codespace:'';
if(repository&&!/^[\w.-]+\/[\w.-]+$/.test(repository))throw Error('Expected GitHub owner/repository');
// Recreate only this named, generated build directory.
await fs.rm(out,{recursive:true,force:true});await fs.mkdir(out,{recursive:true});
await fs.cp(path.join(root,'public'),out,{recursive:true});
for(const name of ['index.html','app.js','academy-ui.js','depth-ui.js','studies-ui.js','evaluation-ui.js','engineering-ui.js','editor/editor.js','editor/format-worker.js']){
 const target=path.join(out,name);let source=await fs.readFile(target,'utf8');
 source=source.replace(/(["'])\/(bundles|editor)\//g,'$1./$2/');
 if(name==='index.html')source=source.replace(/((?:src|href)=["'])\//g,'$1./').replace('<script src="./editor/editor.js"','<script src="./portal-api.js"></script>\n<script src="./editor/editor.js"');
 await fs.writeFile(target,source);
}
const exercises=curriculum.exercises.map(({solution,tests,...e})=>({...e,testCount:tests.length,sample:tests[0],testNames:tests.map(t=>t.name)}));
const academy={...curriculum.academy,lessons:curriculum.academy.lessons.map(l=>({...l,depth:l.depth?{...l.depth,workshop:undefined}:undefined,quiz:l.quiz.map(({answer,explanation,...q})=>q)}))};
const data={portal:{repository,defaultCodespace,createUrl:repository?'https://codespaces.new/'+repository+'?machine=basicLinux32gb':'',resumeUrl:'https://github.com/codespaces'},bootstrap:{roadmap:curriculum.roadmap,exercises,academy,fixture},solutions:Object.fromEntries(curriculum.exercises.map(e=>[e.id,e.solution])),quiz:Object.fromEntries(curriculum.academy.lessons.map(l=>[l.id,l.quiz.map(({answer,explanation})=>({answer,explanation}))]))};
for(const [name,value] of Object.entries({'portal-content.json':data,'studies.json':{studies,courses:studyCourses,stages:studyStageDefinitions},'study-references.json':studyReferenceFiles,'engineering-templates.json':engineeringTemplates}))await fs.writeFile(path.join(out,name),JSON.stringify(value));
for(const project of curriculum.academy.projects)await fs.writeFile(path.join(out,'bundles',project.id+'.zip'),projectBundle(project,curriculum.exercises));
await build({entryPoints:[path.join(root,'scripts/portal-entry.mjs')],bundle:true,format:'iife',platform:'browser',target:'es2022',outfile:path.join(out,'portal-api.js')});
await fs.writeFile(path.join(out,'.nojekyll'),'');
console.log(`Static course site: ${out}\n${exercises.length} exercises; ${academy.lessons.length} lessons; ${studies.length} studies; ${engineeringTemplates.length} engineering templates.\nRepository: ${repository||'not connected yet'}`);
