import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../_site');
const types = {'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.json':'application/json','.geojson':'application/geo+json','.xml':'application/atom+xml','.woff2':'font/woff2','.png':'image/png'};
http.createServer(async (req,res)=>{
  try {
    const url = new URL(req.url, 'http://localhost');
    const requested = decodeURIComponent(url.pathname);
    let target = path.resolve(root, '.' + requested);
    if (target !== root && !target.startsWith(root + path.sep)) {res.writeHead(403).end(); return;}
    if ((await fs.stat(target)).isDirectory()) {
      if (!requested.endsWith('/')) {res.writeHead(302,{Location:requested + '/' + url.search}).end(); return;}
      target = path.join(target, 'index.html');
    }
    const data = await fs.readFile(target);
    res.writeHead(200,{'Content-Type':types[path.extname(target)] || 'application/octet-stream','Cache-Control':'no-cache'}).end(data);
  } catch {res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'}).end('页面不存在');}
}).listen(Number(process.env.PORT || 4173), '127.0.0.1', ()=>console.log('Preview: http://127.0.0.1:' + (process.env.PORT || 4173)));
