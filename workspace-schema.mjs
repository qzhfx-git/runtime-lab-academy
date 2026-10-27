const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export function validName(name){return typeof name==='string'&&name.length<180&&(/^[A-Za-z0-9_-][A-Za-z0-9_./-]*$/.test(name)||/^\.github\/workflows\/[A-Za-z0-9_-]+\.ya?ml$/.test(name))&&name.split('/').every(s=>s&&s!=='.'&&s!=='..'&&!/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(s))&&(/\.(cpp|cc|cxx|hpp|h|hxx|txt|md|json|cmake|sh|ps1|yml|yaml)$/i.test(name));}
export function validateFiles(files){
 if(!files||Array.isArray(files)||typeof files!=='object')throw fail('无效工程文件');
 const entries=Object.entries(files),seen=new Set();let size=0;
 if(!entries.length||entries.length>80)throw fail('工程需要 1–80 个文本文件');
 for(const [name,code]of entries){if(!validName(name)||typeof code!=='string'||code.includes('\0')||code.length>100000)throw fail('无效文件：'+name);if(seen.has(name.toLowerCase()))throw fail('存在大小写冲突文件');seen.add(name.toLowerCase());size+=new TextEncoder().encode(code).length;}
 if(size>600000)throw fail('工程总大小不能超过 600 KB',413);
 if(!files['CMakeLists.txt'])throw fail('缺少 CMakeLists.txt');return files;
}
export function validateWorkspace(data){
 if(!data||! /^[a-z0-9-]{1,80}$/.test(data.id||''))throw fail('无效工程标识');validateFiles(data.files);
 if(typeof data.title!=='string'||data.title.length>120||!Object.hasOwn(data.files,data.activeFile))throw fail('无效工程信息');
 if(!Array.isArray(data.breakpoints)||data.breakpoints.length>100||data.breakpoints.some(b=>!Object.hasOwn(data.files,b.file)||!Number.isInteger(b.line)||b.line<1||b.line>data.files[b.file].split('\n').length))throw fail('无效断点');
 if(data.report&&(typeof data.report!=='object'||JSON.stringify(data.report).length>350000))throw fail('验收报告过大');
 if(!Number.isSafeInteger(data.revision)||data.revision<0)throw fail('无效保存版本');
 return {id:data.id,title:data.title,files:data.files,activeFile:data.activeFile,breakpoints:data.breakpoints,report:data.report||null,revision:data.revision};
}
