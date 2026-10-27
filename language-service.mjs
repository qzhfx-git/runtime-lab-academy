import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {validateFiles} from './engineering-service.mjs';

const appRoot=path.dirname(fileURLToPath(import.meta.url));
const failure=(message,status=400)=>Object.assign(new Error(message),{status});
const normalize=p=>path.resolve(p).replaceAll('\\','/');
export function findClangd(){
  const candidates=[process.env.LAB_CLANGD,
    path.join(appRoot,'.runtime/tools/clangd_23.1.0/bin/clangd.exe'),
    'C:/msys64/ucrt64/bin/clangd.exe','C:/msys64/clang64/bin/clangd.exe',
    'C:/Program Files/LLVM/bin/clangd.exe',
    ...(process.env.PATH||'').split(path.delimiter).map(dir=>path.join(dir,process.platform==='win32'?'clangd.exe':'clangd'))];
  return candidates.find(p=>p&&fs.existsSync(p))||null;
}

// The browser gets a narrow, authenticated document API, never arbitrary LSP or paths.
export class LanguageService {
  constructor({exercises,fixture,compiler,runtimeDir=path.join(appRoot,'.runtime/language')}){
    this.exercises=exercises;this.fixture=fixture;this.compiler=normalize(compiler);
    this.runtimeDir=path.resolve(runtimeDir);this.root=path.join(this.runtimeDir,`${process.pid}-${randomUUID()}`);
    this.documents=new Map();this.pending=new Map();this.nextId=0;this.child=null;this.starting=null;this.disposed=false;
    this.sweep=setInterval(()=>{for(const doc of this.documents.values())if(Date.now()-doc.used>180000)this.close(doc.id);if(!this.documents.size&&this.child&&Date.now()-this.startedAt>30000)this.stop();},30000);this.sweep.unref();
  }
  status(){return {available:!!findClangd(),engine:'clangd',standard:'C++20',message:findClangd()?'本机 C++ 类型分析已就绪':'未安装 clangd：运行 install-language-tools.ps1，或设置 LAB_CLANGD 后重试'};}
  async start(){
    if(this.disposed)throw failure('语言服务已关闭',503);
    if(this.starting)return this.starting;
    this.starting=this.initialize().catch(error=>{this.stop();throw error;});
    return this.starting;
  }
  async initialize(){
    const executable=findClangd();if(!executable)throw failure(this.status().message,503);
    fs.mkdirSync(this.root,{recursive:true});
    const child=spawn(executable,['--background-index=false','--clang-tidy=false','--enable-config=false','--header-insertion=never','--completion-style=detailed','--function-arg-placeholders=true','--limit-results=80','--pch-storage=memory','-j=2','--log=error','--query-driver='+this.compiler],{cwd:this.root,windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PATH:path.dirname(this.compiler)+path.delimiter+process.env.PATH}});
    this.child=child;this.startedAt=Date.now();let buffer=Buffer.alloc(0);
    const failed=()=>{if(this.child===child)this.stop();};
    child.on('error',failed);child.on('exit',failed);child.stdin.on('error',failed);
    child.stderr.on('data',()=>{});
    child.stdout.on('data',chunk=>{
      buffer=Buffer.concat([buffer,chunk]);
      if(buffer.length>16*1024*1024){failed();return;}
      while(buffer.length){
        const end=buffer.indexOf('\r\n\r\n');if(end<0)return;
        const match=/Content-Length:\s*(\d+)/i.exec(buffer.subarray(0,end).toString());if(!match){failed();return;}
        const length=Number(match[1]);if(buffer.length<end+4+length)return;
        const payload=buffer.subarray(end+4,end+4+length);buffer=buffer.subarray(end+4+length);
        try{this.message(JSON.parse(payload.toString('utf8')));}catch{failed();return;}
      }
    });
    await this.rpc('initialize',{processId:process.pid,rootUri:pathToFileURL(this.root).href,capabilities:{general:{positionEncodings:['utf-16']},offsetEncoding:['utf-16'],textDocument:{completion:{completionItem:{snippetSupport:true,insertReplaceSupport:true,labelDetailsSupport:true,documentationFormat:['plaintext']}},hover:{contentFormat:['plaintext']},signatureHelp:{signatureInformation:{documentationFormat:['plaintext'],parameterInformation:{labelOffsetSupport:true},activeParameterSupport:true}},publishDiagnostics:{versionSupport:true}}},initializationOptions:{clangdFileStatus:false}},20000);
    this.notify('initialized',{});
  }
  write(message){if(!this.child||!this.child.stdin.writable)throw failure('clangd 连接已断开，请重连',503);const bytes=Buffer.from(JSON.stringify({jsonrpc:'2.0',...message}));this.child.stdin.write(Buffer.concat([Buffer.from(`Content-Length: ${bytes.length}\r\n\r\n`),bytes]));}
  notify(method,params){this.write({method,params});}
  rpc(method,params,timeout=10000){return new Promise((resolve,reject)=>{
    const id=++this.nextId,timer=setTimeout(()=>{this.pending.delete(id);try{this.notify('$/cancelRequest',{id});}catch{}reject(failure('语言分析超时，请重试',504));},timeout);
    this.pending.set(id,{resolve,reject,timer});try{this.write({id,method,params});}catch(e){clearTimeout(timer);this.pending.delete(id);reject(e);}
  });}
  message(message){
    if(message.method==='textDocument/publishDiagnostics'){
      const doc=[...this.documents.values()].find(d=>d.uri===message.params.uri);if(!doc)return;
      const version=message.params.version;if(version!==doc.version)return;
      doc.diagnostics=(message.params.diagnostics||[]).slice(0,150);doc.diagnosticVersion=version;
      for(const wake of doc.waiters)wake();doc.waiters.clear();return;
    }
    if(message.method&&message.id!==undefined){this.write({id:message.id,result:message.method==='workspace/configuration'?[]:null});return;}
    const pending=this.pending.get(message.id);if(!pending)return;this.pending.delete(message.id);clearTimeout(pending.timer);
    if(message.error)pending.reject(failure(message.error.message||'语言请求已取消',message.error.code===-32801?409:503));else pending.resolve(message.result);
  }
  validateDocument(data){if(typeof data.code!=='string'||data.code.length>50000||!Number.isSafeInteger(data.version)||data.version<1)throw failure('无效文档或版本');}
  async open(data){
    this.validateDocument(data);const project=data.files?validateFiles(data.files):null;
    const exercise=project?null:this.exercises.get(data.exerciseId);if(!project&&!exercise)throw failure('练习不存在',404);
    if(project&&(!Object.hasOwn(project,data.file)||! /\.(cpp|cc|cxx|h|hpp|hxx)$/.test(data.file)))throw failure('无效工程文档');
    if(this.documents.size>=8)throw failure('打开的编辑器过多，请关闭其他练习页后重试',429);
    await this.start();
    if(this.documents.size>=8)throw failure('打开的编辑器过多，请关闭其他练习页后重试',429);
    const id=randomUUID(),dir=path.join(this.root,id),file=path.join(dir,project?data.file:'solution.cpp');fs.mkdirSync(dir,{recursive:true});
    // Force-include exactly the exercise's supplied context. No added lines in the editor document.
    const related=[];
    if(project){for(const [name,code]of Object.entries(project)){const dest=path.join(dir,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,code);if(name!==data.file&&/\.(cpp|cc|cxx|h|hpp|hxx)$/.test(name))related.push({name,uri:pathToFileURL(dest).href,code});}}
    else {fs.writeFileSync(path.join(dir,'provided.hpp'),this.fixture+'\n'+(exercise.preamble||''));fs.writeFileSync(file,'');}
    const args=[this.compiler,'-std=c++20','-pthread','-Wall','-Wextra','-Wpedantic','-fsyntax-only',...(project?['-I',normalize(dir),'-I',normalize(path.join(dir,'include')),'-I',normalize(path.join(dir,'src'))]:['-include',normalize(path.join(dir,'provided.hpp'))])];
    const sources=project?Object.keys(project).filter(n=>/\.(cpp|cc|cxx)$/.test(n)).map(n=>path.join(dir,n)):[file];
    fs.writeFileSync(path.join(dir,'compile_commands.json'),JSON.stringify(sources.map(f=>({directory:normalize(dir),file:normalize(f),arguments:[...args,normalize(f)]}))));
    const doc={id,dir,related,project:!!project,files:project,file:data.file,uri:pathToFileURL(file).href,code:data.code,version:data.version,diagnosticVersion:0,diagnostics:[],used:Date.now(),waiters:new Set()};this.documents.set(id,doc);
    for(const other of related)this.notify('textDocument/didOpen',{textDocument:{uri:other.uri,languageId:'cpp',version:1,text:other.code}});
    this.notify('textDocument/didOpen',{textDocument:{uri:doc.uri,languageId:'cpp',version:doc.version,text:doc.code}});
    // clangd may return lexical fallback completions before its first AST is ready.
    if(doc.diagnosticVersion!==doc.version)await new Promise(resolve=>{let timer;const wake=()=>{clearTimeout(timer);doc.waiters.delete(wake);resolve();};doc.waiters.add(wake);timer=setTimeout(wake,8000);});
    return {session:id,version:doc.version,engine:'clangd'};
  }
  update(doc,data){
    this.validateDocument(data);doc.used=Date.now();
    if(data.version<doc.version||(data.version===doc.version&&data.code!==doc.code))throw failure('文档已更新，忽略旧分析请求',409);
    if(data.version>doc.version){doc.code=data.code;doc.version=data.version;doc.diagnostics=[];
      this.notify('textDocument/didChange',{textDocument:{uri:doc.uri,version:doc.version},contentChanges:[{text:doc.code}]});
      for(const wake of doc.waiters)wake();doc.waiters.clear();
    }
  }
  async handle(data){
    if(!data||typeof data!=='object')throw failure('无效语言服务请求');
    if(data.op==='status')return this.status();
    if(data.op==='open')return this.open(data);
    const doc=this.documents.get(data.session);if(!doc)throw failure('编辑器会话已过期，请重连',410);
    if(data.op==='close'){this.close(doc.id);return {closed:true};}
    if(!['diagnostics','completion','signature','hover','definition','references','rename'].includes(data.op))throw failure('不支持的语言操作');
    this.update(doc,data);
    if(data.op==='diagnostics'){
      if(doc.diagnosticVersion!==data.version)await new Promise(resolve=>{let timer;const wake=()=>{clearTimeout(timer);doc.waiters.delete(wake);resolve();};doc.waiters.add(wake);timer=setTimeout(wake,1800);});
      return {version:data.version,pending:doc.diagnosticVersion!==data.version,diagnostics:doc.diagnosticVersion===data.version?doc.diagnostics:[]};
    }
    const p=data.position,lines=doc.code.split('\n');
    if(!p||!Number.isInteger(p.line)||!Number.isInteger(p.character)||p.line<0||p.line>=lines.length||p.character<0||p.character>lines[p.line].length)throw failure('无效光标位置');
    if(data.op==='rename'&&(!/^[A-Za-z_]\w{0,79}$/.test(data.newName||'')))throw failure('新名称必须是 C++ 标识符');
    const methods={completion:'textDocument/completion',signature:'textDocument/signatureHelp',hover:'textDocument/hover',definition:'textDocument/definition',references:'textDocument/references',rename:'textDocument/rename'};
    const result=await this.rpc(methods[data.op],{textDocument:{uri:doc.uri},position:p,...(data.op==='completion'?{context:{triggerKind:1}}:{}),...(data.op==='references'?{context:{includeDeclaration:true}}:{}),...(data.op==='rename'?{newName:data.newName}:{})});
    if(doc.version!==data.version)throw failure('文档已更新，忽略旧分析结果',409);
    const localFile=uri=>{try{const name=path.relative(doc.dir,fileURLToPath(uri)).replaceAll('\\','/');return doc.files&&Object.hasOwn(doc.files,name)?name:null;}catch{return null;}};
    if(['definition','references'].includes(data.op))return {version:data.version,result:(Array.isArray(result)?result:result?[result]:[]).map(l=>({file:localFile(l.uri||l.targetUri),range:l.range||l.targetSelectionRange})).filter(l=>l.file)};
    if(data.op==='rename')return {version:data.version,result:Object.entries(result?.changes||{}).map(([uri,edits])=>({file:localFile(uri),edits})).filter(l=>l.file)};
    return {version:data.version,result};
  }
  close(id){const doc=this.documents.get(id);if(!doc)return;try{this.notify('textDocument/didClose',{textDocument:{uri:doc.uri}});for(const other of doc.related||[])this.notify('textDocument/didClose',{textDocument:{uri:other.uri}});}catch{}this.documents.delete(id);for(const wake of doc.waiters)wake();
    // These directories contain only generated context and an empty source file.
    if(path.dirname(doc.dir)===this.root)try{fs.rmSync(doc.dir,{recursive:true,force:true});}catch{}
  }
  stop(){const child=this.child;this.child=null;this.starting=null;for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(failure('clangd 已断开，请重连',503));}this.pending.clear();for(const doc of this.documents.values()){for(const wake of doc.waiters)wake();}this.documents.clear();child?.kill();}
  dispose(){this.disposed=true;clearInterval(this.sweep);this.stop();if(path.dirname(this.root)===this.runtimeDir&&/^\d+-[a-f0-9-]+$/.test(path.basename(this.root)))try{fs.rmSync(this.root,{recursive:true,force:true});}catch{}}
}
