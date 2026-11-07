import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {realpathSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(realpathSync(new URL('../upstream/deepseek-harness-master/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/package.json',import.meta.url))),{chromium}=require('playwright');const fixture=resolve('.enterprise-test/canvas-source-'+crypto.randomUUID());mkdirSync(fixture+'/公司制度',{recursive:true});writeFileSync(fixture+'/公司制度/设备维护.md','设备维护前必须停止运行。');writeFileSync(fixture+'/公司制度/员工手册.txt','员工每周完成一次业务复盘。');const host=spawn(process.execPath,['--import','tsx','enterprise/tests/test-service.ts'],{env:{...process.env,TEST_KNOWLEDGE_ROOT:fixture,TEST_KNOWLEDGE_DATA_ROOT:fixture+'-data'},stdio:['ignore','pipe','pipe']});let browser;
try{
 const url=await new Promise((ok,bad)=>{host.stdout.on('data',b=>{const m=String(b).match(/TEST_ENTERPRISE_URL (http:\/\/127.0.0.1:\d+)/);if(m)ok(m[1]);});host.stderr.on('data',b=>console.error(String(b).slice(0,500)));setTimeout(()=>bad(Error('服务未就绪')),30000).unref();});
 const login=await(await fetch(url+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({login:'admin',password:'test-password-123'})})).json();const headers={authorization:'Bearer '+login.token};
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1366,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.getByLabel('登录账号',{exact:true}).fill('admin');await page.getByLabel('密码',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'登录企业工作台',exact:true}).click();await page.getByRole('button',{name:'协作大屏',exact:true}).click();await page.locator('.or-screen[data-source=business]').waitFor();
 assert.equal(await page.getByRole('button',{name:'视频演示',exact:true}).count(),0);assert.equal(await page.locator('.or-stats strong').nth(2).innerText(),'—');
 await page.getByRole('button',{name:'发起业务',exact:true}).click();const form=page.getByLabel('发起真实业务',{exact:true});await form.getByLabel('本次业务名称',{exact:true}).fill('大屏真实人工流转测试');await form.getByLabel('发起方式',{exact:true}).selectOption('flow');await form.getByRole('button',{name:'确认发起',exact:true}).click();await form.waitFor({state:'detached'});
 await page.waitForFunction(()=>document.querySelectorAll('.or-task[data-status="waiting"]').length===1);assert.equal(await page.locator('.or-stats strong').nth(4).innerText(),'1');
 const state=await(await fetch(url+'/api/state',{headers})).json(),created=state.instances.find(i=>i.title==='大屏真实人工流转测试');assert.ok(created);assert.equal(state.instances.length,1,'dashboard creates exactly one server instance');
 await page.getByRole('button',{name:'办理当前待办（1）',exact:true}).click();await page.getByRole('heading',{name:'提交办理成果',exact:true}).waitFor({timeout:10000}).catch(async e=>{await page.screenshot({path:'.enterprise-test/screenshots/live-handoff-error.png'});console.log('UI_HANDOFF',await page.locator('.ep').innerText(),errors);throw e;});await page.getByLabel('业务需求与验收标准',{exact:true}).fill('测试需求已核实：交付内容与验收证据齐备');
 await page.getByRole('button',{name:'提交完成',exact:true}).click();
 await page.getByRole('button',{name:'协作大屏',exact:true}).click();await page.waitForFunction(()=>[...document.querySelectorAll('.or-task')].some(e=>e.textContent.includes('项目经理审批')&&e.dataset.status==='waiting'));
 const after=await(await fetch(url+'/api/state',{headers})).json(),instance=after.instances.find(i=>i.id===created.id);assert.equal(instance.runs.find(r=>r.nodeId==='intake').status,'complete');assert.equal(instance.runs.find(r=>r.nodeId==='plan-review').status,'waiting');assert.equal(instance.runs.find(r=>r.nodeId==='execute-a').status,'blocked');
 await page.getByRole('button',{name:'流程节点：项目经理审批',exact:true}).click();await page.getByLabel('调度节点详情').getByRole('button',{name:'办理此节点',exact:true}).click();await page.getByRole('heading',{name:'本人核对并审批',exact:true}).waitFor();
 await page.getByRole('button',{name:'协作大屏',exact:true}).click();await page.getByRole('button',{name:'沉浸大屏',exact:true}).click();await page.locator('.or-immersive').waitFor();await page.keyboard.press('Escape');await page.locator('.or-immersive').waitFor({state:'detached'});
 mkdirSync('.enterprise-test/screenshots',{recursive:true});await page.screenshot({path:'.enterprise-test/screenshots/live-operations-wide.png'});
 for(const size of [{width:1920,height:1080},{width:1093,height:615},{width:911,height:512}]){await page.setViewportSize(size);const bounds=await page.locator('.ep main').evaluate(e=>({w:e.clientWidth,sw:e.scrollWidth,h:e.clientHeight}));assert.ok(bounds.sw<=bounds.w+2,JSON.stringify(bounds));assert.ok(bounds.h>150);}
 assert.deepEqual(errors,[]);console.log('LIVE_DASHBOARD_START_HUMAN_SUBMIT_AI_TEST_OUTPUT_APPROVAL_HANDOFF_REAL_COUNTS_AND_RESPONSIVE_PASSED');
}finally{await browser?.close();host.kill();}

