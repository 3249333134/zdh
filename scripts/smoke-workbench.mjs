import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const require=createRequire(realpathSync(new URL('../upstream/deepseek-harness-master/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/package.json',import.meta.url)));
const {chromium}=require('playwright');
let host;
let url=process.argv[2];
if(!url){
  const root=fileURLToPath(new URL('../',import.meta.url));
  host=spawn(process.execPath,['apps/cli/lib/bin.js','web','--patch','../../workbench/cordis.patch.yml','--no-open','--port','3081'],{cwd:new URL('../upstream/deepseek-harness-master',import.meta.url),env:{...process.env,DSH_HOME:root+'.local-dsh',ENTERPRISE_DATA_HOME:root+'.local-business'},stdio:['ignore','pipe','pipe']});
  url=await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('DSH 启动超时')),30000);
    host.stdout.on('data',chunk=>{const m=String(chunk).match(/http:\/\/127\.0\.0\.1:3081\/\?token=\S+/);if(m){clearTimeout(timeout);resolve(m[0]);}});
    host.stderr.on('data',chunk=>console.error(String(chunk).slice(0,1500)));
    host.on('exit',code=>{clearTimeout(timeout);reject(new Error('DSH exited '+code));});
  });
}
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',e=>console.error('PAGE:',e.message));
  page.on('console',m=>{if(m.type()==='error')console.error('CONSOLE:',m.text().slice(0,1000));});
  await page.goto(url);
  await page.getByRole('heading',{name:'企业人机协作工作台',exact:true}).waitFor({timeout:30000});
  await page.screenshot({path:new URL('../workbench/screenshot.png',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'),fullPage:true});
  console.log('WORKBENCH_VISIBLE');
  const preview=page.getByRole('dialog').filter({hasText:'预览版说明'});
  try {await preview.waitFor({timeout:5000});await preview.getByRole('button',{name:'继续',exact:true}).click();}catch{}
  console.log('DIALOGS',await page.getByRole('dialog').allTextContents());
  await page.getByRole('button',{name:'新建项目',exact:true}).click();
  await page.getByRole('textbox',{name:'项目名称',exact:true}).fill('安装验收项目');
  await page.getByRole('textbox',{name:'目标与验收要求',exact:true}).fill('验证 DSH 工作台真实业务接口');
  await page.getByRole('textbox',{name:'负责人',exact:true}).fill('验收人员');
  await page.getByRole('button',{name:'创建项目',exact:true}).click();
  await page.getByRole('heading',{name:'安装验收项目',exact:true}).waitFor();
  console.log('PROJECT_CREATED_THROUGH_DSH');
  await page.getByRole('textbox',{name:'任务与交付物',exact:true}).fill('完成接口验收');
  await page.getByRole('textbox',{name:'负责人',exact:true}).fill('验收人员');
  await page.getByRole('button',{name:'添加任务',exact:true}).click();
  await page.getByRole('cell',{name:'完成接口验收',exact:true}).waitFor();
  await page.getByRole('combobox',{name:'完成接口验收状态'}).selectOption('done');
  await page.reload();
  await page.getByRole('heading',{name:'企业人机协作工作台',exact:true}).waitFor();
  await page.getByRole('button',{name:'项目任务',exact:true}).click();
  await page.getByRole('cell',{name:'完成接口验收',exact:true}).first().waitFor();
  console.log('TASK_PERSISTED_AFTER_RELOAD');
  await page.getByRole('button',{name:'业务地图',exact:true}).click();
  await page.getByRole('heading',{name:'项目执行业务地图',exact:true}).waitFor();
  await page.setViewportSize({width:900,height:900});
  await page.screenshot({path:new URL('../workbench/screenshot-compact.png',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'),fullPage:true});
  console.log('PDCA_VISIBLE_AT_COMPACT_SIZE');
} finally {await browser.close();host?.kill();}
