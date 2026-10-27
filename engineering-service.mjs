import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {root,compiler,compilerVersion,runProcess,runner} from './judge.mjs';
import {DebugSession} from './gdb-service.mjs';
import {validName,validateFiles} from './workspace-schema.mjs';
export {validName,validateFiles};

export const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const normalized=p=>p.replaceAll('\\','/');
export function sourceHash(files){return createHash('sha256').update(JSON.stringify(Object.entries(files).sort(([a],[b])=>a.localeCompare(b)))).digest('hex');}
function tool(name){const candidates=[process.env['LAB_'+name.toUpperCase()],path.join(path.dirname(compiler),name+'.exe'),...(process.env.PATH||'').split(path.delimiter).map(p=>path.join(p,name+(process.platform==='win32'?'.exe':'')))];return candidates.find(p=>p&&fs.existsSync(p));}
export function toolchainProfiles(){const clang=[process.env.LAB_CLANGXX,tool('clang++'),'C:/Program Files/LLVM/bin/clang++.exe','C:/msys64/clang64/bin/clang++.exe'].find(p=>p&&fs.existsSync(p));const msvc=process.env.LAB_MSVC||tool('cl');return [{id:'gcc',label:process.platform==='linux'?'Linux GCC':'当前 GCC / MinGW',compiler,available:fs.existsSync(compiler)},{id:'clang',label:'Clang',compiler:clang||null,available:!!clang},{id:'msvc',label:'MSVC 开发环境',compiler:msvc||null,available:!!msvc&&fs.existsSync(msvc)},...(process.platform==='win32'?[{id:'linux',label:'Linux GCC / Clang + sanitizers',compiler:null,available:false,external:true,message:'此连接器使用 Windows 执行器。导出工程后用 tools/verify.sh 或附带 CI 在 Linux 执行；本网站尚未运行该平台。'}]:[])];}
const expressionEscape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function sanitizerVerdict(evidence){
 const failures=evidence.filter(x=>x.status!=='pass');
 if(failures.some(x=>!/FATAL: ThreadSanitizer: unexpected memory mapping/.test(x.output)))return 'fail';
 return !evidence.length||failures.length?'blocked':'pass';
}
export class EngineeringService{
 constructor({runtimeDir=path.join(root,'.runtime/engineering')}={}){
  this.parent=path.resolve(runtimeDir);this.root=path.join(this.parent,`${process.pid}-${randomUUID()}`);this.jobs=new Map();this.sessions=new Map();this.active=null;this.debug=null;this.runner=runner;this.disposed=false;
  this.sweep=setInterval(()=>{if(this.debug&&Date.now()-this.debug.used>180000)this.debug.stop('空闲 3 分钟，调试已停止');},30000);this.sweep.unref();
 }
 status(){const tools=Object.fromEntries(['cmake','ctest','ninja','gdb'].map(n=>[n,!!tool(n)]));return {available:tools.cmake&&tools.ctest&&tools.ninja,tools,profiles:toolchainProfiles().map(({compiler,...p})=>p),compiler:compilerVersion,execution:'在当前机器运行 CMake、编译器与 GDB；使用当前账户权限，受进程树、输出和时间限制，非文件/网络隔离沙箱。',debugState:this.debug?.state||null,debugSession:this.debug?.session||null};}
 create(files){
  validateFiles(files);if(this.sessions.size>=4){for(const [id,s]of this.sessions){if(this.active?.session===id||this.debug?.session===id&&this.debug.state!=='exited')continue;this.sessions.delete(id);this.remove(s.dir);break;}}
  if(this.sessions.size>=4)throw fail('工程会话过多',429);
  const id=randomUUID(),dir=path.join(this.root,id),sourceDir=path.join(dir,'src');fs.mkdirSync(sourceDir,{recursive:true});
  for(const [name,code]of Object.entries(files)){const dest=path.join(sourceDir,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,code);}
  let config={};try{config=JSON.parse(files['runtime-lab.json']||'{}');}catch{throw fail('runtime-lab.json 不是有效 JSON');}
  if(config.runTarget&&!/^[A-Za-z_][A-Za-z0-9_-]{0,79}$/.test(config.runTarget))throw fail('无效 runTarget');
  if(config.args&&(!Array.isArray(config.args)||config.args.length>16||config.args.some(a=>typeof a!=='string'||a.length>200||/[\0\r\n]/.test(a))))throw fail('无效程序参数');
  const s={id,dir,sourceDir,files,config,hash:sourceHash(files),tests:[],build:null};this.sessions.set(id,s);return s;
 }
 remove(dir){if(path.dirname(dir)===this.root)try{fs.rmSync(dir,{recursive:true,force:true});}catch{}}
 async process(job,file,args,timeout=120000){
  if(job.controller.signal.aborted)throw fail('任务已取消',499);
  const r=await runProcess(this.runner,['--engineering',file,...args],{cwd:this.root,timeout,signal:job.controller.signal,maxOutput:262144});
  job.log=(job.log+'\n$ '+path.basename(file)+' '+args.join(' ')+'\n'+(args.includes('--show-only=json-v1')?'':r.stdout)+r.stderr).slice(-180000);
  if(job.controller.signal.aborted)throw fail('任务已取消',499);return r;
 }
 async build(s,job,flavor='debug',extra='',profile=toolchainProfiles().find(p=>p.id===(job.profile||'gcc'))){
  job.stage='配置 '+flavor;const build=path.join(s.dir,'build-'+flavor);
  if(!profile?.available)throw fail('此工具链不可用，请先安装或切回当前 GCC',503);
  const flags=(profile.id==='msvc'?'/W4 /Zi /Od':'-Wall -Wextra -Wpedantic -g -O0')+' '+extra;
  const configure=await this.process(job,tool('cmake'),['-S',s.sourceDir,'-B',build,'-G','Ninja','-DCMAKE_MAKE_PROGRAM='+normalized(tool('ninja')),'-DCMAKE_CXX_COMPILER='+normalized(profile.compiler),'-DCMAKE_BUILD_TYPE=Debug','-DCMAKE_EXPORT_COMPILE_COMMANDS=ON','-DCMAKE_CXX_FLAGS='+flags]);
  if(configure.code!==0||configure.reason)return {ok:false,build,output:configure.stdout+configure.stderr,reason:configure.reason||'CMake 配置失败'};
  job.stage='构建 '+flavor;const result=await this.process(job,tool('cmake'),['--build',build,'--parallel','2']);
  return {ok:result.code===0&&!result.reason,build,output:result.stdout+result.stderr,flags,reason:result.reason||''};
 }
 async discover(s,job,build){
  const r=await this.process(job,tool('ctest'),['--test-dir',build,'--show-only=json-v1']);if(r.code!==0)throw fail('CTest 无法枚举测试',422);
  let parsed;try{parsed=JSON.parse(r.stdout);}catch{throw fail('CTest 返回无效的测试列表',422);}
  const tests=(parsed.tests||[]).slice(0,80).map(t=>({name:t.name,command:t.command,labels:t.properties?.find(p=>p.name==='LABELS')?.value||[]}));
  job.log+='已发现 '+tests.length+' 个 CTest 用例：'+tests.map(t=>t.name).join(', ')+'\n';
  return tests;
 }
 async test(s,job,build,test,repeat=1){
  job.stage='验收 · '+test.name+(repeat>1?' × '+repeat:'');
  const args=['--test-dir',build,'--no-tests=error','--timeout','8','-R','^'+expressionEscape(test.name)+'$','-V'];if(repeat>1)args.push('--repeat','until-fail:'+repeat);
  const r=await this.process(job,tool('ctest'),args,Math.min(120000,repeat*12000+5000));return {name:test.name,labels:test.labels,status:r.code===0&&!r.reason?'pass':'fail',ms:r.ms,repeat,output:(r.stdout+r.stderr).slice(-24000),reason:r.reason,command:test.command};
 }
 binary(s,build){const target=s.config.runTarget||'runtime_demo';const file=path.join(build,target+(process.platform==='win32'?'.exe':''));if(!fs.existsSync(file))throw fail('未找到运行目标 '+target+'；请在 runtime-lab.json 设置 CMake 可执行目标名',422);return file;}
 async probe(job,kind){
  const dir=path.join(this.root,'probe-'+kind);fs.mkdirSync(dir,{recursive:true});const source=path.join(dir,'probe.cpp'),binary=path.join(dir,'probe.exe');fs.writeFileSync(source,'#include <thread>\nint main(){std::thread t([]{});t.join();return 0;}\n');
  const flag=kind==='address'?'address,undefined':'thread';const compile=await this.process(job,compiler,['-std=c++20','-pthread','-fsanitize='+flag,'-fno-omit-frame-pointer',source,'-o',binary],30000);
  if(compile.code!==0||compile.reason)return {available:false,detail:(compile.stderr+compile.stdout).slice(-8000)};
  const run=await this.process(job,binary,['probe'],10000);return {available:run.code===0&&!run.reason,detail:(run.stderr+run.stdout).slice(-8000)};
 }
 launch(data){
  if(!['build','run','acceptance','debug','matrix'].includes(data.mode))throw fail('无效工程操作');
  const profile=data.profile||'gcc';if(!['gcc','clang','msvc'].includes(profile))throw fail('无效本机工具链');
  if(data.mode!=='matrix'&&!toolchainProfiles().find(p=>p.id===profile)?.available)throw fail('所选工具链未安装或未在开发环境中启动',503);
  if(data.mode==='debug'&&profile!=='gcc')throw fail('当前 GDB 调试使用 GCC / MinGW 的调试符号，请选择当前 GCC。其他工具链可构建和验收。');
  if(this.active)throw fail('工程任务正在运行，请等待或取消',409);
  if(this.debug&&this.debug.state!=='exited')throw fail('请先停止当前调试会话',409);
  if(!this.status().available)throw fail('需要安装 CMake、Ninja、GCC。请查看工程环境教程。',503);
  if(data.mode==='debug'&&!tool('gdb'))throw fail('未安装 GDB，请查看环境教程',503);
  const s=this.create(data.files),job={id:randomUUID(),session:s.id,mode:data.mode,profile,hash:s.hash,stage:'准备快照',done:false,created:new Date().toISOString(),log:'',checks:[],controller:new AbortController()};this.jobs.set(job.id,job);this.active=job;
  for(const [id,j]of this.jobs)if(this.jobs.size>12&&j.done)this.jobs.delete(id);
  this.execute(s,job,data).catch(e=>{job.error=e.message;job.status=job.controller.signal.aborted?'cancelled':'fail';}).finally(()=>{job.done=true;job.stage=job.status==='cancelled'?'已取消':'已完成';this.active=null;});return {id:job.id,session:s.id,hash:s.hash};
 }
 async execute(s,job,data){
  if(data.mode==='matrix'){
   for(const p of toolchainProfiles()){
    if(!p.available){job.checks.push({name:p.label,status:'blocked',output:p.message||'工具链未安装或环境未配置。本项未执行。'});continue;}
    const b=await this.build(s,job,'matrix-'+p.id,'',p);if(!b.ok){job.checks.push({name:p.label,status:'fail',output:b.output});continue;}
    const r=await this.process(job,tool('ctest'),['--test-dir',b.build,'--output-on-failure','--no-tests=error','--timeout','8']);job.checks.push({name:p.label,status:r.code===0&&!r.reason?'pass':'fail',output:b.output+'\n'+r.stdout+r.stderr,ms:r.ms});
   }
   job.status=job.checks.some(c=>c.status==='fail')?'fail':job.checks.some(c=>c.status==='blocked')?'partial':'pass';job.note='只记录实际可用工具链的构建和 CTest 结果。导出包中的 Linux / MSVC CI 配置不代表已经执行。';return;
  }
  const build=await this.build(s,job);s.build=build.build;job.checks.push({name:'CMake Debug 构建',status:build.ok?'pass':'fail',output:build.output,flags:build.flags});
  if(!build.ok){job.status='fail';return;}
  const warnings=(build.output.match(/warning:/g)||[]).length;job.checks.push({name:'编译器警告',status:warnings?'warning':'pass',output:warnings?`${warnings} 条警告。详见构建日志。`:'本次编译未报告警告。'});
  s.tests=await this.discover(s,job,s.build);job.tests=s.tests.map(({command,...t})=>t);
  if(data.mode==='build'){job.status='pass';return;}
  if(data.mode==='run'){
   job.stage='运行演示程序';const r=await this.process(job,this.binary(s,s.build),s.config.args||[],10000);job.checks.push({name:'程序运行',status:r.code===0&&!r.reason?'pass':'fail',output:r.stdout+r.stderr,ms:r.ms,exitCode:r.code,reason:r.reason});job.status=r.code===0&&!r.reason?'pass':'fail';return;
  }
  if(data.mode==='debug'){
   let binary=this.binary(s,s.build),args=s.config.args||[];
   if(data.testName){const test=s.tests.find(t=>t.name===data.testName);if(!test?.command?.length)throw fail('调试用例不存在');[binary,...args]=test.command;if(!path.resolve(binary).startsWith(path.resolve(s.build)+path.sep)||!fs.existsSync(binary))throw fail('仅可调试构建目录内的可执行测试');}
   this.debug=new DebugSession({gdb:tool('gdb'),runner:this.runner,compiler,dir:s.build,sourceDir:s.sourceDir,files:s.files,binary,args});this.debug.session=s.id;
   try{await this.debug.start(data.breakpoints||[]);if(job.controller.signal.aborted){this.debug.stop();throw fail('任务已取消',499);}job.status='pass';job.debug=true;}catch(e){this.debug.stop();throw e;}return;
  }
  if(!s.tests.length){job.checks.push({name:'功能测试',status:'blocked',output:'工程没有注册 CTest 用例。请在 CMakeLists.txt 中调用 enable_testing() / add_test()。'});}
  for(const t of s.tests)job.checks.push({...await this.test(s,job,s.build,t),testName:t.name});
  const stress=s.tests.filter(t=>t.labels.some(l=>['concurrent','drain','lifetime','exception'].includes(l)));
  if(stress.length){for(const t of stress)job.checks.push({...await this.test(s,job,s.build,t,5),name:'重复验证 · '+t.name,testName:t.name});}
  else job.checks.push({name:'并发 / 生命周期重复验证',status:'blocked',output:'未注册 concurrent、drain、lifetime 或 exception 标签的 CTest 测试。'});
  job.stage='探测动态检测工具';
  for(const kind of ['address','thread']){
   if(job.profile!=='gcc'){job.checks.push({name:kind==='address'?'ASan + UBSan':'TSan',status:'blocked',output:'当前动态检测探针面向 GCC / MinGW。请切回 GCC，或在导出的 Linux 工程中运行对应检测脚本。'});continue;}
   const name=kind==='address'?'ASan + UBSan 内存 / 未定义行为检测':'TSan 数据竞争检测';const probe=await this.probe(job,kind);
   if(!probe.available){job.checks.push({name,status:'blocked',output:'当前工具链无法编译或运行此检测。未执行，不计为通过。\n'+probe.detail});continue;}
   const flags='-fsanitize='+(kind==='address'?'address,undefined':'thread')+' -fno-omit-frame-pointer';const b=await this.build(s,job,kind,flags);
   if(!b.ok){job.checks.push({name,status:'fail',output:b.output});continue;}
   const tests=await this.discover(s,job,b.build);const evidence=[];for(const t of tests)evidence.push(await this.test(s,job,b.build,t));
   const status=sanitizerVerdict(evidence);
   job.checks.push({name,status,output:(status==='blocked'?'检测未能完成；请查看环境诊断，本项不计为通过。\n':'')+evidence.map(x=>x.output).join('\n').slice(-40000),tests:evidence});
  }
  const bench=s.tests.find(t=>t.labels.includes('benchmark'));
  if(bench){const samples=[];for(let n=0;n<3;n++)samples.push(await this.test(s,job,s.build,bench));const times=samples.map(x=>x.ms).sort((a,b)=>a-b);job.checks.push({name:'性能采样 · 3 次',status:samples.every(x=>x.status==='pass')?'info':'fail',output:`进程级墙钟时间：${samples.map(x=>x.ms).join(', ')} ms；中位数 ${times[1]} ms。包含 CTest/进程启动开销，无性能合格线。程序内部计时见下方；Debug 结果不可代替 Release 基准。\n`+samples.map(x=>x.output).join('\n'),samples:times});}
  else job.checks.push({name:'性能采样',status:'blocked',output:'没有 benchmark 标签的测试，尚无性能证据。'});
  job.status=job.checks.some(x=>x.status==='fail')?'fail':job.checks.some(x=>x.status==='blocked')?'partial':job.checks.some(x=>x.status==='warning')?'warning':'pass';
  job.note='证据绑定本次源码 SHA-256。测试只能覆盖已编写的断言；重复通过不证明无线程竞争，工具缺失不算通过。测试源可编辑，报告不是防篡改认证。';
 }
 async handle(data){
  if(!data||typeof data!=='object')throw fail('无效请求');
  if(data.op==='status')return this.status();
  if(data.op==='start')return this.launch(data);
  if(data.op==='job'){const j=this.jobs.get(data.id);if(!j)throw fail('任务已过期',410);const {controller,...view}=j;return view;}
  if(data.op==='cancel'){const j=this.jobs.get(data.id);if(j&&!j.done)j.controller.abort();return {cancelled:!!j&&!j.done};}
  if(data.op==='debug'||data.op==='inspect'){if(!this.debug)throw fail('没有调试会话',410);if(data.session!==this.debug.session)throw fail('调试快照不匹配，请重新开始',409);return data.op==='inspect'?this.debug.inspect():this.debug.action(data);}
  throw fail('未知工程操作');
 }
 dispose(){this.disposed=true;clearInterval(this.sweep);this.active?.controller.abort();this.debug?.stop();if(path.dirname(this.root)===this.parent&&/^\d+-[a-f0-9-]+$/.test(path.basename(this.root)))try{fs.rmSync(this.root,{recursive:true,force:true});}catch{}}
}
