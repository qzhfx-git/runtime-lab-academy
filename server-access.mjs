// Exact allowed hosts only; never trust arbitrary forwarded-host headers.
export function serverAccess(env=process.env,port=3210){
 const local='127.0.0.1:'+port,origins=new Set(['http://'+local]),hosts=new Set([local]);
 let external=null;
 if(env.CODESPACES==='true'){
  const name=env.CODESPACE_NAME,domain=env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN||'app.github.dev';
  if(!/^[a-z0-9][a-z0-9-]{1,100}$/.test(name||'')||domain!=='app.github.dev')throw new Error('Invalid Codespaces forwarding environment');
  external=`https://${name}-${port}.${domain}`;
  origins.add(external);hosts.add(new URL(external).host);
  // Codespaces rewrites same-site Host and Origin to localhost on forwarding.
  hosts.add('localhost:'+port);origins.add('https://localhost:'+port);
 }
 return {origin:external||'http://'+local,codespaces:!!external,allows(req){
  const navigation=!!external&&req.method==='GET'&&req.url==='/'&&req.headers['sec-fetch-mode']==='navigate'&&req.headers['sec-fetch-dest']==='document';
  return hosts.has(req.headers.host)&&(!req.headers.origin||origins.has(req.headers.origin))&&(req.headers['sec-fetch-site']!=='cross-site'||navigation);
 }};
}
