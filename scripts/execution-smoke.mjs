import assert from 'node:assert/strict';
import {judge,setupRunner} from '../judge.mjs';
import {curriculum} from '../curriculum.mjs';
setupRunner();
const exercise=curriculum.exercises.find(e=>e.id==='weak-lock');
for(const [name,code,expected]of [
 ['reference',exercise.solution,'AC'],['unfinished',exercise.starter,'WA'],
 ['compiler error','this is not C++;','CE'],
 ['time limit','std::shared_ptr<Player> acquire(const std::weak_ptr<Player>&){while(true){} return {};}','TLE'],
 ['memory limit','std::shared_ptr<Player> acquire(const std::weak_ptr<Player>&){std::vector<char> data(512u*1024u*1024u);std::cout<<data.size();return {};}','RE'],
 ['output limit','std::shared_ptr<Player> acquire(const std::weak_ptr<Player>&){std::cout<<std::string(2000000,\'x\');return {};}','OLE']
]){
 const result=await judge(exercise,code,'submit');assert.equal(result.status,expected,name+': '+JSON.stringify({status:result.status,compileOutput:result.compileOutput,tests:result.tests.map(t=>({status:t.status,exitCode:t.exitCode,stderr:t.stderr.slice(0,2000)}))}));console.log('PASS: '+name+' => '+result.status);
}
const controller=new AbortController();
const cancelled=await judge(exercise,'std::shared_ptr<Player> acquire(const std::weak_ptr<Player>&){while(true){} return {};}', 'run',{signal:controller.signal,onStage(stage){if(stage==='running')setTimeout(()=>controller.abort(),100);}});
assert.equal(cancelled.status,'CANCELLED');console.log('PASS: cancellation');
