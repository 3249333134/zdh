import path from 'node:path';import service from './motion-editor.cjs';
const options={data:path.join(process.cwd(),'data'),ffmpegBin:path.resolve('../.local-runtimes/ffmpeg/ffmpeg-9.0.2-essentials_build/bin')},id='7136b32f-7880-43e2-ac36-e0ed7ccd27c4';
const job=await service({action:'motion-editor-render',id},options);console.log(JSON.stringify(job));
for(let n=0;n<300;n++){await new Promise(r=>setTimeout(r,1000));const s=await service({action:'motion-editor-status',id,renderId:job.id},options);if(s.state==='rendering')continue;console.log(JSON.stringify(s));if(s.state!=='done'||!s.hasAudio)throw Error('模板入轨导出未通过');break}
