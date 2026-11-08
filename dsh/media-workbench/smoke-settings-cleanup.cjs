const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
module.exports = async (win, logs) => {
  const run = async code => { const result = await win.webContents.executeJavaScript(`(()=>{try{return eval(${JSON.stringify(code)})}catch(error){return {__testError:error.message}}})()`); if(result?.__testError)throw new Error(`${result.__testError}: ${code}`);return result; };
  for(let i=0;i<60;i++){if(await run(`Boolean(document.querySelector('button[aria-label="自媒体工作台设置"]'))`))break;await sleep(100);}
  await run(`document.querySelector('button[aria-label="自媒体工作台设置"]').click()`);
  for(let i=0;i<60;i++){if(await run(`Boolean(document.querySelector('.md-settings-nav'))`))break;await sleep(100);}
  const labels = await run(`[...document.querySelectorAll('.md-settings-nav button')].map(el=>el.textContent)`);
  for(const label of ['账户设置','积分与用量','通知管理','反馈管理']) assert.equal(labels.includes(label),false);
  assert.ok(labels.includes('创作偏好'));
  await run(`[...document.querySelectorAll('.md-settings-nav button')].find(el=>el.textContent==='创作偏好').click()`);
  let frame, body='';
  for(let i=0;i<100;i++) { frame=win.webContents.mainFrame.frames.find(frame=>frame.url.includes('workbenchSettings=1'));if(frame){body=await frame.executeJavaScript('document.body.innerText');if(body.includes('提示词偏好'))break;}await sleep(200); }
  assert.ok(body.includes('提示词偏好'));
  for(const label of ['个人信息','头像与账号','修改密码','我的对象存储','我的反馈']) assert.equal(body.includes(label),false,label);
  fs.writeFileSync(path.join(logs,'settings-cleanup.png'),(await win.webContents.capturePage()).toPNG());
  await run(`document.querySelector('.md-dialog-head button[aria-label="关闭"]').click()`);
  await run(`document.querySelector('.md-workbench-controls button[aria-label="更多"]').click()`);
  await sleep(150);
  const menu=await run(`document.querySelector('.md-more-menu').innerText`);
  for(const label of ['积分','通知','反馈','账户设置']) assert.equal(menu.includes(label),false,label);
  await run(`document.querySelector('.md-workbench-controls button[aria-label="更多"]').click()`);
  await run(`[...document.querySelectorAll('.md-nav button')].find(el=>el.textContent==='影策').click()`);
  let creative;
  for(let i=0;i<80;i++) {creative=win.webContents.mainFrame.frames.find(frame=>frame.url.startsWith('http://127.0.0.1:13001/'));if(creative && await creative.executeJavaScript(`Boolean(document.querySelector('.is-embedded-rail'))`))break;await sleep(200);}
  const hidden=await creative.executeJavaScript(`(()=>{const row=document.querySelector('.app-workspace-sidebar-profile-row');return !row||getComputedStyle(row).display==='none'})()`);assert.ok(hidden);
  await creative.executeJavaScript(`location.href='/admin/announcements'`);await sleep(1800);
  const activeFrame=win.webContents.mainFrame.frames.find(frame=>frame.url.includes('/admin/'));
  assert.ok(activeFrame && !activeFrame.url.includes('/admin/announcements'));
  const adminLinks=await activeFrame.executeJavaScript(`[...document.querySelectorAll('a[href]')].map(el=>el.getAttribute('href'))`);
  for(const href of ['/admin/announcements','/admin/banner-announcements','/admin/feedbacks','/admin/credit-operations','/admin/payments']) assert.equal(adminLinks.includes(href),false,href);
  fs.writeFileSync(path.join(logs,'settings-cleanup-smoke.json'),JSON.stringify({ok:true,labels,personalInfoRemoved:true,moreClean:true,accountPopupRemoved:hidden,removedRoutesRedirected:true},null,2));
};
