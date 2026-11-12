const fs=require('node:fs'),path=require('node:path');
module.exports=async(win,logs)=>{
 const run=code=>win.webContents.executeJavaScript(code),sleep=ms=>new Promise(r=>setTimeout(r,ms)),report={};
 const nav=async text=>{await run(`[...document.querySelectorAll('.md-nav button')].find(b=>b.textContent===${JSON.stringify(text)})?.click()`);await sleep(500)};
 const click=async text=>{await run(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)})?.click()`);await sleep(400)};
 const shot=async name=>{await sleep(400);fs.writeFileSync(path.join(logs,name+'.png'),(await win.webContents.capturePage()).toPNG())};
 try{
 for(let i=0;i<60;i++){if(await run("!!document.querySelector('.md-nav')"))break;await sleep(250)}
 const origin=new URL(win.webContents.getURL()).origin;
 const get=async route=>(await win.webContents.session.fetch(origin+'/media-desk/'+route)).json();
 let trends=await get('trends');
 if(!trends.runs.length){const r=await win.webContents.session.fetch(origin+'/media-desk/trends/collect',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});report.collectStatus=r.status;await r.json();trends=await get('trends')}
 report.sources=trends.runs[0]?.results;report.added=trends.runs[0]?.added;report.dailyTime=trends.time;
 win.show();win.setSize(1440,960);await nav('复盘');
 report.audience=await run("document.body.innerText.includes('受众用户画像')&&!!document.querySelector('.md-profile-fields')");await shot('profiles-audience-wide');
 await click('个人账号画像');report.account=await run("document.body.innerText.includes('个人账号画像')&&document.body.innerText.includes('哪些导入账号属于你自己')");await shot('profiles-account-wide');
 win.setSize(1050,800);await run("document.querySelector('button[aria-label=\"收起对话\"]')?.click()");await click('受众用户画像');await shot('profiles-audience-narrow');
 report.narrow=await run("(()=>{const el=document.querySelector('.md-insights-shell');return el&&el.scrollWidth<=el.clientWidth+1})()");
 win.setSize(1440,960);await nav('灵感');await run("document.querySelector('.md-trend-launcher')?.click()");await sleep(600);report.launcher=await run("!!document.querySelector('.md-trend-panel')");await shot('profiles-daily-trends');
 const state=await get('state');report.imported=state.state.items.filter(i=>i.trend).map(i=>({platform:i.platform,kind:i.trend.kind,url:i.trend.url}));
 report.ok=report.audience&&report.account&&report.narrow&&report.launcher&&report.imported.length>0;
 await run("document.querySelector('.md-dialog-head button[aria-label=\"关闭\"]')?.click()");await nav('复盘');
 }catch(e){report.error=e.stack;report.ok=false}
 fs.writeFileSync(path.join(logs,'profiles-check.json'),JSON.stringify(report,null,2));
};
