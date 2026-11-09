const fs=require('node:fs'),path=require('node:path');
module.exports=async(win,logs)=>{
 const run=code=>win.webContents.executeJavaScript(code),sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const report={};
 try{
 for(let i=0;i<60;i++){if(await run("!!document.querySelector('.md-nav')"))break;await sleep(250)}
 await run("[...document.querySelectorAll('.md-nav button')].find(b=>b.textContent==='知识库')?.click()");
 for(let i=0;i<90;i++){if(await run("document.querySelectorAll('.md-knowledge-list article').length>0"))break;await sleep(500)}
 report.sources=await run("document.querySelectorAll('.md-knowledge-list article').length");
 report.warnings=await run("[...document.querySelectorAll('.md-knowledge-page .md-task-error')].map(el=>el.innerText)");
 report.navigation=await run("[...document.querySelectorAll('.md-nav button')].map(el=>el.textContent)");
 win.show();win.setSize(1440,960);await sleep(600);fs.writeFileSync(path.join(logs,'knowledge-wide.png'),(await win.webContents.capturePage()).toPNG());
 win.setSize(1050,800);await run("document.querySelector('button[aria-label=\"收起对话\"]')?.click()");await sleep(600);fs.writeFileSync(path.join(logs,'knowledge-narrow.png'),(await win.webContents.capturePage()).toPNG());
 win.setSize(1440,960);await run("[...document.querySelectorAll('.md-nav button')].find(b=>b.textContent==='影策')?.click()");await sleep(2000);
 const frame=win.webContents.mainFrame.frames.find(f=>f.url.startsWith('http://127.0.0.1:13001/'));
 if(frame) { await frame.executeJavaScript("if(location.pathname!=='/create')location.href='/create'"); await sleep(2000); }
 report.yingceHeading=frame?await frame.executeJavaScript("(()=>{const el=document.querySelector('.creation-start-heading>div');return el?getComputedStyle(el).display:null})()"):null;
 fs.writeFileSync(path.join(logs,'knowledge-yingce-restored.png'),(await win.webContents.capturePage()).toPNG());
 report.ok=report.sources>0 && report.navigation.at(-1)==='知识库' && !!report.yingceHeading && report.yingceHeading!=='none';
 }catch(e){report.error=e.stack;report.ok=false}
 fs.writeFileSync(path.join(logs,'knowledge-check.json'),JSON.stringify(report,null,2));
};
