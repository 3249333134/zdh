import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import service from './motion-editor.cjs'
import { generateAnimation } from '../media_desk/src/motion-editor-ai.js'
import unifiedAI from './unified-ai.cjs'
const root=path.dirname(fileURLToPath(import.meta.url)), data=path.join(root,'data')
const ffmpegBin=path.resolve(root,'../.local-runtimes/ffmpeg/ffmpeg-9.0.2-essentials_build/bin')
const options={data,ffmpegBin}
const project=await service({action:'motion-editor-create'},options)
const dir=path.join(data,'motion-editor',project.id),source=path.join(dir,'synthetic.mp4'),assetId=randomUUID()
execFileSync(path.join(ffmpegBin,'ffmpeg.exe'),['-v','error','-n','-f','lavfi','-i','testsrc2=size=320x180:rate=24:duration=2','-f','lavfi','-i','sine=frequency=440:duration=2','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',source],{windowsHide:true})
const asset={id:assetId,name:'合成测试视频',kind:'video',duration:2,hasAudio:true,path:source}
const p={...project,title:'功能验收 · 动画与真实素材合成',width:640,height:360,duration:3,fps:24,assets:[asset],clips:[
 {id:'animation',type:'animation',start:0,duration:3,layer:1,code:'ctx.fillStyle="#204b48";ctx.fillRect(0,0,width,height);ctx.fillStyle="#b5edd7";ctx.fillRect(time*90,35,60,60)'},
 {id:'video',type:'video',assetId,start:.5,duration:1.5,inPoint:.3,x:280,y:70,width:320,height:180,layer:5,volume:.5},
 {id:'text',type:'text',start:0,duration:3,text:'动画 + 视频 + 字幕 + 原声',x:30,y:280,width:600,fontSize:26,layer:20}
]}
await fs.writeFile(path.join(dir,'project.json'),JSON.stringify(p))
const loaded=await service({action:'motion-editor-read',id:p.id},options)
if(loaded.assets[0].path||!loaded.previewUrls[assetId])throw Error('公开工程包含文件路径或未生成预览地址')
const saved=await service({action:'motion-editor-save',id:p.id,project:loaded},options)
try {await service({action:'motion-editor-save',id:p.id,project:loaded},options);throw Error('未检测并发修改')}catch(e){if(!e.message.includes('另一处更新'))throw e}
const voices=await service({action:'motion-editor-voices'},options)
if(voices.voices.length){const spoken=await service({action:'motion-editor-speech',id:p.id,text:'动画测试。',voice:voices.voices[0].name},options);if(!spoken.clips.some(c=>c.type==='audio'))throw Error('配音未进入音轨')}
if(process.env.MOTION_EDITOR_VERIFY_AI==='1'){
 const config=unifiedAI.read(data),current=await service({action:'motion-editor-read',id:p.id},options)
 const generated=await generateAnimation({project:current,instruction:'只生成1个三秒镜头。绘制青绿色圆形从左向右移动，显示中文标题“代码动画”。保持画面简单，所有代码不超过20行。',script:'AI代码与真实素材合成验收。',call:async request=>{
  const response=await fetch(config.baseUrl.replace(/\/$/,'')+'/chat/completions',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+config.apiKey},body:JSON.stringify({model:config.textModel,messages:[{role:'system',content:request.system},{role:'user',content:request.user}],max_tokens:request.maxTokens}),signal:AbortSignal.timeout(120000)})
  if(!response.ok)throw Error('AI 验收调用失败 '+response.status)
  const result=await response.json();return {text:result.choices?.[0]?.message?.content||''}
 }})
 await service({action:'motion-editor-save',id:p.id,project:{...current,title:'AI 实测 · 自由动画与真实素材',clips:[...current.clips.filter(c=>c.type!=='animation'),...generated.clips]}},options)
 console.log('真实模型已生成并保存 '+generated.clips.length+' 个自由动画片段')
}
const job=await service({action:'motion-editor-render',id:p.id},options)
console.log(JSON.stringify({id:p.id,renderId:job.id,revision:saved.revision}))
let state
for(let n=0;n<120;n++){
 await new Promise(r=>setTimeout(r,500));state=await service({action:'motion-editor-status',id:p.id,renderId:job.id},options)
 if(state.state!=='rendering')break
}
console.log(JSON.stringify(state))
if(state.state!=='done'||!state.hasAudio)throw Error('端到端导出失败')
console.log(path.join(dir,job.id,'video.mp4'))
