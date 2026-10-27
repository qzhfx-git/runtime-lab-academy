import {EditorSelection} from '@codemirror/state';
import {EditorView,hoverTooltip,keymap} from '@codemirror/view';
import {setDiagnostics,lintGutter,openLintPanel,closeLintPanel} from '@codemirror/lint';
import {snippet} from '@codemirror/autocomplete';
import {syntaxTree} from '@codemirror/language';

export function offsetOf(doc,p){const line=doc.line(Math.min(doc.lines,Math.max(1,p.line+1)));return Math.min(line.to,line.from+Math.max(0,p.character));}
const positionOf=(doc,pos)=>{const line=doc.lineAt(pos);return {line:line.number-1,character:pos-line.from};};
const plain=value=>typeof value==='string'?value:value?.value||'';
const inComment=(state,pos)=>/Comment|String|Char/.test(syntaxTree(state).resolveInner(pos,-1).name);
const types={1:'text',2:'method',3:'function',4:'constructor',5:'property',6:'variable',7:'class',8:'interface',9:'namespace',10:'property',13:'enum',14:'keyword',15:'text',21:'constant',22:'class',25:'type'};

export function diagnosticItems(doc,items){return items.map(d=>{
  let from=offsetOf(doc,d.range.start),to=offsetOf(doc,d.range.end);
  if(to<=from){if(from<doc.length)to=from+1;else if(from>0)from--;}
  return {from,to,severity:d.severity===1?'error':d.severity===2?'warning':'info',message:d.message,source:'clangd'+(d.code?' · '+d.code:'')};
});}

export function createSemantic({exerciseId,request,container,fallback,onNotice}){
  let view,session,opening,dead=false,connected=false,revision=1,diagTimer,signatureTimer,signatureSequence=0,diagSequence=0,signatureData,signatureIndex=0;
  let lastSignaturePos=-1,liveSignature=false,reconnectAttempted=false;
  const panel=document.createElement('div');panel.className='language-panel';
  const bar=document.createElement('div');bar.className='language-bar';
  const status=document.createElement('span');status.className='language-status';status.setAttribute('role','status');status.textContent='clangd · 正在连接…';
  const actions=document.createElement('div');actions.className='language-actions';
  const parameterButton=document.createElement('button');parameterButton.textContent='参数提示';parameterButton.title='Ctrl + Shift + Space';
  const problemsButton=document.createElement('button');problemsButton.textContent='问题';problemsButton.setAttribute('aria-pressed','false');
  const retry=document.createElement('button');retry.textContent='重连';retry.hidden=true;
  const settings=document.createElement('a');settings.href='#/settings';settings.textContent='连接设置';settings.dataset.nav='settings';settings.hidden=true;
  actions.append(parameterButton,problemsButton,retry,settings);bar.append(status,actions);
  const signatures=document.createElement('div');signatures.className='signature-help';signatures.hidden=true;signatures.setAttribute('aria-label','函数参数提示');signatures.setAttribute('role','region');
  panel.append(bar,signatures);container.before(panel);
  const setStatus=(text,kind='')=>{status.textContent=text;status.dataset.kind=kind;};
  const unavailable=error=>{
    if(dead)return;connected=false;retry.hidden=false;settings.hidden=false;setStatus('类型分析未连接','offline');
    status.title=error.message;panel.dataset.reason=error.message;
    let note=panel.querySelector('.language-unavailable');if(!note){note=document.createElement('p');note.className='language-unavailable';panel.append(note);}note.textContent=error.message;
    if(view)view.dispatch(setDiagnostics(view.state,[]));hideSignature();
  };
  const connecting=()=>{setStatus('clangd · 正在分析题目类型…');retry.hidden=true;settings.hidden=true;panel.querySelector('.language-unavailable')?.remove();};
  async function connect(){
    if(opening)return opening;if(dead||!view)return;
    connecting();
    opening=(async()=>{
      if(session){const old=session;session=null;await request({op:'close',session:old}).catch(()=>{});}
      const health=await request({op:'status'});if(!health.available)throw new Error(health.message);
      const initial=await request({op:'open',exerciseId,code:view.state.doc.toString(),version:revision});
      if(dead){await request({op:'close',session:initial.session}).catch(()=>{});return;}
      session=initial.session;connected=true;setStatus('clangd · C++20 · 已连接','ready');scheduleDiagnostics(0);
    })().catch(unavailable).finally(()=>{opening=null;});return opening;
  }
  async function call(op,pos,extra={}){
    if(!connected||!session)throw Object.assign(new Error('类型分析未连接'),{offline:true});
    const version=revision,doc=view.state.doc,params={op,session,code:doc.toString(),version,...extra};
    if(pos!==undefined)params.position=positionOf(doc,pos);
    try{const response=await request(params);if(dead||version!==revision||response.version!==version)return null;return response;}
    catch(error){
      if(dead||version!==revision||error.status===409)return null;
      if(error.status===410&&!reconnectAttempted){reconnectAttempted=true;session=null;connected=false;void connect();return null;}
      unavailable(error);return null;
    }
  }
  function scheduleDiagnostics(delay=450){clearTimeout(diagTimer);if(!connected||dead)return;diagTimer=setTimeout(diagnostics,delay);}
  async function diagnostics(){
    const seq=++diagSequence;
    const response=await call('diagnostics').catch(()=>null);if(!response||dead||seq!==diagSequence)return;
    if(response.pending){setStatus('clangd · 正在分析…');scheduleDiagnostics(650);return;}
    const items=diagnosticItems(view.state.doc,response.diagnostics||[]);
    view.dispatch(setDiagnostics(view.state,items));const errors=items.filter(d=>d.severity==='error').length,warnings=items.filter(d=>d.severity==='warning').length;
    setStatus(errors||warnings?`clangd · ${errors} 个错误 · ${warnings} 个警告`:'clangd · 未发现语法 / 类型错误',errors?'error':warnings?'warning':'ready');
    problemsButton.textContent=`问题 ${items.length}`;
  }
  async function completion(context){
    if(inComment(context.state,context.pos))return null;
    if(opening)await opening;
    if(dead||context.aborted||context.state.doc!==view.state.doc)return null;
    const before=context.state.sliceDoc(Math.max(0,context.pos-150),context.pos),word=context.matchBefore(/\w*/);
    const member=/(?:\.|->)\w*$/.test(before),scope=/::\w*$/.test(before);
    if(!context.explicit&&!word?.text&&!member&&!scope)return null;
    if(/^\d/.test(word?.text||''))return null;
    if(!connected){if(member)return null;return fallback(context);}
    const response=await call('completion',context.pos);if(!response||context.aborted)return null;
    const items=Array.isArray(response.result)?response.result:response.result?.items||[];
    const doc=context.state.doc,version=revision,mainEdit=items.find(i=>i.textEdit)?.textEdit;
    const range=mainEdit?.replace||mainEdit?.range||mainEdit?.insert;
    const from=range?offsetOf(doc,range.start):word?.from??context.pos;
    const to=range?offsetOf(doc,range.end):context.pos;
    const options=items.map(item=>({
      label:item.filterText||item.label.trim(),displayLabel:item.label.trim(),detail:item.detail||item.labelDetails?.description||'',type:types[item.kind]||'variable',
      info:[item.labelDetails?.detail,plain(item.documentation),item.detail].filter(Boolean).join('\n'),
      boost:0,apply(editor,_completion,start,end){
        // LSP edits refer to the exact version that produced this completion list.
        if(revision!==version)return;
        const edit=item.textEdit,editRange=edit?.replace||edit?.range||edit?.insert;
        const a=editRange?offsetOf(editor.state.doc,editRange.start):start,b=editRange?offsetOf(editor.state.doc,editRange.end):end;
        const text=edit?.newText||item.insertText||item.filterText||item.label.trim();
        if(item.insertTextFormat===2){
          const template=text.replace(/\$(\d+)/g,'${$1}')+(/\$(?:0\b|\{0(?::|\}))/.test(text)?'':'${0}');snippet(template)(editor,_completion,a,b);
        }else editor.dispatch({changes:{from:a,to:b,insert:text},selection:EditorSelection.cursor(a+text.length),userEvent:'input.complete'});
        if([2,3,4].includes(item.kind)&&text.includes('('))setTimeout(()=>showSignature(false),0);
      },
    }));
    // Keep our engineering templates; never mix untyped members into semantic candidates.
    if(!member&&!scope){for(const option of fallback(context)?.options||[])if(option.type==='text'&&option.label.includes('-'))options.push(option);}
    return {from,to,options};
  }
  function hideSignature(){liveSignature=false;signatureData=null;signatures.hidden=true;signatures.replaceChildren();}
  function drawSignature(){
    const all=signatureData?.signatures||[];if(!all.length){hideSignature();return;}
    const info=all[signatureIndex],parameter=info.activeParameter??signatureData.activeParameter??0,entry=info.parameters?.[parameter];
    signatures.replaceChildren();signatures.hidden=false;liveSignature=true;
    const head=document.createElement('div');head.className='signature-heading';
    const name=document.createElement('span');name.textContent='函数参数';head.append(name);
    if(all.length>1){for(const [label,delta]of [['‹',-1],['›',1]]){const b=document.createElement('button');b.textContent=label;b.setAttribute('aria-label',delta<0?'上一个函数重载':'下一个函数重载');b.onclick=()=>{signatureIndex=(signatureIndex+delta+all.length)%all.length;drawSignature();view.focus();};head.append(b);}const count=document.createElement('span');count.textContent=`${signatureIndex+1} / ${all.length} 个重载`;head.append(count);}
    const close=document.createElement('button');close.textContent='×';close.setAttribute('aria-label','关闭参数提示');close.onclick=()=>{signatureSequence++;hideSignature();view.focus();};head.append(close);signatures.append(head);
    const code=document.createElement('code');let offsets=entry?.label;
    if(typeof offsets==='string'){const index=info.label.indexOf(offsets);offsets=index<0?null:[index,index+offsets.length];}
    if(Array.isArray(offsets)){code.append(document.createTextNode(info.label.slice(0,offsets[0])));const current=document.createElement('mark');current.textContent=info.label.slice(...offsets);code.append(current,document.createTextNode(info.label.slice(offsets[1])));}else code.textContent=info.label;
    signatures.append(code);const documentation=plain(entry?.documentation)||plain(info.documentation);if(documentation){const p=document.createElement('p');p.textContent=documentation;signatures.append(p);}
  }
  async function showSignature(explicit=false){
    clearTimeout(signatureTimer);if(opening)await opening;if(!connected||dead)return;
    const pos=view.state.selection.main.head,seq=++signatureSequence;lastSignaturePos=pos;
    if(/Comment/.test(syntaxTree(view.state).resolveInner(pos,-1).name)){hideSignature();return;}
    const response=await call('signature',pos);
    if(!response||dead||seq!==signatureSequence||pos!==view.state.selection.main.head)return;
    if(!response.result?.signatures?.length){hideSignature();if(explicit)onNotice('当前位置没有可显示的函数参数');return;}
    signatureData=response.result;signatureIndex=Math.min(signatureData.activeSignature||0,signatureData.signatures.length-1);drawSignature();
  }
  const hover=hoverTooltip(async(state,pos)=>{
    if(!connected||inComment(state,pos))return null;
    const response=await call('hover',pos);if(!response?.result)return null;
    const result=response.result,content=Array.isArray(result.contents)?result.contents.map(plain).join('\n'):plain(result.contents);
    if(!content)return null;const range=result.range;
    return {pos:range?offsetOf(state.doc,range.start):pos,end:range?offsetOf(state.doc,range.end):pos,above:true,create(){const dom=document.createElement('div');dom.className='semantic-hover';dom.textContent=content;return {dom};}};
  },{hoverTime:400});
  parameterButton.onclick=()=>{view.focus();void showSignature(true);};
  problemsButton.onclick=()=>{const open=problemsButton.getAttribute('aria-pressed')!=='true';if(open)openLintPanel(view);else closeLintPanel(view);problemsButton.setAttribute('aria-pressed',String(open));};
  retry.onclick=()=>{reconnectAttempted=false;void connect();};
  return {
    completion,
    async symbol(op,newName){if(opening)await opening;if(!connected)throw new Error('请先连接 clangd');return call(op,view.state.selection.main.head,{newName});},
    extensions:[lintGutter(),hover,keymap.of([{key:'Mod-Shift-Space',run:()=>{void showSignature(true);return true;}},{key:'Escape',run:()=>{if(!liveSignature)return false;signatureSequence++;hideSignature();return true;}}]),EditorView.updateListener.of(update=>{
      if(update.docChanged){revision++;diagSequence++;scheduleDiagnostics();if(connected)setStatus('clangd · 正在分析…');}
      if(update.docChanged||update.selectionSet){
        const pos=update.state.selection.main.head,character=update.state.sliceDoc(Math.max(0,pos-1),pos);
        if(!update.state.selection.main.empty){signatureSequence++;hideSignature();return;}
        if(liveSignature||((character==='('||character===',')&&update.docChanged)){
          clearTimeout(signatureTimer);signatureSequence++;signatureTimer=setTimeout(()=>showSignature(false),180);
        }else if(pos!==lastSignaturePos){signatureSequence++;}
      }
    })],
    attach(editor){view=editor;void connect();},
    connected:()=>connected,
    destroy(){dead=true;clearTimeout(diagTimer);clearTimeout(signatureTimer);signatureSequence++;diagSequence++;if(session)request({op:'close',session}).catch(()=>{});panel.remove();},
  };
}
