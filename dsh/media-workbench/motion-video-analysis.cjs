const fs=require('node:fs/promises');
const path=require('node:path');
const {execFile}=require('node:child_process');
const unifiedAI=require('./unified-ai.cjs');
const run=(exe,args,options)=>new Promise((resolve,reject)=>{
 const child=execFile(exe,args,{windowsHide:true,timeout:180000,maxBuffer:3000000},(error,out,err)=>error?reject(Error((err||error.message).slice(-1000))):resolve({out,err}));options.registerChild?.(child);
});
module.exports=async function analyze(project,dir,options,{allowFrames=false}={}){
 const videos=project.assets.filter(a=>a.kind==='video');if(!videos.length)throw Error('请先导入要剪辑的视频');
 if(videos.length>8)throw Error('单次请使用不超过8个视频素材');
 const ffmpeg=path.join(options.ffmpegBin,process.platform==='win32'?'ffmpeg.exe':'ffmpeg'),folder=path.join(dir,'video-analysis');await fs.mkdir(folder,{recursive:true});
 const analysis={videos:[],visualAnalysis:'未发送画面到模型，仅使用本地时间结构。',frameAnalysis:false},sheets=[];
 for(const asset of videos){
  const seconds=Math.min(asset.duration,600),cuts=[],silences=[];
  const scene=await run(ffmpeg,['-hide_banner','-i',asset.path,'-t',String(seconds),'-an','-vf',"fps=4,scale=160:-2,select='gt(scene,0.22)',showinfo",'-f','null','-'],options);
  for(const match of scene.err.matchAll(/pts_time:([\d.]+)/g)){const t=Number(match[1]);if(t>0&&t<seconds)cuts.push(t)}
  if(asset.hasAudio){
   const audio=await run(ffmpeg,['-hide_banner','-i',asset.path,'-t',String(seconds),'-vn','-af','silencedetect=noise=-35dB:d=0.4','-f','null','-'],options);
   let start;for(const match of audio.err.matchAll(/silence_(start|end):\s*([\d.]+)/g)){if(match[1]==='start')start=Number(match[2]);else if(start!==undefined){silences.push({start,end:Number(match[2])});start=undefined}}
   if(start!==undefined)silences.push({start,end:seconds});
  }
  const keyframes=Array.from({length:12},(_,i)=>Math.round(Math.min(seconds-.08,i*seconds/11)*100)/100);
  if(allowFrames){
   const prefix=path.join(folder,asset.id);
   for(let i=0;i<keyframes.length;i++)await run(ffmpeg,['-v','error','-y','-ss',String(keyframes[i]),'-i',asset.path,'-frames:v','1','-vf','scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2','-q:v','5',prefix+'-'+String(i).padStart(2,'0')+'.jpg'],options);
   const sheet=prefix+'-sheet.jpg';await run(ffmpeg,['-v','error','-y','-framerate','1','-i',prefix+'-%02d.jpg','-vf','tile=4x3','-frames:v','1','-q:v','5',sheet],options);
   sheets.push({assetId:asset.id,data:'data:image/jpeg;base64,'+(await fs.readFile(sheet)).toString('base64')});
  }
  analysis.videos.push({id:asset.id,name:asset.name,duration:asset.duration,hasAudio:asset.hasAudio,cuts:[...new Set(cuts)].slice(0,100),silences,keyframes});
 }
 if(allowFrames){
  const config=unifiedAI.read(options.data);if(!config?.apiKey||!config?.textModel)throw Error('尚未配置可分析画面的模型');
  const content=[{type:'text',text:'这些是用户导入视频的低清关键帧接触表，每张表按从左到右、从上到下的顺序对应keyframes时间。描述各时间段可见动作、镜头和适合Vlog的开场/主体/结尾，给出建议源时间区间。只依据画面，不编造台词或经历。视频信息：'+JSON.stringify(analysis.videos)},...sheets.map(sheet=>({type:'image_url',image_url:{url:sheet.data,detail:'low'}}))];
  const response=await fetch(config.baseUrl.replace(/\/$/,'')+'/chat/completions',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+config.apiKey},body:JSON.stringify({model:config.textModel,messages:[{role:'user',content}],max_tokens:2400}),signal:AbortSignal.timeout(120000)});
  if(!response.ok)throw Error('关键帧分析服务返回 '+response.status+'，可取消画面分析后使用本地剪辑');
  const result=await response.json();const answer=result.choices?.[0]?.message?.content;
  if(typeof answer!=='string'||!answer.trim())throw Error('画面分析没有返回内容');
  analysis.visualAnalysis=answer.slice(0,14000);analysis.frameAnalysis=true;
 }
 await fs.writeFile(path.join(folder,'analysis.json'),JSON.stringify(analysis,null,2));return analysis;
};
