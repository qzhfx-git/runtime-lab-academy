import {basicSetup} from 'codemirror';
import {EditorState, EditorSelection, Compartment, Prec, countColumn} from '@codemirror/state';
import {EditorView, keymap, hoverTooltip} from '@codemirror/view';
import {indentUnit, syntaxTree} from '@codemirror/language';
import {indentMore, indentLess, isolateHistory} from '@codemirror/commands';
import {autocompletion, startCompletion, acceptCompletion, snippetCompletion, hasNextSnippetField, nextSnippetField, hasPrevSnippetField, prevSnippetField} from '@codemirror/autocomplete';
import {cpp} from '@codemirror/lang-cpp';
import {oneDark} from '@codemirror/theme-one-dark';
import {library, keywords, templates, members} from './catalog.js';
import {createSemantic} from './semantic.js';
import {debugMarks} from './debug-marks.js';

let active;
const snippets=templates.map(({template,...item})=>snippetCompletion(template,{...item,type:'text',boost:2}));
const ignoredNode = (state,pos)=>/Comment|String|Char/.test(syntaxTree(state).resolveInner(pos,-1).name);
const hints = new Map([...library,...members].map(item=>[item.label,item]));

export function completionSource(fixture='') {
  return context=>{
    if(ignoredNode(context.state,context.pos))return null;
    const word=context.matchBefore(/[\w:]+/);
    const before=context.state.sliceDoc(Math.max(0,context.pos-120),context.pos);
    const member=/(?:\.|->)\w*$/.test(before);
    if(!context.explicit && !word && !member)return null;
    const from=word?.from??context.pos;
    const tail=context.state.sliceDoc(context.pos,context.state.doc.lineAt(context.pos).to).match(/^\w*/)[0];
    const to=context.pos+tail.length;
    if(word && /^\d/.test(word.text))return null;
    if(member)return {from,to,options:members,validFor:/^\w*$/};
    const qualified=word?.text.startsWith('std::');
    // This identifier list is intentionally lexical, not a claim of type analysis.
    const identifiers=[...new Set((context.state.doc.toString()+'\n'+fixture).match(/\b[A-Za-z_]\w{2,}\b/g)||[])].slice(0,700);
    const base=qualified?library:[...library,...keywords,...snippets];
    const labels=new Set(base.map(x=>x.label));
    const options=qualified?base:base.concat(identifiers.filter(x=>!labels.has(x)&&x!==word?.text).map(label=>({label,type:'variable',detail:'当前代码 / 题目中的名称'})));
    return {from,to,options,validFor:/^[\w:]*$/};
  };
}

function hover(state,pos) {
  if(ignoredNode(state,pos))return null;
  const line=state.doc.lineAt(pos), offset=pos-line.from;
  for(const match of line.text.matchAll(/(?:std::)?[A-Za-z_]\w*/g)) {
    if(offset<match.index || offset>match.index+match[0].length)continue;
    const item=hints.get(match[0]);if(!item)return null;
    return {pos:line.from+match.index,end:line.from+match.index+match[0].length,above:true,create(){
      const dom=document.createElement('div');dom.className='cpp-hover';
      const title=document.createElement('strong');title.textContent=item.detail;
      const body=document.createElement('p');body.textContent=item.info;
      dom.append(title,body);return {dom};
    }};
  }
  return null;
}

function readSettings(){try{return JSON.parse(localStorage.getItem('runtime-editor-settings')||'{}');}catch{return {};}}
function saveSettings(settings){try{localStorage.setItem('runtime-editor-settings',JSON.stringify(settings));}catch{}}
export function insertSpaces({state,dispatch}){
  if(state.selection.ranges.some(range=>!range.empty))return indentMore({state,dispatch});
  const changes=state.changeByRange(range=>{
    const line=state.doc.lineAt(range.from),column=countColumn(line.text.slice(0,range.from-line.from),state.tabSize);
    const spaces=' '.repeat(state.tabSize-column%state.tabSize);
    return {changes:{from:range.from,insert:spaces},range:EditorSelection.cursor(range.from+spaces.length)};
  });
  dispatch(state.update(changes,{scrollIntoView:true,userEvent:'input'}));return true;
}
// Map the caret by non-whitespace characters; formatting changes layout, not token order.
export function formattedOffset(oldText,newText,offset){
  const count=oldText.slice(0,offset).replace(/\s/g,'').length;
  if(!count)return 0;
  let n=0;for(let i=0;i<newText.length;i++)if(!/\s/.test(newText[i])&&++n===count)return i+1;
  return newText.length;
}

function mount({textarea,fixture='',exerciseId,languageRequest,onChange,onNotice,onRun,breakpoints,onBreakpoints,onSymbol,readOnly=false}) {
  destroy();
  if(!textarea)return false;
  const wrap=textarea.closest('.code-wrap');
  const host=document.createElement('div');host.className='rich-code';wrap.append(host);
  const stored=readSettings(),settings={indent:stored.indent===2?2:4,wrap:stored.wrap===true};
  const indent=new Compartment(),wrapping=new Compartment();
  const editable=new Compartment(),marks=breakpoints?debugMarks(breakpoints,onBreakpoints):null;
  const toolbar=document.createElement('div');toolbar.className='editor-tools';
  toolbar.innerHTML='<div class="editor-tool-actions"><button type="button" data-editor="complete" title="Ctrl + Space">代码补全 <kbd>⌃ Space</kbd></button><button type="button" data-editor="format" title="Shift + Alt + F">格式化 <kbd>⇧ Alt F</kbd></button></div><div class="editor-tool-settings"><label>缩进 <select aria-label="缩进空格数"><option value="4">4 空格</option><option value="2">2 空格</option></select></label><button type="button" data-editor="wrap" aria-pressed="false">自动换行</button><details class="editor-help"><summary aria-label="编辑器快捷键与提示说明">?</summary><div><strong>专注于代码</strong><p>输入时自动提示；悬停标准库名称查看说明。补全列表用 ↑ ↓ 选择，Enter / Tab 接受，Esc 关闭。</p><p>Tab / Shift Tab 缩进 · Ctrl Space 补全<br>Shift Alt F 格式化 · Ctrl Z 撤销<br>Ctrl F 查找 · Ctrl Enter 运行<br>Ctrl Shift Enter 提交评测</p><p>连接 clangd 后，成员补全、悬停类型与实时诊断基于 C++ 类型分析。输入 ( 或 , 自动显示参数；Ctrl Shift Space 手动调出。ClangFormat 在当前浏览器内运行。</p></div></details></div>';
  wrap.before(toolbar);
  const semantic=languageRequest?createSemantic({exerciseId,request:languageRequest,container:wrap,fallback:completionSource(fixture),onNotice}):null;
  const formatButton=toolbar.querySelector('[data-editor="format"]');
  const ctx={view:null,revision:0,destroyed:false,busy:false,worker:null,request:0,pending:null};
  const updatePosition=()=>{
    const position=document.getElementById('cursor-position');if(!position||!ctx.view)return;
    const {state}=ctx.view,head=state.selection.main.head,line=state.doc.lineAt(head);
    position.textContent=`Ln ${line.number}, Col ${head-line.from+1} · ${settings.indent} 空格 · C++20`;
  };
  const formatCode=async()=>{
    if(ctx.busy||ctx.destroyed)return;
    if(ctx.view.state.readOnly){onNotice('停止运行或调试后再格式化源码。');return;}
    const original=ctx.view.state.doc.toString(),revision=ctx.revision;
    if(!original.trim())return;
    ctx.busy=true;formatButton.disabled=true;formatButton.textContent='正在排版…';
    try {
      if(!ctx.worker)ctx.worker=new Worker('/editor/format-worker.js',{type:'module'});
      const id=++ctx.request;
      const code=await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('格式化加载超时，请重试')),25000);
        ctx.pending={reject,timer};
        ctx.worker.onmessage=({data})=>{if(data.id!==id)return;clearTimeout(timer);data.error?reject(new Error(data.error)):resolve(data.code);};
        ctx.worker.onerror=()=>{clearTimeout(timer);reject(new Error('格式化组件加载失败，请刷新后重试'));};
        ctx.worker.postMessage({id,code:original,indent:settings.indent});
      });
      if(ctx.destroyed)return;
      if(ctx.revision!==revision){onNotice('代码已继续编辑，本次排版未覆盖新内容；请再次格式化。');return;}
      if(code===original){onNotice('代码格式已经整齐');return;}
      const selection=ctx.view.state.selection.main;
      ctx.view.dispatch({changes:{from:0,to:original.length,insert:code},selection:{anchor:formattedOffset(original,code,selection.anchor),head:formattedOffset(original,code,selection.head)},annotations:[isolateHistory.of('full')],userEvent:'input.format'});
      ctx.view.focus();onNotice('已按 '+settings.indent+' 空格格式化 · Ctrl Z 可撤销');
    } catch(error) {
      ctx.worker?.terminate();ctx.worker=null;
      if(!ctx.destroyed)onNotice(error.message);
    } finally {
      if(ctx.pending)clearTimeout(ctx.pending.timer);ctx.pending=null;
      ctx.busy=false;formatButton.disabled=false;formatButton.innerHTML='格式化 <kbd>⇧ Alt F</kbd>';
    }
  };
  try {
    ctx.view=new EditorView({parent:host,state:EditorState.create({doc:textarea.value,extensions:[
      basicSetup,cpp(),oneDark,
      // A debugger jump should scroll the source pane, not move the whole page
      // and push its step/stop controls off-screen.
      EditorView.scrollHandler.of((view,range,options)=>{
        if(!view.dom.closest('.eng-code'))return false;
        // CodeMirror invokes scroll handlers during its write phase. Defer
        // layout reads so they do not throw and fall back to page scrolling.
        view.requestMeasure({key:view.scrollDOM,read:()=>{
        const pos=Math.min(range.head,view.state.doc.length),caret=view.coordsAtPos(pos);
        if(!caret){const line=view.lineBlockAt(pos);return {top:Math.max(0,line.top-(view.scrollDOM.clientHeight-line.height)/2),left:view.scrollDOM.scrollLeft};}
        const pane=view.scrollDOM,box=pane.getBoundingClientRect();
        const yMargin=Math.min(options.yMargin??12,pane.clientHeight/4);
        const xMargin=Math.min(options.xMargin??12,pane.clientWidth/4);
        const top=box.top+yMargin,bottom=box.top+pane.clientHeight-yMargin;
        let dy=0;
        if(options.y==='center')dy=(caret.top+caret.bottom-box.top*2-pane.clientHeight)/2;
        else if(options.y==='start')dy=caret.top-top;
        else if(options.y==='end')dy=caret.bottom-bottom;
        else if(caret.top<top)dy=caret.top-top;
        else if(caret.bottom>bottom)dy=caret.bottom-bottom;
        const left=box.left+(view.dom.querySelector('.cm-gutters')?.getBoundingClientRect().width||0)+xMargin;
        const right=box.left+pane.clientWidth-xMargin;
        const dx=caret.left<left?caret.left-left:caret.right>right?caret.right-right:0;
        return {top:pane.scrollTop+dy,left:pane.scrollLeft+dx};
        },write:({top,left})=>{view.scrollDOM.scrollTop=top;view.scrollDOM.scrollLeft=left;}});
        return true;
      }),
      editable.of([EditorState.readOnly.of(readOnly),EditorView.editable.of(!readOnly)]),...(marks?.extensions||[]),
      indent.of([indentUnit.of(' '.repeat(settings.indent)),EditorState.tabSize.of(settings.indent)]),
      wrapping.of(settings.wrap?EditorView.lineWrapping:[]),
      autocompletion({override:[semantic?.completion||completionSource(fixture)],activateOnTyping:true,icons:true,maxRenderedOptions:50}),
      hoverTooltip((state,pos)=>semantic?.connected()?null:hover(state,pos),{hoverTime:350}),
      ...(semantic?.extensions||[]),
      Prec.highest(keymap.of([
        {key:'Mod-Enter',run:()=>{onRun('run');return true;},stopPropagation:true},
        {key:'Mod-Shift-Enter',run:()=>{onRun('submit');return true;},stopPropagation:true},
        {key:'Tab',run:view=>acceptCompletion(view)||(hasNextSnippetField(view.state)&&nextSnippetField(view))||insertSpaces(view)},
        {key:'Shift-Tab',run:view=>(hasPrevSnippetField(view.state)&&prevSnippetField(view))||indentLess(view)},
        {key:'Alt-Shift-f',run:()=>{void formatCode();return true;}},
        {key:'Ctrl-Space',run:startCompletion},
        ...(onSymbol?[{key:'F12',run:()=>{onSymbol('definition');return true;}},{key:'Shift-F12',run:()=>{onSymbol('references');return true;}},{key:'F2',run:()=>{onSymbol('rename');return true;}}]:[]),
      ])),
      EditorView.contentAttributes.of({'aria-label':'C++ 代码编辑器','spellcheck':'false','autocapitalize':'off'}),
      EditorView.updateListener.of(update=>{
        if(update.docChanged){ctx.revision++;textarea.value=update.state.doc.toString();onChange();}
        if(update.docChanged||update.selectionSet)updatePosition();
      }),
      Prec.high(EditorView.theme({'&':{height:'100%',backgroundColor:'#0b101b'},'.cm-scroller':{overflow:'auto',fontFamily:'"Cascadia Code", Consolas, monospace',fontSize:'14px',lineHeight:'1.75'},'.cm-content':{padding:'16px 0'},'.cm-gutters':{backgroundColor:'#0b101b',borderRight:'1px solid #ffffff08',color:'#5f6c85'},'.cm-line':{padding:'0 20px 0 12px'},'&.cm-focused':{outline:'none'},'.cm-activeLine':{backgroundColor:'#72a9ff09'},'.cm-activeLineGutter':{backgroundColor:'#72a9ff12'},'.cm-tooltip':{border:'1px solid #354058',borderRadius:'9px',boxShadow:'0 16px 44px #0008'},'.cm-tooltip-autocomplete':{maxWidth:'min(600px, 92vw)'},'.cm-completionDetail':{color:'#94a6c4',fontStyle:'normal'},'.cm-selectionBackground, &.cm-focused .cm-selectionBackground':{backgroundColor:'#34669965'},'.cm-cursor':{borderLeftColor:'#9bc8ff'}})),
    ]})});
    wrap.classList.add('rich-editor');textarea.hidden=true;textarea.tabIndex=-1;
    active={ctx,textarea,wrap,host,toolbar,formatCode,semantic,marks,editable};
    semantic?.attach(ctx.view);
    toolbar.querySelector('select').value=String(settings.indent);
    toolbar.querySelector('select').onchange=event=>{settings.indent=Number(event.target.value);ctx.view.dispatch({effects:indent.reconfigure([indentUnit.of(' '.repeat(settings.indent)),EditorState.tabSize.of(settings.indent)])});saveSettings(settings);updatePosition();};
    const wrapButton=toolbar.querySelector('[data-editor="wrap"]');wrapButton.setAttribute('aria-pressed',String(settings.wrap));
    toolbar.onclick=event=>{
      const action=event.target.closest('[data-editor]')?.dataset.editor;
      if(action==='complete'){ctx.view.focus();startCompletion(ctx.view);}
      if(action==='format')void formatCode();
      if(action==='wrap'){settings.wrap=!settings.wrap;ctx.view.dispatch({effects:wrapping.reconfigure(settings.wrap?EditorView.lineWrapping:[])});wrapButton.setAttribute('aria-pressed',String(settings.wrap));saveSettings(settings);}
    };
    updatePosition();return true;
  } catch(error) {
    semantic?.destroy();ctx.view?.destroy();toolbar.remove();host.remove();onNotice('高级编辑器未能加载，仍可在文本框中编辑。');return false;
  }
}

function destroy(){
  if(!active)return;
  const {ctx,textarea,wrap,host,toolbar,semantic}=active;
  semantic?.destroy();
  ctx.destroyed=true;ctx.pending?.reject(new Error('编辑器已关闭'));ctx.worker?.terminate();ctx.view.destroy();
  host.remove();toolbar.remove();wrap.classList.remove('rich-editor');textarea.hidden=false;textarea.removeAttribute('tabindex');active=null;
}
if(typeof window!=='undefined')window.LabEditor={mount,destroy,focus(){active?.ctx.view.focus();},isActive(){return !!active;},symbol(op,name){return active?.semantic?.symbol(op,name);},cursor(){const v=active?.ctx.view;if(!v)return null;const p=v.state.selection.main.head,l=v.state.doc.lineAt(p);return {line:l.number,character:p-l.from};},goTo(line,character=0,{focus=true}={}){const v=active?.ctx.view;if(!v)return;const l=v.state.doc.line(Math.max(1,Math.min(line,v.state.doc.lines)));v.dispatch({selection:{anchor:Math.min(l.to,l.from+character)},effects:EditorView.scrollIntoView(l.from,{y:'center'})});if(focus)v.focus();},execution(line){if(active?.marks)active.marks.execution(active.ctx.view,line);},readOnly(value){if(active)active.ctx.view.dispatch({effects:active.editable.reconfigure([EditorState.readOnly.of(value),EditorView.editable.of(!value)])});},setBreakpoints(lines){if(active?.marks)active.marks.set(active.ctx.view,lines);}};
