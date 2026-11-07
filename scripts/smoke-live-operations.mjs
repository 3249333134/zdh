import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {realpathSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const require=createRequire(realpathSync(new URL('../upstream/deepseek-harness-master/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/package.json',import.meta.url)));
const {_electron}=require('playwright');
if(!process.argv[2])throw new Error('请传入已打包的工作台可执行文件路径');
const host=spawn(process.execPath,['--import','tsx','enterprise/tests/test-service.ts'],{stdio:['ignore','pipe','pipe']});if(process.env.DEBUG_ENTERPRISE_TEST)host.stdout.on('data',b=>console.log(String(b).trim()));
let app,page;
try{
  const url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('测试服务启动超时')),30000);host.stdout.on('data',b=>{const m=String(b).match(/TEST_ENTERPRISE_URL (http:\/\/127.0.0.1:\d+)/);if(m){clearTimeout(timer);resolve(m[1]);}});host.stderr.on('data',b=>console.error(String(b).slice(0,1000)));host.on('exit',code=>reject(new Error('测试服务退出 '+code)));});
  const home=fileURLToPath(new URL('../.enterprise-test/desktop-'+crypto.randomUUID(),import.meta.url));mkdirSync(home,{recursive:true});
  app=await _electron.launch({args:['--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding','--disable-background-timer-throttling'],executablePath:process.argv[2],env:{...process.env,ENTERPRISE_WORKBENCH_HOME:home},timeout:60000});
  page=await app.firstWindow();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.locator('.es-brand').waitFor({timeout:120000});
  const editor=page.locator('.es-command [contenteditable="true"]').first();await editor.waitFor();await editor.fill('打包客户端常驻 AI 草稿');
  const info=await app.evaluate(({app})=>({packaged:app.isPackaged,version:app.getVersion(),userData:app.getPath('userData')}));if(!info.packaged)throw new Error('目标不是打包后的应用');console.log('PACKAGED_DSH_WORKBENCH_VISIBLE',JSON.stringify(info));
  await page.getByLabel('企业服务器地址',{exact:true}).fill(url);await page.getByRole('button',{name:'连接服务器',exact:true}).click();await page.getByLabel('登录账号',{exact:true}).fill('admin');await page.getByLabel('密码',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'登录企业工作台',exact:true}).click();await page.locator('.pipeline-stage').waitFor();

  await page.getByRole('navigation',{name:'工作台插件导航'}).getByRole('button',{name:'协作大屏',exact:true}).click();await page.locator('.or-screen[data-source=business]').waitFor();
  if(await page.getByRole('button',{name:'视频演示',exact:true}).count())throw Error('仍存在演示入口');
  await page.getByRole('button',{name:'发起业务',exact:true}).click();const form=page.getByLabel('发起真实业务',{exact:true});await form.getByLabel('本次业务名称',{exact:true}).fill('打包客户端人工流转测试');await form.getByLabel('发起方式',{exact:true}).selectOption('flow');await form.getByRole('button',{name:'确认发起',exact:true}).click();await form.waitFor({state:'detached'});
  await page.getByRole('button',{name:'办理当前待办（1）',exact:true}).click();await page.getByRole('heading',{name:'提交办理成果',exact:true}).waitFor();await page.getByLabel('业务需求与验收标准',{exact:true}).fill('明确标记测试需求：验证桌面端人工交接');await page.getByRole('button',{name:'提交完成',exact:true}).click();
  await page.getByRole('navigation',{name:'工作台插件导航'}).getByRole('button',{name:'协作大屏',exact:true}).click();await page.waitForFunction(()=>[...document.querySelectorAll('.or-task')].some(e=>e.textContent.includes('项目经理审批')&&e.dataset.status==='waiting'));
  await page.getByRole('button',{name:'办理当前待办（1）',exact:true}).click();await page.getByRole('heading',{name:'本人核对并审批',exact:true}).waitFor();
  await page.getByRole('navigation',{name:'工作台插件导航'}).getByRole('button',{name:'协作大屏',exact:true}).click();await page.locator('.or-field canvas').waitFor();await page.waitForTimeout(150);const frozen=await page.locator('.or-field canvas').evaluate(e=>e.toDataURL());await page.waitForTimeout(250);if(frozen!==await page.locator('.or-field canvas').evaluate(e=>e.toDataURL()))throw Error('等待人工时不应模拟轨迹');
  await page.getByRole('button',{name:'沉浸大屏',exact:true}).click();await page.locator('.or-immersive').waitFor();await page.keyboard.press('Escape');await page.locator('.or-immersive').waitFor({state:'detached'});
  await page.getByRole('button',{name:'个人对话',exact:true}).click();if(!(await editor.innerText()).includes('打包客户端常驻 AI 草稿'))throw Error('常驻草稿丢失');
  await page.getByRole('navigation',{name:'工作台插件导航'}).getByRole('button',{name:'企业知识库',exact:true}).click();await page.getByLabel('可交互知识星海',{exact:true}).waitFor();if(errors.length)throw Error(errors.join('\n'));
  console.log('PACKAGED_LIVE_START_HUMAN_FORM_SUBMIT_APPROVAL_SERVER_COUNTS_NO_FAKE_MOTION_KNOWLEDGE_AI_DRAFT_PASSED');
}finally{await app?.close();host.kill();}
