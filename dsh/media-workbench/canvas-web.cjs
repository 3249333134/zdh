const http = require('node:http');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, 'runtime/canvas-web');
const localAssets = require('./local-assets.cjs');
const indexFile = process.env.WORKBENCH_ASSET_INDEX || path.join(__dirname, 'data/local-assets.json');
const imports = new Map();
process.on('message', message => { if (['local-assets:result', 'unified-ai:result', 'workflow:result'].includes(message?.type)) imports.get(message.id)?.(message); });
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.mp4': 'video/mp4' };
const isApi = url => url.startsWith('/api/') || url.startsWith('/oauth/');
const server = http.createServer((req, res) => {
  if (req.url === '/api/workbench/workflow') {
    const reply = (status, value) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)); };
    if (!process.env.WORKBENCH_NATIVE_KEY || req.headers['x-workbench-native'] !== process.env.WORKBENCH_NATIVE_KEY) { reply(401, { error: '需要工作台授权' }); return; }
    if (req.method !== 'POST') { reply(405, {}); return; }
    let raw = '';
    req.on('data', chunk => { raw += chunk; if (raw.length > 2000000) req.destroy(); });
    req.on('end', () => {
      let body; try { body = JSON.parse(raw); } catch { reply(400, { error: '参数格式无效' }); return; }
      const id = require('node:crypto').randomUUID();
      const timer = setTimeout(() => { imports.delete(id); reply(504, { error: '办理超时，已保存产物保留，请核对后重试' }); }, 290000);
      imports.set(id, result => { clearTimeout(timer); imports.delete(id); reply(result.ok ? 200 : 400, result.ok ? result : { error: result.error }); });
      process.send?.({ type: 'workflow:request', id, body });
    });
    return;
  }
  if (req.url === '/api/workbench/ai') {
    const reply = (status, value) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)); };
    if (!process.env.WORKBENCH_NATIVE_KEY || req.headers['x-workbench-native'] !== process.env.WORKBENCH_NATIVE_KEY) { reply(401, { error: '需要工作台授权' }); return; }
    if (!['GET', 'POST'].includes(req.method)) { reply(405, {}); return; }
    let raw = '';
    req.on('data', chunk => { raw += chunk; if (raw.length > 16384) req.destroy(); });
    req.on('end', () => {
      let body;
      try { body = req.method === 'POST' ? JSON.parse(raw) : undefined; } catch { reply(400, { error: '配置格式不正确' }); return; }
      const id = require('node:crypto').randomUUID();
      const timer = setTimeout(() => { imports.delete(id); reply(504, { error: '配置同步超时，请重试' }); }, 90000);
      imports.set(id, result => { clearTimeout(timer); imports.delete(id); reply(result.ok ? 200 : 400, result.ok ? result : { error: result.error }); });
      process.send?.({ type: 'unified-ai:request', id, body });
    });
    return;
  }
  if (req.url.startsWith('/api/workbench/local-assets')) {
    try {
    if (!process.env.WORKBENCH_NATIVE_KEY || req.headers['x-workbench-native'] !== process.env.WORKBENCH_NATIVE_KEY) { res.writeHead(401); res.end(); return; }
    const reply = (status, value) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
    const fileId = /^\/api\/workbench\/local-assets\/([a-zA-Z0-9-]+)\/file$/.exec(req.url)?.[1];
    if (fileId) {
      const row = localAssets.publicIndex(indexFile).find(row => row.id === fileId && row.status === 'available');
      if (!row) { res.writeHead(404); res.end(); return; }
      const stat = fs.statSync(row.path), range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
      const start = range ? Number(range[1]) : 0, end = range?.[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
      if (range && (start > end || start >= stat.size)) { res.writeHead(416, { 'content-range': `bytes */${stat.size}` }); res.end(); return; }
      const mime = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.webm': 'video/webm', '.m4a': 'audio/mp4', '.flac': 'audio/flac', '.gif': 'image/gif', '.avif': 'image/avif', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.pdf': 'application/pdf' };
      res.writeHead(range ? 206 : 200, { 'content-type': types[path.extname(row.path).toLowerCase()] || mime[path.extname(row.path).toLowerCase()] || 'application/octet-stream', 'content-security-policy': 'sandbox', 'x-content-type-options': 'nosniff', 'accept-ranges': 'bytes', 'content-length': stat.size ? end - start + 1 : 0, ...(range ? { 'content-range': `bytes ${start}-${end}/${stat.size}` } : {}) });
      if (req.method === 'HEAD' || !stat.size) res.end(); else fs.createReadStream(row.path, { start, end }).on('error', () => res.destroy()).pipe(res); return;
    }
    if (req.method === 'GET') { const rows = localAssets.publicIndex(indexFile); reply(200, { rows, totalBytes: rows.filter(row => row.status === 'available').reduce((sum, row) => sum + row.bytes, 0) }); return; }
    if (req.method === 'POST' && ['/api/workbench/local-assets/import', '/api/workbench/local-assets/import-directory'].includes(req.url)) {
      const id = require('node:crypto').randomUUID();
      const timer = setTimeout(() => { imports.delete(id); reply(504, { error: '导入超时，请刷新素材列表。' }); }, 300000);
      imports.set(id, result => { clearTimeout(timer); imports.delete(id); reply(result.ok ? 200 : 500, result); });
      process.send?.({ type: 'local-assets:import', id, directory: req.url.endsWith('import-directory') }); return;
    }
    reply(405, { error: '不支持的本地索引操作' }); return;
    } catch { if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: '索引或文件读取失败，请刷新并检查文件是否仍在原位置。' })); return; }
  }
  if (isApi(req.url)) {
    const proxy = http.request({ hostname: '127.0.0.1', port: 18081, path: req.url, method: req.method, headers: { ...req.headers, host: '127.0.0.1:18081', 'x-forwarded-host': req.headers.host, 'x-forwarded-proto': 'http' } }, upstream => {
      res.writeHead(upstream.statusCode, upstream.headers); upstream.pipe(res);
    });
    proxy.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Backend unavailable'); });
    req.pipe(proxy);
    return;
  }
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400); res.end(); return; }
  let file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403); res.end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    if (path.extname(pathname)) { res.writeHead(404); res.end(); return; }
    file = path.join(root, 'index.html');
  }
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'content-length': fs.statSync(file).size });
  if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
});
server.on('upgrade', (req, socket, head) => {
  if (!isApi(req.url)) { socket.destroy(); return; }
  const upstream = net.connect(18081, '127.0.0.1', () => {
    upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n` + Object.entries({ ...req.headers, host: '127.0.0.1:18081' }).map(([key, value]) => `${key}: ${value}`).join('\r\n') + '\r\n\r\n');
    if (head.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on('error', () => socket.destroy()); socket.on('error', () => upstream.destroy());
  socket.on('close', () => upstream.destroy());
});
server.listen(13001, '127.0.0.1', () => console.log('Canvas frontend ready'));
