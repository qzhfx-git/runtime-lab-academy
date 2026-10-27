import {spawn} from 'node:child_process';
import path from 'node:path';

const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const quote=JSON.stringify;
// Recursive GDB/MI grammar: unlike JSON, lists may contain repeated result keys.
export function parseMI(text){
 let i=0;
 function str(){let out='';i++;while(i<text.length){let c=text[i++];if(c==='"')return out;if(c==='\\'){c=text[i++];if(/[0-7]/.test(c)){let oct=c;for(let n=0;n<2&&/[0-7]/.test(text[i]||'x');n++)oct+=text[i++];out+=String.fromCharCode(parseInt(oct,8));}else out+=({n:'\n',r:'\r',t:'\t',b:'\b',f:'\f',v:'\v'}[c]??c);}else out+=c;}return out;}
 function key(){let start=i;while(i<text.length&&/[\w-]/.test(text[i]))i++;return text.slice(start,i);}
 function value(){if(text[i]==='"')return str();if(text[i]==='{'){i++;const o={};while(i<text.length&&text[i]!=='}'){const k=key();if(text[i++]!=='=')break;o[k]=value();if(text[i]===',')i++;}i++;return o;}if(text[i]==='['){i++;const a=[];while(i<text.length&&text[i]!==']'){if(/[\w-]/.test(text[i])){const k=key();i++;a.push({[k]:value()});}else a.push(value());if(text[i]===',')i++;}i++;return a;}let s=i;while(i<text.length&&!/[,}\]]/.test(text[i]))i++;return text.slice(s,i);}
 const out={};while(i<text.length){const k=key();if(!k||text[i++]!=='=')break;out[k]=value();if(text[i]===',')i++;}return out;
}
export class DebugSession{
 constructor({gdb,runner,compiler,dir,sourceDir,files,binary,args=[]}){
  this.dir=dir;this.sourceDir=sourceDir;this.files=files;this.binary=binary;this.args=args;this.seq=0;this.pending=new Map();this.state='starting';this.revision=0;this.output='';this.breaks=[];this.frame=null;this.reason='';this.used=Date.now();
  this.child=spawn(runner,['--debug',gdb,'--quiet','--interpreter=mi2','--nx','--nh','-iex','set auto-load off'],{cwd:dir,windowsHide:true,env:{...process.env,PATH:path.dirname(compiler)+path.delimiter+process.env.PATH},stdio:['pipe','pipe','pipe']});
  let buffer='';this.child.stdout.setEncoding('utf8');this.child.stdout.on('data',s=>{buffer+=s;if(buffer.length>262144){this.stop('调试输出超限');return;}let n;while((n=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,n).replace(/\r$/,'');buffer=buffer.slice(n+1);this.line(line);}});
  this.child.stderr.on('data',s=>this.log(s.toString()));this.child.stdin.on('error',()=>{});
  this.child.on('error',e=>this.stop(e.message));this.child.on('exit',()=>{this.state='exited';this.revision++;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(fail('调试进程已退出',410));}this.pending.clear();});
  this.timer=setTimeout(()=>this.stop('调试达到 15 分钟上限'),900000);this.timer.unref();
 }
 log(s){this.output=(this.output+s).slice(-65536);}
 line(line){
  if(/^[~@&]"/.test(line)){const p=parseMI('s='+line.slice(1));if(line[0]!=='&')this.log(p.s||'');return;}
  const m=/^(\d*)\^([\w-]+)(?:,(.*))?$/.exec(line);if(m){const p=this.pending.get(Number(m[1]));if(p){clearTimeout(p.timer);this.pending.delete(Number(m[1]));const data=parseMI(m[3]||'');m[2]==='error'?p.reject(fail(data.msg||'GDB 操作失败')):p.resolve(data);}return;}
  if(line.startsWith('*running')){this.state='running';this.revision++;return;}
  if(line.startsWith('*stopped')){const p=parseMI(line.slice(9));this.reason=p.reason||'stopped';this.state=this.reason.startsWith('exited')?'exited':'paused';this.frame=this.mapFrame(p.frame);this.signal=p['signal-name'];this.thread=p['thread-id'];this.exitCode=p['exit-code'];this.revision++;return;}
  if(line&&!/^(\(gdb\)|[=+])/.test(line))this.log(line+'\n');
 }
 mapFrame(f){if(!f)return null;let file=f.fullname||f.file||'';const relative=path.relative(this.sourceDir,file).replaceAll('\\','/');return {...f,file:Object.hasOwn(this.files,relative)?relative:null,external:file,line:Number(f.line)||0};}
 command(cmd,timeout=12000){this.used=Date.now();return new Promise((resolve,reject)=>{if(!this.child?.stdin.writable)return reject(fail('调试连接已关闭',410));const id=++this.seq,timer=setTimeout(()=>{this.pending.delete(id);reject(fail('GDB 响应超时',504));},timeout);this.pending.set(id,{resolve,reject,timer});this.child.stdin.write(id+cmd+'\n');});}
 async start(breakpoints=[]){
  await this.command('-gdb-set pagination off');await this.command('-gdb-set confirm off');await this.command('-gdb-set mi-async on');await this.command('-gdb-set may-call-functions off');await this.command('-gdb-set print elements 40');
  await this.command('-environment-cd '+quote(this.dir.replaceAll('\\','/')));
  await this.command('-file-exec-and-symbols '+quote(this.binary.replaceAll('\\','/')));
  if(this.args.length)await this.command('-exec-arguments '+this.args.map(quote).join(' '));
  await this.breakpoints(breakpoints);
  await this.command('-break-insert -t main');await this.command('-exec-run');return this.snapshot();
 }
 async breakpoints(items){
  if(!Array.isArray(items)||items.length>100)throw fail('最多 100 个断点');
  const valid=items.map(b=>{if(!Object.hasOwn(this.files,b.file)||!Number.isInteger(b.line)||b.line<1||b.line>this.files[b.file].split('\n').length)throw fail('无效断点位置');return b;});
  const ids=this.breaks.map(b=>b.number).filter(Boolean);if(ids.length)await this.command('-break-delete '+ids.join(' '));this.breaks=[];
  for(const b of valid){try{const r=await this.command('-break-insert '+quote(path.join(this.sourceDir,b.file).replaceAll('\\','/')+':'+b.line));this.breaks.push({...b,number:r.bkpt.number,verified:!!r.bkpt.line,actualLine:Number(r.bkpt.line)||b.line});}catch(e){this.breaks.push({...b,verified:false,error:e.message});}}
  this.breaks=this.breaks.filter(b=>b.number||!b.verified);return {breakpoints:this.breaks};
 }
 snapshot(){return {state:this.state,revision:this.revision,reason:this.reason,frame:this.frame,thread:this.thread,signal:this.signal,exitCode:this.exitCode,output:this.output,breakpoints:this.breaks};}
 async inspect(){
  this.used=Date.now();
  if(this.state!=='paused')return this.snapshot();const revision=this.revision;
  const [s,v,t]=await Promise.all([this.command('-stack-list-frames 0 63'),this.command('-stack-list-variables --simple-values'),this.command('-thread-info')]);
  if(revision!==this.revision)return this.snapshot();
  return {...this.snapshot(),stack:(s.stack||[]).map(x=>this.mapFrame(x.frame)),variables:v.variables||[],threads:(t.threads||[]).map(t=>({...t,frame:this.mapFrame(t.frame)}))};
 }
 async action(data){
  if(data.action==='stop'){this.stop();return this.snapshot();}
  if(data.action==='breakpoints'){if(this.state==='running')throw fail('请暂停后修改断点',409);return this.breakpoints(data.breakpoints);}
  if(data.action==='pause'){await this.command('-exec-interrupt --all');return this.snapshot();}
  if(this.state!=='paused')throw fail('程序未暂停',409);
  const commands={continue:'-exec-continue',next:'-exec-next',step:'-exec-step',out:'-exec-finish'};
  if(commands[data.action]){await this.command(commands[data.action]);return this.snapshot();}
  if(data.action==='frame'){if(!Number.isInteger(data.frame)||data.frame<0||data.frame>1000)throw fail('无效栈帧');await this.command('-stack-select-frame '+data.frame);const r=await this.command('-stack-info-frame');this.frame=this.mapFrame(r.frame);this.revision++;return this.inspect();}
  if(data.action==='thread'){if(!/^\d+$/.test(String(data.thread)))throw fail('无效线程');const r=await this.command('-thread-select '+data.thread);this.thread=String(data.thread);this.frame=this.mapFrame(r.frame);this.revision++;return this.inspect();}
  if(data.action==='evaluate'){if(typeof data.expression!=='string'||data.expression.length>200||!/^[-\w\s.>\[\]*+/:]+$/.test(data.expression))throw fail('监视表达式支持变量、成员、下标和简单算术，不支持函数调用或赋值');const r=await this.command('-data-evaluate-expression '+quote(data.expression));return {expression:data.expression,value:r.value};}
  throw fail('未知调试操作');
 }
 stop(reason='调试已停止'){clearTimeout(this.timer);this.reason=reason;this.state='exited';this.revision++;this.child?.kill();}
}
