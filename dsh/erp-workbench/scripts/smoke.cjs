const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
require('../desktop.cjs');
const root = path.resolve(__dirname, '..');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let stage = 'load';
app.whenReady().then(async () => {
  try {
    let win, state;
    for (let i = 0; i < 110; i++) {
      win = BrowserWindow.getAllWindows()[0];
      if (win && !win.webContents.isLoading()) {
        state = await win.webContents.executeJavaScript(`(() => { const root = document.querySelector('.erp-root'); return { mounted:!!root, text:root?.innerText || '', iframe:!!root?.querySelector('iframe') } })()`);
        if (state.mounted && state.text.includes('设备交付')) break;
      }
      await sleep(500);
    }
    if (!state?.mounted) throw Error('ERP plugin did not mount');
    if (!state.text.includes('设备交付')) throw Error('Expected local sample board');
    await win.webContents.executeJavaScript(`(() => { const dialog = document.querySelector('[role="dialog"]'); if (dialog && dialog.textContent.includes('开始使用')) { const close = dialog.querySelector('button[aria-label="关闭"],button[aria-label="Close"],button[data-slot="dialog-close"]'); close?.click(); } })()`);
    const run = code => { stage = code.slice(0, 180); return win.webContents.executeJavaScript(code); };
    win.webContents.on('console-message', (_event, _level, message) => fs.appendFileSync(path.join(root, 'data/logs/smoke-console.log'), message + '\n'));
    await run(`[...document.querySelectorAll('.erp-filters button')].find(e=>e.textContent.includes('新建任务')).click()`);
    await sleep(300);
    await run(`(() => { const input=document.querySelector('.erp-editor input'); const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(input,'界面验收临时任务');input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await sleep(150);
    await run(`document.querySelector('.erp-editor form').requestSubmit()`);
    await sleep(800);
    if (!await run(`document.querySelector('.erp-project-main').textContent.includes('界面验收临时任务')`)) throw Error('Task creation failed');
    await run(`[...document.querySelectorAll('.erp-task')].find(e=>e.textContent.includes('界面验收临时任务')).click()`);
    await sleep(150);
    await run(`(() => { const select=document.querySelector('.erp-editor select[value]') || document.querySelectorAll('.erp-editor select')[1]; select.value='已完成';select.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    await sleep(150);
    await run(`document.querySelector('.erp-editor form').requestSubmit()`);
    await sleep(600);
    const completed = await run(`[...document.querySelectorAll('.erp-column')].find(e=>e.querySelector('h3').textContent.includes('已完成')).textContent.includes('界面验收临时任务')`);
    if (!completed) throw Error('Task status update failed');
    await run(`[...document.querySelectorAll('.erp-task')].find(e=>e.textContent.includes('界面验收临时任务')).click()`);
    await sleep(150);
    await run(`document.querySelector('.erp-delete button').click()`);
    await sleep(150);
    await run(`[...document.querySelectorAll('.erp-delete button')].find(e=>e.textContent==='确认删除').click()`);
    await sleep(600);
    if (await run(`document.querySelector('.erp-project-main').textContent.includes('界面验收临时任务')`)) throw Error('Task deletion failed');
    await run(`[...document.querySelectorAll('.erp-filters nav button')].find(e=>e.textContent==='列表').click()`);
    await sleep(150);
    if (!await run(`document.querySelectorAll('.erp-table-wrap tbody tr').length===6`)) throw Error('List view mismatch');
    await run(`[...document.querySelectorAll('.erp-filters nav button')].find(e=>e.textContent==='看板').click()`);
    const widths = [1480, 780];
    for (const width of widths) {
      win.setSize(width, 900); await sleep(500);
      fs.writeFileSync(path.join(root, `data/logs/erp-${width}.png`), (await win.webContents.capturePage()).toPNG());
    }
    fs.writeFileSync(path.join(root, 'data/logs/smoke.json'), JSON.stringify({ ok: true, widths, workflows: ['create task', 'complete task', 'delete task', 'list view'], ...state }, null, 2));
  } catch (err) {
    fs.mkdirSync(path.join(root, 'data/logs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'data/logs/smoke.json'), JSON.stringify({ ok: false, stage, error: String(err.stack || err) }));
  } finally { app.quit(); }
});
