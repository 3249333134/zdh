import fs from 'node:fs/promises'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import service from './motion-editor.cjs'
import production from './motion-production.cjs'
const root=process.cwd(),options={data:path.join(root,'data'),ffmpegBin:path.resolve(root,'../.local-runtimes/ffmpeg/ffmpeg-9.0.2-essentials_build/bin')}
let p=await service({action:'motion-editor-create'},options)
const dir=path.join(options.data,'motion-editor',p.id),video=path.join(dir,'synthetic.mp4')
execFileSync(path.join(options.ffmpegBin,'ffmpeg.exe'),['-v','error','-y','-f','lavfi','-i','testsrc2=size=640x360:rate=30','-f','lavfi','-i','sine=frequency=220:sample_rate=48000','-t','8','-c:v','libx264','-preset','ultrafast','-c:a','aac','-pix_fmt','yuv420p',video],{windowsHide:true})
p=await service({action:'motion-editor-import',id:p.id},{...options,dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[video]})}})
p=await service({action:'motion-editor-save',id:p.id,project:{...p,title:'原版模板入轨验收'}},options)
const job=await service({action:'motion-editor-template-start',id:p.id,revision:p.revision,template:'626-16x9',duration:8},options)
console.log(JSON.stringify({project:p.id,job:job.id,sourceSeconds:job.sourceSeconds}))
const ready=await production({action:'motion-production-prepare',id:job.id,plan:{title:'模板入轨验收',scenes:[{id:'B1',title:'本期视频'}],basic:{keyword:'真实素材',explanation:'原版动效与本地视频合成验收'}}},options)
if(ready.state==='failed')throw Error(ready.error)
await production({action:'motion-production-render',id:job.id},options)
for(let n=0;n<1000;n++){await new Promise(r=>setTimeout(r,1000));const state=await production({action:'motion-production-status',id:job.id},options);if(state.state==='failed')throw Error(state.error);if(state.state!=='done')continue;const updated=await service({action:'motion-editor-template-attach',id:p.id,jobId:job.id},options);if(!updated.clips.some(c=>c.templateOutput&&c.type==='video'))throw Error('原版画面未加入轨道');if(!updated.clips.some(c=>c.templateOutput&&c.type==='audio'))throw Error('原版声音未加入轨道');console.log(JSON.stringify({project:p.id,mode:updated.appliedTemplate.mode,duration:updated.duration,tracks:updated.tracks.map(t=>t.name),templateClips:updated.clips.filter(c=>c.templateOutput).length}));break}
