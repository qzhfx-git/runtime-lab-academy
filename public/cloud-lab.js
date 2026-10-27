window.CloudLab=(()=>{
 const isPortal=()=>state.data?.environment.location==='portal';
 const isCodespace=()=>state.data?.environment.location==='codespaces';
 function links(){
  const p=state.data.portal||{};
  return `${p.createUrl?`<a class="btn primary" href="${esc(p.createUrl)}" target="_blank" rel="noopener">首次创建云实验室 ↗</a>`:'<span class="cloud-pending">云实验室地址待发布</span>'}<a class="btn ghost" href="https://github.com/codespaces" target="_blank" rel="noopener">继续已有实验室 ↗</a>`;
 }
 function settings(){return `<header class="academy-page-head"><span class="a-eyebrow">YOUR PERSONAL CLOUD LAB</span><h1>课程随时读。<br><span class="spectral-text">工程在云端跑。</span></h1><p>公网课程页＋个人 GitHub Codespaces。无需保持自己的电脑开机。</p></header><section class="cloud-guide"><div><span class="a-eyebrow">01 / READ</span><h2>当前：课程阅读空间</h2><p>完整讲义、参考实现、源码研修、工程模板和自测均可使用。笔记、草稿和自评保存在此浏览器，不会自动同步到云实验室。</p><p>自测用于检查理解，不等同于编译或工程验收通过。</p></div><div><span class="a-eyebrow">02 / BUILD & DEBUG</span><h2>个人云实验室</h2><p>登录 GitHub，创建 2 核 Codespace。初始化完成后打开 Ports 面板的 3210 端口，即可使用同一学习站的 C++ 编译、clangd 补全、CMake、GDB 和工程验收。</p><div class="cloud-links">${links()}</div></div><div><span class="a-eyebrow">03 / KEEP YOUR WORK</span><h2>保存与费用边界</h2><p>在云实验室内完成代码练习最方便。工程可用工作台的 JSON 导出／导入在两处转移；阅读笔记可用顶部「导出学习数据」备份。</p><p>Codespaces 个人免费额度有上限，停止后仍占用存储。用完请停止，删除前先导出工程和学习数据。保持转发端口 Private，只运行你信任的代码。不要为本次试用开启付费额度。</p><a class="text-link" href="https://docs.github.com/en/billing/concepts/product-billing/github-codespaces" target="_blank" rel="noopener">查看 GitHub 最新免费额度与计费规则 ↗</a></div></section>`;}
 function mount(){
  if(!isPortal()&&!isCodespace())return;
  const main=document.getElementById('main-content');if(!main)return;
  const banner=document.createElement('aside');banner.className='cloud-notice';banner.setAttribute('aria-label','运行环境');
  banner.innerHTML=isPortal()?`<div><span class="cloud-dot"></span><strong>课程阅读空间</strong><p>草稿保存在此浏览器。运行、调试与验收请进入个人云实验室。</p></div><a class="text-link" href="#/settings" data-nav="settings">进入云实验室 →</a>`:`<div><span class="cloud-dot"></span><strong>个人云实验室 · Linux</strong><p>使用当前 Codespace 的 GCC、clangd 与 GDB。学习数据保存在此云工作区。</p></div><span class="cloud-detail">3210 端口请保持 Private</span>`;
  main.before(banner);
 }
 return {isPortal,isCodespace,settings,mount};
})();
