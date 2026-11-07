import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {realpathSync,mkdirSync} from 'node:fs';
const require=createRequire(realpathSync(new URL('../upstream/deepseek-harness-master/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/package.json',import.meta.url)));
const {chromium}=require('playwright');
const host=spawn(process.execPath,['--import','tsx','enterprise/tests/test-service.ts'],{stdio:['ignore','pipe','pipe']});
const url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('测试服务启动超时')),30000);host.stdout.on('data',b=>{const m=String(b).match(/TEST_ENTERPRISE_URL (http:\/\/127.0.0.1:\d+)/);if(m){clearTimeout(timer);resolve(m[1]);}});host.stderr.on('data',b=>console.error(String(b).slice(0,1000)));host.on('exit',code=>reject(new Error('测试服务退出 '+code)));});
const browser=await chromium.launch({channel:'msedge',headless:true});mkdirSync('.enterprise-test/screenshots',{recursive:true});
const errors=[];
async function login(role){const context=await browser.newContext({viewport:{width:1366,height:768}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.getByLabel('登录账号',{exact:true}).fill(role);await page.getByLabel('密码',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'登录企业工作台',exact:true}).click();await page.getByRole('button',{name:'文字工作台',exact:true}).click();await page.getByRole('navigation',{name:'企业工作台导航'}).waitFor();await page.getByRole('navigation',{name:'企业工作台导航'}).getByRole('button',{name:'工作台',exact:true}).click();return page;}
async function nav(page,name){await page.getByRole('navigation').getByRole('button',{name,exact:true}).click();}
async function openTodo(page){await nav(page,'待办与审核');await page.getByRole('button',{name:'办理',exact:true}).first().click();}
try{
  const manager=await login('manager'),executor=await login('executor'),reviewer=await login('reviewer'),admin=await login('admin');
  await manager.getByRole('button',{name:'发起业务',exact:true}).click();await manager.getByLabel('发起方式',{exact:true}).selectOption('flow');await manager.getByLabel('本次业务名称').fill('多岗位项目交付验收');await manager.getByRole('button',{name:'确认发起',exact:true}).click();
  await openTodo(manager);await manager.getByLabel('业务需求与验收标准').fill('交付方案和证据，由独立岗位验收');await manager.getByRole('button',{name:'提交完成',exact:true}).click();
  await openTodo(manager);await manager.getByLabel('审核意见',{exact:true}).fill('计划有依据，同意执行');await manager.getByRole('button',{name:'确认通过',exact:true}).click();
  await openTodo(executor);await executor.getByLabel('交付内容',{exact:true}).fill('已完成业务交付方案');await executor.getByRole('button',{name:'提交完成',exact:true}).click();
  await openTodo(executor);await executor.getByLabel('证据与资料说明',{exact:true}).fill('已整理过程记录与检验资料');await executor.getByRole('button',{name:'提交完成',exact:true}).click();
  await openTodo(reviewer);await reviewer.getByLabel('办理说明',{exact:true}).fill('验收依据齐备，同意归档');await reviewer.getByRole('button',{name:'确认通过',exact:true}).click();
  await nav(admin,'运行与运营');await admin.getByText('已归档',{exact:true}).first().waitFor({timeout:15000});console.log('MULTI_CLIENT_DELIVERY_PASSED');
  for(const name of ['工作台','制造业务','企业业务地图','组件库','项目与任务','数字员工','流程设计','待办与审核','运行与运营','资料与知识','管理与设置']){
    await nav(admin,name);const dims=await admin.locator('.ep main').evaluate(el=>({height:el.clientHeight,scrollHeight:el.scrollHeight,width:el.clientWidth,scrollWidth:el.scrollWidth}));if(dims.height<100||dims.scrollWidth>dims.width+2)throw new Error(name+' 主内容区裁切或整体横向溢出');
    await admin.locator('.ep main').evaluate(el=>el.scrollTop=el.scrollHeight);console.log('PAGE_REACHABLE',name);
  }
  await nav(admin,'组件库');await admin.getByRole('button',{name:'新建工作台组件',exact:true}).click();await admin.getByLabel('名称',{exact:true}).fill('跨岗位验收组件');await admin.getByLabel('岗位职责／业务能力').fill('承接上游交付并按标准验收');await admin.getByLabel('责任岗位',{exact:true}).selectOption('reviewer');await admin.getByLabel('输出交付物（每行一项）').fill('验收报告');await admin.getByLabel('验收规则',{exact:true}).fill('输入完整、证据可追溯');await admin.getByRole('button',{name:'保存配置',exact:true}).click();await admin.getByRole('cell',{name:'跨岗位验收组件',exact:true}).waitFor();console.log('COMPONENT_CONFIGURATION_SAVED');
  await nav(admin,'流程设计');await admin.getByRole('button',{name:'配置流程',exact:true}).first().click();await admin.getByRole('button',{name:'校验流程',exact:true}).click();await admin.getByRole('status').filter({hasText:'操作已完成'}).waitFor();
  await admin.screenshot({path:'.enterprise-test/screenshots/designer-1366.png'});
  for(const width of [1920,1093,911]){await admin.setViewportSize({width,height:Math.round(768*width/1366)});const reachable=await admin.locator('.ep main').evaluate(el=>el.clientHeight>100&&el.scrollWidth<=el.clientWidth+2);if(!reachable)throw new Error('缩放布局不可用 '+width);await admin.locator('.ep main').evaluate(el=>el.scrollTop=el.scrollHeight);}
  await admin.screenshot({path:'.enterprise-test/screenshots/designer-scaled.png'});
  if(errors.length)throw new Error(errors.join('\n'));console.log('ENTERPRISE_UI_PASSED');
}finally{await browser.close();host.kill('SIGTERM');}
