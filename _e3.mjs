import fs from 'node:fs';
const f='worker.js';
let s=fs.readFileSync(f,'utf8');
const a='      let spaNotFound = false;';
if(s.indexOf(a)<0){console.error('NF');process.exit(1);}
const b=[
"      // _redirects 会把未知路径也映射成 index.html(200)，因此这里按「HTML 外壳 + 无扩展名 + 非已知路由」判定为 404",
"      const reqHasExt = /\\.[a-zA-Z0-9]+$/.test(url.pathname);",
"      const isHtmlShell = /text\\/html/i.test(res.headers.get('content-type') || '');",
"      let spaNotFound = isHtmlShell && !reqHasExt && !isKnownSpaRoute(url.pathname);"
].join('\r\n');
fs.writeFileSync(f, s.replace(a,b));
console.log('OK');