import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {execFileSync} from 'node:child_process'
import service from './motion-editor.cjs'
import {applyMotionOperations} from '../media_desk/src/motion-operations.js'
const root=path.dirname(fileURLToPath(import.meta.url)),data=path.join(root,'data'),ffmpegBin=path.resolve(root,'../.local-runtimes/ffmpeg/ffmpeg-9.0.2-essentials_build/bin')
const options={data,ffmpegBin},p=await service({action:'motion-editor-create'},options),dir=path.join(data,'motion-editor',p.id)
const voice=await service({action:'motion-editor-voices'},options)
const speech=await service({action:'motion-editor-speech',id:p.id,text:'这是自动剪辑验收。字幕在本地识别，配乐与视频可以自由编辑。',voice:voice.voices.find(v=>v.culture==='zh-CN')?.name||voice.voices[0].name},options)
const asset=await service({action:'motion-editor-asset',id:p.id,assetId:speech.assets.at(-1).id},options)
const videos=[]
for(const color of ['#203f50','#62443a']){
 const file=path.join(dir,color.slice(1)+'.mp4');execFileSync(path.join(ffmpegBin,'ffmpeg.exe'),['-v','error','-n','-f','lavfi','-i',`color=${color}:size=640x360:rate=24`,'-i',asset.path,'-shortest','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',file],{windowsHide:true});videos.push(file)
}
let project=await service({action:'motion-editor-import',id:p.id},{...options,dialog:{showOpenDialog:async()=>({canceled:false,filePaths:videos})}})
project=await service({action:'motion-editor-save',id:p.id,project:{...project,title:'AI 助手 · 多视频字幕配乐验收',clips:project.clips.filter(c=>c.type==='video'||c.linkId),fps:24}},options)
project=await service({action:'motion-editor-subtitles',id:p.id},options)
const captions=project.clips.filter(c=>c.transcribed)
if(!captions.length)throw Error('真实语音未生成字幕')
console.log(JSON.stringify({id:p.id,subtitles:captions.map(c=>({text:c.text,start:c.start,duration:c.duration}))}))
project=await service({action:'motion-editor-music',id:p.id,mood:'chill'},options)
if(!project.clips.some(c=>c.generatedMusic))throw Error('未生成实际配乐音轨')
const first=project.clips.find(c=>c.type==='video'),other=project.clips.find(c=>c.type==='video'&&c.id!==first.id)
const revised=applyMotionOperations(project,[{type:'volume',volume:.25},{type:'trim',duration:first.duration-1}],first.id)
if(JSON.stringify(revised.clips.find(c=>c.id===other.id))!==JSON.stringify(other))throw Error('局部操作修改了其他片段')
project=await service({action:'motion-editor-save',id:p.id,project:revised},options)
const job=await service({action:'motion-editor-render',id:p.id},options)
for(let n=0;n<360;n++){await new Promise(r=>setTimeout(r,500));const status=await service({action:'motion-editor-status',id:p.id,renderId:job.id},options);if(status.state==='rendering')continue;console.log(JSON.stringify(status));if(status.state!=='done'||!status.hasAudio)throw Error('成片导出失败');console.log(path.join(dir,job.id,'video.mp4'));break}
