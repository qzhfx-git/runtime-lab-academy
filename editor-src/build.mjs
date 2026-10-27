import {build} from 'esbuild';
import {mkdir,copyFile,readFile,writeFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const out=path.join(root,'public/editor');await mkdir(out,{recursive:true});
await build({entryPoints:[path.join(root,'editor-src/editor.js')],bundle:true,minify:true,format:'iife',target:'es2022',outfile:path.join(out,'editor.js'),legalComments:'linked'});
await build({entryPoints:[path.join(root,'editor-src/format-worker.js')],bundle:true,minify:true,format:'esm',target:'es2022',outfile:path.join(out,'format-worker.js'),legalComments:'linked'});
await copyFile(path.join(root,'node_modules/@wasm-fmt/clang-format/clang-format.wasm'),path.join(out,'clang-format.wasm'));
const notices=[];
for(const name of ['codemirror','@codemirror/state','@codemirror/view','@codemirror/language','@codemirror/commands','@codemirror/autocomplete','@codemirror/search','@codemirror/lint','@codemirror/lang-cpp','@codemirror/theme-one-dark','@lezer/common','@lezer/highlight','@lezer/lr','@lezer/cpp','@wasm-fmt/clang-format','style-mod','w3c-keyname','crelt','@marijn/find-cluster-break']){
 const dir=path.join(root,'node_modules',name);try{const files=await readdir(dir);for(const f of files.filter(f=>/^licen[cs]e|^notice/i.test(f)))notices.push(name+' / '+f+'\n'+await readFile(path.join(dir,f),'utf8'));}catch{}
}
await writeFile(path.join(out,'LICENSES.txt'),notices.join('\n\n────────────\n\n'));
console.log('Built self-hosted C++ editor and ClangFormat worker.');
