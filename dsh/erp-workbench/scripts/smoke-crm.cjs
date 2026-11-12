const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
process.env.ERP_SMOKE = '1';
const source = path.join(root, 'data/dsh/profiles/web');
const target = path.join(root, 'data/qa/dsh/profiles/web');
fs.mkdirSync(target, { recursive: true });
fs.mkdirSync(path.join(root, 'data/qa/workspace'), { recursive: true });
for (const name of ['package.json', 'compatibility.json', 'cordis.yml', 'cordis.patch.yml', 'node_modules/dsh-erp-workbench']) fs.cpSync(path.join(source, name), path.join(target, name), { recursive: true });
require('../desktop.cjs');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let stage = 'load';
app.whenReady().then(async () => {
  try {
    let win;
    const run = code => { stage = code.slice(0, 160); return win.webContents.executeJavaScript(code); };
    for (let i = 0; i < 110; i++) {
      win = BrowserWindow.getAllWindows()[0];
      if (win && !win.webContents.isLoading() && await run(`!!document.querySelector('.erp-project-main')`)) break;
      await sleep(500);
    }
    await run(`[...document.querySelectorAll('.erp-toolbar nav button')].find(e=>e.textContent==='客户管理').click()`);
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
    await sleep(200);
    for (let i = 0; i < 30; i++) { if (await run(`!!document.querySelector('.crm-main')`)) break; await sleep(300); }
    assert.ok(await run(`document.querySelector('.crm-root').textContent.includes('华辰制造')`));
    const setField = async (key, value) => {
      await run(`(() => { const input=document.querySelector('.crm-editor [data-field="${key}"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true})); })()`); await sleep(100);
    };
    await run(`document.querySelector('.crm-main .erp-primary').click()`); await sleep(200);
    await setField('name', 'CRM界面验收临时客户');
    await run(`document.querySelector('.crm-editor form').requestSubmit()`); await sleep(700);
    assert.ok(await run(`document.querySelector('.crm-main').textContent.includes('CRM界面验收临时客户')`));
    await run(`[...document.querySelectorAll('.crm-main .erp-task-link')].find(e=>e.textContent==='CRM界面验收临时客户').click()`); await sleep(150);
    await setField('city', '南京');
    await run(`document.querySelector('.crm-editor form').requestSubmit()`); await sleep(600);
    assert.ok(await run(`document.querySelector('.crm-main').textContent.includes('南京')`));
    await run(`[...document.querySelectorAll('.crm-main .erp-task-link')].find(e=>e.textContent==='CRM界面验收临时客户').click()`); await sleep(150);
    await run(`document.querySelector('.crm-editor .erp-delete button').click()`); await sleep(150);
    await run(`[...document.querySelectorAll('.crm-editor .erp-delete button')].find(e=>e.textContent==='确认删除').click()`); await sleep(600);
    assert.equal(await run(`document.querySelector('.crm-main').textContent.includes('CRM界面验收临时客户')`), false);
    await run(`[...document.querySelectorAll('.crm-tabs button')].find(e=>e.textContent.startsWith('商机')).click()`); await sleep(200);
    assert.equal(await run(`document.querySelectorAll('.crm-pipeline .erp-column').length`), 6);
    await run(`[...document.querySelectorAll('.crm-pipeline .erp-task')].find(e=>e.textContent.includes('设备升级一期')).click()`); await sleep(200);
    await run(`(() => {const select=[...document.querySelectorAll('.crm-editor select')].at(-1);select.value='商务谈判';select.dispatchEvent(new Event('change',{bubbles:true}));})()`); await sleep(150);
    await run(`document.querySelector('.crm-editor form').requestSubmit()`); await sleep(600);
    assert.ok(await run(`[...document.querySelectorAll('.crm-pipeline .erp-column')].find(e=>e.querySelector('h3').textContent.includes('商务谈判')).textContent.includes('设备升级一期')`));
    await run(`[...document.querySelectorAll('.crm-tabs button')].find(e=>e.textContent.startsWith('跟进记录')).click()`); await sleep(150);
    assert.ok(await run(`document.querySelector('.crm-main').textContent.includes('首次需求沟通')`));
    for (const label of ['客户待办', '客户笔记']) {
      await run(`[...document.querySelectorAll('.crm-tabs button')].find(e=>e.textContent.startsWith('${label}')).click()`); await sleep(150);
      await run(`document.querySelector('.crm-main .erp-primary').click()`); await sleep(150);
      await run(`(() => {const input=document.querySelector('.crm-editor input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'新增模块界面验收');input.dispatchEvent(new Event('input',{bubbles:true}));})()`); await sleep(100);
      await run(`(() => {const input=document.querySelector('.crm-editor textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'记录客户要求及下一步');input.dispatchEvent(new Event('input',{bubbles:true}));})()`); await sleep(100);
      await run(`document.querySelector('.crm-editor form').requestSubmit()`); await sleep(500);
      assert.ok(await run(`document.querySelector('.crm-main').textContent.includes('新增模块界面验收')`));
      await run(`[...document.querySelectorAll('.crm-main .erp-task-link')].find(e=>e.textContent==='新增模块界面验收').click()`); await sleep(100);
      await run(`document.querySelector('.crm-editor .erp-delete button').click()`); await sleep(100);
      await run(`[...document.querySelectorAll('.crm-editor .erp-delete button')].find(e=>e.textContent==='确认删除').click()`); await sleep(400);
    }
    const screenshots = [];
    for (const width of [1480, 780]) {
      win.setSize(width, 900); await sleep(400);
      if (!await run(`!!document.querySelector('.crm-tabs')`)) { await run(`[...document.querySelectorAll('.erp-toolbar nav button')].find(e=>e.textContent==='客户管理').click()`); await sleep(500); }
      for (const label of ['客户公司', '商机']) {
        await run(`[...document.querySelectorAll('.crm-tabs button')].find(e=>e.textContent.startsWith('${label}')).click()`); await sleep(200);
        const name = `crm-${width}-${label === '商机' ? 'pipeline' : 'companies'}.png`;
        try { fs.writeFileSync(path.join(root, 'data/logs', name), (await win.webContents.capturePage()).toPNG()); screenshots.push(name); } catch {}
      }
    }
    await run(`[...document.querySelectorAll('.erp-toolbar nav button')].find(e=>e.textContent==='项目任务').click()`); await sleep(500);
    await run(`[...document.querySelectorAll('.erp-filters nav button')].find(e=>e.textContent==='日历').click()`); await sleep(250);
    assert.equal(await run(`document.querySelectorAll('.erp-calendar-day').length`), 42);
    try { fs.writeFileSync(path.join(root, 'data/logs/planning-calendar.png'), (await win.webContents.capturePage()).toPNG()); } catch {}
    await run(`[...document.querySelectorAll('.erp-filters nav button')].find(e=>e.textContent==='甘特图').click()`); await sleep(250);
    assert.ok(await run(`document.querySelectorAll('.erp-gantt-row').length>0`));
    await run(`[...document.querySelectorAll('.erp-filters nav button')].find(e=>e.textContent==='列表').click()`);
    assert.ok(await run(`!!document.querySelector('select[aria-label^="更新"]')`));
    const previousStatus = await run(`document.querySelector('select[aria-label^="更新"]').value`);
    const nextStatus = previousStatus === '待办' ? '进行中' : '待办';
    const changeStatus = status => run(`(() => {const select=document.querySelector('select[aria-label^="更新"]');select.value=${JSON.stringify(status)};select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await changeStatus(nextStatus); await sleep(450);
    assert.equal(await run(`document.querySelector('select[aria-label^="更新"]').value`), nextStatus);
    await changeStatus(previousStatus); await sleep(450);
    await run(`document.querySelector('.erp-project-main .erp-task-link').click()`); await sleep(150);
    assert.ok(await run(`!!document.querySelector('.erp-dialog[open] .erp-editor-actions button[type="submit"]')`));
    assert.ok(await run(`(() => { const s = getComputedStyle(document.querySelector('.erp-dialog .erp-primary')); return s.color !== s.backgroundColor; })()`));
    assert.ok(await run(`(() => {const button=document.querySelector('.erp-dialog .erp-primary');const rect=button.getBoundingClientRect();return button.contains(document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2));})()`), 'Save button must be visible and clickable without scrolling');
    try { fs.writeFileSync(path.join(root, 'data/logs/erp-task-editor.png'), (await win.webContents.capturePage()).toPNG()); } catch {}
    await run(`(() => {const input=document.querySelector('.erp-dialog input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'未保存的界面验收修改');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await run(`document.querySelector('.erp-dialog header button').click()`); await sleep(100);
    assert.ok(await run(`!!document.querySelector('.erp-discard')`));
    await run(`document.querySelector('.erp-discard .erp-danger').click()`);
    await run(`[...document.querySelectorAll('.erp-toolbar nav button')].find(e=>e.textContent==='客户管理').click()`);
    await run(`[...document.querySelectorAll('.erp-toolbar nav button')].find(e=>e.textContent==='项目任务').click()`);
    assert.ok(await run(`!!document.querySelector('.erp-project-main .erp-table-wrap')`));
    try { fs.writeFileSync(path.join(root, 'data/logs/planning-gantt.png'), (await win.webContents.capturePage()).toPNG()); } catch {}
    fs.writeFileSync(path.join(root, 'data/logs/crm-smoke.json'), JSON.stringify({ ok: true, workflows: ['create company', 'edit company', 'delete company', 'move deal stage', 'follow-up list', 'calendar', 'gantt', 'task editor actions', 'discard confirmation', 'view retention'], screenshots }, null, 2));
  } catch (error) { fs.writeFileSync(path.join(root, 'data/logs/crm-smoke.json'), JSON.stringify({ ok: false, stage, error: String(error.stack || error) })); }
  finally { app.quit(); }
});
