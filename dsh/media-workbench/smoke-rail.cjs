const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
module.exports = async (win, logs) => {
  const run = code => win.webContents.executeJavaScript(code);
  const originalDock = process.argv.includes('--restore-dock-open') || await run(`Boolean(document.querySelector('.md-dock'))`);
  await run(`[...document.querySelectorAll('.md-nav button')].find(el=>el.textContent==='影策').click()`);
  let frame;
  for (let i=0;i<80;i++) { frame=win.webContents.mainFrame.frames.find(frame=>frame.url.startsWith('http://127.0.0.1:13001/')); if(frame && await frame.executeJavaScript(`Boolean(document.querySelector('.is-embedded-rail'))`)) break; await sleep(250); }
  assert.ok(frame);
  const widths=[1440,1100];
  for(const width of widths) {
    win.setSize(width,900);await sleep(800);
    if(await run(`Boolean(document.querySelector('.md-dock'))`)) await run(`document.querySelector('.md-topbar button[aria-label="收起全局助手"]').click()`);
    const state=await frame.executeJavaScript(`(()=>{const rail=document.querySelector('.is-embedded-rail'),stage=document.querySelector('.app-workspace-stage');const box=rail.getBoundingClientRect();return {width:box.width,visible:getComputedStyle(rail).display!=='none',position:getComputedStyle(rail).position,scrim:!!document.querySelector('.app-workspace-sidebar-scrim'),separate:stage.getBoundingClientRect().left>=box.right-1}})()`);
    assert.equal(state.width,64);assert.ok(state.visible);assert.equal(state.position,'relative');assert.equal(state.scrim,false);assert.ok(state.separate);
    await frame.executeJavaScript(`document.querySelector('a[data-nav-id="home"]')?.click()`);await sleep(500);
    const input=await frame.executeJavaScript(`(()=>{const field=document.querySelector('.creation-home textarea');if(!field)return null;const r=field.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+Math.min(20,r.height/2));return {clickable:hit===field||field.contains(hit),disabled:field.disabled}})()`);
    assert.ok(input?.clickable);assert.equal(input.disabled,false);
    fs.writeFileSync(path.join(logs,`rail-${width}.png`),(await win.webContents.capturePage()).toPNG());
  }
  const assets=await frame.executeJavaScript(`(()=>{const link=document.querySelector('a[data-nav-id="assets"]');if(!link)return false;link.click();return true})()`);
  assert.ok(assets);await sleep(800);
  assert.ok(await frame.executeJavaScript(`document.body.innerText.includes('本地素材索引')`));
  await frame.executeJavaScript(`document.querySelector('a[data-nav-id="home"]')?.click()`);
  if (Boolean(await run(`Boolean(document.querySelector('.md-dock'))`)) !== originalDock) await run(`document.querySelector('.md-topbar button[aria-label="打开全局助手"],.md-topbar button[aria-label="收起全局助手"]').click()`);
  fs.writeFileSync(path.join(logs,'rail-smoke.json'),JSON.stringify({ok:true,widths,alwaysVisible:true,noScrim:true,mainInputClickable:true,navigation:true},null,2));
};
