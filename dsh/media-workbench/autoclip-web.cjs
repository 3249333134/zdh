// Original AutoClip frontend with a same-origin, loopback-only backend proxy.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../autoclip/frontend/dist');
const backendPort = Number(process.env.AUTOCLIP_BACKEND_PORT);
if (!Number.isInteger(backendPort) || backendPort < 1 || backendPort > 65535) throw new Error('Invalid AutoClip port');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  if (req.headers.host !== '127.0.0.1:13002') { res.writeHead(403); res.end(); return; }
  if (req.url === '/health' || req.url.startsWith('/api/') || req.url.startsWith('/static/')) {
    const upstream = http.request({ hostname: '127.0.0.1', port: backendPort, path: req.url, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${backendPort}` } }, response => { res.writeHead(response.statusCode, response.headers); response.pipe(res); });
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('剪辑服务暂不可用，请重新打开工作台。'); });
    req.on('aborted', () => upstream.destroy()); req.pipe(upstream); return;
  }
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1:13002').pathname); } catch { res.writeHead(400); res.end(); return; }
  let file = path.resolve(root, '.' + pathname);
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    if (path.extname(pathname)) { res.writeHead(404); res.end(); return; }
    file = path.join(root, 'index.html');
  }
  res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'content-length': fs.statSync(file).size });
  if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
});
server.listen(13002, '127.0.0.1', () => console.log('AutoClip frontend ready'));
