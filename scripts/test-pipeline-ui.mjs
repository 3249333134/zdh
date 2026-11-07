import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {realpathSync,mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(realpathSync(new URL('../upstream/deepseek-harness-master/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/package.json',import.meta.url)));
const {chromium}=require('playwright');let browser;
const host=spawn(process.execPath,['--import','tsx','enterprise/tests/test-service.ts'],{stdio:['ignore','pipe','pipe']});
try{
  const url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('服务启动超时')),30000);host.stdout.on('data',b=>{const m=String(b).match(/TEST_ENTERPRISE_URL (http:\/\/127.0.0.1:\d+)/);if(m){clearTimeout(timer);resolve(m[1]);}});host.stderr.on('data',b=>console.error(String(b).slice(0,1000)));host.on('exit',code=>reject(new Error('服务退出 '+code)));});
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1366,height:900}});page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.getByLabel('登录账号',{exact:true}).fill('admin');await page.getByLabel('密码',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'登录企业工作台',exact:true}).click();
  const nav=name=>page.getByRole('navigation',{name:'企业工作台导航'}).getByRole('button',{name,exact:true}).click();
  await page.locator('.pipeline-stage').waitFor();assert.equal(await page.getByRole('button',{name:'流程工作台',exact:true}).getAttribute('aria-pressed'),'true');
  const canvas=page.locator('.pipeline-viewport');
  const initialCanvas=await canvas.boundingBox(),main=await page.locator('.ep main').boundingBox();assert.ok(initialCanvas.width>main.width*.85,'主区域应该给工作流');
  await page.getByRole('button',{name:'需求受理',exact:true}).scrollIntoViewIfNeeded();await page.getByRole('button',{name:'需求受理',exact:true}).click();
  await page.getByLabel('节点名称',{exact:true}).fill('需求受理模式互通');
  const stage=await page.locator('.pipeline-stage').boundingBox(),dock=await page.getByLabel('所选流程配置',{exact:true}).boundingBox();assert.ok(dock.y>=stage.y+stage.height-2,'配置必须在画布下方');
  await page.getByRole('button',{name:'文字工作台',exact:true}).click();await page.getByRole('button',{name:'查看步骤：需求受理模式互通',exact:true}).waitFor();
  await page.getByLabel('责任岗位',{exact:true}).selectOption('reviewer');await page.getByRole('button',{name:'流程工作台',exact:true}).click();assert.match(await page.getByRole('button',{name:'需求受理模式互通',exact:true}).textContent(),/验收人员/);
  await page.getByRole('button',{name:'文字工作台',exact:true}).click();await nav('管理与设置');await page.getByRole('button',{name:'流程工作台',exact:true}).click();assert.equal(await page.getByLabel('节点名称',{exact:true}).inputValue(),'需求受理模式互通','离开设置回到画布也须保留草稿');
  await page.getByRole('button',{name:'撤销',exact:true}).click();await page.getByRole('button',{name:'撤销',exact:true}).click();
  mkdirSync('.enterprise-test/screenshots',{recursive:true});await page.screenshot({path:'.enterprise-test/screenshots/flow-workbench-mode.png'});
  await page.getByRole('button',{name:'收起配置',exact:true}).click();await page.getByRole('button',{name:'自动排列',exact:true}).click();
  assert.ok(await page.locator('.pipeline-return').count()>0,'审批退回路径必须可见');
  const planned=await page.locator('.pipeline-node[data-kind=ai]').first().textContent();assert.match(planned,/助手|计划|AI/);
  assert.ok((await page.locator('.pipeline-node').evaluateAll(nodes=>nodes.map(n=>Number(n.getAttribute('transform').match(/translate\(([^,]+)/)[1])))).some(x=>x>720),'自动排列应支持横向长流水线');
  await page.getByRole('button',{name:'保存草稿',exact:true}).click();await page.getByText('草稿已保存',{exact:false}).waitFor();await page.getByRole('button',{name:'校验流程',exact:true}).click();
  await page.getByRole('button',{name:'新建流程',exact:true}).click();await page.getByRole('button',{name:'文字工作台',exact:true}).click();await page.getByLabel('流程名称',{exact:true}).fill('拖拽流水线验收');await page.getByRole('button',{name:'流程工作台',exact:true}).click();
  await canvas.scrollIntoViewIfNeeded();
  const area=await canvas.boundingBox();const transfer=await page.evaluateHandle(()=>new DataTransfer());
  await page.locator('.pipeline-palette').getByRole('button',{name:'人工任务',exact:true}).dispatchEvent('dragstart',{dataTransfer:transfer});
  await canvas.dispatchEvent('drop',{dataTransfer:transfer,clientX:area.x+350,clientY:area.y+220});
  await page.getByLabel('节点名称',{exact:true}).fill('岗位交付');
  const node=page.getByRole('button',{name:'岗位交付',exact:true}),nodeId=await node.getAttribute('data-node-id');assert.ok(nodeId);
  async function wire(from,to){const a=page.getByRole('button',{name:'从此连接：'+from,exact:true}),b=page.getByRole('button',{name:'连接到：'+to,exact:true});await a.scrollIntoViewIfNeeded();const x=await a.boundingBox();await b.scrollIntoViewIfNeeded();await page.getByRole('button',{name:'适应画布',exact:true}).click();await canvas.scrollIntoViewIfNeeded();const aa=await a.boundingBox(),bb=await b.boundingBox();await page.mouse.move(aa.x+aa.width/2,aa.y+aa.height/2);await page.mouse.down();await page.mouse.move(bb.x+bb.width/2,bb.y+bb.height/2,{steps:12});await page.mouse.up();}
  await wire('开始','岗位交付');await wire('岗位交付','归档结束');assert.equal(await page.locator('.pipeline-edge').count(),2);
  await node.click();await page.getByRole('button',{name:'原始大小',exact:true}).click();await node.scrollIntoViewIfNeeded();const before=await node.getAttribute('transform'),box=await node.boundingBox();await page.mouse.move(box.x+70,box.y+40);await page.mouse.down();await page.mouse.move(box.x+125,box.y+90,{steps:10});await page.mouse.up();const after=await node.getAttribute('transform');assert.notEqual(after,before,'拖动必须改变节点坐标');await page.getByRole('button',{name:'撤销',exact:true}).click();assert.equal(await node.getAttribute('transform'),before);await page.getByRole('button',{name:'重做',exact:true}).click();assert.equal(await node.getAttribute('transform'),after);
  await page.getByRole('button',{name:'保存草稿',exact:true}).click();await page.getByText('草稿已保存',{exact:false}).waitFor();await page.getByRole('button',{name:'校验流程',exact:true}).click();await page.getByRole('button',{name:'发布版本',exact:true}).click();
  await page.getByRole('button',{name:'文字工作台',exact:true}).click();await page.getByRole('button',{name:'关闭编辑',exact:true}).click();const row=page.getByRole('row').filter({has:page.getByRole('cell',{name:'拖拽流水线验收',exact:true})}).first();await row.getByRole('button',{name:'配置流程',exact:true}).click();await page.getByRole('button',{name:'流程工作台',exact:true}).click();assert.equal(await page.getByRole('button',{name:'岗位交付',exact:true}).getAttribute('transform'),after,'保存重开须保留位置');
  await page.getByRole('button',{name:'连接：开始 → 岗位交付',exact:true}).click();await page.getByLabel('连线终点',{exact:true}).selectOption('end');assert.equal(await page.getByRole('button',{name:'连接：开始 → 归档结束',exact:true}).count(),1);await page.getByRole('button',{name:'撤销',exact:true}).click();
  await page.getByRole('button',{name:'适应画布',exact:true}).click();await page.getByRole('button',{name:'连接：开始 → 岗位交付',exact:true}).click();
  await canvas.scrollIntoViewIfNeeded();const handle=await page.getByRole('button',{name:'拖动连线末端改接',exact:true}).boundingBox(),end=await page.getByRole('button',{name:'连接到：归档结束',exact:true}).boundingBox();await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(end.x+end.width/2,end.y+end.height/2,{steps:12});await page.mouse.up();assert.equal(await page.getByRole('button',{name:'连接：开始 → 归档结束',exact:true}).count(),1,'拖动连线末端应实际改接');await page.getByRole('button',{name:'撤销',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'连接到：开始',exact:true}).count(),0);
  for(const size of [{width:1366,height:768},{width:911,height:512},{width:1920,height:1080}]){await page.setViewportSize(size);await page.getByRole('button',{name:'适应画布',exact:true}).click();const bounds=await page.locator('.ep main').evaluate(el=>({w:el.clientWidth,sw:el.scrollWidth}));assert.ok(bounds.sw<=bounds.w+2,'画布不能撑宽整页');}
  await page.setViewportSize({width:1366,height:900});await page.getByRole('button',{name:'适应画布',exact:true}).click();await canvas.scrollIntoViewIfNeeded();mkdirSync('.enterprise-test/screenshots',{recursive:true});await page.screenshot({path:'.enterprise-test/screenshots/pipeline-designer.png'});
  await page.getByRole('button',{name:'文字工作台',exact:true}).click();await page.getByRole('button',{name:'关闭编辑',exact:true}).click();const versionRow=page.locator('section').filter({has:page.getByRole('heading',{name:'已发布版本',exact:true})}).getByRole('row').filter({hasText:'拖拽流水线验收'});await versionRow.getByRole('button',{name:'发起流程',exact:true}).first().click();await page.getByLabel('本次业务名称').fill('拖拽定义实际执行');await page.getByRole('button',{name:'确认发起',exact:true}).click();await page.getByRole('heading',{name:'拖拽定义实际执行',exact:true}).waitFor();assert.ok(await page.locator('.pipeline-node[data-status=waiting]').count()>0,'人工节点等待本人办理');
  assert.deepEqual(errors,[]);writeFileSync('.enterprise-test/pipeline-result.json',JSON.stringify({defaultFlow:true,sharedDraftAcrossModes:true,configurationBelow:true,returnFromSettings:true,drag:true,connect:true,rewire:true,undoRedo:true,persistence:true,publishAndRun:true,viewportWidths:[911,1366,1920]},null,2));console.log('FLOW_TEXT_MODES_SHARED_DRAFT_CONFIG_BELOW_AND_PIPELINE_PASSED');
}finally{if(browser)await browser.close();host.kill('SIGTERM');}
