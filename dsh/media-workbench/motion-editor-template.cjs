const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {atomic}=require('./unified-ai.cjs');
module.exports=async(request,p,dir,options,run,helpers)=>{
 const production=require('./motion-production.cjs');
 if(request.action==='motion-editor-template-start'){
  const language=({'626-16x9':'zh','626-en-16x9':'en'})[request.template];if(!language)throw Error('此模板未安装或尚未接入原版渲染');
  const folders=await fs.readdir(path.join(options.data,'motion-templates',request.template)).catch(()=>[]);if(!folders.some(name=>/^[a-f0-9]{64}$/.test(name)))throw Error('原始模板未导入本机');
  if(request.revision!==p.revision)throw Error('工程已发生修改，请重试');
  const videos=p.clips.filter(c=>c.type==='video'&&!c.templateOutput).sort((a,b)=>a.start-b.start);
  if(!videos.length)throw Error('请先导入视频');
  const job=await production({action:'motion-production-create',language},options),jobDir=path.join(options.data,'motion-production',job.id),parts=[];
  let cursor=0;const target=Math.min(84,Math.max(8,Number(request.duration)||30));
  for(const c of videos){
   if(cursor>=target)break;
   const asset=p.assets.find(a=>a.id===c.assetId),duration=Math.min(c.duration,target-cursor),destination=path.join(jobDir,`source-${parts.length}.mp4`);
   const audio=p.clips.find(a=>a.type==='audio'&&c.linkId&&a.linkId===c.linkId),volume=audio?.volume??c.volume??1;
   await run(path.join(options.ffmpegBin,'ffmpeg.exe'),['-v','error','-y','-ss',String(c.inPoint||0),'-i',asset.path,...(!asset.hasAudio?['-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=48000']:[]),'-t',String(duration),'-map','0:v:0','-map',asset.hasAudio?'0:a:0':'1:a:0','-vf','scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1','-af',`volume=${volume},aresample=48000`,'-r','30','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-ac','2',destination],options);
   parts.push(destination);cursor+=duration;
  }
  if(cursor<8)throw Error('原版动效至少需要 8 秒视频，请补充素材后重试');
  const concat=path.join(jobDir,'concat.txt'),presenter=path.join(jobDir,'presenter.mp4');
  await fs.writeFile(concat,parts.map(f=>"file '"+f.replace(/\\/g,'/').replace(/'/g,"'\\''")+"'").join('\n'));
  await run(path.join(options.ffmpegBin,'ffmpeg.exe'),['-v','error','-y','-f','concat','-safe','0','-i',concat,'-c','copy',presenter],options);
  atomic(path.join(jobDir,'job.json'),{...job,presenter,voice:presenter,sourceEditorId:p.id,sourceRevision:p.revision,templateId:request.template});
  return {...job,sourceSeconds:cursor};
 }
 if(request.action==='motion-editor-template-attach'){
  if(!/^[a-f0-9-]{36}$/.test(request.jobId||''))throw Error('模板制作不存在');
  const jobDir=path.join(options.data,'motion-production',request.jobId),job=JSON.parse(await fs.readFile(path.join(jobDir,'job.json'),'utf8'));
  if(job.state!=='done'||job.sourceEditorId!==p.id||job.sourceRevision!==p.revision)throw Error('模板未完成或当前工程已修改，请重新应用');
  const assetId=randomUUID(),destination=path.join(dir,assetId+'.mp4');
  await fs.copyFile(path.join(jobDir,'video-with-audio.mp4'),destination);
  const duration=job.duration,assets=[...p.assets,{id:assetId,name:'酷炫科技风 · '+(job.language==='en'?'英文':'中文')+'原版成片',kind:'video',duration,hasAudio:true,path:destination,templateOutput:true}],clips=[];
  for(const c of p.clips){if(c.templateOutput||!['video','audio'].includes(c.type)||c.start>=duration)continue;clips.push({...c,duration:Math.min(c.duration,duration-c.start),volume:0})}
  let start=0;
  for(const scene of job.scenes){const id=randomUUID(),linkId=randomUUID();clips.push({id,type:'video',assetId,title:'原版 · '+scene.title,start,duration:scene.duration,inPoint:start,volume:0,x:0,y:0,width:p.width,height:p.height,trackId:'template-picture',templateOutput:true,linkId});clips.push({id:randomUUID(),type:'audio',assetId,title:'模板声轨 · '+scene.title,start,duration:scene.duration,inPoint:start,volume:1,trackId:'template-sound',templateOutput:true,linkId});start+=scene.duration}
  const tracks=[{id:'template-picture',name:'模板 · 原版画面',kind:'visual'},{id:'template-sound',name:'模板 · 原版声音',kind:'audio'},...p.tracks.filter(t=>!['template-picture','template-sound'].includes(t.id))];
  const updated={...p,revision:p.revision+1,duration,assets,clips,tracks,appliedTemplate:{id:job.templateId||'626-16x9',title:'酷炫科技风 · '+(job.language==='en'?'英文横屏':'中文横屏'),mode:'original',language:job.language,jobId:job.id},editSummary:'已用本期视频与文案渲染原版酷炫科技风。模板画面与声音按场景加入独立轨道，可裁剪、移动与调音量。底层源视频保留；修改源内容后重新应用模板。'};
  helpers.validateEditor(updated);atomic(path.join(dir,'revision-'+p.revision+'.json'),p);atomic(path.join(dir,'project.json'),updated);return updated;
 }
 throw Error('模板操作不存在');
};
