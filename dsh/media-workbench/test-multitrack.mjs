import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {execFileSync} from 'node:child_process'
import service from './motion-editor.cjs'
import {splitTimeline,moveTimeline,resolveTimeline} from '../media_desk/src/motion-timeline.js'
const root=path.dirname(fileURLToPath(import.meta.url)),data=path.join(root,'data'),ffmpegBin=path.resolve(root,'../.local-runtimes/ffmpeg/ffmpeg-9.0.2-essentials_build/bin')
const options={data,ffmpegBin},created=await service({action:'motion-editor-create'},options),dir=path.join(data,'motion-editor',created.id)
const files=[]
for(const [color,tone] of [['red',440],['blue',880]]){
 const file=path.join(dir,color+'.mp4');execFileSync(path.join(ffmpegBin,'ffmpeg.exe'),['-v','error','-n','-f','lavfi','-i',`color=${color}:size=640x360:rate=24:duration=2`,'-f','lavfi','-i',`sine=frequency=${tone}:duration=2`,'-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',file],{windowsHide:true});files.push(file)
}
const imported=await service({action:'motion-editor-import',id:created.id},{...options,dialog:{showOpenDialog:async()=>({canceled:false,filePaths:files})}})
const video=imported.clips.filter(c=>c.type==='video'),audio=imported.clips.filter(c=>c.type==='audio')
if(video.length!==2||audio.length!==2||video[1].start!==2||imported.duration!==4)throw Error('多段导入未按顺序进入影音轨道')
if(!imported.assets.every(a=>a.peaks?.length>0))throw Error('未提取真实音频波形')
let edited=splitTimeline(imported,[video[0].id],1)
edited=moveTimeline(edited,[video[1].id],0,{targetTrack:'overlay'})
edited={...edited,title:'多段导入 · 自由轨道验收',tracks:edited.tracks.map(t=>t.id==='audio-main'?{...t,muted:true}:t)}
if(resolveTimeline(edited).clips.filter(c=>c.type==='audio').some(c=>c.volume))throw Error('音轨静音没有生效')
const saved=await service({action:'motion-editor-save',id:edited.id,project:edited},options)
const job=await service({action:'motion-editor-render',id:saved.id},options)
console.log(JSON.stringify({id:saved.id,renderId:job.id,videoClips:saved.clips.filter(c=>c.type==='video').length,audioClips:saved.clips.filter(c=>c.type==='audio').length,tracks:saved.tracks.length}))
let status;for(let n=0;n<180;n++){await new Promise(r=>setTimeout(r,500));status=await service({action:'motion-editor-status',id:saved.id,renderId:job.id},options);if(status.state!=='rendering')break}
console.log(JSON.stringify(status));if(status.state!=='done'||status.hasAudio||Math.abs(status.duration-4)>.1)throw Error('多轨导出不符合编辑结果')
console.log(path.join(dir,job.id,'video.mp4'))
