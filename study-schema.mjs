const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export const studyIds=['async-log','expression','async-lifetime','memory-budget','event-lifetime','container-cost','rpc-contract','ecs-identity','resource-streaming','framegraph','build-boundaries'];
export function validateStudyRecord(data){
 if(!data||!studyIds.includes(data.id))throw fail('研修单元不存在');
 if(!Number.isSafeInteger(data.revision)||data.revision<0)throw fail('无效研修记录版本');
 if(!data.notes||typeof data.notes!=='object'||['architecture','hypothesis','evidence','decision'].some(k=>typeof data.notes[k]!=='string'||data.notes[k].length>15000))throw fail('无效研修笔记');
 if(!Array.isArray(data.checks)||data.checks.length!==3||data.checks.some(v=>typeof v!=='boolean'))throw fail('无效阅读自评');
 return {id:data.id,revision:data.revision,notes:Object.fromEntries(['architecture','hypothesis','evidence','decision'].map(k=>[k,data.notes[k]])),checks:data.checks};
}
export function workspaceStudySummary(w){return {id:w.id,updated:w.updated,mode:w.report?.mode||null,status:w.report?.status||null,hash:w.report?.hash||null,executedAt:w.report?.created||null,checks:w.report?.checks?.map(c=>({name:c.name,status:c.status}))||[]};}
// Fetch progress without loading every engineering source snapshot into the Worker.
export const studyWorkspaceProjection="json_object('id',json_extract(value,'$.id'),'updated',json_extract(value,'$.updated'),'report',json_object('mode',json_extract(value,'$.report.mode'),'status',json_extract(value,'$.report.status'),'hash',json_extract(value,'$.report.hash'),'created',json_extract(value,'$.report.created')))";
