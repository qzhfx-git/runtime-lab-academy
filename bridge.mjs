import http from 'node:http';
import fs from 'node:fs';
import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {judge,setupRunner,compilerVersion,compiler,fixture} from './judge.mjs';
import {LanguageService} from './language-service.mjs';
import {EngineeringService} from './engineering-service.mjs';
const data=JSON.parse(fs.readFileSync(new URL('./bridge-data.json',import.meta.url),'utf8'));
const exercises=new Map(data.exercises.map(e=>[e.id,e]));
const language=new LanguageService({exercises,fixture,compiler});
const engineering=new EngineeringService();
process.on('exit',()=>engineering.dispose());
process.on('exit',()=>language.dispose());
setupRunner();
const origin=process.env.LAB_SITE_ORIGIN||'https://qzhfx.dainty-ridge-8852.chatgpt.site';
if(new URL(origin).origin!==origin||!(origin.startsWith('https://')||origin.startsWith('http://127.0.0.1:')))throw new Error('LAB_SITE_ORIGIN 必须为网站的准确来源地址');
const port=Number(process.env.LAB_BRIDGE_PORT||3211),host='127.0.0.1:'+port;
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid LAB_BRIDGE_PORT');
let pairCode=randomBytes(12).toString('hex'),session='',active=null;
const jobs=new Map();
const equal=(a,b)=>typeof a==='string'&&a.length===b.length&&!!b&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const server=http.createServer(async(req,res)=>{
 const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
 try{
  if(req.headers.host!==host)return send(403,{error:'无效 Host'});
  if(req.headers.origin!==origin)return send(403,{error:'此连接器只允许配置的网站来源'});
  res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');
  if(req.method==='OPTIONS'){
   res.setHeader('Access-Control-Allow-Methods','GET, POST');res.setHeader('Access-Control-Allow-Headers','Content-Type, X-Lab-Bridge');res.setHeader('Access-Control-Allow-Private-Network','true');res.writeHead(204);res.end();return;
  }
  const url=new URL(req.url,'http://'+host);let body={};
  if(req.method==='POST'){let text='';for await(const chunk of req){text+=chunk;if(text.length>1500000)return send(413,{error:'请求过大'});}try{body=JSON.parse(text);}catch{return send(400,{error:'无效 JSON'});}}
  if(req.method==='POST'&&url.pathname==='/pair'){
   if(!equal(body.code,pairCode))return send(403,{error:'配对码无效或已使用，请重启连接器获取新码'});
   session=randomBytes(32).toString('hex');pairCode='';return send(200,{token:session,compiler:compilerVersion,version:data.version,features:['engineering','studies-v1','matrix-v1']});
  }
  if(!equal(req.headers['x-lab-bridge'],session))return send(403,{error:'请先配对本机连接器'});
  if(req.method==='POST'&&url.pathname==='/language')return send(200,await language.handle(body));
  if(req.method==='POST'&&url.pathname==='/engineering')return send(200,await engineering.handle(body));
  if(req.method==='GET'&&url.pathname==='/health')return send(200,{compiler:compilerVersion,version:data.version,activeJob:active?.id||null});
  if(req.method==='POST'&&url.pathname==='/jobs'){
   const e=exercises.get(body.exerciseId);if(!e||typeof body.code!=='string'||body.code.length>50000||!['run','submit'].includes(body.mode))return send(400,{error:'无效提交'});
   if(active)return send(409,{error:'本机已有运行任务，请等待或取消'});
   const controller=new AbortController(),id=randomUUID(),job={id,exerciseId:e.id,mode:body.mode,done:false,stage:'queued',total:body.mode==='run'?1:e.tests.length,controller};jobs.set(id,job);active=job;send(202,{id});
   try{job.result={...await judge(e,body.code,body.mode,{signal:controller.signal,onStage:(stage,index)=>{job.stage=stage;job.testIndex=index;}}),provider:'local'};}
   catch(error){job.result={status:'IE',tests:[],mode:body.mode,provider:'local',error:error.message};}
   finally{job.done=true;job.stage='done';active=null;for(const [key,v]of jobs)if(jobs.size>30&&v.done&&key!==id)jobs.delete(key);}return;
  }
  if(req.method==='GET'&&url.pathname.startsWith('/jobs/')){const job=jobs.get(url.pathname.slice(6));if(!job)return send(404,{error:'任务不存在'});const{controller,...value}=job;return send(200,value);}
  if(req.method==='POST'&&url.pathname==='/cancel'){jobs.get(body.id)?.controller.abort();return send(200,{cancelled:true});}
  return send(404,{error:'接口不存在'});
 }catch(error){if(!res.headersSent)send(error.status||500,{error:error.message});else res.end();}
});
server.listen(port,'127.0.0.1',()=>console.log('Runtime Lab 本机连接器\n允许网站：'+origin+'\n编译器：'+compilerVersion+'\n配对码：'+pairCode+'\n在网站「评测设置」中输入此码。代码以当前账户权限运行，仅运行自己信任的练习。关闭此窗口即可停止。'));
server.on('error',e=>{console.error(e.message);process.exitCode=1;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{active?.controller.abort();server.close(()=>process.exit(0));});
