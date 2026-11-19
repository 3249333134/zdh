import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateAnimation } from '../media_desk/src/motion-editor-ai.js'
import service from './motion-editor.cjs'
const root=path.dirname(fileURLToPath(import.meta.url)),data=path.join(root,'data')
const options={data,ffmpegBin:path.resolve(root,'../.local-runtimes/ffmpeg/ffmpeg-9.0.2-essentials_build/bin')}
const state=JSON.parse(await fs.readFile(path.join(data,'dsh/media-desk/state.json'),'utf8'))
const item=state.items.find(item=>/哈利/.test(item.title))
const script=item?.production?.article || item?.drafts?.script || item?.body
if(!script || script.length<500)throw Error('未找到截图对应的长文案，不能完成该案例验收')
const previous=await service({action:'motion-editor-read',id:'de50c824-63bb-4ee2-9a54-51e8e2a82476'},options)
const code=previous.clips.find(c=>c.type==='animation').code
const created=await service({action:'motion-editor-create'},options)
const project={...created,title:'长文案 · 排期越界修复验收',width:640,height:360,fps:24,duration:30}
let calls=0,streamed=0
const result=await generateAnimation({project,script,onText:text=>{if(text.includes('自动适配'))console.log(text.trim())},onClip:()=>{streamed++},call:async()=>{
  calls++
  // Reproduce an AI plan longer than the project without sending the user's article externally.
  return {text:calls===1?JSON.stringify({clips:Array.from({length:8},(_,i)=>({title:'排期验收镜头 '+(i+1),start:i*20,duration:20}))}):code}
}})
if(streamed!==8)throw Error('镜头未逐项提交')
await service({action:'motion-editor-save',id:project.id,project:{...project,clips:result.clips}},options)
const job=await service({action:'motion-editor-render',id:project.id},options)
console.log(JSON.stringify({id:project.id,renderId:job.id,sourceCharacters:script.length,scenes:streamed,sourceSentToModel:false}))
for(let n=0;n<240;n++){
  await new Promise(r=>setTimeout(r,500))
  const status=await service({action:'motion-editor-status',id:project.id,renderId:job.id},options)
  if(status.state==='rendering')continue
  console.log(JSON.stringify(status))
  if(status.state!=='done'||Math.abs(status.duration-30)>.1)throw Error('长文案排期验收未通过')
  process.exitCode=0;break
}
