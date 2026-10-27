import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist-portal'),port=Number(process.env.PORT||3215);
const prefix='/runtime-lab/';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.zip':'application/zip'};
http.createServer((req,res)=>{
 if(req.headers.host!==`127.0.0.1:${port}`){res.writeHead(403);res.end();return;}
 const pathname=new URL(req.url,'http://127.0.0.1').pathname;
 if(pathname==='/'){res.writeHead(302,{Location:prefix});res.end();return;}
 if(!['GET','HEAD'].includes(req.method)||!pathname.startsWith(prefix)){res.writeHead(404);res.end();return;}
 const relative=decodeURIComponent(pathname.slice(prefix.length))||'index.html',target=path.resolve(root,relative);
 if(!target.startsWith(root+path.sep)||!fs.existsSync(target)||!fs.statSync(target).isFile()){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
 if(req.method==='HEAD')res.end();else fs.createReadStream(target).pipe(res);
}).listen(port,'127.0.0.1',()=>console.log(`Static-only preview at http://127.0.0.1:${port}${prefix}`));
