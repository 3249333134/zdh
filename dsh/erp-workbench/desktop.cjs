const { app, BrowserWindow, dialog, shell } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const root = __dirname;
const dataRoot = path.join(root, process.env.ERP_SMOKE === '1' ? 'data/qa' : 'data');
const port = process.env.ERP_SMOKE === '1' ? '33291' : '33290';
let engine, window;
app.setPath('userData', path.join(dataRoot, 'desktop'));
if (!app.requestSingleInstanceLock({ erpWorkbench: true })) app.quit();
else {
  app.on('second-instance', () => { window?.show(); window?.focus(); });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => engine?.kill());
  app.whenReady().then(async () => {
    window = new BrowserWindow({ width: 1480, height: 960, minWidth: 760, minHeight: 600, title: 'erp系统工作台', webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
    window.setMenuBarVisibility(false);
    window.on('page-title-updated', e => { e.preventDefault(); window.setTitle('erp系统工作台'); });
    window.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
    await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<body style="font:16px system-ui;padding:64px;background:#f7f8fa"><h1>erp系统工作台</h1><p>正在启动 DSH…</p></body>'));
    fs.mkdirSync(path.join(root, 'data/logs'), { recursive: true });
    const log = fs.createWriteStream(path.join(root, 'data/logs/dsh.log'), { flags: 'a' });
    engine = spawn(path.resolve(root, '../media-workbench/runtime/host/DeepSeek Harness.exe'), ['--expose-internals', path.join(root, 'host.mjs'), 'web', '--no-open', '--host', '127.0.0.1', '--port', port], {
      cwd: root, windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', DSH_HOME: path.join(dataRoot, 'dsh'), DSH_ROOT: path.join(dataRoot, 'workspace'), DSH_WORKSPACE: path.join(dataRoot, 'workspace') }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const address = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('DSH 启动超时，请检查 data/logs/dsh.log。')), 60000);
      engine.stdout.on('data', chunk => {
        log.write(String(chunk).replace(/token=[A-Za-z0-9_-]+/g, 'token=[redacted]'));
        output = (output + chunk).slice(-100000);
        const match = new RegExp(`dsh web:\\s*(http:\\/\\/127\\.0\\.0\\.1:${port}\\/\\?token=[A-Za-z0-9_-]+)`).exec(output);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
      engine.stderr.on('data', chunk => log.write(String(chunk).replace(/token=[A-Za-z0-9_-]+/g, 'token=[redacted]')));
      engine.once('error', error => { clearTimeout(timer); reject(error); });
      engine.once('exit', code => { clearTimeout(timer); reject(new Error(`DSH 已退出（${code}），请检查日志。`)); });
    });
    await window.loadURL(address);
    for (let i = 0; i < 60; i++) {
      const selected = await window.webContents.executeJavaScript(`(() => { const e = [...document.querySelectorAll('button,[role="button"]')].find(e => /erp系统工作台/.test((e.textContent || '') + (e.getAttribute('aria-label') || '') + (e.getAttribute('title') || ''))); if(e){e.click();return true} return false })()`);
      if (selected) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }).catch(error => { dialog.showErrorBox('erp系统工作台启动失败', error.message); app.quit(); });
}
