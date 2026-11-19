const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');

// A locally synthesized instrumental bed, not an external song or a downloaded recording.
function musicWave(duration,mood='cinematic') {
  const rate=22050,count=Math.ceil(duration*rate),out=Buffer.alloc(44+count*2);
  out.write('RIFF');out.writeUInt32LE(36+count*2,4);out.write('WAVEfmt ',8);out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);out.writeUInt16LE(1,22);out.writeUInt32LE(rate,24);out.writeUInt32LE(rate*2,28);out.writeUInt16LE(2,32);out.writeUInt16LE(16,34);out.write('data',36);out.writeUInt32LE(count*2,40);
  const bpm=mood==='upbeat'?112:mood==='chill'?84:72,beat=60/bpm;
  const chords=[[130.81,164.81,196],[110,130.81,164.81],[87.31,110,130.81],[98,123.47,146.83]];
  for(let i=0;i<count;i++){
    const t=i/rate,chord=chords[Math.floor(t/(beat*4))%4],phase=t%beat;
    const pad=chord.reduce((s,f)=>s+Math.sin(2*Math.PI*f*t)+.2*Math.sin(4*Math.PI*f*t),0)/7;
    const note=chord[Math.floor(t/(beat/2))%3]*2,local=t%(beat/2);
    const bell=Math.sin(2*Math.PI*note*t)*Math.exp(-local*8)*.16;
    const kick=mood==='cinematic'?0:Math.sin(2*Math.PI*(48*phase+8*(1-Math.exp(-phase*20))))*Math.exp(-phase*18)*.18;
    const fade=Math.max(0,Math.min(1,t/1.5,(duration-t)/2));out.writeInt16LE(Math.round((pad*.4+bell+kick)*fade*22000),44+i*2);
  }return out;
}
async function addMusic(p,dir,options,request,run,waveform) {
  const mood=['cinematic','chill','upbeat'].includes(request.mood)?request.mood:'cinematic',id=randomUUID(),file=path.join(dir,id+'.wav');
  await fs.writeFile(file,musicWave(p.duration,mood));
  const asset=await waveform({id,name:`本地原创配乐 · ${mood}`,kind:'audio',duration:p.duration,hasAudio:true,path:file,generatedMusic:true},options);
  const clips=p.clips.filter(c=>!c.generatedMusic);
  // Dip the bed under original sound, including original audio that was separated to a track.
  const ranges=p.clips.filter(c=>c.type==='audio'&&!c.generatedMusic&&(c.volume??1)>0).map(c=>[c.start,c.start+c.duration]);
  const points=[...new Set([0,p.duration,...ranges.flat()])].sort((a,b)=>a-b);
  for(let i=0;i<points.length-1;i++){const start=points[i],end=points[i+1];if(end-start<.001)continue;const speech=ranges.some(([a,b])=>start<b&&end>a);clips.push({id:randomUUID(),type:'audio',assetId:id,title:'配乐',start,duration:end-start,inPoint:start,volume:speech?.12:.28,audioFade:.15,trackId:'audio-music',generatedMusic:true})}
  return {...p,assets:[...p.assets,asset],clips};
}
async function transcribe(p,dir,options,request,run) {
  const model=path.join(options.data,'motion-runtime','whisper-small');
  try{await fs.access(path.join(model,'model.bin'))}catch{throw Error('本地字幕模型尚未安装完成，请稍后重试；剪辑结果已保留')}
  const ids=new Set(p.clips.filter(c=>c.type==='video').map(c=>c.assetId));
  const assets=p.assets.filter(a=>ids.has(a.id)&&a.hasAudio);
  const cache=path.join(dir,'transcripts.json');let transcripts=[];
  try{transcripts=JSON.parse(await fs.readFile(cache,'utf8'))}catch{}
  const pending=assets.filter(a=>!transcripts.some(t=>t.assetId===a.id));
  if(pending.length){
    const input=path.join(dir,'transcribe-input.json'),output=path.join(dir,'transcribe-output.json');
    await fs.writeFile(input,JSON.stringify({model,assets:pending,output,ffmpeg:path.join(options.ffmpegBin,'ffmpeg.exe')}));
    await run(path.join(options.data,'motion-runtime/python/Scripts/python.exe'),[path.join(__dirname,'motion-transcribe.py'),input],options,{timeout:540000,env:{...process.env,PYTHONUTF8:'1',HF_HUB_OFFLINE:'1'}});
    transcripts.push(...JSON.parse(await fs.readFile(output,'utf8')));await fs.writeFile(cache,JSON.stringify(transcripts));
  }
  let clips=p.clips.filter(c=>!c.transcribed);
  for(const video of p.clips.filter(c=>c.type==='video')){
    for(const cue of transcripts.find(t=>t.assetId===video.assetId)?.cues||[]){
      const from=Math.max(video.inPoint||0,cue.start),to=Math.min((video.inPoint||0)+video.duration,cue.end);
      if(to-from<.15||!cue.text.trim())continue;
      clips.push({id:randomUUID(),type:'text',title:'语音字幕',text:cue.text,start:video.start+from-(video.inPoint||0),duration:to-from,x:Math.round(p.width*.06),y:Math.round(p.height*.86),width:Math.round(p.width*.88),fontSize:Math.round(p.width*.031),color:'#ffffff',boxColor:'rgba(0,0,0,.58)',layer:30,trackId:'captions',transcribed:true,sourceClipId:video.id});
    }
  }
  return {...p,clips,subtitleSummary:clips.filter(c=>c.transcribed).length?`已在本地识别并对齐 ${clips.filter(c=>c.transcribed).length} 条语音字幕`:'未检测到清晰语音，未添加虚构字幕'};
}
module.exports={musicWave,addMusic,transcribe};
