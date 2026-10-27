'use strict';
const app=document.getElementById('app');
const state={data:null,view:'home',id:'weak-lock',lessonId:'shared-weak',tab:'task',drafts:{},results:{},hints:{},job:null,search:'',topic:'all',concept:0};
let saveTimer=null,toastTimer=null,polling=false,navigationVersion=0;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={AC:'全部通过',SAMPLE_PASS:'样例通过',WA:'结果不符',CE:'编译失败',RE:'运行异常',TLE:'运行超时',CTLE:'编译超时',OLE:'输出超限',IE:'执行服务错误',CANCELLED:'已取消',PASS:'通过'};
const passed=status=>['AC','SAMPLE_PASS','PASS'].includes(status);
const date=s=>new Date(s).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
const exercise=()=>state.data.exercises.find(e=>e.id===state.id);
const topicOf=e=>state.data.roadmap.find(t=>t.id===e.topic);
const completed=id=>state.data.progress.some(p=>p.exercise===id);
const icons={work:'<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M9 3v18M9 10h12"/>',roadmap:'<circle cx="6" cy="5" r="2"/><circle cx="18" cy="19" r="2"/><path d="M6 7v7a5 5 0 0 0 5 5h5M10 5h7a3 3 0 0 1 0 6h-4"/>',library:'<path d="m9 3-2 6-3 9a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-3-9-2-6M8 3h8M7 13h10"/><path d="M10 17h.01M14 16h.01"/>',project:'<path d="m12 2 9 5v10l-9 5-9-5V7Z"/><path d="m3 7 9 5 9-5M12 12v10M7.5 4.5l9 5"/>',history:'<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2"/>',arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',play:'<path d="m8 4 12 8-12 8Z"/>',code:'<path d="m7 7-5 5 5 5m10-10 5 5-5 5M14 4l-4 16"/>',expand:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',download:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',check:'<path d="m5 12 4 4 10-10"/>',spark:'<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z"/>',terminal:'<path d="m5 6 6 6-6 6m9 0h5"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',reset:'<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>'};
function icon(name){return '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(icons[name]||icons.code)+'</svg>';}
function orbitalArt(){return '<div class="orbital-art" aria-hidden="true"><div class="orbit-field"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="orbit orbit-three"></div><div class="orbit-core">'+icon('code')+'</div><i class="orbit-point point-one"></i><i class="orbit-point point-two"></i></div><span class="orbit-label label-one">&lt;memory&gt;</span><span class="orbit-label label-two">std::weak_ptr</span><span class="orbit-caption">EXPLORE THE UNDERLYING.</span></div>';}
function toast(message){const el=document.getElementById('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3600);}
async function api(url,{method='GET',data}={}){
 const headers={'X-Lab-Token':state.data?.token||''};
 if(data)headers['Content-Type']='application/json';
 const res=await fetch(url,{method,headers,body:data?JSON.stringify(data):undefined});
 const value=await res.json();if(!res.ok)throw Object.assign(new Error(value.error||'请求失败'),{status:res.status});return value;
}
function draft(id=state.id){const e=state.data.exercises.find(x=>x.id===id);return state.drafts[id]||{id,code:e.starter,notes:''};}
function capture(){
 const code=document.getElementById('code-editor'),notes=document.getElementById('notes-editor');
 const d={...draft()};if(code)d.code=code.value;if(notes)d.notes=notes.value;state.drafts[state.id]=d;
}
async function save(id=state.id){
 clearTimeout(saveTimer);const d={...draft(id)};await api('/api/draft',{method:'POST',data:{id,code:d.code,notes:d.notes||''}});
 if(state.id===id){const el=document.getElementById('save-status');if(el)el.textContent='已保存到'+Evaluation.storage()+'';}
}
function scheduleSave(){
 capture();const status=document.getElementById('save-status');if(status)status.textContent='保存中…';
 clearTimeout(saveTimer);const id=state.id;saveTimer=setTimeout(()=>save(id).catch(e=>toast('保存失败：'+e.message)),650);
}
function hashFor(view,id){return view==='work'?'#/practice/'+id:'#/'+view;}
function readHash(){
 const parts=location.hash.replace(/^#\/?/,'').split('/');
 const valid=['home','courses','assessment','roadmap','library','project','history','settings','engineering','studies'];
 if(parts[0]==='practice'&&state.data.exercises.some(e=>e.id===parts[1])){state.view='work';state.id=parts[1];}
 else if(parts[0]==='lesson'&&state.data.academy.lessons.some(l=>l.id===parts[1])){state.view='lesson';state.lessonId=parts[1];}
 else if(valid.includes(parts[0]))state.view=parts[0];
 else {state.view='home';if(state.data.exercises.some(e=>e.id===state.data.lastExercise))state.id=state.data.lastExercise;}
}
async function navigate(view,id){
 const version=++navigationVersion;
 await Studies.flush();
 await Engineering.flush();
 await Academy.flush();
 if(state.view==='work'){capture();await save();}
 if(version!==navigationVersion)return;
 state.view=view;if(id)state.id=id;state.tab='task';
 const hash=hashFor(view,state.id);if(location.hash!==hash)history.pushState(null,'',hash);
 render();window.scrollTo({top:0,behavior:'instant'});
}
function badge(status){return '<span class="pill '+(passed(status)?'green':['CANCELLED'].includes(status)?'':'red')+'">'+esc(names[status]||status)+'</span>';}
function render(){
 Studies.unmount();
 Engineering.unmount();
 window.LabEditor?.destroy();
 app.classList.remove('focus-mode');
 const navItems=[['home','概览'],['courses','课程体系'],['studies','架构研修'],['library','实验室'],['project','工程项目'],['engineering','工程工作台'],['assessment','能力档案'],['settings','评测设置']];
 const primaryViews=['home','courses','studies','library','engineering'];
 const activeView=state.view==='lesson'?'courses':state.view==='work'?'library':state.view;
 const navLink=([view,label])=>'<a href="#/'+view+'" data-nav="'+view+'" '+(activeView===view?'aria-current="page"':'')+'>'+label+'</a>';
 const primaryNav=navItems.filter(([v])=>primaryViews.includes(v)).map(navLink).join('');
 const secondaryNav=navItems.filter(([v])=>!primaryViews.includes(v)).map(navLink).join('');
 const e=exercise(),topic=topicOf(e);
 app.innerHTML='<a class="skip-link" href="#main-content">跳到学习内容</a><header class="global-nav"><a class="academy-brand" href="#/home" data-nav="home">'+icon('code')+'<span>Runtime<span class="brand-light"> Lab</span></span><i>ACADEMY</i></a><nav aria-label="主导航">'+primaryNav+'<details class="nav-more"><summary '+(!primaryViews.includes(activeView)?'data-active="true"':'')+'>更多 <span aria-hidden="true">⌄</span></summary><div>'+secondaryNav+'</div></details>'+'</nav><div class="global-tools"><button class="motion-toggle" data-motion aria-label="暂停动效" title="暂停动效">Ⅱ</button><a href="'+hashFor('work',state.id)+'" data-nav="work" class="continue-pill">继续练习 '+icon('arrow')+'</a></div></header><div class="shell"><header class="topbar"><div class="breadcrumb">C++ 工程训练 <span>/</span> <b>'+esc(state.view==='work'?e.title:state.view==='lesson'?'课程讲义':navItems.find(n=>n[0]===state.view)?.[1]||'学习记录')+'</b></div><div class="top-actions"><span class="completion">'+state.data.progress.length+' / '+state.data.exercises.length+' 个实验已通过</span><a href="#/history" data-nav="history" class="text-link">执行记录</a><button class="btn ghost small" data-action="export">'+icon('download')+'导出学习数据</button><span class="local-label"><span class="online"></span>'+({cloud:'CLOUD',codespaces:'CODESPACES',portal:'COURSES'}[state.data.environment.location]||'LOCAL')+' · C++20</span></div></header><main class="page view-'+state.view+'" id="main-content" tabindex="-1"></main></div><dialog class="dialog" id="reference-dialog"><div class="row"><h2>参考实现</h2><button class="btn ghost" data-action="close-reference">关闭 ×</button></div><p>先比较思路，再决定是否载入。通过测试只代表覆盖到的行为符合要求。</p><pre id="reference-code"></pre><div class="row"><span class="muted"><small>C++20 · 本题参考实现</small></span><button class="btn primary" data-action="load-reference">载入编辑器 '+icon('arrow')+'</button></div></dialog>';
 const main=document.getElementById('main-content');
 if(state.view==='work')main.innerHTML=workbench(e,topic);
 if(state.view==='roadmap')main.innerHTML=roadmapPage();
 if(state.view==='library')main.innerHTML=libraryPage();
 if(['home','courses','lesson','project','assessment'].includes(state.view))main.innerHTML=Academy.page(state.view);
 if(state.view==='history')main.innerHTML=historyPage();
 if(state.view==='settings')main.innerHTML=Evaluation.page();
 if(state.view==='engineering')Engineering.mount(main);
 if(state.view==='studies')Studies.mount(main);
 if(state.view==='work'){
  updateLines();renderProblem();renderResult();
  window.LabEditor?.mount({textarea:document.getElementById('code-editor'),exerciseId:state.id,languageRequest:Evaluation.language,fixture:state.data.fixture+'\n'+(exercise().preamble||''),onChange:scheduleSave,onNotice:toast,onRun:mode=>startJob(mode).catch(e=>toast(e.message))});
 }
 Academy.mount();
 window.CloudLab?.mount();
}
function heading(kicker,title,description,aside=''){return '<div class="page-heading"><div><div class="eyebrow">'+esc(kicker)+'</div><h1>'+esc(title)+'</h1><p>'+esc(description)+'</p></div>'+aside+'</div>';}
function workbench(e,topic){
 return '<section class="workspace-hero"><div class="hero-copy"><div class="eyebrow"><span class="hero-dash"></span> LESS RECALL. MORE DISCOVERY.</div><h1>深入机制，<span>构建所想。</span></h1><p>让每一个 C++ 概念，成为你亲手验证的代码。</p><div class="hero-bottom"><span class="phase-chip">'+esc(topic.phase)+'</span><span>'+esc(topic.name)+'</span><a href="#/roadmap" data-nav="roadmap" class="hero-link">查看学习路线 '+icon('arrow')+'</a></div></div>'+orbitalArt()+'</section><div class="workspace-toolbar"><div><span class="tiny-dot"></span><strong>当前实验</strong><span class="toolbar-divider"></span><span>'+esc(e.subtitle)+'</span></div><a href="#/library" data-nav="library">全部实验 '+icon('arrow')+'</a></div>'+
 Evaluation.toolbar()+'<div class="workbench"><section class="panel problem-panel"><div class="tabs" role="tablist" aria-label="学习内容">'+[['task','练习任务'],['guide','概念讲解'],['notes','我的笔记'],['attempts','提交记录']].map(([id,label])=>'<button role="tab" id="tab-'+id+'" aria-controls="problem-body" aria-selected="'+(id===state.tab)+'" class="tab '+(id===state.tab?'active':'')+'" data-tab="'+id+'">'+label+'</button>').join('')+'</div><div class="problem-body" id="problem-body" role="tabpanel" aria-labelledby="tab-'+state.tab+'"></div></section><section class="coding-column" aria-label="代码与评测"><div class="panel editor"><div class="editor-top"><span class="file-label"><span>c++</span> solution.hpp <i></i></span><div class="row"><span class="editor-language">C++20</span><button class="icon-button" data-action="reset" aria-label="重置代码" title="重置代码">'+icon('reset')+'</button><button class="icon-button" data-action="focus" aria-label="切换专注模式" title="专注模式">'+icon('expand')+'</button></div></div><div class="code-wrap"><div class="line-numbers" id="line-numbers" aria-hidden="true"></div><div class="code-surface"><pre class="code-highlight" id="code-highlight" aria-hidden="true"></pre><textarea id="code-editor" class="code" aria-label="C++ 代码编辑器" spellcheck="false" autocapitalize="off" autocomplete="off" wrap="off">'+esc(draft().code)+'</textarea></div></div><div class="editor-status"><span><span class="save-dot"></span><span id="save-status">自动保存到'+Evaluation.storage()+'</span></span><span id="cursor-position">UTF-8 · C++20</span></div><div class="action-bar"><small><kbd>Ctrl</kbd> <kbd>↵</kbd> 运行</small><div class="row"><button class="btn" id="run-button" data-action="run" '+(state.job?'disabled':'')+'>'+icon('play')+'运行样例</button><button class="btn primary" id="submit-button" data-action="submit" '+(state.job?'disabled':'')+'>提交评测 '+icon('arrow')+'</button></div></div></div><div class="panel result-panel"><div class="result-head"><h3>'+icon('terminal')+' 执行结果 <span class="terminal-label">TERMINAL</span></h3><span class="pill" id="execution-label">'+esc(Evaluation.label())+'</span></div><div class="result-body" id="result-body" aria-live="polite"></div></div><details class="legal-note"><summary>运行环境 <span>'+esc(state.data.environment.limits)+'</span></summary><p>'+esc(state.data.environment.execution)+'</p></details></section></div>';
}
function renderProblem(){
 if(state.view!=='work')return;
 const e=exercise(),body=document.getElementById('problem-body');
 document.querySelectorAll('[data-tab]').forEach(t=>{t.classList.toggle('active',t.dataset.tab===state.tab);t.setAttribute('aria-selected',String(t.dataset.tab===state.tab));});
 body.setAttribute('aria-labelledby','tab-'+state.tab);
 const title='<div class="problem-title"><span class="exercise-index">'+String(state.data.exercises.indexOf(e)+1).padStart(2,'0')+'</span><div><h2>'+esc(e.title)+'</h2><div class="sub">'+esc(e.subtitle)+'</div></div></div>';
 if(state.tab==='task'){
  const h=state.hints[e.id]||0;
  body.innerHTML=title+Academy.relatedLesson(e.id)+'<div class="metadata"><span class="pill '+(e.id==='weak-lock'?'green':'amber')+'">'+esc(e.difficulty)+'</span><span>约 '+e.minutes+' 分钟</span><span>'+e.testCount+' 项测试</span>'+(completed(e.id)?'<span class="success">✓ 已通过</span>':'')+'</div><div class="section-label">你的任务</div><p class="prose">'+esc(e.objective)+'</p><div class="section-label">接口约定</div><ul class="contract">'+e.contract.map(c=>'<li>'+esc(c)+'</li>').join('')+'</ul><div class="section-label">公开样例 · '+esc(e.sample.name)+'</div><div class="sample"><div class="sample-head"><span>测试调用</span><span>test / 01</span></div><pre>'+esc(e.sample.body.replaceAll(';',';\n'))+'</pre><div class="sample-output">期望输出<code>'+esc(e.sample.expected)+'</code></div></div><div class="section-label">测试会检查什么</div><ul class="contract">'+e.testNames.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul><hr><div class="row"><button class="btn small" data-action="hint" '+(h>=e.hints.length?'disabled':'')+'>给我一点提示 '+h+'/'+e.hints.length+'</button><button class="btn ghost small" data-action="reference">查看参考实现</button></div>'+e.hints.slice(0,h).map((hint,i)=>'<div class="hint-box">'+(i+1)+'. '+esc(hint)+'</div>').join('')+'<details class="footer-source"><summary>已提供的类型与头文件</summary><pre>'+esc(state.data.fixture)+'</pre></details>';
 }else if(state.tab==='guide'){
  body.innerHTML=title+Academy.relatedLesson(e.id)+'<div class="section-label">先建立正确的理解</div><div class="prose">'+e.guide.map((p,i)=>'<p><strong>'+String(i+1).padStart(2,'0')+'</strong>　'+esc(p)+'</p>').join('')+'</div>'+(e.topic==='ownership'?conceptHTML():'')+'<hr><p class="prose">尝试解释：你的实现满足哪些约定？去掉一个关键操作后，哪项测试会首先失败？</p><div class="row"><button class="btn small" data-tab="task">返回任务</button><button class="btn ghost small" data-tab="notes">写下理解 →</button></div>';
 }else if(state.tab==='notes'){
  body.innerHTML=title+'<div class="section-label">把理解留在这里</div><p class="prose">记录容易混淆的概念、失败原因和你选择这种实现的理由。笔记与代码一起保存在'+Evaluation.storage()+'。</p><label class="section-label" for="notes-editor">本题笔记</label><textarea class="note" id="notes-editor" placeholder="例如：get() 相同，不一定共享控制块……">'+esc(draft().notes||'')+'</textarea><div class="section-label">复盘问题</div><ul class="contract"><li>这段代码中谁负责保活，谁只负责观察？</li><li>哪个边界条件是我最初漏掉的？</li><li>哪些结论来自语言规则，哪些只来自本次实验？</li></ul>';
 }else{
  const rows=state.data.history.filter(r=>r.exercise===e.id);
  body.innerHTML=title+'<div class="section-label">最近提交 · 包含样例运行</div>'+(rows.length?rows.map(r=>historyRow(r,false)).join(''):'<div class="records-empty">还没有执行记录。写好代码后，运行样例或提交全部测试。</div>');
 }
}
function conceptHTML(){
 const s=state.concept;return '<div class="concept"><h3>对象模型演示 · weak_ptr</h3><div class="concept-nodes"><div class="concept-node">p<strong>'+(s===0?'持有对象':'空')+'</strong></div><div class="concept-node">控制块<strong>strong = '+(s===0?'1':'0')+'</strong></div><div class="concept-node">对象<strong>'+(s===0?'存活':'已销毁')+'</strong></div></div><p>'+['w 已建立观察关系，strong 仍为 1。','执行 p.reset()：对象销毁，w 仍关联控制块。','执行 w.lock()：得到空 shared_ptr，对象不会复活。'][s]+'</p><div class="row"><small class="muted">预设概念演示 · '+(s+1)+'/3</small><button class="btn small" data-action="concept">'+(s===2?'重新开始':'下一步 →')+'</button></div></div>';
}
function renderResult(){
 if(state.view!=='work')return;
 const el=document.getElementById('result-body'),label=document.getElementById('execution-label');
 if(state.job&&state.job.exerciseId===state.id){
  const stage=state.job.stage==='reviewing'?'AI 正在分析代码（未编译运行）…':state.job.stage==='compiling'?'正在调用 g++ 编译…':state.job.stage==='running'?'正在运行测试 '+state.job.testIndex+' / '+state.job.total:(Evaluation.mode()==='judge0'?'云端排队、编译与执行中…':'正在准备执行…');
  el.innerHTML='<div class="result-title"><strong>'+stage+'</strong><button class="btn small" data-action="cancel">停止等待</button></div><p class="muted"><small>当前方式：'+esc(state.job.provider==='ai'?'AI 代码评审':Evaluation.label())+'。完成后显示结果；云端共享服务可能排队。</small></p>';label.textContent='执行中';return;
 }
 const result=state.results[state.id];
 if(result?.status==='AI_REVIEW'){label.textContent='AI 静态评审';el.innerHTML=Evaluation.reviewHTML(result);return;}
 label.textContent=result?(result.mode==='run'?'样例运行':'完整评测'):Evaluation.label();
 if(!result){el.innerHTML='<div class="empty-result"><div class="empty-icon">›_</div><div><p>代码准备好了吗？</p><small>先运行公开样例，再提交全部测试。</small></div></div>';return;}
 const ok=(result.tests||[]).filter(t=>t.status==='PASS').length;
 el.innerHTML='<div class="result-title"><strong class="'+(passed(result.status)?'success':'failure')+'">'+esc(names[result.status]||result.status)+'</strong><small class="muted">'+ok+' / '+(result.tests?.length||0)+' 项通过</small></div>'+
 (result.status==='SAMPLE_PASS'?'<p class="muted"><small>公开样例通过；提交评测后才会运行其余测试并记录通过状态。</small></p>':'')+
 (result.evaluationNote?'<p class="evaluation-note">'+esc(result.evaluationNote)+'</p>':'')+
 (result.error?'<pre class="diagnostic">'+esc(result.error)+'</pre>':'')+
 (result.compileOutput?'<details '+(['CE','CTLE'].includes(result.status)?'open':'')+'><summary class="muted"><small>编译器输出</small></summary><pre class="diagnostic">'+esc(result.compileOutput)+'</pre></details>':'')+
 (result.tests||[]).map((t,i)=>'<details class="test-row" '+(t.status!=='PASS'?'open':'')+'><summary><span class="'+(t.status==='PASS'?'success':'failure')+'">'+(t.status==='PASS'?'✓':'×')+'</span>'+esc(t.name)+'<small>'+esc(names[t.status]||t.status)+' · '+t.ms+' ms</small></summary><div class="test-detail"><p>'+esc(t.explanation)+'</p><div class="output-grid"><div><small>期望输出</small><pre>'+esc(t.expected)+'</pre></div><div><small>实际输出</small><pre>'+esc(t.actual||'（无输出）')+'</pre></div></div>'+(t.stderr?'<small>stderr</small><pre>'+esc(t.stderr)+'</pre>':'')+'<details><summary class="muted"><small>查看测试调用</small></summary><pre>'+esc(t.body.replaceAll(';',';\n'))+'</pre></details><p>退出码：'+esc(t.exitCode)+'</p></div></details>').join('')+
 '<div class="result-meta">编译 '+(result.compileMs==null?'耗时未提供':result.compileMs+' ms')+' · '+esc(result.standard||'C++20')+' · '+esc(result.flags||'')+'</div>';
}
function roadmapPage(){
 return heading('YOUR LEARNING PATH','接上你的 C++ 主线','沿用已恢复的阶段与主题，保留学习断点，按需复习。')+
 '<div class="roadmap-hero"><div><div class="eyebrow">CONTINUE / PHASE 2</div><h2>从所有权，走向 Runtime</h2><p>上次已经学习 control block 与 enable_shared_from_this。接下来通过 weak_ptr、所有权图和资源转移，把理解落实成可运行的代码。</p></div><button class="btn primary" data-open="weak-lock">继续学习 →</button></div><div class="route-list">'+state.data.roadmap.map((t,i)=>{
 const ex=state.data.exercises.filter(e=>e.topic===t.id),count=ex.filter(e=>completed(e.id)).length;
 return '<div class="route-item '+(t.status==='current'?'current':'')+'"><div class="route-number">'+String(i+1).padStart(2,'0')+'</div><div><small>'+esc(t.phase)+'</small><h3>'+esc(t.name)+'</h3><p>'+esc(t.summary)+'</p>'+(ex.length?'<p>'+count+' / '+ex.length+' 个练习通过</p>':'')+'</div>'+(ex.length?'<button class="btn '+(t.status==='current'?'primary':'')+'" data-topic="'+t.id+'">进入专题 →</button>':'<a class="btn" href="#/courses" data-nav="courses">讲义与工程项目 →</a>')+'</div>';
 }).join('')+'</div><details class="footer-source"><summary>路线来源与当前范围</summary>根据之前聊天中的路线摘要与后续学习记录恢复：Phase 1、1.5、2、3 和 Allocator / ECS / Job System / Lock-free / TinyRuntime 主线。现已扩展为 36 节讲义、34 个实验和 4 个工程项目。新增主题按能力模块组织，沿用原路线的机制与 Runtime 主线。</details>';
}
function libraryPage(){
 return heading('EXPERIMENT LIBRARY','为理解机制而练习','每道题都包含接口约定、边界测试和可复盘的运行结果。')+
 '<div class="filters"><input id="exercise-search" class="search" type="search" aria-label="搜索练习" placeholder="搜索主题、机制或练习…" value="'+esc(state.search)+'"><select id="topic-filter" class="filter-select" aria-label="筛选专题"><option value="all">全部专题</option>'+state.data.roadmap.filter(t=>state.data.exercises.some(e=>e.topic===t.id)).map(t=>'<option value="'+t.id+'" '+(t.id===state.topic?'selected':'')+'>'+esc(t.name)+'</option>').join('')+'</select><span class="muted"><small>'+state.data.exercises.length+' 个实验 · '+state.data.exercises.reduce((n,e)=>n+e.testCount,0)+' 项测试</small></span></div><div class="exercise-list" id="exercise-list">'+libraryRows()+'</div>';
}
function libraryRows(){
 const list=state.data.exercises.filter(e=>(state.topic==='all'||e.topic===state.topic)&&(e.title+' '+e.subtitle+' '+topicOf(e).name).toLowerCase().includes(state.search.toLowerCase()));
 return list.length?list.map(e=>'<a href="#/practice/'+e.id+'" class="exercise-row" data-open="'+e.id+'"><div class="exercise-card-top"><span class="number">'+(completed(e.id)?icon('check'):String(state.data.exercises.indexOf(e)+1).padStart(2,'0'))+'</span><span>'+esc(topicOf(e).name)+'</span>'+icon('arrow')+'</div><div><h3>'+esc(e.title)+'</h3><p>'+esc(e.subtitle)+'</p></div><div class="exercise-card-foot"><span class="pill '+(completed(e.id)?'green':'')+'">'+(completed(e.id)?'已通过':esc(e.difficulty))+'</span><span>'+icon('clock')+e.minutes+' 分钟 · '+e.testCount+' 项测试</span></div></a>').join(''):'<div class="no-match">没有符合条件的练习，试试其他关键词。</div>';
}
function historyRow(r,showTitle=true){
 const e=state.data.exercises.find(e=>e.id===r.exercise);
 return '<div class="history-row"><div class="row"><h3>'+(showTitle?esc(e?.title||r.exercise):esc(r.mode==='review'?'AI 代码评审':r.mode==='run'?'运行公开样例':'提交全部测试'))+'</h3>'+badge(r.result.status)+'</div><p>'+date(r.created)+' · '+(r.mode==='review'?'AI 静态评审':r.mode==='run'?'样例':'完整测试')+' · '+esc(r.result.provider||'local')+'</p><div class="row"><button class="btn ghost small" data-attempt="'+r.id+'">查看这次结果</button><button class="btn ghost small" data-restore="'+r.id+'">恢复这次代码</button></div></div>';
}
function historyPage(){return heading('YOUR PROGRESS','留下代码，也留下理解','样例通过和完整评测分别记录；只有完整评测通过才计入进度。')+'<div class="panel history-table">'+(state.data.history.length?state.data.history.map(r=>historyRow(r)).join(''):'<div class="records-empty">还没有提交记录。你的第一次真实执行会出现在这里。</div>')+'</div>';}
// Highlight only escaped text, preserving the textarea as the accessible editing surface.
function highlightCode(source){
 const pattern=/(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(^\s*#[^\n]*)|\b(auto|const|constexpr|return|if|else|for|while|switch|case|break|continue|class|struct|public|private|protected|template|typename|using|namespace|new|delete|noexcept|override|virtual|explicit|static|throw|try|catch|nullptr|true|false|sizeof|alignof|alignas|volatile|default)\b|\b(void|bool|char|int|long|short|float|double|unsigned|size_t|std|shared_ptr|weak_ptr|unique_ptr|vector|string|optional)\b|\b(\d+(?:\.\d+)?[uUlLfF]*)\b|\b([A-Za-z_]\w*)(?=\s*\()|([{}\[\]();,<>*&=:+!?.-])/gm;
 let output='',offset=0;
 for(const match of source.matchAll(pattern)){
  output+=esc(source.slice(offset,match.index));
  const kind=['comment','string','directive','keyword','type','number','call','punctuation'].find((_,i)=>match[i+1]!==undefined);
  output+='<span class="tok-'+kind+'">'+esc(match[0])+'</span>';offset=match.index+match[0].length;
 }
 return output+esc(source.slice(offset))+'\n';
}
function syncCodeScroll(){
 const editor=document.getElementById('code-editor'),highlight=document.getElementById('code-highlight'),lines=document.getElementById('line-numbers');
 if(!editor||!highlight||!lines)return;
 highlight.scrollTop=editor.scrollTop;highlight.scrollLeft=editor.scrollLeft;lines.scrollTop=editor.scrollTop;
}
function updateLines(){
 if(window.LabEditor?.isActive())return;
 const editor=document.getElementById('code-editor'),lines=document.getElementById('line-numbers');if(!editor||!lines)return;
 lines.textContent=Array.from({length:editor.value.split('\n').length},(_,i)=>i+1).join('\n');lines.style.whiteSpace='pre';
 document.getElementById('code-highlight').innerHTML=highlightCode(editor.value);syncCodeScroll();
}
function updateButtons(){document.getElementById('run-button')?.toggleAttribute('disabled',!!state.job);document.getElementById('submit-button')?.toggleAttribute('disabled',!!state.job);const el=document.getElementById('engine-state');if(el)el.textContent=state.job?'正在执行代码':'编译服务已连接';}
async function refreshHistory(){const data=await api('/api/history');state.data.history=data.history;state.data.progress=data.progress;const el=document.querySelector('.completion');if(el)el.textContent=data.progress.length+' / '+state.data.exercises.length+' 个练习已通过';}
async function startJob(mode){
 if(state.job)return;
 capture();await save();const e=exercise();
 if(await Evaluation.run(e,draft().code,mode))return;
 state.job={id:null,exerciseId:e.id,mode,stage:'sending',total:mode==='run'?1:e.testCount};updateButtons();renderResult();
 try{const data=await api('/api/jobs',{method:'POST',data:{exerciseId:e.id,code:draft().code,mode,provider:Evaluation.mode()}});state.job.id=data.id;state.job.stage='queued';pollJob();}
 catch(error){state.job=null;updateButtons();renderResult();throw error;}
}
async function pollJob(){
 if(polling||!state.job)return;polling=true;
 try{
  while(state.job){
   const job=await api('/api/jobs/'+state.job.id);state.job=job;
   if(job.done){
    state.results[job.exerciseId]=job.result;state.job=null;await refreshHistory();updateButtons();renderResult();
    if(state.view==='work'&&state.tab==='attempts')renderProblem();
    if(state.view==='history')document.getElementById('main-content').innerHTML=historyPage();
    toast(names[job.result.status]||job.result.status);break;
   }
   updateButtons();renderResult();await new Promise(r=>setTimeout(r,state.data.environment.location==='cloud'?3000:700));
  }
 }catch(err){toast('连接中断：'+err.message+'。刷新页面可恢复任务。');}
 finally{polling=false;}
}
app.addEventListener('click',async event=>{
 if(event.target.closest('.skip-link')){event.preventDefault();document.getElementById('main-content')?.focus();return;}
 const target=event.target.closest('[data-nav],[data-open],[data-tab],[data-action],[data-topic],[data-attempt],[data-restore]');
 if(!target)return;
 try{
  if(target.dataset.nav){event.preventDefault();await navigate(target.dataset.nav,target.dataset.id);return;}
  if(target.dataset.open){event.preventDefault();await navigate('work',target.dataset.open);return;}
  if(target.dataset.topic){state.topic=target.dataset.topic;await navigate('library');return;}
  if(target.dataset.tab){capture();state.tab=target.dataset.tab;renderProblem();return;}
  if(target.dataset.attempt){
   const row=await api('/api/attempt/'+target.dataset.attempt);await navigate('work',row.exercise);state.results[row.exercise]=row.result;renderResult();return;
  }
  if(target.dataset.restore){
   const row=await api('/api/attempt/'+target.dataset.restore);
   if(!confirm('用这次提交的代码替换当前练习的草稿？原来的提交记录仍会保留。'))return;
   await navigate('work',row.exercise);state.drafts[row.exercise]={...draft(),code:row.code};await save();render();toast('已恢复提交代码');return;
  }
  switch(target.dataset.action){
   case 'focus':{
    const focused=app.classList.toggle('focus-mode');
    target.setAttribute('aria-pressed',String(focused));target.setAttribute('aria-label',focused?'退出专注模式':'切换专注模式');target.title=focused?'退出专注模式 · Esc':'专注模式';
    if(window.LabEditor?.isActive())window.LabEditor.focus();else document.getElementById('code-editor')?.focus();break;
   }
   case 'run':await startJob('run');break;
   case 'submit':await startJob('submit');break;
   case 'cancel':if(await Evaluation.cancel())break;if(state.job?.id)await api('/api/cancel',{method:'POST',data:{id:state.job.id}});else toast('正在提交任务，请等服务接受后再停止等待。');break;
   case 'reset':if(confirm('重置为题目初始代码？提交历史和笔记会保留。')){state.drafts[state.id]={...draft(),code:exercise().starter};await save();render();}break;
   case 'hint':state.hints[state.id]=(state.hints[state.id]||0)+1;renderProblem();break;
   case 'concept':state.concept=(state.concept+1)%3;renderProblem();break;
   case 'reference':{
    const result=await api('/api/solution/'+state.id);
    document.getElementById('reference-code').textContent=result.solution;
    document.getElementById('reference-dialog').showModal();break;
   }
   case 'close-reference':document.getElementById('reference-dialog').close();break;
   case 'load-reference':{
    const source=document.getElementById('reference-code').textContent;
    document.getElementById('reference-dialog').close();state.drafts[state.id]={...draft(),code:source};await save();render();toast('已载入参考实现，可以修改并实验');break;
   }
   case 'export':{
    await Studies.flush();await Engineering.flush();await Academy.flush();capture();if(state.view==='work')await save();
    const data=await api('/api/export');const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='runtime-lab-backup-'+new Date().toISOString().slice(0,10)+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('学习记录已导出');break;
   }
  }
 }catch(err){toast(err.message);}
});
app.addEventListener('input',event=>{
 if(['code-editor','notes-editor'].includes(event.target.id)){scheduleSave();updateLines();}
 if(event.target.id==='exercise-search'){state.search=event.target.value;document.getElementById('exercise-list').innerHTML=libraryRows();}
});
app.addEventListener('change',event=>{if(event.target.id==='topic-filter'){state.topic=event.target.value;document.getElementById('exercise-list').innerHTML=libraryRows();}});
app.addEventListener('scroll',event=>{if(event.target.id==='code-editor')syncCodeScroll();},true);
app.addEventListener('keyup',event=>{
 if(event.target.id==='code-editor'){const text=event.target.value.slice(0,event.target.selectionStart);document.getElementById('cursor-position').textContent='Ln '+text.split('\n').length+', Col '+(text.length-text.lastIndexOf('\n'))+' · C++20';}
});
document.addEventListener('click',event=>{if(!event.target.closest('.nav-more'))app.querySelector('.nav-more')?.removeAttribute('open');});
 app.addEventListener('keydown',event=>{
 if(event.key==='Escape'){const focused=app.querySelector('.eng-focused');if(focused){focused.classList.remove('eng-focused');const toggle=focused.querySelector('[data-eng=focus]');toggle.textContent='专注工作台';toggle.setAttribute('aria-pressed','false');}const more=app.querySelector('.nav-more[open]');if(more){more.removeAttribute('open');more.querySelector('summary').focus();}}
 if(event.key==='Escape'&&app.classList.contains('focus-mode')){app.classList.remove('focus-mode');const button=app.querySelector('[data-action="focus"]');button?.setAttribute('aria-pressed','false');button?.setAttribute('aria-label','切换专注模式');if(button)button.title='专注模式';}
 if(event.target.id==='code-editor'&&event.key==='Tab'){event.preventDefault();const editor=event.target;editor.setRangeText('    ',editor.selectionStart,editor.selectionEnd,'end');scheduleSave();updateLines();}
 if((event.ctrlKey||event.metaKey)&&event.key==='Enter'&&state.view==='work'){event.preventDefault();startJob(event.shiftKey?'submit':'run').catch(e=>toast(e.message));}
});
window.addEventListener('hashchange',async()=>{const version=++navigationVersion;try{if(state.data){await Studies.flush();await Engineering.flush();await Academy.flush();if(state.view==='work'){capture();await save();}if(version!==navigationVersion)return;readHash();render();window.scrollTo({top:0,behavior:'instant'});}}catch(e){toast(e.message);}});
window.addEventListener('beforeunload',()=>{
 if(!state.data||state.view!=='work')return;
 capture();const d=draft();fetch('/api/draft',{method:'POST',headers:{'Content-Type':'application/json','X-Lab-Token':state.data.token},body:JSON.stringify({id:state.id,code:d.code,notes:d.notes||''}),keepalive:true}).catch(()=>{});
});
async function init(){
 try{
  state.data=await api('/api/bootstrap');
  state.drafts=Object.fromEntries(state.data.drafts.map(d=>[d.id,d]));
  if(state.data.exercises.some(e=>e.id===state.data.lastExercise))state.id=state.data.lastExercise;
  for(const row of state.data.history)if(!state.results[row.exercise])state.results[row.exercise]=row.result;
  readHash();Academy.init();Evaluation.init();DepthUI.init();render();
  if(state.data.activeJob){state.job=await api('/api/jobs/'+state.data.activeJob);updateButtons();pollJob();}
 }catch(err){
  app.innerHTML='<div class="boot"><div class="brand-mark">R_</div><h1>学习服务暂未连接</h1><p>'+esc(err.message)+'</p><p>请确认已登录私人网站，或已启动本机学习站，然后刷新此页。</p><p><a href="/signin-with-chatgpt?return_to=%2F" target="_top">使用 ChatGPT 登录</a></p></div>';
 }
}
init();

