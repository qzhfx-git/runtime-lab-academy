import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {setupRunner} from './judge.mjs';
import {EngineeringService,validateFiles,sanitizerVerdict} from './engineering-service.mjs';
import {engineeringTemplates} from './engineering-templates.mjs';
import {parseMI} from './gdb-service.mjs';
setupRunner();
const files=structuredClone(engineeringTemplates[0].files),service=new EngineeringService();
async function run(mode,source=files,extra={}){const started=await service.handle({op:'start',mode,files:source,...extra});for(let n=0;n<240;n++){const job=await service.handle({op:'job',id:started.id});if(job.done)return job;await delay(500);}throw new Error('test timed out');}
async function paused(){for(let n=0;n<100;n++){const r=await service.handle({op:'inspect',session:service.debug.session});if(r.state==='paused')return r;if(r.state==='exited')throw new Error('GDB exited: '+r.output);await delay(150);}throw new Error('GDB did not pause');}
try{
 assert.equal(sanitizerVerdict([{status:'fail',output:'FATAL: ThreadSanitizer: unexpected memory mapping 0x123'}]),'blocked');
 assert.equal(sanitizerVerdict([{status:'fail',output:'WARNING: ThreadSanitizer: data race'}]),'fail');
 assert.equal(sanitizerVerdict([{status:'fail',output:'FATAL: ThreadSanitizer: unexpected memory mapping'},{status:'fail',output:'heap-use-after-free'}]),'fail');
 assert.deepEqual(parseMI('stack=[frame={level="0",func="main",args=[{name="x",value="7"}]}],a="escaped\\ntext"'),{stack:[{frame:{level:'0',func:'main',args:[{name:'x',value:'7'}]}}],a:'escaped\ntext'});
 for(const name of ['../escape.cpp','C:/x.cpp','src/CON.cpp','src/./x.cpp','src//x.cpp'])assert.throws(()=>validateFiles({'CMakeLists.txt':'x',[name]:'x'}));
 assert.throws(()=>validateFiles({'CMakeLists.txt':'x','A.cpp':'x','a.cpp':'x'}));
 const r=await run('run');assert.equal(r.status,'pass',r.error||r.log);assert.match(r.checks.at(-1).output,/square\(7\) = 49/);console.log('PASS: real multi-file CMake + Ninja build and program output');
 const acceptance=await run('acceptance');assert.ok(['partial','pass'].includes(acceptance.status),acceptance.error||JSON.stringify(acceptance.checks.filter(x=>x.status==='fail')));assert.equal(acceptance.checks.filter(x=>x.testName).length,11);assert.ok(acceptance.checks.some(x=>x.name.startsWith('性能采样')));for(const c of acceptance.checks.filter(x=>/ASan|TSan/.test(x.name)))assert.ok(['blocked','pass'].includes(c.status));console.log('PASS: seven CTest cases, five-repeat engineering checks, honest sanitizer capability and measured performance');
 const broken=structuredClone(files);broken['src/main.cpp']=broken['src/main.cpp'].replace('value * value','value + value');const bad=await run('run',broken);assert.equal(bad.status,'fail');assert.match(bad.checks.at(-1).output,/14/);console.log('PASS: incorrect source fails a real execution');
 const start=await run('debug',files,{breakpoints:[{file:'src/main.cpp',line:5}]});assert.equal(start.status,'pass',start.error||start.log);let d=await paused();assert.equal(d.frame.func,'main');
 await service.handle({op:'debug',session:start.session,action:'continue'});d=await paused();assert.equal(d.frame.func,'square');assert.ok(d.stack.length>=2);assert.ok(d.threads.length>=2);assert.ok(d.variables.some(x=>x.name==='value'&&x.value==='7'));assert.equal(d.frame.file,'src/main.cpp');
 await service.handle({op:'debug',session:start.session,action:'next'});d=await paused();const v=await service.handle({op:'debug',session:start.session,action:'evaluate',expression:'result'});assert.equal(v.value,'49');
 await assert.rejects(()=>service.handle({op:'debug',session:start.session,action:'evaluate',expression:'system("calc")'}));
 await service.handle({op:'debug',session:start.session,action:'frame',frame:1});await service.handle({op:'debug',session:start.session,action:'frame',frame:0});
 await service.handle({op:'debug',session:start.session,action:'out'});await paused();await service.handle({op:'debug',session:start.session,action:'stop'});console.log('PASS: GDB breakpoints, real worker thread, step, stack, locals, watches and stop');
 const faulty=structuredClone(files);faulty['tests/task_pool_test.cpp']=faulty['tests/task_pool_test.cpp'].replace('value.get() == 42','value.get() == 43');const failRun=await run('acceptance',faulty);assert.equal(failRun.status,'fail');assert.ok(failRun.checks.some(x=>x.testName==='pool_functional'&&x.status==='fail'));
 const repro=await run('debug',faulty,{testName:'pool_functional'});assert.equal(repro.status,'pass',repro.error);d=await paused();assert.equal(d.frame.file,'tests/task_pool_test.cpp');await service.handle({op:'debug',session:repro.session,action:'stop'});console.log('PASS: failed CTest case can be rebuilt and launched under GDB');
 const invalid=structuredClone(files);invalid['src/main.cpp']='int main( { broken';assert.equal((await run('build',invalid)).status,'fail');console.log('PASS: compilation errors never report success');
 const looping=structuredClone(files);looping['src/main.cpp']='#include <thread>\n#include <chrono>\nint main(){for(;;) std::this_thread::sleep_for(std::chrono::milliseconds(10));}\n';
 const loop=await run('debug',looping);assert.equal(loop.status,'pass',loop.error);await paused();await service.handle({op:'debug',session:loop.session,action:'continue'});await delay(300);await service.handle({op:'debug',session:loop.session,action:'pause'});await paused();await service.handle({op:'debug',session:loop.session,action:'stop'});console.log('PASS: interrupt and terminate a running program');
 const waiting=service.handle({op:'start',mode:'acceptance',files});const active=await waiting;await assert.rejects(()=>service.handle({op:'start',mode:'run',files}),/正在运行/);await service.handle({op:'cancel',id:active.id});for(let n=0;n<100&&!service.jobs.get(active.id).done;n++)await delay(100);assert.equal(service.jobs.get(active.id).status,'cancelled');console.log('PASS: busy guard and process-tree cancellation');
}finally{service.dispose();}
