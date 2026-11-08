const fs = require('node:fs');
const path = require('node:path');
module.exports = async (win, logs) => {
  const run = code => win.webContents.executeJavaScript(code);
  const nav = await run(`[...document.querySelectorAll('.md-nav button')].map(el => el.textContent)`);
  if (nav.join('|') !== '灵感|内容|排期|影策|剪辑助手|复盘|风格') throw new Error('剪辑助手导航位置不正确');
  await run(`[...document.querySelectorAll('.md-nav button')].find(el => el.textContent === '剪辑助手').click()`);
  let frame, body = '';
  for (let attempt = 0; attempt < 80; attempt++) {
    frame = win.webContents.mainFrame.frames.find(frame => frame.url.startsWith('http://127.0.0.1:13002/'));
    if (frame) { body = await frame.executeJavaScript('document.body.innerText'); if (body.includes('视频') && body.length > 100) break; }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!frame || !body.includes('视频')) throw new Error('AutoClip 原版页面未载入');
  const health = await win.webContents.session.fetch('http://127.0.0.1:13002/health');
  if (!health.ok) throw new Error('AutoClip 服务不可用');
  await new Promise(resolve => setTimeout(resolve, 1800));
  await frame.executeJavaScript(`[...document.querySelectorAll('button')].find(el => el.textContent.trim() === '稍后设置')?.click()`);
  const readiness = await (await win.webContents.session.fetch('http://127.0.0.1:13002/api/v1/studio/readiness')).json();
  const projects = await win.webContents.session.fetch('http://127.0.0.1:13002/api/v1/projects/');
  if (!projects.ok) throw new Error('剪辑项目接口不可用');
  const sizes = [];
  for (const [width, height] of [[1440, 960], [1100, 800]]) {
    win.setSize(width, height);
    await new Promise(resolve => setTimeout(resolve, 700));
    const layout = await run(`(() => { const h = document.querySelector('.md-topbar').getBoundingClientRect(); const r = [...document.querySelectorAll('.md-nav button')].map(el => el.getBoundingClientRect()); return {height:h.height, tops:r.map(x=>x.top), right:r.at(-1).right, headerRight:h.right}; })()`);
    if (layout.height !== 56 || new Set(layout.tops).size !== 1 || layout.right > layout.headerRight) throw new Error('导航未保持单行');
    sizes.push({ width, ...layout });
    fs.writeFileSync(path.join(logs, `autoclip-${width}.png`), (await win.webContents.capturePage()).toPNG());
  }
  await run(`[...document.querySelectorAll('.md-nav button')].find(el => el.textContent === '复盘').click()`);
  await run(`[...document.querySelectorAll('.md-nav button')].find(el => el.textContent === '剪辑助手').click()`);
  if (!win.webContents.mainFrame.frames.some(candidate => candidate === frame)) throw new Error('切页重建了剪辑助手');
  win.setSize(1440, 960);
  fs.writeFileSync(path.join(logs, 'autoclip-smoke.json'), JSON.stringify({ ok: true, nav, sizes, preserved: true, readiness, body }, null, 2));
};
