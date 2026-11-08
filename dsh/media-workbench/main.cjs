const { app, BrowserWindow, dialog, shell } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { establishSession } = require('./local-session.cjs');
const localAssets = require('./local-assets.cjs');
const unifiedAI = require('./unified-ai.cjs');
const nativeKey = require('node:crypto').randomBytes(32).toString('hex');
const root = __dirname;
const data = path.join(root, process.argv.includes('--smoke-workflow') ? '.smoke-workflow-data' : process.argv.includes('--smoke-agent') ? '.smoke-agent-data' : 'data');
if (process.argv.includes('--smoke-workflow') && !fs.existsSync(path.join(data, 'dsh'))) { fs.mkdirSync(data, { recursive: true }); fs.cpSync(path.join(root, 'data/dsh'), path.join(data, 'dsh'), { recursive: true }); if (fs.existsSync(path.join(root, 'data/unified-ai.json'))) fs.copyFileSync(path.join(root, 'data/unified-ai.json'), path.join(data, 'unified-ai.json')); }
if (process.argv.includes('--smoke-agent') && !fs.existsSync(path.join(data, 'dsh'))) { fs.mkdirSync(data, { recursive: true }); fs.cpSync(path.join(root, 'data/dsh'), path.join(data, 'dsh'), { recursive: true }); }
fs.mkdirSync(path.join(data, 'desktop'), { recursive: true });
app.setName('自媒体工作台');
app.setAppUserModelId('local.dsh.media-desk');
app.setPath('userData', path.join(data, 'desktop'));
const children = new Set();
let win, quitting = false;
const logs = path.join(root, 'logs');
fs.mkdirSync(logs, { recursive: true });
const log = fs.createWriteStream(path.join(logs, 'desktop.log'), { flags: 'a' });
const scrub = value => String(value).replace(/token=[A-Za-z0-9_-]+/g, 'token=***');
function launch(exe, args, env = {}, cwd = root, ipc = false) {
  const child = spawn(exe, args, { cwd, windowsHide: true, env: { ...process.env, ...env }, stdio: ipc ? ['ignore', 'pipe', 'pipe', 'ipc'] : ['ignore', 'pipe', 'pipe'] });
  children.add(child);
  child.stdout.on('data', chunk => log.write(scrub(chunk)));
  child.stderr.on('data', chunk => log.write(scrub(chunk)));
  child.on('error', error => log.write(`${error.message}\n`));
  child.on('exit', () => children.delete(child));
  return child;
}
function freePort(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(port)));
  });
}
async function ready(url, child) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) throw new Error('本机服务已退出，请查看 logs/desktop.log');
    try { const response = await fetch(url, { signal: AbortSignal.timeout(1000) }); if (response.ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('本机服务启动超时，请查看 logs/desktop.log');
}
async function boot() {
  for (const port of [33280, 18081, 13001, 13002]) await freePort(port);
  win = new BrowserWindow({ width: 1440, height: 960, minWidth: 1000, minHeight: 700, title: '自媒体工作台', backgroundColor: '#faf9f6', webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
  win.setMenuBarVisibility(false);
  win.on('page-title-updated', event => { event.preventDefault(); win.setTitle('自媒体工作台'); });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<title>自媒体工作台</title><body style="font:18px system-ui;background:#faf9f6;padding:60px"><h2>自媒体工作台</h2><p>正在启动创作服务，请稍候…</p></body>'));
  const origin = 'http://127.0.0.1:33280';
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (event, url) => { if (!url.startsWith(origin + '/') && !url.startsWith('data:')) { event.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  const backend = launch(path.join(root, 'runtime/canvas-server.exe'), [], {
    CANVAS_BACKEND_ADDR: '127.0.0.1:18081', CANVAS_BACKEND_DATA_DIR: path.join(data, 'canvas'),
    CANVAS_DATABASE_DRIVER: 'sqlite', CANVAS_AUTO_MIGRATE: 'true', CANVAS_REGISTRATION_ENABLED: 'false',
    CANVAS_CORS_ORIGINS: 'http://127.0.0.1:13001', GIN_MODE: 'release',
  }, path.join(root, 'runtime/canvas/backend'));
  await ready('http://127.0.0.1:18081/api/health/ready', backend);
  const authorizeCanvas = async () => {
    const identity = await establishSession({ baseURL: 'http://127.0.0.1:18081', identityFile: path.join(data, 'canvas-identity.json') });
    await win.webContents.session.cookies.set({ url: 'http://127.0.0.1:13001', name: 'open_ai_canvas_session', value: identity.value, httpOnly: true, sameSite: 'lax' });
    return identity.userId;
  };
  const canvasUserId = await authorizeCanvas();
  let aiRuntime;
  let workflowOptions;
  const renewal = setInterval(() => authorizeCanvas().catch(() => log.write('工作台身份续期失败，请重新打开工作台。\n')), 12 * 60 * 60 * 1000);
  renewal.unref();
  win.webContents.session.webRequest.onBeforeSendHeaders({ urls: ['http://127.0.0.1:13001/api/workbench/local-assets*'] }, (details, callback) => callback({ requestHeaders: { ...details.requestHeaders, 'X-Workbench-Native': nativeKey } }));
  const frontend = launch(process.execPath, [path.join(root, 'canvas-web.cjs')], { ELECTRON_RUN_AS_NODE: '1', WORKBENCH_NATIVE_KEY: nativeKey, WORKBENCH_ASSET_INDEX: path.join(data, 'local-assets.json') }, root, true);
  frontend.on('message', async request => {
    if (request?.type === 'workflow:request') {
      try {
        if (!workflowOptions) throw new Error('本机创作服务尚未就绪');
        const result = await require('./workflow-native.cjs')(request.body, workflowOptions);
        frontend.send({ type: 'workflow:result', id: request.id, ok: true, result });
      } catch (error) { frontend.send({ type: 'workflow:result', id: request.id, ok: false, error: String(error.message).replace(/sk-[A-Za-z0-9_-]+/g, '***') }); }
      return;
    }
    if (request?.type === 'unified-ai:request') {
      try {
        if (request.body) {
          const next = unifiedAI.validate(request.body, unifiedAI.read(data));
          const synced = await unifiedAI.synchronize(next, aiRuntime);
          next.canvasChannelId = synced.canvasChannelId;
          unifiedAI.atomic(path.join(data, 'unified-ai.json'), next);
          unifiedAI.prepareDsh(root, data, next);
        }
        frontend.send({ type: 'unified-ai:result', id: request.id, ok: true, config: unifiedAI.publicConfig(unifiedAI.read(data)), restartRequired: Boolean(request.body) });
      } catch (error) { frontend.send({ type: 'unified-ai:result', id: request.id, ok: false, error: error.message }); }
      return;
    }
    if (request?.type !== 'local-assets:import') return;
    try {
      const selection = await dialog.showOpenDialog(win, { title: '导入本地素材索引', properties: request.directory ? ['openDirectory'] : ['openFile', 'multiSelections'] });
      if (!selection.canceled) localAssets.importPaths(path.join(data, 'local-assets.json'), selection.filePaths);
      frontend.send({ type: 'local-assets:result', id: request.id, ok: true });
    } catch { frontend.send({ type: 'local-assets:result', id: request.id, ok: false, error: '本地素材导入失败，请检查文件是否可读。' }); }
  });
  await ready('http://127.0.0.1:13001/', frontend);
  const clipData = path.join(data, 'autoclip');
  fs.mkdirSync(clipData, { recursive: true });
  const ffmpegRoot = path.join(root, '../.local-runtimes/ffmpeg');
  const ffmpegBundle = fs.readdirSync(ffmpegRoot, { withFileTypes: true }).find(entry => entry.isDirectory() && fs.existsSync(path.join(ffmpegRoot, entry.name, 'bin/ffmpeg.exe')));
  const ffmpegBin = ffmpegBundle ? path.join(ffmpegRoot, ffmpegBundle.name, 'bin') : ffmpegRoot;
  const clipBackend = launch(path.join(root, '../.local-runtimes/autoclip-python/Scripts/python.exe'), ['-u', '-m', 'backend.desktop_main'], {
    PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', AUTOCLIP_MODE: 'desktop', AUTOCLIP_DESKTOP_MODE: 'true', AUTOCLIP_PARENT_PID: String(process.pid),
    AUTOCLIP_APP_DIR: clipData, AUTOCLIP_DATA_DIR: clipData, AUTOCLIP_ALLOWED_ORIGINS: 'http://127.0.0.1:13002',
    AUTOCLIP_WORKBENCH_TOKEN: nativeKey, AUTOCLIP_WORKBENCH_DERIVED: path.join(data, 'workflow-derived'),
    AUTOCLIP_FFMPEG_PATH: path.join(ffmpegBin, 'ffmpeg.exe'), AUTOCLIP_FFPROBE_PATH: path.join(ffmpegBin, 'ffprobe.exe'),
    PATH: ffmpegBin + path.delimiter + process.env.PATH,
  }, path.join(root, '../autoclip'));
  const clipPort = await new Promise((resolve, reject) => {
    let pending = '';
    const timer = setTimeout(() => reject(new Error('剪辑服务启动超时，请查看 logs/desktop.log')), 60000);
    clipBackend.stdout.on('data', chunk => {
      pending = (pending + chunk).slice(-10000);
      const match = /^PORT=(\d+)\s*$/m.exec(pending);
      if (match) { clearTimeout(timer); resolve(Number(match[1])); }
    });
    clipBackend.once('exit', code => { clearTimeout(timer); reject(new Error(`剪辑服务已退出（${code}）`)); });
    clipBackend.once('error', error => { clearTimeout(timer); reject(error); });
  });
  await ready(`http://127.0.0.1:${clipPort}/health`, clipBackend);
  const clipFrontend = launch(process.execPath, [path.join(root, 'autoclip-web.cjs')], { ELECTRON_RUN_AS_NODE: '1', AUTOCLIP_BACKEND_PORT: String(clipPort) });
  await ready('http://127.0.0.1:13002/health', clipFrontend);
  const canvasSession = await win.webContents.session.cookies.get({ url: 'http://127.0.0.1:13001', name: 'open_ai_canvas_session' });
  aiRuntime = { canvasCookie: canvasSession[0].value, clipPort };
  workflowOptions = { data, win, dialog, nativeKey, ffmpegBin, ...aiRuntime, registerChild: child => { children.add(child); child.once('exit', () => children.delete(child)); } };
  const globalAI = unifiedAI.read(data);
  if (globalAI) {
    unifiedAI.prepareDsh(root, data, globalAI);
    const synced = await unifiedAI.synchronize(globalAI, aiRuntime);
    globalAI.canvasChannelId = synced.canvasChannelId;
    unifiedAI.atomic(path.join(data, 'unified-ai.json'), globalAI);
  }
  const engine = launch(path.join(root, 'runtime/host/DeepSeek Harness.exe'), ['--expose-internals', path.join(root, 'host.mjs'), 'web', '--no-open', '--host', '127.0.0.1', '--port', '33280'], {
    ELECTRON_RUN_AS_NODE: '1', DSH_HOME: path.join(data, 'dsh'), DSH_ROOT: path.join(data, 'workspace'), DSH_WORKSPACE: path.join(data, 'workspace'), WORKBENCH_AI_KEY: globalAI?.apiKey || '', WORKBENCH_NATIVE_KEY: nativeKey,
  });
  const address = await new Promise((resolve, reject) => {
    let pending = '';
    const timer = setTimeout(() => reject(new Error('DSH 启动超时')), 60000);
    engine.stdout.on('data', chunk => {
      pending = (pending + chunk).slice(-100000);
      const match = /dsh web:\s*(http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+)/.exec(pending);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    engine.once('error', error => { clearTimeout(timer); reject(error); });
    engine.once('exit', code => { clearTimeout(timer); reject(new Error(`DSH 已退出（${code}）`)); });
  });
  for (const child of [backend, frontend, clipBackend, clipFrontend, engine]) child.once('exit', code => {
    if (!quitting) { dialog.showErrorBox('自媒体工作台', `本机服务意外退出（${code}），请关闭后重新打开。`); app.quit(); }
  });
  await win.loadURL(address);
  // Select the installed plugin once its sidebar entry has mounted.
  for (let attempt = 0; attempt < 80; attempt++) {
    const opened = await win.webContents.executeJavaScript(`(() => {
      const entry = [...document.querySelectorAll('button,a,[role="button"]')].find(el => ['自媒体工作台', 'Media Desk'].includes(el.textContent.trim()));
      if (!entry) return false;
      entry.click(); return true;
    })()`);
    if (opened) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  fs.writeFileSync(path.join(logs, 'ready.json'), JSON.stringify({ pid: process.pid, engine: origin, frontend: 'http://127.0.0.1:13001', backend: 'http://127.0.0.1:18081', readyAt: new Date().toISOString() }, null, 2));
  if (process.argv.includes('--yingce')) {
    await win.webContents.executeJavaScript(`[...document.querySelectorAll('.md-nav button')].find(el => el.textContent === '影策')?.click()`);
  }
  if (process.argv.includes('--autoclip')) {
    await win.webContents.executeJavaScript(`[...document.querySelectorAll('.md-nav button')].find(el => el.textContent === '剪辑助手')?.click()`);
  }
  if (process.argv.includes('--smoke-autoclip')) await require('./smoke-autoclip.cjs')(win, logs);
  if (process.argv.includes('--smoke-shared-ai')) await require('./smoke-shared-ai.cjs')(win, logs);
  if (process.argv.includes('--schedule-refresh')) await require('./smoke-task-layout.cjs').refresh(win, logs);
  if (process.argv.includes('--smoke-task-layout')) { await require('./smoke-task-layout.cjs').check(win, logs); app.quit(); return }
  if (process.argv.includes('--smoke-workflow')) { await require('./smoke-workflow.cjs')(win, logs, { data, workflowOptions }); app.quit(); return }
  if (process.argv.includes('--smoke')) {
    if (process.argv.includes('--smoke-cleanup')) await require('./smoke-settings-cleanup.cjs')(win, logs);
    if (process.argv.includes('--smoke-rail')) await require('./smoke-rail.cjs')(win, logs);
    if (process.argv.includes('--smoke-agent')) await require('./smoke-unified.cjs')(win, logs, data);
    const response = await win.webContents.session.fetch(origin + '/media-desk/state');
    if (!response.ok) throw new Error(`工作台接口检查失败：${response.status}`);
    const result = await response.json();
    const health = await fetch('http://127.0.0.1:13001/api/health/ready');
    const unauthenticated = await fetch(origin + '/media-desk/state');
    if (!health.ok || unauthenticated.status !== 401) throw new Error('代理或访问验证未通过');
    if (process.argv.includes('--smoke-yingce')) {
      await win.webContents.executeJavaScript(`[...document.querySelectorAll('.md-nav button')].find(el => el.textContent === '影策').click()`);
      let frame, body = '';
      for (let attempt = 0; attempt < 100; attempt++) {
        frame = win.webContents.mainFrame.frames.find(frame => frame.url.startsWith('http://127.0.0.1:13001/'));
        if (frame) {
          body = await frame.executeJavaScript('document.body.innerText');
          if (body.includes('参考内容') && body.includes('灵感大厅')) break;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      if (!body.includes('参考内容') || !body.includes('灵感大厅')) throw new Error('影策原版首页未显示');
      const sessionResponse = await win.webContents.session.fetch('http://127.0.0.1:13001/api/auth/session');
      const authenticated = (await sessionResponse.json()).data?.user;
      if (authenticated?.id !== canvasUserId || body.includes('游客模式')) throw new Error('影策未继承工作台身份');
      const projects = await win.webContents.session.fetch('http://127.0.0.1:13001/api/projects');
      const anonymousProjects = await fetch('http://127.0.0.1:13001/api/projects');
      if (!projects.ok || anonymousProjects.status !== 401) throw new Error('影策项目权限验证失败');
      const navigation = ['创作', '短剧制作', '自由画布', '技能', '插件', '资产', '创作历史'];
      for (const label of navigation) if (!body.includes(label)) throw new Error(`影策导航缺少：${label}`);
      await new Promise(resolve => setTimeout(resolve, 4000));
      const images = await frame.executeJavaScript('[...document.images].filter(image => image.complete && image.naturalWidth > 0).length');
      if (!images) throw new Error('影策原版图片未载入');
      const dock = await win.webContents.executeJavaScript('Boolean(document.querySelector(".md-dock"))');
      if (!dock) throw new Error('影策页面缺少全局助手');
      fs.writeFileSync(path.join(logs, 'yingce-desktop.png'), (await win.webContents.capturePage()).toPNG());
      win.setSize(1100, 800);
      await new Promise(resolve => setTimeout(resolve, 1000));
      fs.writeFileSync(path.join(logs, 'yingce-narrow.png'), (await win.webContents.capturePage()).toPNG());
      win.setSize(1440, 960);
      await win.webContents.executeJavaScript(`[...document.querySelectorAll('.md-nav button')].find(el => el.textContent === '灵感').click()`);
      await win.webContents.executeJavaScript(`[...document.querySelectorAll('.md-nav button')].find(el => el.textContent === '影策').click()`);
      const preserved = win.webContents.mainFrame.frames.some(candidate => candidate === frame);
      if (!preserved) throw new Error('切换标签重建了影策页面');
      fs.writeFileSync(path.join(logs, 'yingce-smoke.json'), JSON.stringify({ ok: true, authenticatedUserId: authenticated.id, projects: projects.status, anonymousProjects: anonymousProjects.status, navigation, images, preserved, body }, null, 2));
    }
    if (process.argv.includes('--smoke-settings')) {
      const run = code => win.webContents.executeJavaScript(code);
      const pages = ['灵感', '内容', '排期', '影策', '复盘', '风格'];
      for (const page of pages) {
        await run(`[...document.querySelectorAll('.md-nav button')].find(el => el.textContent === ${JSON.stringify(page)}).click()`);
        const available = await run(`Boolean(document.querySelector('.md-workbench-controls button[aria-label="自媒体工作台设置"]'))`);
        if (!available) throw new Error(`${page}缺少全局配置`);
      }
      await run(`[...document.querySelectorAll('.md-nav button')].find(el => el.textContent === '灵感').click()`);
      await new Promise(resolve => setTimeout(resolve, 500));
      fs.writeFileSync(path.join(logs, 'global-toolbar.png'), (await win.webContents.capturePage()).toPNG());
      await run(`document.querySelector('button[aria-label="自媒体工作台设置"]').click()`);
      await new Promise(resolve => setTimeout(resolve, 500));
      const form = await run(`Boolean(document.querySelector('.md-settings-general form input[type="password"]'))`);
      if (!form) throw new Error('全局设置未保留生图和成稿表单');
      fs.writeFileSync(path.join(logs, 'global-settings-general.png'), (await win.webContents.capturePage()).toPNG());
      await run(`document.querySelector('.md-settings-general form').requestSubmit()`);
      for (let attempt = 0; attempt < 40; attempt++) {
        if (await run(`!document.querySelector('.md-workbench-settings')`)) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (await run(`Boolean(document.querySelector('.md-workbench-settings'))`)) throw new Error('通用配置保存失败');
      await run(`document.querySelector('button[aria-label="自媒体工作台设置"]').click()`);
      await run(`[...document.querySelectorAll('.md-settings-nav button')].find(el => el.textContent === '渠道与模型').click()`);
      let configFrame, configBody = '';
      for (let attempt = 0; attempt < 80; attempt++) {
        configFrame = win.webContents.mainFrame.frames.find(frame => frame.url.includes('/admin/channels'));
        if (configFrame) { configBody = await configFrame.executeJavaScript('document.body.innerText'); if (configBody.includes('渠道与模型')) break; }
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      if (!configBody.includes('渠道与模型')) throw new Error('全局设置未打开真实模型渠道页面');
      await new Promise(resolve => setTimeout(resolve, 1500));
      fs.writeFileSync(path.join(logs, 'global-settings-channels.png'), (await win.webContents.capturePage()).toPNG());
      const brandHidden = await configFrame.executeJavaScript(`!document.querySelector('.admin-sidebar-identity') || getComputedStyle(document.querySelector('.admin-sidebar-identity')).display === 'none'`);
      if (!brandHidden) throw new Error('系统配置页仍显示独立品牌');
      win.setSize(1100, 800);
      await new Promise(resolve => setTimeout(resolve, 500));
      fs.writeFileSync(path.join(logs, 'global-settings-narrow.png'), (await win.webContents.capturePage()).toPNG());
      win.setSize(1440, 960);
      await run(`document.querySelector('.md-dialog-head button[aria-label="关闭"]').click()`);
      const originalTheme = await run(`document.body.hasAttribute('data-ds-dark-theme')`);
      await run(`document.querySelector('button[aria-label="切换全局主题"]').click()`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      const changedTheme = await run(`document.body.hasAttribute('data-ds-dark-theme')`);
      const creativeFrame = win.webContents.mainFrame.frames.find(frame => frame.url.startsWith('http://127.0.0.1:13001/') && !frame.url.includes('workbenchSettings'));
      const syncedTheme = await creativeFrame.executeJavaScript('document.documentElement.classList.contains("dark")');
      await run(`document.querySelector('button[aria-label="切换全局主题"]').click()`);
      if (changedTheme === originalTheme) throw new Error('全局主题未生效');
      if (syncedTheme !== changedTheme) throw new Error('内置页面主题未同步');
      fs.writeFileSync(path.join(logs, 'global-settings-smoke.json'), JSON.stringify({ ok: true, pages, form, settingsSaved: true, brandHidden, themeChanged: true, themeSynced: true }, null, 2));
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
    fs.writeFileSync(path.join(logs, 'smoke.png'), (await win.webContents.capturePage()).toPNG());
    fs.writeFileSync(path.join(logs, 'smoke.json'), JSON.stringify({ ok: Boolean(result.state), proxy: health.status, unauthenticated: unauthenticated.status, title: win.getTitle(), items: result.state?.items?.length, body: await win.webContents.executeJavaScript('document.body.innerText') }, null, 2));
    app.quit();
  }
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
  app.whenReady().then(boot).catch(error => {
    log.write(error.stack + '\n');
    if (process.argv.includes('--smoke') || process.argv.includes('--smoke-workflow')) fs.writeFileSync(path.join(logs, 'smoke.json'), JSON.stringify({ ok: false, error: error.message }));
    else dialog.showErrorBox('自媒体工作台启动失败', error.message);
    app.quit();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    quitting = true;
    for (const child of children) spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    fs.rmSync(path.join(logs, 'ready.json'), { force: true });
  });
}
