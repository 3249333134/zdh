import fs from 'node:fs/promises'
import { createReadStream, existsSync } from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { createRequire } from 'node:module'
import { spawn, execFile } from 'node:child_process'
import { once } from 'node:events'
import { editorDocument, validateEditor } from '../media_desk/src/motion-editor.js'
import { resolveTimeline } from '../media_desk/src/motion-timeline.js'
const [dir,data,ffmpegBin]=process.argv.slice(2),require=createRequire(import.meta.url)
const { chromium }=require(path.join(data,'motion-runtime/zh/node_modules/playwright-core'))
const p=validateEditor(JSON.parse(await fs.readFile(path.join(dir,'snapshot.json'),'utf8')))
const id=path.basename(dir),statusFile=path.join(dir,'status.json')
async function status(value){await fs.writeFile(statusFile+'.tmp',JSON.stringify({id,revision:p.revision,...value}));await fs.rename(statusFile+'.tmp',statusFile)}
const mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.mp4':'video/mp4','.mov':'video/quicktime','.webm':'video/webm','.mp3':'audio/mpeg','.wav':'audio/wav','.m4a':'audio/mp4'}
const server=http.createServer(async(req,res)=>{
 try{
  const asset=p.assets.find(a=>'/'+a.id===req.url);if(!asset){res.writeHead(404).end();return}
  const stat=await fs.stat(asset.path),range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
  const start=range?Number(range[1]):0,end=range&&range[2]?Math.min(Number(range[2]),stat.size-1):stat.size-1;
  if(start>end){res.writeHead(416).end();return}
  res.writeHead(range?206:200,{'Content-Type':mime[path.extname(asset.path)]||'application/octet-stream','Access-Control-Allow-Origin':'*','Accept-Ranges':'bytes','Content-Length':end-start+1,...(range?{'Content-Range':`bytes ${start}-${end}/${stat.size}`}:{})});
  createReadStream(asset.path,{start,end}).pipe(res)
 }catch{res.writeHead(500).end()}
})
let browser,encoder
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 const base='http://127.0.0.1:'+server.address().port,urls=Object.fromEntries(p.assets.map(a=>[a.id,base+'/'+a.id]))
 const executablePath=process.env.CHROME||['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync)
 browser=await chromium.launch({executablePath,headless:true})
 const page=await browser.newPage({viewport:{width:p.width,height:p.height},deviceScaleFactor:1})
 await page.setContent('<body style="margin:0"><iframe name="composition" sandbox="allow-scripts" style="border:0;display:block;width:100vw;height:100vh"></iframe></body>')
 await page.locator('iframe').evaluate((el,html)=>el.srcdoc=html,editorDocument(p,urls,'export'))
 const frame=page.frame({name:'composition'});await frame.waitForFunction(()=>typeof window.renderAt==='function')
 const silent=path.join(dir,'silent.mp4');let stderr=''
 encoder=spawn(path.join(ffmpegBin,'ffmpeg.exe'),['-v','error','-n','-f','image2pipe','-vcodec','mjpeg','-framerate',String(p.fps),'-i','pipe:0','-an','-c:v','libx264','-preset','veryfast','-pix_fmt','yuv420p',silent],{windowsHide:true})
 encoder.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-2000)})
 encoder.stdin.on('error',()=>{})
 encoder.on('error',()=>{})
 const completed=new Promise((resolve,reject)=>{encoder.once('error',reject);encoder.once('exit',code=>code===0?resolve():reject(Error(stderr||'视频编码失败')))})
 completed.catch(()=>{})
 const total=Math.ceil(p.duration*p.fps)
 for(let n=0;n<total;n++){
  let timeout
  const errors=await Promise.race([frame.evaluate(t=>window.renderAt(t),n/p.fps),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('动画代码单帧执行超时，请检查循环与素材')),20000)})]).finally(()=>clearTimeout(timeout));if(errors.length)throw Error(errors.join('；'))
  const image=await page.screenshot({type:'jpeg',quality:92,timeout:30000});if(!encoder.stdin.write(image))await Promise.race([once(encoder.stdin,'drain'),completed.then(()=>{throw Error('编码提前终止')})])
  if(n%p.fps===0)await status({state:'rendering',progress:Math.round(n/total*90)})
 }
 encoder.stdin.end();await completed;await browser.close();browser=null
 const audio=resolveTimeline(p).clips.filter(c=>['audio','video'].includes(c.type)&&(c.volume??1)>0&&p.assets.find(a=>a.id===c.assetId)?.hasAudio)
 const output=path.join(dir,'video.mp4'),args=['-v','error','-n','-i',silent],filters=[]
 audio.forEach((clip,index)=>{
  args.push('-i',p.assets.find(a=>a.id===clip.assetId).path)
  const fade=clip.audioFade?Math.min(Number(clip.audioFade),clip.duration/2):0
  filters.push(`[${index+1}:a]atrim=start=${clip.inPoint||0}:duration=${clip.duration},asetpts=PTS-STARTPTS,volume=${clip.volume??1}${fade?`,afade=t=in:d=${fade},afade=t=out:st=${clip.duration-fade}:d=${fade}`:''},adelay=${Math.round(clip.start*1000)}:all=1[a${index}]`)
 })
 if(audio.length){filters.push(audio.map((_,i)=>`[a${i}]`).join('')+`amix=inputs=${audio.length}:normalize=0,apad,atrim=duration=${p.duration}[mix]`);args.push('-filter_complex',filters.join(';'),'-map','0:v:0','-map','[mix]','-c:a','aac')}
 else args.push('-map','0:v:0')
 args.push('-c:v','copy','-t',String(p.duration),'-movflags','+faststart',output)
 await new Promise((resolve,reject)=>execFile(path.join(ffmpegBin,'ffmpeg.exe'),args,{windowsHide:true,timeout:300000},(e,o,s)=>e?reject(Error(s||e.message)):resolve()))
 const probe=await new Promise((resolve,reject)=>execFile(path.join(ffmpegBin,'ffprobe.exe'),['-v','error','-show_format','-show_streams','-of','json',output],{windowsHide:true},(e,o)=>e?reject(e):resolve(JSON.parse(o))))
 if(!probe.streams.some(s=>s.codec_type==='video')||Math.abs(Number(probe.format.duration)-p.duration)>.2)throw Error('导出校验未通过')
 await status({state:'done',progress:100,duration:Number(probe.format.duration),hasAudio:audio.length>0});await fs.unlink(silent)
}catch(error){await status({state:'failed',error:error.message});process.exitCode=1}
finally{encoder?.kill();await browser?.close();server.close()}
