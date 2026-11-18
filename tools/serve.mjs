#!/usr/bin/env node
// خادم ملفات ثابتة صغير للتطوير والاختبار:  node tools/serve.mjs [port] [dir]
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

// base: مسار فرعي (مثل /daftar/) لمحاكاة GitHub Pages. getRoot: دالة تعيد مجلد الجذر (يمكن تبديله أثناء الاختبار).
export function startServer({ port = 0, getRoot, base = '/' } = {}) {
  const server = createServer((req, res) => {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (!path.startsWith(base)) {
      res.writeHead(404).end('not found');
      return;
    }
    path = normalize('/' + path.slice(base.length));
    let file = join(getRoot(), path);
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!file.startsWith(getRoot()) || !existsSync(file)) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok({ server, port: server.address().port, url: `http://127.0.0.1:${server.address().port}${base}`, close: () => new Promise((r) => server.close(r)) })));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[3] || join(dirname(fileURLToPath(import.meta.url)), '../app'));
  startServer({ port: Number(process.argv[2]) || 8080, getRoot: () => root }).then((s) => console.log(`دفتر الخير: ${s.url}`));
}
