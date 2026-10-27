// Static course edition. No remote code execution or fake evaluation results.
import {validateWorkspace} from '../workspace-schema.mjs';
import {validateStudyRecord,workspaceStudySummary} from '../study-schema.mjs';
const nativeFetch=window.fetch.bind(window);
const base=new URL('./',document.currentScript.src);
const content=nativeFetch(new URL('portal-content.json',base)).then(r=>{if(!r.ok)throw Error('课程数据加载失败');return r.json();});
const database=new Promise((resolve,reject)=>{
 const request=indexedDB.open('runtime-lab-portal:'+base.pathname,1);
 request.onupgradeneeded=()=>request.result.createObjectStore('records');
 request.onsuccess=()=>resolve(request.result);
 request.onerror=()=>reject(Error('浏览器存储不可用；请允许此站点使用存储'));
});
const empty=()=>({drafts:{},lessonProgress:{},lessonWork:{},projectReviews:{},workspaces:{},studyRecords:{},lastExercise:'weak-lock'});
async function transaction(write,fn){
 const db=await database;
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('records',write?'readwrite':'readonly'),store=tx.objectStore('records');let result,failure;
  const request=store.get('learning');
  request.onsuccess=()=>{try{const data=request.result||empty();result=fn(data);if(write)store.put(data,'learning');}catch(e){failure=e;tx.abort();}};
  tx.oncomplete=()=>resolve(result);
  tx.onabort=tx.onerror=()=>reject(failure||tx.error||Error('保存失败，请导出当前学习记录'));
 });
}
const error=(message,status=400)=>Object.assign(Error(message),{status});
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const needsLab='真实编译、类型分析和 GDB 调试需要进入个人云实验室。当前课程页不会执行代码。';
async function api(url,method,data){
 const catalog=await content,path=url.pathname.replace(base.pathname.replace(/\/$/,''),'');
 if(path==='/api/health')return {app:'cpp-runtime-lab-portal',version:'1'};
 if(path==='/api/bootstrap')return transaction(false,s=>({...catalog.bootstrap,environment:{location:'portal',compiler:'在个人 Codespaces 中运行',standard:'C++20',execution:needsLab},token:'static-browser-storage',portal:catalog.portal,...Object.fromEntries(['drafts','lessonProgress','lessonWork','projectReviews'].map(k=>[k,Object.values(s[k])])),progress:[],history:[],activeJob:null,lastExercise:s.lastExercise}));
 if(path==='/api/export')return transaction(false,s=>({version:2,source:'static-course-portal',exportedAt:new Date().toISOString(),...Object.fromEntries(['drafts','lessonProgress','lessonWork','projectReviews','workspaces','studyRecords'].map(k=>[k,Object.values(s[k])])),attempts:[],progress:[]}));
 if(path==='/api/history')return {history:[],progress:[]};
 if(path.startsWith('/api/solution/')){const solution=catalog.solutions[path.split('/').pop()];if(!solution)throw error('练习不存在',404);return {solution};}
 if(path==='/api/engineering'&&data.op==='status')return {available:false,message:needsLab,tools:{}};
 if(path==='/api/language'&&data.op==='status')return {available:false,message:needsLab};
 if(['/api/jobs','/api/ai-review','/api/engineering','/api/language'].includes(path))throw error(needsLab,428);
 if(path==='/api/workspace'&&method==='GET')return transaction(false,s=>({workspace:s.workspaces[url.searchParams.get('id')]||null}));
 if(path==='/api/study'&&method==='GET')return transaction(false,s=>({records:Object.values(s.studyRecords),workspaces:Object.values(s.workspaces).filter(w=>w.id.startsWith('study-')).map(workspaceStudySummary)}));
 if(method!=='POST')throw error('静态课程页未提供此接口',404);
 return transaction(true,s=>{
  const updated=new Date().toISOString();
  if(path==='/api/workspace'||path==='/api/study'){
   const workspace=path==='/api/workspace',value=workspace?validateWorkspace(data):validateStudyRecord(data),records=workspace?s.workspaces:s.studyRecords;
   if((records[value.id]?.revision||0)!==value.revision)throw error('此记录已在其他页面更新，请导出本页备份后刷新合并。',409);
   // Static editing cannot manufacture an execution or acceptance report.
   if(workspace)value.report=null;
   value.revision++;value.updated=updated;records[value.id]=value;return {saved:true,revision:value.revision};
  }
  const lesson=catalog.bootstrap.academy.lessons.find(l=>l.id===data.id);
  if(path==='/api/draft'){
   if(!catalog.solutions[data.id]||typeof data.code!=='string'||data.code.length>50000||typeof data.notes!=='string'||data.notes.length>10000)throw error('无效草稿');
   s.drafts[data.id]={id:data.id,code:data.code,notes:data.notes,updated};s.lastExercise=data.id;return {saved:true};
  }
  if(path==='/api/lesson-work'){
   if(!lesson||!Array.isArray(data.checks)||data.checks.length!==3||data.checks.some(c=>typeof c!=='boolean')||typeof data.notes!=='string'||data.notes.length>20000)throw error('无效工程记录');
   s.lessonWork[data.id]={id:data.id,checks:data.checks,notes:data.notes,updated};return {saved:true,lessonWork:Object.values(s.lessonWork)};
  }
  if(path==='/api/lesson-check'||path==='/api/lesson-notes'){
   if(!lesson)throw error('课程不存在');
   const old=s.lessonProgress[data.id]||{id:data.id,attempts:0,best_score:0,last_score:0,feedback:[],answers:[],notes:''};
   if(path==='/api/lesson-notes'){
    if(typeof data.notes!=='string'||data.notes.length>20000)throw error('无效笔记');
    old.notes=data.notes;old.updated=updated;s.lessonProgress[data.id]=old;return {saved:true,lessonProgress:Object.values(s.lessonProgress)};
   }
   const quiz=catalog.quiz[data.id];
   if(!Array.isArray(data.answers)||data.answers.length!==quiz.length||data.answers.some((a,i)=>!Number.isInteger(a)||a<0||a>=lesson.quiz[i].options.length))throw error('请完成全部自测题');
   const feedback=quiz.map((q,i)=>({...q,correct:q.answer===data.answers[i]})),score=Math.round(feedback.filter(q=>q.correct).length/quiz.length*100);
   s.lessonProgress[data.id]={...old,attempts:old.attempts+1,best_score:Math.max(score,old.best_score),last_score:score,feedback,answers:data.answers,updated};
   return {score,feedback,lessonProgress:Object.values(s.lessonProgress)};
  }
  if(path==='/api/project-review'){
   const project=catalog.bootstrap.academy.projects.find(p=>p.id===data.id);
   if(!project||!Array.isArray(data.checks)||data.checks.length!==project.rubric.length||data.checks.some(c=>typeof c!=='boolean')||typeof data.report!=='string'||data.report.length>20000)throw error('无效项目自评');
   s.projectReviews[data.id]={id:data.id,checks:data.checks,report:data.report,updated};return {saved:true,projectReviews:Object.values(s.projectReviews)};
  }
  throw error('静态课程页未提供此接口',404);
 });
}
window.fetch=async(input,init={})=>{
 const raw=typeof input==='string'?input:input instanceof URL?input.href:input.url;
 let url=new URL(raw,location.href);
 if(url.origin!==location.origin)return nativeFetch(input,init);
 // Existing app uses origin-relative paths; Pages may host at /repository/.
 if(typeof input==='string'&&input.startsWith('/'))url=new URL(input.slice(1),base);
 const pathname=url.pathname.slice(base.pathname.length-1);
 if(pathname.startsWith('/api/project-bundle/'))return nativeFetch(new URL('bundles/'+pathname.split('/').pop()+'.zip',base),init);
 if(!pathname.startsWith('/api/'))return nativeFetch(url,init);
 try{
  const method=init.method||(input instanceof Request?input.method:'GET');
  const body=init.body??(input instanceof Request&&method!=='GET'?await input.clone().text():null);
  return response(await api(url,method,body?JSON.parse(body):{}));
 }catch(e){return response({error:e.message},e.status||500);}
};
