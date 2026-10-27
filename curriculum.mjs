import fs from 'node:fs';
import {advancedExercises} from './advanced-curriculum.mjs';
import {modules,lessons,projects} from './academy.mjs';
import {depthLanguage} from './depth-language.mjs';
import {depthFoundations} from './depth-foundations.mjs';
import {depthSystems} from './depth-systems.mjs';
const base=JSON.parse(fs.readFileSync(new URL('./curriculum.json',import.meta.url),'utf8'));
const extraTopics=[
 ['modern','现代 C++ 语言与标准库'],['templates','泛型、Concepts 与 CRTP'],['structures','数据结构与工程建模'],
 ['patterns','设计模式与接口'],['concurrency','线程协作与任务执行'],['atomics','原子操作与内存模型'],
 ['performance','数据布局与性能'],['engineering','异常安全与工程质量']
].map(([id,name])=>({id,name,phase:'工程进阶',summary:modules.find(m=>m.topics.includes(id))?.description||name,status:'available'}));
const depth={...depthLanguage,...depthFoundations,...depthSystems};
const workshops=lessons.map(l=>{
 const d=depth[l.id];if(!d)throw new Error('Missing deep lesson '+l.id);
 l.depth=d;l.minutes=Math.max(l.minutes,90);l.exercises=[...new Set([...l.exercises,d.workshop.id])];
 return {topic:modules.find(m=>m.id===l.module).topics[0],difficulty:'工程深化',minutes:60,...d.workshop};
});
export const curriculum={roadmap:[...base.roadmap,...extraTopics],exercises:[...base.exercises,...advancedExercises,...workshops],academy:{modules,lessons,projects}};
for(const topic of curriculum.roadmap)if(curriculum.exercises.some(e=>e.topic===topic.id)&&topic.status==='planned')topic.status='available';
const ids=new Set();
for(const e of curriculum.exercises){if(ids.has(e.id))throw new Error('Duplicate exercise '+e.id);ids.add(e.id);}
const lessonIds=new Set();
for(const l of lessons){
 if(lessonIds.has(l.id))throw new Error('Duplicate lesson '+l.id);lessonIds.add(l.id);
 if(!modules.some(m=>m.id===l.module))throw new Error('Missing module '+l.module);
 for(const id of l.exercises)if(!ids.has(id))throw new Error('Missing exercise '+id);
 for(const stage of l.depth.stages)if(!ids.has(stage.exerciseId))throw new Error('Missing stage exercise '+stage.exerciseId);
 if(l.quiz.some(q=>!Number.isInteger(q.answer)||q.answer<0||q.answer>=q.options.length))throw new Error('Invalid quiz '+l.id);
}
