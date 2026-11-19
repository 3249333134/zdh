import path from 'node:path'
import {fileURLToPath} from 'node:url'
import service from './motion-editor.cjs'
import unifiedAI from './unified-ai.cjs'
import {planVideoEdit} from '../media_desk/src/motion-video-edit.js'
const root=path.dirname(fileURLToPath(import.meta.url)),data=path.join(root,'data')
const options={data,ffmpegBin:path.resolve(root,'../.local-runtimes/ffmpeg/ffmpeg-9.0.2-essentials_build/bin')}
const sourceId=process.argv[2];if(!sourceId)throw Error('请指定已导入视频的工程')
const project=await service({action:'motion-editor-fork-video',id:sourceId,allowFrames:true},options)
console.log('已另存视频剪辑工程，原工程保留。'+project.id)
const analysis=await service({action:'motion-editor-analyze-video',id:project.id,allowFrames:true},options)
console.log('已分析关键帧、镜头切点及静音区间。')
const config=unifiedAI.read(data)
const instruction='帮我生成vlog。用导入视频中实际可见的动作做一条节奏清晰的日常片段，约30秒，保留原声，只加少量中性短标题，不编造台词和经历，不用旧的动画或成稿素材。'
const patch=await planVideoEdit({project,analysis,instruction,targetDuration:30,onText:text=>{if(text.includes('修正'))console.log(text.trim())},call:async request=>{
 const response=await fetch(config.baseUrl.replace(/\/$/,'')+'/chat/completions',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+config.apiKey},body:JSON.stringify({model:config.textModel,messages:[{role:'system',content:request.system},{role:'user',content:request.user}],max_tokens:request.maxTokens}),signal:AbortSignal.timeout(120000)})
 if(!response.ok)throw Error('剪辑编排服务返回 '+response.status)
 const result=await response.json();return {text:result.choices?.[0]?.message?.content||''}
}})
const saved=await service({action:'motion-editor-save',id:project.id,project:{...project,...patch,title:'DSCF0822 · Vlog 剪辑',editInstruction:'帮我生成vlog',videoTargetDuration:30,editTarget:'video'}},options)
console.log(JSON.stringify({id:saved.id,duration:saved.duration,cuts:saved.clips.filter(c=>c.type==='video').map(c=>({inPoint:c.inPoint,duration:c.duration,start:c.start})),summary:saved.editSummary}))
const job=await service({action:'motion-editor-render',id:saved.id},options)
console.log('正在导出 '+job.id)
let state
for(let n=0;n<1200;n++){await new Promise(r=>setTimeout(r,500));state=await service({action:'motion-editor-status',id:saved.id,renderId:job.id},options);if(state.state!=='rendering')break}
console.log(JSON.stringify(state));if(state.state!=='done')throw Error('成片导出尚未完成')
console.log(path.join(data,'motion-editor',saved.id,job.id,'video.mp4'))
