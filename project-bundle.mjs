import {fixture} from './judge.mjs';
// Uncompressed ZIP, generated entirely from authored source files; no shell or external service.
function crc32(buffer){let c=0xffffffff;for(const b of buffer){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
export function zipFiles(files){
 const bodies=[],directory=[];let offset=0;
 for(const [name,text] of Object.entries(files)){
  const filename=Buffer.from(name),data=Buffer.from(text),crc=crc32(data);
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(0x21,12);local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(filename.length,26);
  bodies.push(local,filename,data);
  const entry=Buffer.alloc(46);entry.writeUInt32LE(0x02014b50);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);entry.writeUInt16LE(0x800,8);entry.writeUInt16LE(0x21,14);entry.writeUInt32LE(crc,16);entry.writeUInt32LE(data.length,20);entry.writeUInt32LE(data.length,24);entry.writeUInt16LE(filename.length,28);entry.writeUInt32LE(offset,42);directory.push(entry,filename);
  offset+=local.length+filename.length+data.length;
 }
 const central=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(files).length,8);end.writeUInt16LE(Object.keys(files).length,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...bodies,central,end]);
}
export function projectFiles(project,exercises){
 const tasks=project.exercises.map(id=>exercises.find(e=>e.id===id));
 const files={'fixture.hpp':fixture,'.gitignore':'build/\n', 'DESIGN.md':'# 设计与验证记录\n\n'+project.rubric.map(q=>'## '+q+'\n\n待填写：实现位置、证据、取舍与未决问题。\n').join('\n')};
 files['CMakeLists.txt']='cmake_minimum_required(VERSION 3.20)\nproject(RuntimeLab LANGUAGES CXX)\nset(CMAKE_CXX_STANDARD 20)\nset(CMAKE_CXX_STANDARD_REQUIRED ON)\nenable_testing()\nfind_package(Threads REQUIRED)\n';
 for(const e of tasks){
  const target=e.id.replaceAll('-','_');files[`solutions/${e.id}.hpp`]=e.starter+'\n';
  files[`tests/${e.id}.cpp`]=`#include "fixture.hpp"\n${e.preamble||''}\n#include "solutions/${e.id}.hpp"\nint main(int argc,char**argv){ if(argc!=2)return 2;std::ostringstream captured;auto* original=std::cout.rdbuf(captured.rdbuf());std::string expected;try{switch(std::stoi(argv[1])){\n`+e.tests.map((t,i)=>`case ${i}:{expected=${JSON.stringify(t.expected.trim())};${t.body}break;}`).join('\n')+'\ndefault:std::cout.rdbuf(original);return 2;}}catch(const std::exception& e){std::cout.rdbuf(original);std::cerr<<e.what();return 3;}std::cout.rdbuf(original);auto actual=captured.str();while(!actual.empty()&&(actual.back()==\' \'||actual.back()==\'\\n\'||actual.back()==\'\\r\'||actual.back()==\'\\t\'))actual.pop_back();if(actual!=expected){std::cerr<<"Expected: "<<expected<<"\\nActual: "<<actual;return 1;}std::cout<<"PASS\\n";return 0;}\n';
  // The generated harness captures outputs and compares to the same authored expectations.
  files[`tests/${e.id}.cpp`]='#include <sstream>\n'+files[`tests/${e.id}.cpp`];
  files['CMakeLists.txt']+=`\nadd_executable(${target} tests/${e.id}.cpp)\ntarget_include_directories(${target} PRIVATE \$\{CMAKE_CURRENT_SOURCE_DIR\})\ntarget_link_libraries(${target} PRIVATE Threads::Threads)\n`+e.tests.map((_,i)=>`add_test(NAME ${target}_${i} COMMAND ${target} ${i})\nset_tests_properties(${target}_${i} PROPERTIES TIMEOUT 10)`).join('\n')+'\n';
 }
 files['README.md']=`# ${project.title}\n\n${project.brief}\n\n## 构建\n\n需要 CMake 3.20+、C++20 编译器和可用构建工具。MSYS2 UCRT64 示例（已安装 Ninja 时）：\n\n    cmake -S . -B build -G Ninja -DCMAKE_CXX_COMPILER=g++\n    cmake --build build\n    ctest --test-dir build --output-on-failure\n\n初始代码刻意未完成，测试失败是预期行为；填写 solutions 中的实现。tests 为可检查的测试驱动，不包含参考实现。\n\n## 练习\n\n${tasks.map(e=>'### '+e.title+'\n\n'+e.objective+'\n\n'+e.contract.map(c=>'- '+c).join('\n')).join('\n\n')}\n\n## 工程验收\n\n${project.rubric.map(q=>'- [ ] '+q).join('\n')}\n\n有限功能测试不证明复杂度、并发正确性或职业等级。线上本机评测有资源限制，直接运行下载的工程不附带这些限制；请审查自己编写的代码。\n`;
 return files;
}
export function projectBundle(project,exercises){return zipFiles(projectFiles(project,exercises));}
export function lessonBundle(lesson,exercises){
 const d=lesson.depth;
 const project={title:lesson.title,brief:lesson.subtitle,exercises:[...new Set(d.stages.map(s=>s.exerciseId).concat('deep-'+lesson.id))],rubric:d.stages.flatMap(s=>s.acceptance)};
 const files=projectFiles(project,exercises);
 files['example.cpp']=d.example.code;
 files['CMakeLists.txt']+='\nadd_executable(complete_example example.cpp)\ntarget_link_libraries(complete_example PRIVATE Threads::Threads)\nadd_test(NAME complete_example COMMAND complete_example)\nset_tests_properties(complete_example PROPERTIES TIMEOUT 10)\n';
 files['WORKSHOP.md']='# '+lesson.title+'\n\n'+d.stages.map((s,i)=>'## '+(i+1)+'. '+s.title+'\n\n'+s.task+'\n\n### 交付物\n'+s.deliverables.map(x=>'- '+x).join('\n')+'\n\n### 验收\n'+s.acceptance.map(x=>'- [ ] '+x).join('\n')+'\n\n提示：'+s.hint).join('\n\n')+'\n\n## 完整示例输出\n\n```text\n'+d.example.expectedOutput+'\n```\n\nREADME 中的构建命令会同时构建完整示例与工程练习。完整示例用于走读；solutions 中的练习需要你自行完成。';
 return zipFiles(files);
}
