const fs=require('node:fs'),path=require('node:path');
module.exports=async(win,logs)=>{
 const run=code=>win.webContents.executeJavaScript(code),sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const report={};
 try{
 for(let i=0;i<60;i++){if(await run("!!document.querySelector('.md-nav')"))break;await sleep(250)}
 await run("[...document.querySelectorAll('.md-nav button')].find(b=>b.textContent==='知识库')?.click()");
 for(let i=0;i<90;i++){if(await run("!!document.querySelector('.wiki-galaxy canvas')"))break;await sleep(500)}
 report.sources=await run("Number(document.querySelector('.md-knowledge-page .md-page-sub')?.textContent.match(/(\\d+) 条来源/)?.[1] || 0)");
 report.graph=await run("!!document.querySelector('.wiki-galaxy canvas')");
 report.itemPlans=await run("document.body.innerText.includes('知识库')");
 report.warnings=await run("[...document.querySelectorAll('.md-knowledge-page .md-task-error')].map(el=>el.innerText)");
 const st=await (await win.webContents.session.fetch(new URL(win.webContents.getURL()).origin+'/media-desk/state')).json(); report.itemDrafts=st.state.workflow.proposals.filter(p=>p.sourceItemId).map(p=>({id:p.id,tasks:p.tasks.length}));
 report.navigation=await run("[...document.querySelectorAll('.md-nav button')].map(el=>el.textContent)");
 win.show();win.setSize(1440,960);await sleep(600);fs.writeFileSync(path.join(logs,'knowledge-wide.png'),(await win.webContents.capturePage()).toPNG());
 win.setSize(1050,800);await run("document.querySelector('button[aria-label=\"收起对话\"]')?.click()");await sleep(600);fs.writeFileSync(path.join(logs,'knowledge-narrow.png'),(await win.webContents.capturePage()).toPNG());
 win.setSize(1440,960);await run("[...document.querySelectorAll('.md-nav button')].find(b=>b.textContent==='影策')?.click()");await sleep(2000);
 const frame=win.webContents.mainFrame.frames.find(f=>f.url.startsWith('http://127.0.0.1:13001/'));
 if(frame) { await frame.executeJavaScript("if(location.pathname!=='/create')location.href='/create'"); await sleep(2000); }
 report.yingceHeading=frame?await frame.executeJavaScript("(()=>{const el=document.querySelector('.creation-start-heading>div');return el?getComputedStyle(el).display:null})()"):null;
 fs.writeFileSync(path.join(logs,'knowledge-yingce-restored.png'),(await win.webContents.capturePage()).toPNG());

 report.homeTitleHidden=report.yingceHeading==='none';
 await run("[...document.querySelectorAll('.md-nav button')].find(b=>b.textContent==='排期')?.click()");await sleep(600);
 report.legacyTaskCount=await run("document.querySelectorAll('.md-cal-workflow-chip').length");
 fs.writeFileSync(path.join(logs,'unified-calendar.png'),(await win.webContents.capturePage()).toPNG());
 await run("[...document.querySelectorAll('.md-nav button')].find(b=>b.textContent==='内容')?.click()");await sleep(500);
 await run("document.querySelector('.md-task-table .md-task-title')?.click()");await sleep(400);
 report.executionModes=await run("[...document.querySelectorAll('.md-task-form select option')].filter(el=>['AI 图片 · 影策','AI 视频 · 影策','AI 剪辑 · 剪辑助手'].includes(el.textContent)).length");
 await run("document.querySelector('.md-dialog-head button[aria-label=\"关闭\"]')?.click()");
 report.ok=report.sources>0 && report.navigation.at(-1)==='知识库' && report.homeTitleHidden && report.executionModes===3 && report.legacyTaskCount>0;
 const sourceItem=st.state.items.find(i=>i.production?.status==='done'&&!i.workflowProjectId&&!st.state.workflow.proposals.some(p=>p.sourceItemId===i.id&&p.projectId));
 if(sourceItem){
 await run("[...document.querySelectorAll('.md-nav button')].find(b=>b.textContent==='内容')?.click()");await sleep(400);
 await run("[...document.querySelectorAll('.md-content-tabs button')].find(b=>b.textContent==='内容看板')?.click()");await sleep(300);
 await run(`[...document.querySelectorAll('.md-board-card')].find(b=>b.textContent.includes(${JSON.stringify(sourceItem.production.title||sourceItem.title)}))?.click()`);await sleep(600);
 await run("[...document.querySelectorAll('.md-hero-actions button')].find(b=>b.textContent.trim()==='重新生成')?.click()");await sleep(350);
 report.regenerationSpec=await run("!!document.querySelector('.md-production-spec-body input[type=number][max=\"120\"]')");
 if(report.regenerationSpec){
   await run("(()=>{const field=document.querySelector('.md-production-spec-body input[max=\"120\"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,'9'); field.dispatchEvent(new Event('input',{bubbles:true}));})()");
   await sleep(250);
   report.nineShotOptions=await run("document.querySelectorAll('.md-production-spec-body .md-shot-source select').length===9");
   await run("document.querySelector('.md-dialog-head button[aria-label=\"关闭\"]')?.click()");
 }
 report.studioEntry=await run("!![...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='打包到内容')");
 await run("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='打包到内容')?.click()");await sleep(600);
 report.studioPlanOpened=await run("!!document.querySelector('.md-plan-editor .md-plan-source') && document.querySelectorAll('.md-plan-row').length > 4");
 await run("[...document.querySelectorAll('.md-plan-footer button')].find(b=>b.textContent==='预览预计排期')?.click()");await sleep(600);
 report.studioSchedulePreview=await run("[...document.querySelectorAll('.md-plan-row summary small')].some(el=>el.textContent.includes(' 至 '))");
 fs.writeFileSync(path.join(logs,'finished-item-plan.png'),(await win.webContents.capturePage()).toPNG());
 await run("document.querySelector('.md-dialog-head button[aria-label=\"关闭\"]')?.click()");
 report.ok=report.ok&&report.regenerationSpec&&report.nineShotOptions&&report.studioEntry&&report.studioPlanOpened&&report.studioSchedulePreview;
 }

 if (st.state.workflow.projects.length) {
   const project = st.state.workflow.projects.find(row => st.state.workflow.tasks.some(task => task.projectId === row.id && task.module === 'drama')) || st.state.workflow.projects[0];
   await run("[...document.querySelectorAll('.md-nav button')].find(b=>b.textContent==='内容')?.click()");
   await sleep(300);
   await run(`[...document.querySelectorAll('.md-project-strip button')].find(b=>b.textContent.startsWith(${JSON.stringify(project.title)}))?.click()`);
   await run("[...document.querySelectorAll('.md-project-goal button')].find(b=>b.textContent==='查看生成流程')?.click()");
   await sleep(300);
   report.generationFlow = await run("!!document.querySelector('.md-generation-process') && document.querySelectorAll('.md-generation-grid li').length > 1");
   const task = st.state.workflow.tasks.find(row => row.projectId === project.id && row.module === 'drama' && !row.supersededBy && row.status !== 'cancelled');
   if (task) {
     await run(`[...document.querySelectorAll('.md-generation-grid li button')].find(b=>b.textContent.includes(${JSON.stringify(task.title)}))?.click()`);
     await sleep(400);
     report.flowNavigation = await run("document.querySelector('.md-nav button[aria-current=page]')?.textContent==='影策' && !!document.querySelector('.md-generation-process')");
     report.ok = report.ok && report.flowNavigation;
   }
   report.ok = report.ok && report.generationFlow;
   await run("document.querySelector('button[aria-label=\"关闭生成流程\"]')?.click()");
 }
 await run("[...document.querySelectorAll('.md-nav button')].find(b=>b.textContent==='知识库')?.click()");
 }catch(e){report.error=e.stack;report.ok=false}
 fs.writeFileSync(path.join(logs,'knowledge-check.json'),JSON.stringify(report,null,2));
};
