window.CloudLab=(()=>{
 const isPortal=()=>state.data?.environment.location==='portal';
 const isCodespace=()=>state.data?.environment.location==='codespaces';
 const key='runtime-lab-codespace-v1';
 let dialog=null,launchVersion=0,probeTimer=null,probeCleanup=null,returnHash='#/home';
 function codespaceName(value){
  let name=String(value||'').trim();
  if(name.startsWith('https://')){
   const u=new URL(name);
   if(u.username||u.password||u.port)throw Error('请粘贴 GitHub Codespace 地址，不要包含账号或密钥。');
   if(u.hostname==='github.com'&&/^\/codespaces\/[^/]+\/?$/.test(u.pathname))name=u.pathname.split('/')[2];
   else if(u.hostname.endsWith('.app.github.dev')&&u.pathname==='/'){
    const prefix=u.hostname.slice(0,-'.app.github.dev'.length);
    if(!prefix.endsWith('-3210'))throw Error('请使用学习站地址或 Codespace 编辑器地址。');
    name=prefix.slice(0,-5);
   }
   else if(u.hostname.endsWith('.github.dev')&&u.pathname==='/')name=u.hostname.slice(0,-'.github.dev'.length);
   else throw Error('请使用 GitHub Codespace 的名称或完整地址。');
  }
  if(!/^[a-z0-9][a-z0-9-]{1,98}[a-z0-9]$/.test(name))throw Error('实验室名称无效，请复制 Codespace 的完整地址。');
  return name;
 }
 function route(hash){return /^#\/(?:home|courses|lesson|practice|studies|engineering|project|library|roadmap|assessment|history)(?:\/[a-z0-9-]+)?$/.test(hash||'')?hash:'#/home';}
 function addresses(name,hash){const n=codespaceName(name),base=`https://${n}-3210.app.github.dev`;return {name:n,start:`https://${n}.github.dev`,base,study:base+'/'+route(hash)};}
 function selected(){let stored='';try{stored=localStorage.getItem(key)||'';}catch{}try{return codespaceName(stored||state.data?.portal?.defaultCodespace);}catch{return '';}}
 function stopProbe(){launchVersion++;clearTimeout(probeTimer);probeTimer=null;probeCleanup?.();probeCleanup=null;}
 async function flushWork(){await Studies.flush();await Engineering.flush();await Academy.flush();if(state.view==='work'){capture();await save();}}
 function message(title,detail,phase='idle'){
  if(!dialog?.open)return;
  dialog.querySelector('[data-launch-title]').textContent=title;
  dialog.querySelector('[data-launch-detail]').textContent=detail;dialog.dataset.phase=phase;
  dialog.querySelector('[data-cloud-start]').disabled=!selected()||phase==='starting'||phase==='ready';
 }
 function close(){stopProbe();dialog?.close();}
 async function enter(url){const version=launchVersion;try{await flushWork();if(version===launchVersion&&dialog?.open)location.assign(url);}catch(e){if(version===launchVersion)message('草稿尚未保存',e.message+'。请先导出或保存，再进入实验室。','error');}}
 function probe(lab,version,started){
  if(version!==launchVersion||!dialog?.open)return;
  if(Date.now()-started>=120000){stopProbe();message('尚未确认就绪','请完成 GitHub 登录并等待启动。浏览器也可能限制跨站检测；可直接点击「进入学习界面」，无需找端口。','waiting');return;}
  const image=new Image();let finished=false;
  const finish=ready=>{
   if(finished)return;finished=true;clearTimeout(timeout);image.onload=image.onerror=null;probeCleanup=null;
   if(version!==launchVersion||!dialog?.open)return;
   if(ready){stopProbe();message('实验室已就绪','正在保存当前草稿并进入学习界面…','ready');void enter(lab.study);}
   else probeTimer=setTimeout(()=>probe(lab,version,started),5000);
  };
  const timeout=setTimeout(()=>finish(false),4000);
  probeCleanup=()=>{finished=true;clearTimeout(timeout);image.onload=image.onerror=null;};
  image.onload=()=>finish(true);image.onerror=()=>finish(false);
  // No API token, source code or learning data leaves the course page.
  // HTML login/error pages cannot decode as an image and signal readiness.
  image.referrerPolicy='no-referrer';image.src=lab.base+'/lab-ready.png?attempt='+crypto.randomUUID().replaceAll('-','');
 }
 function launch(){
  const name=selected();if(!name){message('先绑定你的实验室','在下方填入已有 Codespace 的名称或地址。','error');return;}
  stopProbe();const lab=addresses(name,returnHash);
  // Only a user click opens the existing instance. Page loads never start compute.
  window.open(lab.start,'_blank','noopener,noreferrer');
  message('正在等待云实验室','已请求在新标签页打开 GitHub 启动入口。完成登录后，检测到服务就绪会自动进入；若新页未打开，请点击下方「打开启动页」。','starting');
  probe(lab,launchVersion,Date.now());
 }
 function bindingMarkup(){const name=selected(),p=state.data.portal||{};return `<form class="cloud-binding"><label for="cloud-address">实验室名称或地址</label><div class="cloud-bind-row"><input id="cloud-address" name="address" autocomplete="off" spellcheck="false" value="${esc(name)}" placeholder="粘贴你的 Codespace 地址" required><button class="btn" type="submit">保存绑定</button></div><p>仅在此浏览器记住地址。这里只能打开所属 GitHub 账号的实验室，不需要填写密钥。</p></form>${p.createUrl?`<a class="text-link" href="${esc(p.createUrl)}" target="_blank" rel="noopener noreferrer">还没有实验室？首次创建 ↗</a>`:''}`;}
 function drawDialog(){
  const name=selected(),lab=name?addresses(name,returnHash):null;
  dialog.innerHTML=`<div class="cloud-launch-head"><span class="a-eyebrow">YOUR CLOUD WORKSPACE</span><button class="btn ghost small" data-cloud-close aria-label="关闭云实验室入口">关闭 ×</button></div><h2 id="cloud-launch-heading">从这里，继续构建。</h2><p class="cloud-launch-intro">启动你的个人云实验室，接着完成当前课程或工程。</p><div class="cloud-launch-status" role="status" aria-live="polite"><span class="cloud-launch-indicator"></span><div><strong data-launch-title>${lab?'实验室入口已绑定':'连接你的实验室'}</strong><p data-launch-detail>${lab?'点击启动并进入。若已在运行，可以直接进入学习界面。':'绑定一次后，就不用再寻找端口地址。'}</p></div></div><div class="cloud-launch-actions"><button class="btn primary" data-cloud-start ${lab?'':'disabled'}>启动并进入 <span aria-hidden="true">↗</span></button><button class="btn ghost" data-cloud-enter ${lab?'':'disabled'}>进入学习界面 →</button></div>${lab?`<div class="cloud-launch-meta"><span>${esc(lab.name)}</span><a href="${esc(lab.start)}" target="_blank" rel="noopener noreferrer">打开启动页 ↗</a></div>`:''}<details class="cloud-binding-details" ${lab?'':'open'}><summary>更换 / 绑定实验室</summary>${bindingMarkup()}</details><p class="cloud-launch-foot">启动后使用你的 Codespaces 额度。讲义页和云实验室的草稿分别保存；进入时保留页面位置，源码不会自动搬移。</p>`;
  dialog.dataset.phase='idle';
  dialog.querySelector('[data-cloud-close]').onclick=close;
  dialog.querySelector('[data-cloud-start]').onclick=launch;
  dialog.querySelector('[data-cloud-enter]').onclick=()=>{stopProbe();if(lab)void enter(lab.study);};
  dialog.querySelector('form').onsubmit=e=>{e.preventDefault();stopProbe();try{const n=codespaceName(new FormData(e.currentTarget).get('address'));localStorage.setItem(key,n);drawDialog();message('已保存实验室入口','下次从网站直接启动或进入，不用再填写地址。');}catch(err){message('无法保存绑定',err.message,'error');}};
 }
 function open(){returnHash=route(location.hash);stopProbe();dialog?.remove();dialog=document.createElement('dialog');dialog.className='cloud-launcher';dialog.setAttribute('aria-labelledby','cloud-launch-heading');document.body.append(dialog);drawDialog();dialog.addEventListener('close',stopProbe);dialog.addEventListener('cancel',stopProbe);dialog.showModal();}
 function settings(){return `<header class="academy-page-head"><span class="a-eyebrow">YOUR PERSONAL CLOUD LAB</span><h1>打开网站。<br><span class="spectral-text">继续你的工程。</span></h1><p>一个学习入口，连接完整的云端编译、类型分析与调试环境。</p></header><section class="cloud-guide"><div class="cloud-launch-card"><span class="a-eyebrow">01 / YOUR WORKSPACE</span><h2>个人云实验室</h2><p>已绑定实验室后，点击下方按钮即可启动并进入。若实验室已启动，也可直接进入学习界面，不用查找端口。</p><div class="cloud-links"><button class="btn primary" data-cloud-open>启动 / 继续云实验室 ↗</button></div><p class="cloud-small">GitHub 可能要求登录。免费额度用完或实例被删除时，启动页会给出原因。</p></div><div><span class="a-eyebrow">02 / READ & BUILD</span><h2>从当前页面接着学</h2><p>进入实验室时保留课程、练习或工程位置。讲义、参考实现和自测随时可读；真实执行、clangd 补全和 GDB 调试在个人云工作区中完成。</p><p>课程页与云实验室分别保存学习数据，工程源码可以使用 JSON 导出／导入转移。</p></div><div><span class="a-eyebrow">03 / KEEP YOUR WORK</span><h2>保存与额度</h2><p>云实验室停止后保留数据，删除前请先导出。课程页草稿存于当前浏览器，清理浏览器数据前也请备份。</p><p>Codespaces 免费计算与存储额度有上限。用完请停止实例，端口保持 Private。</p><a class="text-link" href="https://github.com/codespaces" target="_blank" rel="noopener noreferrer">管理 / 停止实验室 ↗</a> · <a class="text-link" href="https://docs.github.com/en/billing/concepts/product-billing/github-codespaces" target="_blank" rel="noopener noreferrer">查看免费额度 ↗</a></div></section>`;}
 function mount(){
  if(!isPortal()&&!isCodespace())return;
  close();dialog?.remove();dialog=null;
  const main=document.getElementById('main-content');if(!main)return;
  const banner=document.createElement('aside');banner.className='cloud-notice';banner.setAttribute('aria-label','运行环境');
  banner.innerHTML=isPortal()?`<div><span class="cloud-dot"></span><strong>课程阅读空间</strong><p>讲义随时读，代码在个人云实验室运行。</p></div><button class="btn primary small" data-cloud-open>启动 / 继续云实验室 ↗</button>`:`<div><span class="cloud-dot"></span><strong>个人云实验室 · Linux</strong><p>编译、类型分析与调试已连接当前云工作区。</p></div><span class="cloud-detail">学习数据保存在此云实验室</span>`;
  main.before(banner);document.querySelectorAll('[data-cloud-open]').forEach(button=>button.onclick=open);
 }
 return {isPortal,isCodespace,settings,mount,open,codespaceName,route,addresses};
})();
