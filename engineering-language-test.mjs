import assert from 'node:assert/strict';
import {LanguageService} from './language-service.mjs';
import {compiler} from './judge.mjs';
const files={'CMakeLists.txt':'cmake_minimum_required(VERSION 3.20)\nproject(Test LANGUAGES CXX)','include/widget.hpp':'#pragma once\nstruct Widget { int value; int doubled() const; };\n','src/widget.cpp':'#include "widget.hpp"\nint Widget::doubled() const { return value * 2; }\n','src/main.cpp':'#include "widget.hpp"\nint main() { Widget w{7}; auto result = w.doubled(); return result; }\n'};
const service=new LanguageService({exercises:new Map(),fixture:'',compiler});
let session;
const p=word=>({line:1,character:files['src/main.cpp'].split('\n')[1].indexOf(word)+2});
try{
 const opened=await service.handle({op:'open',files,file:'src/main.cpp',code:files['src/main.cpp'],version:1});session=opened.session;
 const call=(op,extra={})=>service.handle({op,session,code:files['src/main.cpp'],version:1,...extra});
 const diag=await call('diagnostics');assert.equal(diag.pending,false);assert.equal(diag.diagnostics.filter(d=>d.severity===1).length,0,JSON.stringify(diag));
 const definition=await call('definition',{position:p('doubled')});assert.ok(definition.result.some(r=>r.file==='src/widget.cpp'||r.file==='include/widget.hpp'),JSON.stringify(definition));
 const references=await call('references',{position:p('doubled')});assert.ok(references.result.some(r=>r.file==='src/main.cpp'));assert.ok(references.result.some(r=>r.file==='src/widget.cpp'),JSON.stringify(references));
 const rename=await call('rename',{position:p('doubled'),newName:'twice'});assert.ok(rename.result.length>=3,JSON.stringify(rename));assert.ok(rename.result.every(f=>Object.hasOwn(files,f.file)));
 const code=files['src/main.cpp'].replace('auto result = w.doubled(); return result;','w.; return 0;');const pos={line:1,character:code.split('\n')[1].indexOf('w.')+2};
 const completion=await service.handle({op:'completion',session,code,version:2,position:pos});const items=Array.isArray(completion.result)?completion.result:completion.result.items;assert.ok(items.some(i=>i.label.includes('doubled')));assert.ok(items.some(i=>i.label.includes('value')));
 console.log('PASS: cross-file C++ completion, diagnostics, definition, references and three-file rename');
}finally{service.dispose();}
