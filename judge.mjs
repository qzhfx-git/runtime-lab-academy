import {spawn,spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';

export const root=path.dirname(fileURLToPath(import.meta.url));
const runtime=path.join(root,'.runtime');
fs.mkdirSync(runtime,{recursive:true});
export const runner=path.join(runtime,process.platform==='win32'?'Runner.exe':'runner-linux');
const runnerSource=path.join(root,'native',process.platform==='win32'?'Runner.cs':'RunnerLinux.cpp');
export const compiler=process.env.CPP_COMPILER || (process.platform==='win32'?'C:\\msys64\\ucrt64\\bin\\g++.exe':'/usr/bin/g++');
const env={...process.env,PATH:path.dirname(compiler)+path.delimiter+process.env.PATH};
const version=spawnSync(compiler,['--version'],{encoding:'utf8',windowsHide:true,env,timeout:5000});
export const compilerVersion=version.status===0?version.stdout.split(/\r?\n/)[0]:'编译器不可用';
export function setupRunner(){
  if(!['win32','linux'].includes(process.platform))throw new Error('执行器支持 Windows 与 Linux。');
  if(version.status!==0)throw new Error('未找到 g++，请设置 CPP_COMPILER。');
  if(process.platform==='linux'){
    if(!fs.existsSync(runner)||fs.statSync(runner).mtimeMs<fs.statSync(runnerSource).mtimeMs){
      const result=spawnSync(compiler,['-std=c++20','-O2','-Wall','-Wextra',runnerSource,'-o',runner],{encoding:'utf8',timeout:30000,env});
      if(result.status!==0)throw new Error('Linux 执行器构建失败：'+result.stdout+result.stderr);
    }
    return;
  }
  if(!fs.existsSync(runner)||fs.statSync(runner).mtimeMs<fs.statSync(runnerSource).mtimeMs){
    const csc='C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
    const result=spawnSync(csc,['/nologo','/optimize+','/out:'+runner,runnerSource],{encoding:'utf8',windowsHide:true,timeout:20000});
    if(result.status!==0)throw new Error('执行器构建失败：'+result.stdout+result.stderr);
  }
}
export const fixture=String.raw`#pragma once
#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <limits>
#include <memory>
#include <new>
#include <stdexcept>
#include <string>
#include <type_traits>
#include <utility>
#include <vector>
struct Player {
    inline static int alive = 0;
    int hp;
    explicit Player(int h=100) : hp(h) { ++alive; }
    ~Player() { --alive; }
    Player(const Player&) = delete;
    Player& operator=(const Player&) = delete;
};
struct Widget {
    inline static int alive = 0;
    int value;
    explicit Widget(int v) : value(v) { ++alive; }
    ~Widget() { --alive; }
};
`;
function harness(exercise){
  return '#include "fixture.hpp"\n'+(exercise.preamble||'')+'\n#include "solution.hpp"\nint main(int argc,char**argv){\ntry{\nif(argc!=2)return 2;\nint n=std::stoi(argv[1]);\nswitch(n){\n'+exercise.tests.map((t,i)=>'case '+i+': {'+t.body+' break;}').join('\n')+'\ndefault:return 2;\n}\n}catch(const std::exception&ex){std::cerr<<"Unhandled exception: "<<ex.what();return 70;}\n}\n';
}
export function runProcess(file,args,{cwd,timeout=2200,signal,maxOutput=65536}={}){
  return new Promise(resolve=>{
    const started=Date.now();
    let stdout='',stderr='',bytes=0,reason='',settled=false;
    if(signal?.aborted)return resolve({code:null,stdout,stderr,reason:'cancelled',ms:0});
    const child=spawn(file,args,{cwd,env,windowsHide:true,stdio:['pipe','pipe','pipe']});
    child.stdin.on('error',()=>{}); child.stdin.end();
    function stop(why){
      if(reason)return;
      reason=why;
      if(child.pid) {
        // Closing the runner's job kills the complete compiler/program family.
        child.kill();
      }
    }
    const timer=setTimeout(()=>stop('timeout'),timeout);
    const aborted=()=>stop('cancelled');
    signal?.addEventListener('abort',aborted,{once:true});
    function finish(code,error){
      if(settled)return;settled=true;
      clearTimeout(timer);signal?.removeEventListener('abort',aborted);
      resolve({code,stdout,stderr:stderr+(error?String(error):''),reason,ms:Date.now()-started});
    }
    child.on('error',err=>finish(null,err.message));
    for(const [stream,key]of [[child.stdout,'out'],[child.stderr,'err']]){
      stream.setEncoding('utf8');
      stream.on('data',chunk=>{
        bytes+=Buffer.byteLength(chunk);
        if(key==='out')stdout=(stdout+chunk).slice(0,maxOutput);
        else stderr=(stderr+chunk).slice(0,maxOutput);
        if(bytes>maxOutput)stop('output-limit');
      });
    }
    child.on('close',code=>finish(code));
  });
}
const normalize=s=>s.replace(/\r\n/g,'\n').trim().replace(/[ \t]+$/gm,'');
export async function judge(exercise,code,mode,{signal,onStage=()=>{}}={}){
  const dir=path.join(runtime,'job-'+randomUUID());fs.mkdirSync(dir);
  const flags=['-std=c++20','-O0','-g','-Wall','-Wextra','-Wpedantic','-pthread',...(process.platform==='win32'?['-static']:[])];
  const result={status:'IE',tests:[],compileOutput:'',compileMs:0,mode,standard:'C++20',compiler:compilerVersion,limits:{wallMs:2200,cpuMs:2000,memoryMiB:128,outputKiB:64,...(process.platform==='win32'?{childProcesses:0}:{memoryKind:'virtual-address-space'})},flags:flags.join(' ')};
  try{
    fs.writeFileSync(path.join(dir,'fixture.hpp'),fixture);
    fs.writeFileSync(path.join(dir,'solution.hpp'),code);
    fs.writeFileSync(path.join(dir,'main.cpp'),harness(exercise));
    onStage('compiling',0);
    const binary=path.join(dir,process.platform==='win32'?'program.exe':'program');
    const compile=await runProcess(runner,['--compile',compiler,...flags,path.join(dir,'main.cpp'),'-o',binary],{cwd:dir,timeout:28000,signal,maxOutput:65536});
    if(exercise.evaluationNote)result.evaluationNote=exercise.evaluationNote;
    result.compileMs=compile.ms;result.compileOutput=(compile.stderr+compile.stdout).replaceAll(dir,'<submission>');
    if(compile.reason==='cancelled'){result.status='CANCELLED';return result;}
    if(compile.reason||compile.code!==0){result.status=compile.reason==='timeout'||compile.code===124?'CTLE':compile.code===125?'IE':'CE';return result;}
    const count=mode==='run'?1:exercise.tests.length;
    for(let i=0;i<count;i++){
      if(signal?.aborted){result.status='CANCELLED';return result;}
      onStage('running',i+1);
      // Allow Windows/CLR startup separately; Runner starts the 2.2 s program clock after resume.
      const actual=await runProcess(runner,[binary,String(i)],{cwd:dir,timeout:8000,signal});
      let status='PASS';
      if(actual.reason==='cancelled'){result.status='CANCELLED';return result;}
      if(actual.reason==='timeout'){status='IE';actual.stderr+='执行器启动或回收超时，请重试；这不代表你的程序超过运行时限。';}
      else if(actual.code===124)status='TLE';
      else if(actual.reason==='output-limit')status='OLE';
      else if(actual.code===125)status='IE';
      else if(actual.code!==0)status='RE';
      else if(normalize(actual.stdout)!==normalize(exercise.tests[i].expected))status='WA';
      result.tests.push({name:exercise.tests[i].name,status,actual:actual.stdout,expected:exercise.tests[i].expected,stderr:actual.stderr,ms:actual.ms,exitCode:actual.code,explanation:exercise.tests[i].explanation,body:exercise.tests[i].body});
      if(['TLE','OLE','IE'].includes(status))break;
    }
    const failure=result.tests.find(t=>t.status!=='PASS');
    result.status=failure?failure.status:(mode==='run'?'SAMPLE_PASS':'AC');
    return result;
  }catch(err){result.status='IE';result.error=err.message;return result;}
  finally{
    // Only delete this unique, generated job directory under our runtime root.
    const resolved=path.resolve(dir);
    if(resolved.startsWith(path.resolve(runtime)+path.sep)&&path.basename(resolved).startsWith('job-'))
      try{fs.rmSync(resolved,{recursive:true,force:true,maxRetries:3,retryDelay:100});}catch{}
  }
}

