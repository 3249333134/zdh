const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
require('../desktop.cjs');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  try {
    let win;
    const run = code => win.webContents.executeJavaScript(code);
    for (let i = 0; i < 110; i++) {
      win = BrowserWindow.getAllWindows()[0];
      if (win && !win.webContents.isLoading() && await run(`!!document.querySelector('.erp-project-main')`)) break;
      await sleep(500);
    }
    const status = await run(`(async () => { const r=await fetch('/erp-workbench/crm'); const d=await r.json(); return {status:r.status,companies:d.companies?.length,contacts:d.contacts?.length,opportunities:d.opportunities?.length,activities:d.activities?.length} })()`);
    if (status.status !== 200 || status.companies < 9) throw Error('CRM test dataset did not load: ' + JSON.stringify(status));
    await run(`(() => { const select=document.querySelector('select[aria-label="当前项目"]');const option=[...select.options].find(o=>o.textContent==='启明精工交付（测试）');select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));})()`); await sleep(400);
    fs.writeFileSync(path.join(root, 'data/logs/test-projects.png'), (await win.webContents.capturePage()).toPNG());
    await run(`[...document.querySelectorAll('.erp-toolbar nav button')].find(e=>e.textContent==='客户管理').click()`);
    for (let i = 0; i < 40; i++) { if (await run(`!!document.querySelector('.crm-main')`)) break; await sleep(250); }
    const rows = await run(`document.querySelectorAll('.crm-main tbody tr').length`);
    if (rows !== status.companies) throw Error('Customer list did not show test dataset');
    fs.writeFileSync(path.join(root, 'data/logs/test-customers.png'), (await win.webContents.capturePage()).toPNG());
    fs.writeFileSync(path.join(root, 'data/logs/test-data-live.json'), JSON.stringify({ ok: true, ...status, visibleCompanyRows: rows }, null, 2));
  } catch (error) { fs.writeFileSync(path.join(root, 'data/logs/test-data-live.json'), JSON.stringify({ ok: false, error: String(error.stack || error) })); }
});
