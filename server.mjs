import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,randomBytes,timingSafeEqual} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {root,setupRunner,judge,compilerVersion,fixture} from './judge.mjs';
import {curriculum} from './curriculum.mjs';
import {projectBundle} from './project-bundle.mjs';
import {submitCloud,pollCloud,reviewAI} from './evaluation.mjs';
import {LanguageService} from './language-service.mjs';
import {compiler} from './judge.mjs';
import {EngineeringService} from './engineering-service.mjs';
import {engineeringTemplates} from './engineering-templates.mjs';
import {validateWorkspace} from './workspace-schema.mjs';
import {studies,studyCourses} from './studies-catalog.mjs';
import {studyStageDefinitions,studyReferenceFiles} from './study-projects.mjs';
import {validateStudyRecord,workspaceStudySummary,studyWorkspaceProjection} from './study-schema.mjs';
import {serverAccess} from './server-access.mjs';

setupRunner();
const exercises=new Map(curriculum.exercises.map(e=>[e.id,e]));
const language=new LanguageService({exercises,fixture,compiler});
const engineering=new EngineeringService();
process.on('exit',()=>engineering.dispose());
process.on('exit',()=>language.dispose());
const port=Number(process.env.PORT||3210);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid PORT');
const access=serverAccess(process.env,port);
const origin=access.origin;
const token=randomBytes(32).toString('hex');
const dataDir=process.env.LAB_DATA_DIR?path.resolve(process.env.LAB_DATA_DIR):path.join(root,'.data');
fs.mkdirSync(dataDir,{recursive:true});
const db=new DatabaseSync(path.join(dataDir,'learning.sqlite'));
db.exec('CREATE TABLE IF NOT EXISTS workspaces(id TEXT PRIMARY KEY,value TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0)');
db.exec('CREATE TABLE IF NOT EXISTS study_records(id TEXT PRIMARY KEY,value TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0)');
db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS drafts(id TEXT PRIMARY KEY,code TEXT NOT NULL,notes TEXT NOT NULL DEFAULT \'\',updated TEXT NOT NULL);CREATE TABLE IF NOT EXISTS attempts(id TEXT PRIMARY KEY,exercise TEXT NOT NULL,code TEXT NOT NULL,mode TEXT NOT NULL,result TEXT NOT NULL,created TEXT NOT NULL);CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);');
db.exec("CREATE TABLE IF NOT EXISTS lesson_work(id TEXT PRIMARY KEY,checks TEXT NOT NULL DEFAULT '[]',notes TEXT NOT NULL DEFAULT '',updated TEXT NOT NULL)");
const lessonWork=()=>db.prepare('SELECT * FROM lesson_work').all().map(r=>({...r,checks:JSON.parse(r.checks)}));
let aiBusy=false;
const getDraft=db.prepare('SELECT * FROM drafts WHERE id=?');
db.exec("CREATE TABLE IF NOT EXISTS lesson_progress(id TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0, best_score INTEGER NOT NULL DEFAULT 0, last_score INTEGER NOT NULL DEFAULT 0, feedback TEXT NOT NULL DEFAULT '[]', answers TEXT NOT NULL DEFAULT '[]', notes TEXT NOT NULL DEFAULT '', updated TEXT NOT NULL); CREATE TABLE IF NOT EXISTS project_reviews(id TEXT PRIMARY KEY, checks TEXT NOT NULL DEFAULT '[]', report TEXT NOT NULL DEFAULT '', updated TEXT NOT NULL);");
const lessonProgress=()=>db.prepare('SELECT * FROM lesson_progress').all().map(r=>({...r,feedback:JSON.parse(r.feedback),answers:JSON.parse(r.answers)}));
const projectReviews=()=>db.prepare('SELECT * FROM project_reviews').all().map(r=>({...r,checks:JSON.parse(r.checks)}));
const publicAcademy=()=>({...curriculum.academy,lessons:curriculum.academy.lessons.map(l=>({...l,depth:l.depth?{...l.depth,workshop:undefined}:undefined,quiz:l.quiz.map(({answer,explanation,...q})=>q)}))});
const saveDraft=db.prepare('INSERT INTO drafts(id,code,notes,updated) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET code=excluded.code,notes=excluded.notes,updated=excluded.updated');
const getSettings=db.prepare('SELECT value FROM settings WHERE key=?');
const putSettings=db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
const jobs=new Map();let active=null;
const publicExercise=e=>{const{solution,tests,...rest}=e;return{...rest,testCount:tests.length,sample:tests[0],testNames:tests.map(t=>t.name)};};
function json(res,status,data){
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));
}
async function body(req){
 let size=0;const chunks=[];
 for await(const chunk of req){size+=chunk.length;if(size>1500000)throw Object.assign(new Error('请求过大'),{status:413});chunks.push(chunk);}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}catch{throw Object.assign(new Error('无效 JSON'),{status:400});}
}
function auth(req){
 const received=req.headers['x-lab-token'];
 return typeof received==='string'&&/^[a-f0-9]{64}$/.test(received)&&timingSafeEqual(Buffer.from(received),Buffer.from(token));
}
function history(exercise){
 const rows=exercise?db.prepare('SELECT id,exercise,mode,result,created FROM attempts WHERE exercise=? ORDER BY created DESC LIMIT 30').all(exercise):db.prepare('SELECT id,exercise,mode,result,created FROM attempts ORDER BY created DESC LIMIT 100').all();
 return rows.map(r=>({...r,result:JSON.parse(r.result)}));
}
function progress(){
 return db.prepare("SELECT exercise,MAX(created) AS passedAt FROM attempts WHERE mode='submit' AND json_extract(result,'$.status')='AC' GROUP BY exercise").all();
}
const server=http.createServer(async(req,res)=>{
 try{
  if(!access.allows(req))return json(res,403,{error:'仅接受学习站自身的请求：'+origin});
  const url=new URL(req.url,origin);
  if(url.pathname==='/api/health'&&req.method==='GET')return json(res,200,{app:'cpp-runtime-lab',version:'2.0.0',compiler:compilerVersion});
  if(url.pathname==='/api/bootstrap'&&req.method==='GET'){
   return json(res,200,{token,roadmap:curriculum.roadmap,exercises:curriculum.exercises.map(publicExercise),academy:publicAcademy(),lessonProgress:lessonProgress(),lessonWork:lessonWork(),projectReviews:projectReviews(),progress:progress(),history:history(),drafts:db.prepare('SELECT * FROM drafts').all(),lastExercise:getSettings.get('lastExercise')?.value||'weak-lock',activeJob:active?.id||null,environment:{location:access.codespaces?'codespaces':'local',compiler:compilerVersion,standard:'C++20',limits:'每例 2.2 秒 / 128 MiB / 64 KiB 输出',execution:process.platform==='win32'?'本机账户权限运行，Job Object 限制资源；不是文件或网络隔离沙箱。':'在个人 Linux 工作区运行，限制单进程 CPU、地址空间和运行时间；不是文件或网络隔离沙箱。仅供工作区所有者使用，转发端口必须保持 Private。'},fixture});
  }
  if(url.pathname.startsWith('/api/')){
   if(!auth(req))return json(res,403,{error:'会话已过期，请刷新页面'});
   if(req.method==='GET'&&url.pathname==='/api/study')return json(res,200,{records:db.prepare('SELECT value FROM study_records').all().map(r=>JSON.parse(r.value)),workspaces:db.prepare("SELECT "+studyWorkspaceProjection+" AS value FROM workspaces WHERE id LIKE 'study-%'").all().map(r=>workspaceStudySummary(JSON.parse(r.value)))});
   if(req.method==='POST'&&url.pathname==='/api/study'){
    const value=validateStudyRecord(await body(req)),previous=db.prepare('SELECT revision FROM study_records WHERE id=?').get(value.id);
    if((previous?.revision||0)!==value.revision)return json(res,409,{error:'研修记录已在另一页面更新。本页备份已保留，请导出后刷新合并。'});
    value.revision++;value.updated=new Date().toISOString();db.prepare('INSERT INTO study_records(id,value,revision) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,revision=excluded.revision').run(value.id,JSON.stringify(value),value.revision);return json(res,200,{revision:value.revision});
   }
   if(req.method==='POST'&&url.pathname==='/api/engineering')return json(res,200,await engineering.handle(await body(req)));
   if(req.method==='GET'&&url.pathname==='/api/workspace'){
    const row=db.prepare('SELECT value FROM workspaces WHERE id=?').get(url.searchParams.get('id')||'');return json(res,200,{workspace:row?JSON.parse(row.value):null});
   }
   if(req.method==='POST'&&url.pathname==='/api/workspace'){
    const value=validateWorkspace(await body(req)),previous=db.prepare('SELECT revision FROM workspaces WHERE id=?').get(value.id);
    if((previous?.revision||0)!==value.revision)return json(res,409,{error:'此工程已在另一个页面修改。当前浏览器备份已保留，请导出后刷新合并。'});
    value.revision++;value.updated=new Date().toISOString();db.prepare('INSERT INTO workspaces(id,value,revision) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,revision=excluded.revision').run(value.id,JSON.stringify(value),value.revision);return json(res,200,{saved:true,revision:value.revision});
   }
   if(req.method==='POST'&&url.pathname==='/api/language')return json(res,200,await language.handle(await body(req)));
   if(req.method==='POST'&&url.pathname==='/api/lesson-work'){
    const data=await body(req);
    if(!curriculum.academy.lessons.some(l=>l.id===data.id)||!Array.isArray(data.checks)||data.checks.length!==3||data.checks.some(c=>typeof c!=='boolean')||typeof data.notes!=='string'||data.notes.length>20000)return json(res,400,{error:'无效工程记录'});
    db.prepare('INSERT INTO lesson_work(id,checks,notes,updated) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET checks=excluded.checks,notes=excluded.notes,updated=excluded.updated').run(data.id,JSON.stringify(data.checks),data.notes,new Date().toISOString());return json(res,200,{saved:true,lessonWork:lessonWork()});
   }
   if(req.method==='POST'&&url.pathname==='/api/ai-review'){
    const data=await body(req),e=exercises.get(data.exerciseId);
    if(!e||typeof data.code!=='string'||data.code.length>50000)return json(res,400,{error:'无效提交'});
    if(aiBusy)return json(res,429,{error:'已有 AI 评审正在进行'});aiBusy=true;
    try{const result=await reviewAI({...e,preamble:fixture+'\n'+(e.preamble||'')},data.code,data.config||{}),id=randomUUID();db.prepare('INSERT INTO attempts(id,exercise,code,mode,result,created) VALUES(?,?,?,?,?,?)').run(id,e.id,data.code,'review',JSON.stringify(result),new Date().toISOString());return json(res,200,{id,result});}finally{aiBusy=false;}
   }
   if(req.method==='POST'&&url.pathname==='/api/lesson-check'){
    const data=await body(req),lesson=curriculum.academy.lessons.find(l=>l.id===data.id);
    if(!lesson||!Array.isArray(data.answers)||data.answers.length!==lesson.quiz.length||data.answers.some((a,i)=>!Number.isInteger(a)||a<0||a>=lesson.quiz[i].options.length))return json(res,400,{error:'请完成全部测验题'});
    const feedback=lesson.quiz.map((q,i)=>({correct:data.answers[i]===q.answer,answer:q.answer,explanation:q.explanation}));
    const score=Math.round(feedback.filter(f=>f.correct).length/feedback.length*100);
    db.prepare("INSERT INTO lesson_progress(id,attempts,best_score,last_score,feedback,answers,updated) VALUES(?,1,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET attempts=attempts+1,best_score=MAX(best_score,excluded.best_score),last_score=excluded.last_score,feedback=excluded.feedback,answers=excluded.answers,updated=excluded.updated").run(lesson.id,score,score,JSON.stringify(feedback),JSON.stringify(data.answers),new Date().toISOString());
    return json(res,200,{score,feedback,lessonProgress:lessonProgress()});
   }
   if(req.method==='POST'&&url.pathname==='/api/lesson-notes'){
    const data=await body(req);
    if(!curriculum.academy.lessons.some(l=>l.id===data.id)||typeof data.notes!=='string'||data.notes.length>20000)return json(res,400,{error:'无效的复盘记录'});
    db.prepare('INSERT INTO lesson_progress(id,notes,updated) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET notes=excluded.notes,updated=excluded.updated').run(data.id,data.notes,new Date().toISOString());
    return json(res,200,{saved:true,lessonProgress:lessonProgress()});
   }
   if(req.method==='POST'&&url.pathname==='/api/project-review'){
    const data=await body(req),project=curriculum.academy.projects.find(p=>p.id===data.id);
    if(!project||!Array.isArray(data.checks)||data.checks.length!==project.rubric.length||data.checks.some(c=>typeof c!=='boolean')||typeof data.report!=='string'||data.report.length>20000)return json(res,400,{error:'无效的项目评审记录'});
    db.prepare('INSERT INTO project_reviews(id,checks,report,updated) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET checks=excluded.checks,report=excluded.report,updated=excluded.updated').run(data.id,JSON.stringify(data.checks),data.report,new Date().toISOString());
    return json(res,200,{saved:true,projectReviews:projectReviews()});
   }
   if(req.method==='GET'&&url.pathname.startsWith('/api/project-bundle/')){
    const project=curriculum.academy.projects.find(p=>p.id===url.pathname.split('/').pop());
    if(!project)return json(res,404,{error:'项目不存在'});
    const zip=projectBundle(project,curriculum.exercises);
    res.writeHead(200,{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="'+project.id+'.zip"','Content-Length':zip.length,'Cache-Control':'no-store'});res.end(zip);return;
   }
   if(req.method==='GET'&&url.pathname.startsWith('/api/jobs/')){
    const job=jobs.get(url.pathname.split('/').pop());
    if(!job)return json(res,404,{error:'任务不存在'});
    const {controller,...view}=job;return json(res,200,view);
   }
   if(req.method==='POST'&&url.pathname==='/api/draft'){
    const data=await body(req);
    if(!exercises.has(data.id)||typeof data.code!=='string'||data.code.length>50000||typeof data.notes!=='string'||data.notes.length>10000)return json(res,400,{error:'无效的草稿'});
    saveDraft.run(data.id,data.code,data.notes,new Date().toISOString());putSettings.run('lastExercise',data.id);
    return json(res,200,{saved:true});
   }
   if(req.method==='POST'&&url.pathname==='/api/jobs'){
    const data=await body(req);const exercise=exercises.get(data.exerciseId);
    if(!exercise||typeof data.code!=='string'||data.code.length<1||data.code.length>50000||!['run','submit'].includes(data.mode))return json(res,400,{error:'无效的提交'});
    if(active)return json(res,409,{error:'已有代码正在评测，请等待或取消'});
    const id=randomUUID();const controller=new AbortController();
    const job={id,exerciseId:exercise.id,mode:data.mode,stage:'queued',testIndex:0,total:data.mode==='run'?1:exercise.tests.length,done:false,created:new Date().toISOString(),controller};
    jobs.set(id,job);active=job;
    json(res,202,{id});
    (async()=>{
      try{
       if(data.provider==='judge0'){
        const tokens=await submitCloud(exercise,data.code,data.mode,fixture),started=Date.now();
        while(!controller.signal.aborted&&Date.now()-started<600000){const result=await pollCloud(tokens,exercise,data.mode);if(result){job.result=result;break;}await new Promise(r=>setTimeout(r,3000));}
        if(!job.result)job.result={status:controller.signal.aborted?'CANCELLED':'IE',provider:'judge0',mode:data.mode,tests:[],evaluationNote:'已停止等待。云端已派发的任务可能继续至资源时限。'};
       }else job.result={...await judge(exercise,data.code,data.mode,{signal:controller.signal,onStage:(stage,index)=>{job.stage=stage;job.testIndex=index;}}),provider:'local'};
       db.prepare('INSERT INTO attempts(id,exercise,code,mode,result,created) VALUES(?,?,?,?,?,?)').run(id,exercise.id,data.code,data.mode,JSON.stringify(job.result),job.created);
      }catch(err){job.result={status:'IE',error:err.message,tests:[]};}
      finally{job.done=true;job.stage='done';active=null;for(const [key,v]of jobs)if(jobs.size>100&&v.done&&key!==id)jobs.delete(key);}
    })();return;
   }
   if(req.method==='POST'&&url.pathname==='/api/cancel'){
    const data=await body(req);const job=jobs.get(data.id);
    if(job&&!job.done)job.controller.abort();
    return json(res,200,{cancelled:!!job});
   }
   if(req.method==='GET'&&url.pathname==='/api/history')return json(res,200,{history:history(url.searchParams.get('exercise')||undefined),progress:progress()});
   if(req.method==='GET'&&url.pathname.startsWith('/api/attempt/')){
    const row=db.prepare('SELECT * FROM attempts WHERE id=?').get(url.pathname.split('/').pop());
    return row?json(res,200,{...row,result:JSON.parse(row.result)}):json(res,404,{error:'提交不存在'});
   }
   if(req.method==='GET'&&url.pathname.startsWith('/api/solution/')){
    const e=exercises.get(url.pathname.split('/').pop());return e?json(res,200,{solution:e.solution}):json(res,404,{error:'练习不存在'});
   }
   if(req.method==='GET'&&url.pathname==='/api/export'){
    return json(res,200,{version:2,exportedAt:new Date().toISOString(),drafts:db.prepare('SELECT * FROM drafts').all(),attempts:db.prepare('SELECT * FROM attempts ORDER BY created DESC').all(),progress:progress(),lessonProgress:lessonProgress(),lessonWork:lessonWork(),projectReviews:projectReviews(),workspaces:db.prepare('SELECT value FROM workspaces').all().map(r=>JSON.parse(r.value)),studyRecords:db.prepare('SELECT value FROM study_records').all().map(r=>JSON.parse(r.value))});
   }
   return json(res,404,{error:'接口不存在'});
  }
  if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'Method not allowed'});
  if(url.pathname==='/studies.json')return json(res,200,{studies,courses:studyCourses,stages:studyStageDefinitions});
  if(url.pathname==='/study-references.json')return json(res,200,studyReferenceFiles);
  if(url.pathname==='/engineering-templates.json')return json(res,200,engineeringTemplates);
  if(req.method==='GET'&&/^\/bundles\/[a-z0-9-]+\.zip$/.test(url.pathname)){
   const bundle=path.join(root,'public',url.pathname.slice(1));if(!fs.existsSync(bundle))return json(res,404,{error:'工程包不存在'});res.writeHead(200,{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="'+path.basename(bundle)+'"'});res.end(fs.readFileSync(bundle));return;
  }
  const allowed={'/':'index.html','/app.js':'app.js','/style.css':'style.css','/academy-ui.js':'academy-ui.js','/academy.css':'academy.css','/depth.css':'depth.css','/depth-ui.js':'depth-ui.js','/evaluation-ui.js':'evaluation-ui.js'};
  allowed['/engineering-ui.js']='engineering-ui.js';allowed['/engineering.css']='engineering.css';
  allowed['/studies-ui.js']='studies-ui.js';allowed['/studies.css']='studies.css';
  allowed['/cloud-lab.js']='cloud-lab.js';allowed['/cloud-lab.css']='cloud-lab.css';
  for(const name of ['editor.js','format-worker.js','clang-format.wasm','LICENSES.txt'])allowed['/editor/'+name]='editor/'+name;allowed['/editor.css']='editor.css';
  const file=allowed[url.pathname];if(!file)return json(res,404,{error:'页面不存在'});
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.txt':'text/plain'};
  res.writeHead(200,{'Content-Type':types[path.extname(file)]+(file.endsWith('.wasm')?'':'; charset=utf-8'),'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",'Referrer-Policy':'no-referrer'});
  res.end(req.method==='HEAD'?'':fs.readFileSync(path.join(root,'public',file)));
 }catch(err){if(!res.headersSent)json(res,err.status||500,{error:err.message});else res.end();}
});
server.listen(port,'127.0.0.1',()=>console.log('Runtime Lab ready: '+origin+'\n'+compilerVersion));
server.on('error',err=>{console.error(err.message);process.exitCode=1;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{active?.controller.abort();server.close(()=>{db.close();process.exit(0);});});

