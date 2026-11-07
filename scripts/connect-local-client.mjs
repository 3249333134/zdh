// Used once to verify the user's local client. Never logs credentials.
import {createRequire} from 'node:module';
import {realpathSync,readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(realpathSync(new URL('../upstream/deepseek-harness-master/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/package.json',import.meta.url)));
const {chromium}=require('playwright');const browser=await chromium.connectOverCDP('http://127.0.0.1:19229');
try{
  let page;for(const p of browser.contexts().flatMap(c=>c.pages()))if(await p.locator('.ep').count())page=p;
  if(!page)throw new Error('未找到工作台窗口');
  if(await page.getByLabel('登录账号',{exact:true}).count()){
    const secret=JSON.parse(readFileSync('local-enterprise-data/local-secrets.json','utf8'));
    await page.getByLabel('登录账号',{exact:true}).fill('admin');await page.getByLabel('密码',{exact:true}).fill(secret.password);await page.getByRole('button',{name:'登录企业工作台',exact:true}).click();
  }
  const nav=page.getByRole('navigation',{name:'企业工作台导航'});await nav.waitFor();console.log('LOCAL_REAL_SERVICE_CONNECTED_AND_LOGGED_IN');
  const divider=page.getByRole('separator',{name:'调整 AI 命令台宽度'});const before=await page.locator('.es-command').boundingBox();const handle=await divider.boundingBox();await page.mouse.move(handle.x+handle.width/2,handle.y+100);await page.mouse.down();await page.mouse.move(handle.x-70,handle.y+100,{steps:10});await page.mouse.up();assert.ok((await page.locator('.es-command').boundingBox()).width>before.width+40);console.log('REAL_POINTER_CONSOLE_RESIZE_PASSED');
  await nav.getByRole('button',{name:'流程设计',exact:true}).click();await page.getByRole('button',{name:'配置流程',exact:true}).first().click();
  const node=page.getByRole('button',{name:'需求受理',exact:true});await node.scrollIntoViewIfNeeded();const original=await node.boundingBox();await page.mouse.move(original.x+70,original.y+25);await page.mouse.down();await page.mouse.move(original.x+100,original.y+50,{steps:8});await page.mouse.up();const moved=await node.boundingBox();assert.ok(moved.x>original.x+20&&moved.y>original.y+15);await page.getByRole('button',{name:'保存草稿',exact:true}).click();await page.getByText('操作已完成',{exact:true}).waitFor();
  await page.getByRole('button',{name:'关闭编辑',exact:true}).click();await page.getByRole('button',{name:'配置流程',exact:true}).first().click();const saved=await node.boundingBox();assert.ok(Math.abs(saved.x-moved.x)<2);console.log('FLOW_NODE_DRAG_AND_PERSIST_PASSED');
  assert.equal(await page.locator('.es-bar').evaluate(e=>getComputedStyle(e).getPropertyValue('-webkit-app-region')),'drag');
  await page.getByRole('button',{name:'关闭编辑',exact:true}).click();await nav.getByRole('button',{name:'工作台',exact:true}).click();await page.screenshot({path:'.enterprise-test/screenshots/local-connected.png'});
}finally{await browser.close();}
