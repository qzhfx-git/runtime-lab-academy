import {StateEffect,StateField,RangeSet} from '@codemirror/state';
import {gutter,GutterMarker,Decoration,EditorView} from '@codemirror/view';
class BreakMarker extends GutterMarker{toDOM(){const el=document.createElement('span');el.textContent='●';el.title='移除断点';el.className='debug-breakpoint';return el;}}
const dot=new BreakMarker();
export function debugMarks(initial,onChange){
 const replace=StateEffect.define(),execution=StateEffect.define();
 const field=StateField.define({create(state){return RangeSet.of(initial.filter(n=>n>0&&n<=state.doc.lines).map(n=>dot.range(state.doc.line(n).from)),true);},update(value,tr){value=value.map(tr.changes);for(const e of tr.effects)if(e.is(replace))value=RangeSet.of(e.value.filter(n=>n>0&&n<=tr.state.doc.lines).map(n=>dot.range(tr.state.doc.line(n).from)),true);return value;}});
 const line=StateField.define({create:()=>Decoration.none,update(value,tr){value=value.map(tr.changes);for(const e of tr.effects)if(e.is(execution))value=e.value>0&&e.value<=tr.state.doc.lines?Decoration.set([Decoration.line({class:'debug-current-line'}).range(tr.state.doc.line(e.value).from)]):Decoration.none;return value;},provide:f=>EditorView.decorations.from(f)});
 const lines=state=>{const values=[];state.field(field).between(0,state.doc.length,from=>values.push(state.doc.lineAt(from).number));return [...new Set(values)];};
 return {extensions:[field,line,gutter({class:'debug-gutter',markers:view=>view.state.field(field),initialSpacer:()=>dot,domEventHandlers:{mousedown(view,block){const n=view.state.doc.lineAt(block.from).number,current=lines(view.state),next=current.includes(n)?current.filter(x=>x!==n):[...current,n];view.dispatch({effects:replace.of(next)});onChange(next);return true;}}}),EditorView.updateListener.of(u=>{if(u.docChanged)onChange(lines(u.state));})],set(view,values){view.dispatch({effects:replace.of(values)});},execution(view,n){view.dispatch({effects:execution.of(n)});}};
}
