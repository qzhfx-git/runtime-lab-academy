import assert from 'node:assert/strict';
import {LanguageService} from './language-service.mjs';
import {fixture,compiler} from './judge.mjs';
import {curriculum} from './curriculum.mjs';

const service=new LanguageService({exercises:new Map(curriculum.exercises.map(e=>[e.id,e])),fixture,compiler});
let version=1,session;
async function request(op,source){const pos=source.indexOf('|'),code=source.replace('|','');return service.handle({op,session,code,version:++version,...(pos>=0?{position:{line:code.slice(0,pos).split('\n').length-1,character:pos-(code.lastIndexOf('\n',pos-1)+1)}}:{})});}
async function diagnostics(code){let r=await request('diagnostics',code);while(r.pending)r=await service.handle({op:'diagnostics',session,version,code});return r.diagnostics;}
try{
  ({session}=await service.handle({op:'open',exerciseId:'weak-lock',code:'void demo() {}',version}));
  const pointer=await request('completion','void demo(){auto player=std::make_shared<Player>(); player->|}');
  const names=pointer.result.items.map(x=>x.filterText);assert(names.includes('hp'));assert(!names.includes('push_back'));
  const vector=await request('completion','void demo(){std::vector<int> values; values.|}');
  assert(vector.result.items.some(x=>x.filterText==='push_back'));assert(!vector.result.items.some(x=>x.filterText==='hp'));
  const custom=await request('completion','struct Session { int retries; void reconnect(int attempts); }; void demo(){Session state; auto& alias=state; alias.|}');
  assert(custom.result.items.some(x=>x.filterText==='retries'));assert(custom.result.items.some(x=>x.filterText==='reconnect'));
  const crtp=await request('completion','template<class D> struct Base { void run(){static_cast<D*>(this)->execute();} }; struct Engine:Base<Engine>{ void execute(){} }; void demo(){Engine e; e.|}');
  assert(crtp.result.items.some(x=>x.filterText==='run'));assert(crtp.result.items.some(x=>x.filterText==='execute'));
  const overloads=await request('signature','int compute(int count, double scale); int compute(const char* text); void demo(){compute(|);}');
  assert.equal(overloads.result.signatures.length,2);
  const sig=await request('signature','int compute(int count, double scale); int compute(const char* text); void demo(){compute(2, |);}');
  assert(sig.result.signatures.some(s=>s.label.includes('double scale')));assert.equal(sig.result.activeParameter,1);
  const hover=await request('hover','void demo(){auto player=std::make_shared<Player>(); pla|yer->hp=1;}');
  assert(JSON.stringify(hover.result).includes('shared_ptr'));
  const errors=await diagnostics('// 中文与 emoji 🧪\nvoid demo(){Player p; p.missing = 1;}');
  assert(errors.some(d=>d.severity===1&&d.range.start.line===1&&d.message.includes('missing')));
  assert.deepEqual(await diagnostics('std::shared_ptr<Player> acquire(const std::weak_ptr<Player>& observer){return observer.lock();}'),[]);
  await assert.rejects(service.handle({op:'diagnostics',session,code:'void wrong(){}',version:1}),e=>e.status===409);
  await assert.rejects(service.handle({op:'completion',session,code:'',version:++version,position:{line:99,character:0}}),e=>e.status===400);
  await service.handle({op:'close',session});await assert.rejects(service.handle({op:'hover',session,code:'',version:++version}),e=>e.status===410);
  ({session}=await service.handle({op:'open',exerciseId:'locked-counter',code:'void demo(){}',version:++version}));
  const mutex=await request('completion','void demo(){std::mutex mutex; mutex.|}');
  assert(mutex.result.items.some(i=>i.filterText==='try_lock'));
  assert.deepEqual(await diagnostics('void demo(){std::mutex mutex; std::lock_guard guard(mutex);}'),[]);
  console.log('clangd integration passed: pointer/vector/custom/CRTP members, overload parameters, auto hover, diagnostics + recovery, stale versions and closed sessions.');
}finally{service.dispose();}
