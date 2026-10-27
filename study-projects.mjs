import {studyModels} from './study-models.mjs';

const common=String.raw`#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstddef>
#include <functional>
#include <iostream>
#include <latch>
#include <limits>
#include <stdexcept>
#include <string>
#include <vector>
`;
export const studyStageDefinitions=[
 {id:'baseline',title:'01 / 建立参考行为',purpose:'构建并运行基线，沿数据、所有权和状态变化追踪一次完整操作。',expected:'基线测试应通过；用断点确认自己预测的状态。'},
 {id:'fault',title:'02 / 故障取证',purpose:'工程中已注入一个可复现缺陷。先记录症状和假设，再调试失败用例。',expected:'此快照预期出现失败。保存定位证据，失败不代表环境坏了。'},
 {id:'repair',title:'03 / 修复并回归',purpose:'在故障实现上修复根因，保留公开契约，验证已有用例。',expected:'修复后原有契约、生命周期与边界测试应通过。'},
 {id:'evolve',title:'04 / 在新约束下演进',purpose:'新需求增加一项验收条件；从上一阶段已保存实现继承，再处理兼容与资源代价。',expected:'已有用例与新增 evolution 用例都需要通过。'}
];

function changed(source,pair){if(!source.includes(pair[0]))throw new Error('Missing study source anchor '+pair[0]);return source.replace(pair[0],pair[1]);}
const shell=String.raw`#!/usr/bin/env bash
set -euo pipefail
lab_profile=debug
if [ "$#" -gt 0 ]; then lab_profile="$1"; fi
lab_build="build/$lab_profile"
lab_flags="-Wall -Wextra -Wpedantic"
case "$lab_profile" in
 debug) ;;
 release) ;;
 asan) lab_flags="$lab_flags -fsanitize=address,undefined -fno-omit-frame-pointer" ;;
 tsan) lab_flags="$lab_flags -fsanitize=thread -fno-omit-frame-pointer" ;;
 *) echo "usage: bash tools/verify.sh [debug|release|asan|tsan]"; exit 2 ;;
esac
lab_type=Debug
if [ "$lab_profile" = release ]; then lab_type=Release; fi
cmake -S . -B "$lab_build" -DCMAKE_BUILD_TYPE="$lab_type" -DCMAKE_CXX_FLAGS="$lab_flags"
cmake --build "$lab_build" --parallel 2
ctest --test-dir "$lab_build" --output-on-failure --no-tests=error
`;
const powershell=String.raw`param([ValidateSet('Debug','Release')][string]$Configuration='Debug')
$ErrorActionPreference='Stop'
$labBuild="build/$Configuration"
& cmake -S . -B $labBuild "-DCMAKE_BUILD_TYPE=$Configuration"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& cmake --build $labBuild --config $Configuration --parallel 2
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& ctest --test-dir $labBuild -C $Configuration --output-on-failure --no-tests=error
exit $LASTEXITCODE
`;
const ci=String.raw`name: Study validation
on: [push, pull_request, workflow_dispatch]
jobs:
  linux:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cmake -S . -B build -DCMAKE_CXX_COMPILER=g++ -DCMAKE_BUILD_TYPE=Debug
      - run: cmake --build build --config Debug --parallel 2
      - run: ctest --test-dir build -C Debug --output-on-failure --no-tests=error
      - run: cmake -S . -B build-clang -DCMAKE_CXX_COMPILER=clang++ -DCMAKE_BUILD_TYPE=Debug
      - run: cmake --build build-clang --parallel 2
      - run: ctest --test-dir build-clang --output-on-failure --no-tests=error
  windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - run: cmake -S . -B build -A x64
      - run: cmake --build build --config Debug --parallel 2
      - run: ctest --test-dir build -C Debug --output-on-failure --no-tests=error
  sanitizer:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: bash tools/verify.sh asan
      - run: bash tools/verify.sh tsan
`;
export const portableFiles={'tools/verify.sh':shell,'tools/verify.ps1':powershell,'.github/workflows/verify.yml':ci};

function project(model,stage,reference=false){
 const source=reference||stage==='baseline'?model.source:changed(model.source,stage==='evolve'?model.evolution:model.fault);
 const cases=Object.keys(model.cases).filter(k=>k!=='evolution'||stage==='evolve');
 const driver=common+'#include "model.hpp"\nint main(){std::cout<<"Open a CTest failure under GDB, then compare the state with DESIGN.md.\\n";return 0;}\n';
 const test=common+'#include "model.hpp"\nvoid require(bool ok,const char* message){if(!ok)throw std::runtime_error(message);}\nvoid check(const std::string& name){\n'+cases.map(name=>'if(name=="'+name+'"){'+model.cases[name]+'return;}').join('\n')+'\nif(name=="benchmark"){auto begin=std::chrono::steady_clock::now();for(int i=0;i<20;++i)check("contract");std::cout<<"20 contract iterations: "<<std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::steady_clock::now()-begin).count()<<" us (not a production benchmark)\\n";return;}throw std::runtime_error("unknown test");}\nint main(int argc,char** argv){if(argc!=2)return 2;try{check(argv[1]);std::cout<<"PASS "<<argv[1]<<"\\n";return 0;}catch(const std::exception& e){std::cerr<<"FAIL "<<argv[1]<<": "<<e.what()<<"\\n";return 1;}}\n';
 const cmake=`cmake_minimum_required(VERSION 3.20)
project(ArchitectureStudy LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
find_package(Threads REQUIRED)
enable_testing()
add_library(study_model INTERFACE)
target_include_directories(study_model INTERFACE include)
target_link_libraries(study_model INTERFACE Threads::Threads)
add_executable(study_demo src/main.cpp)
target_link_libraries(study_demo PRIVATE study_model)
add_executable(study_tests tests/model_test.cpp)
target_link_libraries(study_tests PRIVATE study_model)
foreach(case ${cases.join(' ')} benchmark)
  add_test(NAME study_\${case} COMMAND study_tests \${case})
  set_tests_properties(study_\${case} PROPERTIES LABELS \${case} TIMEOUT 8)
endforeach()
`;
 return {'CMakeLists.txt':cmake,'include/model.hpp':common+source,'src/main.cpp':driver,'tests/model_test.cpp':test,'runtime-lab.json':JSON.stringify({name:'Architecture study',runTarget:'study_tests',args:['contract']},null,2)+'\n',...portableFiles};
}
function boundaryProject(stage,reference){
 const broken=!reference&&['fault','repair'].includes(stage),privateInclude=!reference&&stage==='evolve';
 return {'CMakeLists.txt':`cmake_minimum_required(VERSION 3.20)
project(BuildBoundaries LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
enable_testing()
add_library(service STATIC src/service.cpp)
target_include_directories(service ${privateInclude?'PRIVATE':'PUBLIC'} include)
add_executable(study_tests tests/service_test.cpp)
target_link_libraries(study_tests PRIVATE service)
add_test(NAME study_contract COMMAND study_tests contract)
set_tests_properties(study_contract PROPERTIES LABELS contract)
`, 'include/service.hpp':`#pragma once\n${broken?'':'inline '}int registry_epoch=1;\nint answer();\n`, 'src/service.cpp':'#include "service.hpp"\nint answer(){return registry_epoch+41;}\n', 'tests/service_test.cpp':'#include "service.hpp"\n#include <iostream>\nint main(){if(answer()!=42||registry_epoch!=1)return 1;std::cout<<"public usage requirement and ODR contract PASS\\n";}\n','runtime-lab.json':JSON.stringify({runTarget:'study_tests',args:['contract']},null,2)+'\n',...portableFiles};
}
const names={'async-log':'异步日志的关闭与容量','expression':'表达式求值与别名','async-lifetime':'异步会话与过期完成','memory-budget':'跨子系统内存预算','event-lifetime':'事件派发与退订','container-cost':'容器布局与增长成本','rpc-contract':'重试、截止时间与副作用','ecs-identity':'游戏实体身份与帧边界','resource-streaming':'游戏资源热重载与预算','framegraph':'帧图依赖与临时资源','build-boundaries':'构建、链接与库边界'};
export const studyTemplates=[],studyReferenceFiles={};
for(const [id,title]of Object.entries(names))for(const stage of studyStageDefinitions){
 const files=id==='build-boundaries'?boundaryProject(stage.id,false):project(studyModels[id],stage.id);
 const reference=id==='build-boundaries'?boundaryProject(stage.id,true):project(studyModels[id],stage.id,true);
 for(const target of [files,reference])target['DESIGN.md']=`# ${title}\n\n## 当前任务\n${stage.purpose}\n${stage.expected}\n\n## 约束与不变量\n填写数据流、所有权、线程边界与资源预算。\n\n## 故障证据\n记录复现命令、断点位置、观测值、排除的假设与修复理由。\n\n## 演进与兼容\n说明新要求改变了哪些边界，以及保留了哪些旧契约。\n\n## 测量\n记录编译器、配置、样本、程序内存计数与墙钟时间；不把模型计数当作 RSS 或 GPU 显存。\n\n## 跨平台\nLinux/macOS: bash tools/verify.sh debug\nWindows: powershell -File tools/verify.ps1\nLinux 动态检测: bash tools/verify.sh asan / tsan\n导出的 GitHub Actions 是待运行配置；网站没有替你执行云端 CI。\n\n## 范围\n这是独立编写的机制训练模型，未链接上游框架，不代表完整框架的性能、线程安全或生产适用性。请同时完成研修页的固定版本源码阅读。\n`;
 const templateId=`study-${id}-${stage.id}`;
 studyTemplates.push({id:templateId,title:title+' · '+stage.title,description:stage.purpose,studyId:id,stage:stage.id,expected:stage.expected,files,inheritFrom:stage.id==='evolve'?`study-${id}-repair`:null,implementationFiles:id==='build-boundaries'?['include/service.hpp','src/service.cpp']:['include/model.hpp']});
 studyReferenceFiles[templateId]=reference;
}
