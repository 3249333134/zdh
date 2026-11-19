import fs from 'node:fs/promises';import path from 'node:path';import service from './motion-editor.cjs';import {applyMotionOperations} from '../media_desk/src/motion-operations.js';import {addTimelineMarker} from '../media_desk/src/motion-editor-tools.js';
const options={data:path.join(process.cwd(),'data'),ffmpegBin:path.resolve('../.local-runtimes/ffmpeg/ffmpeg-9.0.2-essentials_build/bin')};
let p=await service({action:'motion-editor-create'},options);
p=await service({action:'motion-editor-import',id:p.id},{...options,dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[path.join(options.data,'motion-editor/7136b32f-7880-43e2-ac36-e0ed7ccd27c4/synthetic.mp4')]})}});
if(!p.assets[0].filmstripFrames||!p.previewUrls[p.assets[0].id+'-thumb'])throw Error('真实缩略图未生成');
const thumb=await fetch(p.previewUrls[p.assets[0].id+'-thumb']);if((await thumb.arrayBuffer()).byteLength<1000)throw Error('缩略图为空');
let next=applyMotionOperations({...p,duration:8,title:'OpenFilm 交互 · 缩略图与画面变换验收'},[{type:'transform',id:p.clips.find(c=>c.type==='video').id,rotation:17,fit:'cover',opacity:.85},{type:'fade',id:p.clips.find(c=>c.type==='video').id,seconds:.3}]);next=addTimelineMarker(next,2);
p=await service({action:'motion-editor-save',id:p.id,project:next},options);const job=await service({action:'motion-editor-render',id:p.id},options);console.log(JSON.stringify({project:p.id,thumbnails:p.assets[0].filmstripFrames,render:job.id}));
for(let n=0;n<200;n++){await new Promise(r=>setTimeout(r,1000));const s=await service({action:'motion-editor-status',id:p.id,renderId:job.id},options);if(s.state==='rendering')continue;if(s.state!=='done'||!s.hasAudio)throw Error(s.error||'导出未通过');console.log(JSON.stringify(s));break}
