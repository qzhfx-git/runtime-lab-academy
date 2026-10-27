import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../public/cloud-lab.js',import.meta.url),'utf8');
function harness(){
 const elements=new Map(),timers=new Map(),images=[],opened=[],redirected=[],storage=new Map();let timerId=0,now=0;
 const element=selector=>{if(!elements.has(selector))elements.set(selector,{textContent:'',disabled:false});return elements.get(selector);};
 const dialog={open:false,dataset:{},setAttribute(){},remove(){},addEventListener(){},showModal(){this.open=true;},close(){this.open=false;},querySelector:element};
 const context={window:{open:(...args)=>opened.push(args)},state:{view:'home',data:{portal:{defaultCodespace:'test-runtime-lab'},environment:{location:'portal'}}},
  URL,Image:class{constructor(){images.push(this);}},crypto:{randomUUID:()=> 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'},
  Date:{now:()=>now},setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId;},clearTimeout:id=>timers.delete(id),
  document:{createElement:()=>dialog,body:{append(){}}},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
  location:{hash:'#/engineering/study-ecs-identity-evolve',assign:url=>redirected.push(url)},esc:s=>String(s??''),
  Studies:{flush:async()=>{}},Engineering:{flush:async()=>{}},Academy:{flush:async()=>{}}};
 vm.runInNewContext(source,context);
 return {...context,api:context.window.CloudLab,dialog,elements,timers,images,opened,redirected,setNow:value=>now=value};
}
const t=harness(),api=t.api;
for(const input of ['test-runtime-lab','https://test-runtime-lab.github.dev/?autoStart=false','https://github.com/codespaces/test-runtime-lab','https://test-runtime-lab-3210.app.github.dev/#/practice/weak-lock'])assert.equal(api.codespaceName(input),'test-runtime-lab');
for(const input of ['javascript:alert(1)','https://evil.test','https://test.github.dev.evil.test','https://user:secret@test.github.dev','https://test.github.dev:4433','https://test-8080.app.github.dev/','https://test.github.dev/other','../../bad'])assert.throws(()=>api.codespaceName(input));
assert.equal(api.addresses('test-runtime-lab','#/practice/weak-lock').study,'https://test-runtime-lab-3210.app.github.dev/#/practice/weak-lock');
assert.equal(api.route('#//evil.test'),'#/home');assert.equal(api.route('#/settings'),'#/home');
api.open();assert.equal(t.opened.length,0);assert.equal(t.images.length,0,'opening the panel must not probe or start compute');
t.elements.get('[data-cloud-start]').onclick();assert.equal(t.opened.length,1);assert.equal(t.opened[0][0],'https://test-runtime-lab.github.dev');
assert.equal(t.opened[0][2],'noopener,noreferrer');assert.match(t.images[0].src,/\/lab-ready\.png\?attempt=[a-f0-9]{32}$/);
t.images[0].onerror();assert.equal(t.redirected.length,0,'authentication and network errors must never report ready');
const retry=[...t.timers.values()].find(timer=>timer.ms===5000);t.setNow(120001);retry.fn();
assert.equal(t.dialog.dataset.phase,'waiting');assert.equal(t.redirected.length,0);assert.equal(t.elements.get('[data-cloud-start]').disabled,false);
t.elements.get('[data-cloud-start]').onclick();t.images.at(-1).onload();
await new Promise(resolve=>setImmediate(resolve));assert.equal(t.redirected[0],'https://test-runtime-lab-3210.app.github.dev/#/engineering/study-ecs-identity-evolve');
const cancelled=harness();cancelled.api.open();cancelled.elements.get('[data-cloud-start]').onclick();const callback=cancelled.images[0].onload;cancelled.elements.get('[data-cloud-close]').onclick();callback();
await new Promise(resolve=>setImmediate(resolve));assert.equal(cancelled.redirected.length,0);assert.equal(cancelled.timers.size,0);
const saving=harness();let release;saving.Engineering.flush=()=>new Promise(resolve=>release=resolve);saving.api.open();saving.elements.get('[data-cloud-start]').onclick();saving.images[0].onload();await new Promise(resolve=>setImmediate(resolve));saving.elements.get('[data-cloud-close]').onclick();release();await new Promise(resolve=>setImmediate(resolve));assert.equal(saving.redirected.length,0,'closing while saving must cancel navigation');
console.log('PASS: launcher validates addresses, preserves routes, never starts on load, handles auth/timeout, and cancels stale navigation');
