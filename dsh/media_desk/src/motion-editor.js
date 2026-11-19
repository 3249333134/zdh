import { motionToolkit } from './motion-design.js'
import { resolveTimeline } from './motion-timeline.js'
export { normalizeTimeline } from './motion-timeline.js'
export const EDITOR_TRACKS = ['animation', 'video', 'image', 'text', 'audio']
export function validateEditor(project) {
  if(project?.tracks&&(!Array.isArray(project.tracks)||project.tracks.length>24||project.tracks.some(t=>!t||!['visual','text','audio'].includes(t.kind)||typeof t.id!=='string'||typeof t.name!=='string')||new Set(project.tracks.map(t=>t.id)).size!==project.tracks.length))throw Error('轨道设置无效或超过24条')
  if (!project || !Number.isInteger(project.width) || !Number.isInteger(project.height) ||
    project.width < 240 || project.width > 3840 || project.height < 240 || project.height > 3840 || project.width % 2 || project.height % 2 ||
    ![24, 25, 30, 60].includes(project.fps) || !Number.isFinite(project.duration) || project.duration < 1 || project.duration > 600) throw new Error('画幅、帧率或时长无效')
  if (!Array.isArray(project.clips) || project.clips.length > 300) throw new Error('时间线最多支持 300 个片段')
  if(project.markers&&(!Array.isArray(project.markers)||project.markers.length>100||project.markers.some(m=>typeof m.id!=='string'||typeof m.title!=='string'||m.title.length>80||!Number.isFinite(m.time)||m.time<0||m.time>600)))throw Error('时间线标记无效或超出工程范围')
  const ids = new Set()
  for (const clip of project.clips) {
    if (typeof clip.id !== 'string' || !/^[\w-]{1,100}$/.test(clip.id) || ids.has(clip.id)) throw new Error('片段编号无效或重复')
    ids.add(clip.id)
    if (!EDITOR_TRACKS.includes(clip.type) || !Number.isFinite(clip.start) || clip.start < 0 ||
      !Number.isFinite(clip.duration) || clip.duration <= 0 || clip.start + clip.duration > project.duration + .001) throw new Error('片段超出时间线范围')
    for (const key of ['x','y','width','height','opacity','volume','inPoint','fontSize','layer','animationOffset','animationDuration','rotation','audioFade']) {
      if (clip[key] !== undefined && (!Number.isFinite(clip[key]) || Math.abs(clip[key]) > 100000)) throw new Error('片段参数无效')
    }
    if ((clip.inPoint || 0) < 0 || (clip.volume ?? 1) < 0 || (clip.volume ?? 1) > 1 || (clip.opacity ?? 1) < 0 || (clip.opacity ?? 1) > 1) throw new Error('素材入点、音量或透明度无效')
    if (clip.rotation!==undefined&&Math.abs(clip.rotation)>360)throw Error('旋转角度需要在 -360 到 360 度之间')
    if (clip.fit!==undefined&&!['contain','cover'].includes(clip.fit))throw Error('画面适配设置无效')
    if (clip.audioFade!==undefined&&(clip.audioFade<0||clip.audioFade>3))throw Error('淡化时长超出片段范围')
    if (clip.type === 'animation' && (typeof clip.code !== 'string' || clip.code.length > 40000)) throw new Error('动画代码过长或缺失')
    if (clip.assetId && !project.assets?.some(asset => asset.id === clip.assetId)) throw new Error('素材引用已失效')
    if (['video', 'audio'].includes(clip.type)) {
      const asset = project.assets?.find(asset => asset.id === clip.assetId)
      if (!asset || (clip.inPoint || 0) + clip.duration > asset.duration + .05) throw new Error('片段入点与时长超出原始素材范围')
    }
  }
  return project
}

// Shared by the isolated live preview and the frame renderer.
export function editorDocument(project, urls, token) {
  project=resolveTimeline(project)
  const serialized = JSON.stringify({ project, urls, token }).replace(/</g, '\\u003c')
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; img-src data: ${new URL(Object.values(urls)[0] || 'http://127.0.0.1').origin}; media-src ${new URL(Object.values(urls)[0] || 'http://127.0.0.1').origin}; style-src 'unsafe-inline'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#080d15}canvas{display:block;width:100%;height:100%;object-fit:contain}</style></head><body><canvas></canvas><script>
const {project,urls,token}=${serialized};
const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d');
canvas.width=project.width;canvas.height=project.height;
const assets={},videos={},functions={},problems=[];
const makeMotion=${motionToolkit.toString()};
const ready=Promise.all((project.assets||[]).map(async asset=>{
 if(asset.kind==='audio')return;
 const element=document.createElement(asset.kind==='video'?'video':'img');
 element.crossOrigin='anonymous';
 if(asset.kind==='video'){element.muted=true;element.preload='auto';element.playsInline=true}
 assets[asset.id]=element;
 await new Promise((resolve,reject)=>{element.addEventListener(asset.kind==='video'?'loadeddata':'load',resolve,{once:true});element.addEventListener('error',()=>reject(Error('素材加载失败 '+asset.name)),{once:true});element.src=urls[asset.id]});
})).then(()=>Promise.all(project.clips.filter(c=>c.type==='video').map(async clip=>{
 const element=document.createElement('video');element.crossOrigin='anonymous';element.muted=true;element.preload='auto';element.playsInline=true;videos[clip.id]=element;
 await new Promise((resolve,reject)=>{element.addEventListener('loadeddata',resolve,{once:true});element.addEventListener('error',()=>reject(Error('视频片段加载失败')),{once:true});element.src=urls[clip.assetId]});
})));
for(const clip of project.clips)if(clip.type==='animation')try{functions[clip.id]=new Function('ctx','time','duration','width','height','assets','motion',clip.code)}catch(error){problems.push(clip.title+': '+error.message)}
let requestSerial=0;
window.renderAt=async function(time){
 await ready;
 const serial=++requestSerial;
 const visible=project.clips.filter(c=>!c.hidden&&time>=c.start&&time<c.start+c.duration);
 await Promise.all(visible.filter(c=>c.type==='video').map(c=>new Promise(resolve=>{
  const video=videos[c.id];if(!video){resolve();return}
  const seek=Math.min(Math.max(0,time-c.start+(c.inPoint||0)),Math.max(0,video.duration-.03));
  if(Math.abs(video.currentTime-seek)<.008){resolve();return}
  let timer;const done=()=>{clearTimeout(timer);video.removeEventListener('seeked',done);resolve()};
  timer=setTimeout(done,10000);video.addEventListener('seeked',done,{once:true});video.currentTime=seek;
 })));
 if(serial!==requestSerial)return;
 ctx.fillStyle=project.background||'#080d15';ctx.fillRect(0,0,canvas.width,canvas.height);
 const ordered=visible.slice().sort((a,b)=>(a.layer||0)-(b.layer||0));
 const errors=problems.slice();
 for(const clip of ordered){
  ctx.save();ctx.globalAlpha=clip.opacity??1;
  try{
   if(clip.type==='animation'&&functions[clip.id]){
    const t=time-clip.start+(clip.animationOffset||0),d=clip.animationDuration||clip.duration;
    functions[clip.id](ctx,t,d,canvas.width,canvas.height,assets,makeMotion(ctx,canvas.width,canvas.height,t,d,assets,project.visualStyle||'cinematic'));
   }
   if(['image','video'].includes(clip.type)&&assets[clip.assetId]){
    const media=clip.type==='video'?videos[clip.id]:assets[clip.assetId],w=clip.width||canvas.width,h=clip.height||canvas.height;
    const mw=media.videoWidth||media.naturalWidth,mh=media.videoHeight||media.naturalHeight;
    const x=clip.x||0,y=clip.y||0,scale=(clip.fit==='cover'?Math.max:Math.min)(w/mw,h/mh);
    ctx.translate(x+w/2,y+h/2);ctx.rotate((clip.rotation||0)*Math.PI/180);ctx.beginPath();ctx.rect(-w/2,-h/2,w,h);ctx.clip();ctx.drawImage(media,-mw*scale/2,-mh*scale/2,mw*scale,mh*scale);
   }
   if(clip.type==='text'){
    ctx.font=(clip.fontSize||48)+'px sans-serif';ctx.textBaseline='top';
    if(clip.boxColor){const lines=(clip.text||'').split('\\n'),max=Math.min(clip.width||canvas.width,Math.max(...lines.map(line=>ctx.measureText(line).width)));ctx.fillStyle=clip.boxColor;ctx.fillRect((clip.x||0)-12,(clip.y||0)-9,max+24,lines.length*(clip.fontSize||48)*1.3+18)}
    ctx.fillStyle=clip.color||'#ffffff';
    (clip.text||'').split('\\n').forEach((line,index)=>ctx.fillText(line,clip.x||0,(clip.y||0)+index*(clip.fontSize||48)*1.3,clip.width||canvas.width));
   }
  }catch(error){errors.push((clip.title||clip.id)+': '+error.message)}finally{ctx.restore()}
 }
 window.renderErrors=errors;
 parent.postMessage({type:'motion-editor-frame',token,time,errors},'*');
 return errors;
};
window.addEventListener('message',event=>{if(event.source===parent&&event.data?.type==='motion-editor-seek'&&event.data.token===token)window.renderAt(event.data.time).catch(error=>parent.postMessage({type:'motion-editor-frame',token,errors:[error.message]},'*'))});
window.renderAt(0).catch(error=>parent.postMessage({type:'motion-editor-frame',token,errors:[error.message]},'*'));
</script></body></html>`
}
