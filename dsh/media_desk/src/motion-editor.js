import { motionToolkit } from './motion-design.js'
import { resolveTimeline } from './motion-timeline.js'
export { normalizeTimeline } from './motion-timeline.js'
export const EDITOR_TRACKS = ['animation', 'video', 'image', 'text', 'audio']
const TRANSITION_TYPES = new Set(['fade','dissolve','slide-left','slide-right','slide-up','slide-down','zoom-in','zoom-out','wipe-left','wipe-right','wipe-up','wipe-down','flash','shake','glitch'])
const TEXT_ANIM_TYPES = new Set(['fade','rise','drop','left','right','pop','zoom','typewriter','blur'])
const BLEND_TYPES = new Set(['normal','multiply','screen','overlay','lighten','darken','difference','soft-light'])
const KEYFRAME_CHANNELS = { x: [-100000, 100000], y: [-100000, 100000], scale: [.1, 10], rotation: [-720, 720], opacity: [0, 1] }
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
    for (const key of ['x','y','width','height','opacity','volume','inPoint','fontSize','layer','animationOffset','animationDuration','rotation','audioFade','fadeIn','fadeOut','brightness','contrast','saturation','blur','grayscale','sepia','hue','vignette','fontWeight','lineHeight','strokeWidth','boxPadding','speed','transitionDuration','textAnimDuration','corners']) {
      if (clip[key] !== undefined && (!Number.isFinite(clip[key]) || Math.abs(clip[key]) > 100000)) throw new Error('片段参数无效')
    }
    if ((clip.fadeIn || 0) < 0 || (clip.fadeOut || 0) < 0 || (clip.fadeIn || 0) + (clip.fadeOut || 0) > clip.duration + .001) throw new Error('淡入淡出时长超出片段范围')
    if (clip.brightness !== undefined && (clip.brightness < 0 || clip.brightness > 300)) throw new Error('亮度需要在 0 到 300 之间')
    if (clip.contrast !== undefined && (clip.contrast < 0 || clip.contrast > 300)) throw new Error('对比度需要在 0 到 300 之间')
    if (clip.saturation !== undefined && (clip.saturation < 0 || clip.saturation > 300)) throw new Error('饱和度需要在 0 到 300 之间')
    if (clip.grayscale !== undefined && (clip.grayscale < 0 || clip.grayscale > 100)) throw new Error('灰度需要在 0 到 100 之间')
    if (clip.sepia !== undefined && (clip.sepia < 0 || clip.sepia > 100)) throw new Error('褪色程度需要在 0 到 100 之间')
    if (clip.hue !== undefined && (clip.hue < -180 || clip.hue > 180)) throw new Error('色相偏移需要在 -180 到 180 之间')
    if (clip.vignette !== undefined && (clip.vignette < 0 || clip.vignette > 100)) throw new Error('暗角需要在 0 到 100 之间')
    if (clip.blur !== undefined && (clip.blur < 0 || clip.blur > 50)) throw new Error('模糊半径超出范围')
    if (clip.align !== undefined && !['left','center','right'].includes(clip.align)) throw new Error('文字对齐方式无效')
    if (clip.fontWeight !== undefined && (clip.fontWeight < 100 || clip.fontWeight > 900)) throw new Error('字重需要在 100 到 900 之间')
    if (clip.lineHeight !== undefined && (clip.lineHeight < .8 || clip.lineHeight > 3)) throw new Error('行高超出范围')
    if (clip.strokeWidth !== undefined && (clip.strokeWidth < 0 || clip.strokeWidth > 20)) throw new Error('描边宽度超出范围')
    if (clip.fontFamily !== undefined && (typeof clip.fontFamily !== 'string' || clip.fontFamily.length > 100)) throw new Error('字体设置无效')
    if (clip.type === 'text' && typeof clip.text === 'string' && clip.text.length > 5000) throw new Error('文字片段过长')
    if (clip.speed !== undefined && (clip.speed < .25 || clip.speed > 4)) throw new Error('变速需要在 0.25 倍到 4 倍之间')
    if (clip.transitionIn !== undefined && clip.transitionIn && !TRANSITION_TYPES.has(clip.transitionIn)) throw new Error('入场转场样式无效')
    if (clip.transitionOut !== undefined && clip.transitionOut && !TRANSITION_TYPES.has(clip.transitionOut)) throw new Error('出场转场样式无效')
    if (clip.transitionDuration !== undefined && (clip.transitionDuration <= 0 || clip.transitionDuration > Math.min(3, clip.duration))) throw new Error('转场时长超出片段范围')
    if (clip.textAnim !== undefined && clip.textAnim && !TEXT_ANIM_TYPES.has(clip.textAnim)) throw new Error('文字动画样式无效')
    if (clip.textAnimDuration !== undefined && (clip.textAnimDuration <= 0 || clip.textAnimDuration > Math.min(3, clip.duration))) throw new Error('文字动画时长超出片段范围')
    if (clip.blend !== undefined && !BLEND_TYPES.has(clip.blend)) throw new Error('混合模式无效')
    if (clip.corners !== undefined && (clip.corners < 0 || clip.corners > 1000)) throw new Error('圆角需要在 0 到 1000 像素之间')
    if (clip.mask !== undefined && !['none','ellipse'].includes(clip.mask)) throw new Error('蒙版形状无效')
    if (clip.keyframes !== undefined) {
      if (!clip.keyframes || typeof clip.keyframes !== 'object' || Array.isArray(clip.keyframes)) throw new Error('关键帧数据无效')
      for (const [channel, rows] of Object.entries(clip.keyframes)) {
        const range = KEYFRAME_CHANNELS[channel]
        if (!range || !Array.isArray(rows) || rows.length > 30) throw new Error('关键帧通道无效或超过30个')
        for (const row of rows) {
          if (!row || !Number.isFinite(row.t) || !Number.isFinite(row.v) || row.t < -.001 || row.t > clip.duration + .001 || row.v < range[0] || row.v > range[1]) throw new Error('关键帧时间或数值超出范围')
        }
      }
    }
    if ((clip.inPoint || 0) < 0 || (clip.volume ?? 1) < 0 || (clip.volume ?? 1) > 1 || (clip.opacity ?? 1) < 0 || (clip.opacity ?? 1) > 1) throw new Error('素材入点、音量或透明度无效')
    if (clip.rotation!==undefined&&Math.abs(clip.rotation)>360)throw Error('旋转角度需要在 -360 到 360 度之间')
    if (clip.fit!==undefined&&!['contain','cover'].includes(clip.fit))throw Error('画面适配设置无效')
    if (clip.audioFade!==undefined&&(clip.audioFade<0||clip.audioFade>3))throw Error('淡化时长超出片段范围')
    if (clip.type === 'animation' && (typeof clip.code !== 'string' || clip.code.length > 40000)) throw new Error('动画代码过长或缺失')
    if (clip.assetId && !project.assets?.some(asset => asset.id === clip.assetId)) throw new Error('素材引用已失效')
    if (['video', 'audio'].includes(clip.type)) {
      const asset = project.assets?.find(asset => asset.id === clip.assetId)
      if (!asset || (clip.inPoint || 0) + clip.duration * (clip.speed ?? 1) > asset.duration + .05) throw new Error('片段入点、时长或变速超出原始素材范围')
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
const trackId=c=>c.trackId||({text:'captions',animation:'effects',audio:'audio-music'}[c.type]||'video-main');
const allTracks=project.tracks||[];
const hiddenTracks=new Set(allTracks.filter(t=>t.hidden).map(t=>t.id));
for(let i=0;i<12;i++){let grew=false;for(const t of allTracks){if(!hiddenTracks.has(t.id)&&hiddenTracks.has(t.parentId)){hiddenTracks.add(t.id);grew=true}}if(!grew)break}
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
 const visible=project.clips.filter(c=>!c.hidden&&!hiddenTracks.has(trackId(c))&&time>=c.start&&time<c.start+c.duration);
 await Promise.all(visible.filter(c=>c.type==='video').map(c=>new Promise(resolve=>{
  const video=videos[c.id];if(!video){resolve();return}
  const seek=Math.min(Math.max(0,(c.inPoint||0)+(time-c.start)*(c.speed||1)),Math.max(0,video.duration-.03));
  if(Math.abs(video.currentTime-seek)<.008){resolve();return}
  let timer;const done=()=>{clearTimeout(timer);video.removeEventListener('seeked',done);resolve()};
  timer=setTimeout(done,10000);video.addEventListener('seeked',done,{once:true});video.currentTime=seek;
 })));
 if(serial!==requestSerial)return;
 ctx.fillStyle=project.background||'#080d15';ctx.fillRect(0,0,canvas.width,canvas.height);
 const sample=(list,local,fallback)=>{
  if(!list||!list.length)return fallback
  const rows=list.slice().sort((a,b)=>a.t-b.t)
  if(local<=rows[0].t)return rows[0].v
  for(let i=1;i<rows.length;i++){if(local<=rows[i].t){const a=rows[i-1],b=rows[i],k=(local-a.t)/Math.max(.0001,b.t-a.t);return a.v+(b.v-a.v)*k}}
  return rows[rows.length-1].v
 };
 const ease=p=>1-Math.pow(1-Math.max(0,Math.min(1,p)),3);
 const transState=(type,p,w,h,out)=>{
  const e=ease(p),inv=1-e,base={alpha:1,tx:0,ty:0,scale:1,flash:0,wipe:null};
  if(!type)return base;
  if(type==='fade'||type==='dissolve')return {alpha:out?inv:e,tx:0,ty:0,scale:1,flash:0,wipe:null};
  if(type==='slide-left')return {alpha:1,tx:out?-w*e:-w*inv,ty:0,scale:1,flash:0,wipe:null};
  if(type==='slide-right')return {alpha:1,tx:out?w*e:w*inv,ty:0,scale:1,flash:0,wipe:null};
  if(type==='slide-up')return {alpha:1,tx:0,ty:out?-h*e:-h*inv,scale:1,flash:0,wipe:null};
  if(type==='slide-down')return {alpha:1,tx:0,ty:out?h*e:h*inv,scale:1,flash:0,wipe:null};
  if(type==='zoom-in')return {alpha:out?inv:e,tx:0,ty:0,scale:out?1+.4*e:.6+.4*e,flash:0,wipe:null};
  if(type==='zoom-out')return {alpha:out?inv:e,tx:0,ty:0,scale:out?1-.4*e:1.4-.4*e,flash:0,wipe:null};
  if(type==='wipe-left')return {alpha:1,tx:0,ty:0,scale:1,flash:0,wipe:{side:out?'right':'left',p:out?inv:e}};
  if(type==='wipe-right')return {alpha:1,tx:0,ty:0,scale:1,flash:0,wipe:{side:out?'left':'right',p:out?inv:e}};
  if(type==='wipe-up')return {alpha:1,tx:0,ty:0,scale:1,flash:0,wipe:{side:out?'down':'up',p:out?inv:e}};
  if(type==='wipe-down')return {alpha:1,tx:0,ty:0,scale:1,flash:0,wipe:{side:out?'up':'down',p:out?inv:e}};
  if(type==='flash')return {alpha:out?inv:e,tx:0,ty:0,scale:1,flash:out?e:inv,wipe:null};
  if(type==='shake')return {alpha:1,tx:Math.sin(p*46)*18*inv,ty:Math.cos(p*37)*12*inv,scale:1,flash:0,wipe:null};
  if(type==='glitch')return {alpha:.55+.45*e,tx:Math.sin(p*70)*14*inv,ty:0,scale:1,flash:0,wipe:null};
  return base;
 };
 const textState=(type,p)=>{
  const e=ease(p),base={alpha:1,tx:0,ty:0,scale:1,reveal:null,blur:0};
  if(!type)return base;
  if(type==='fade')return {alpha:e,tx:0,ty:0,scale:1,reveal:null,blur:0};
  if(type==='rise')return {alpha:e,tx:0,ty:(1-e)*60,scale:1,reveal:null,blur:0};
  if(type==='drop')return {alpha:e,tx:0,ty:-(1-e)*60,scale:1,reveal:null,blur:0};
  if(type==='left')return {alpha:e,tx:(1-e)*90,ty:0,scale:1,reveal:null,blur:0};
  if(type==='right')return {alpha:e,tx:-(1-e)*90,ty:0,scale:1,reveal:null,blur:0};
  if(type==='pop')return {alpha:e,tx:0,ty:0,scale:.7+.3*e,reveal:null,blur:0};
  if(type==='zoom')return {alpha:e,tx:0,ty:0,scale:.55+.45*e,reveal:null,blur:0};
  if(type==='typewriter')return {alpha:1,tx:0,ty:0,scale:1,reveal:e,blur:0};
  if(type==='blur')return {alpha:e,tx:0,ty:0,scale:1,reveal:null,blur:(1-e)*10};
  return base;
 };
 const ordered=visible.slice().sort((a,b)=>(a.layer||0)-(b.layer||0));
 const errors=problems.slice();
 for(const clip of ordered){
  ctx.save();
  const local=time-clip.start,fin=Math.max(0,clip.fadeIn||0),fout=Math.max(0,clip.fadeOut||0);
  const kf=clip.keyframes||{};
  const kx=sample(kf.x,local,clip.x||0),ky=sample(kf.y,local,clip.y||0),krot=sample(kf.rotation,local,clip.rotation||0),ks=sample(kf.scale,local,clip.scale??1),kop=sample(kf.opacity,local,clip.opacity??1);
  const cw=clip.width||canvas.width,ch=clip.height||canvas.height;
  const motion={alpha:1,tx:0,ty:0,scale:1,flash:0,wipe:null};let textMotion={reveal:null,blur:0};
  const merge=m=>{motion.alpha*=m.alpha;motion.tx+=m.tx;motion.ty+=m.ty;motion.scale*=m.scale;motion.flash=Math.max(motion.flash,m.flash||0);if(m.wipe)motion.wipe=m.wipe};
  const din=clip.transitionDuration||.5,rem=clip.duration-local;
  if(clip.transitionIn&&local<din)merge(transState(clip.transitionIn,local/din,cw,ch,false));
  if(clip.transitionOut&&rem<din)merge(transState(clip.transitionOut,1-Math.max(0,rem)/din,cw,ch,true));
  if(clip.type==='text'&&clip.textAnim){const ta=clip.textAnimDuration||.6;if(local<ta){const st=textState(clip.textAnim,local/ta);merge(st);textMotion={reveal:st.reveal,blur:st.blur}}}
  const fade=Math.min(1,fin?local/fin:1,fout?rem/fout:1);
  ctx.globalAlpha=Math.max(0,Math.min(1,kop*motion.alpha*fade));
  try{
   if(clip.type==='animation'&&functions[clip.id]){
    ctx.translate(motion.tx,motion.ty);ctx.scale(motion.scale,motion.scale);
    const t=time-clip.start+(clip.animationOffset||0),d=clip.animationDuration||clip.duration;
    functions[clip.id](ctx,t,d,canvas.width,canvas.height,assets,makeMotion(ctx,canvas.width,canvas.height,t,d,assets,project.visualStyle||'cinematic'));
   }
   if(['image','video'].includes(clip.type)&&assets[clip.assetId]){
    const media=clip.type==='video'?videos[clip.id]:assets[clip.assetId],w=cw,h=ch;
    const mw=media.videoWidth||media.naturalWidth,mh=media.videoHeight||media.naturalHeight;
    const scale=(clip.fit==='cover'?Math.max:Math.min)(w/mw,h/mh);
    const effects=[];
    if(clip.brightness!==undefined&&clip.brightness!==100)effects.push('brightness('+clip.brightness+'%)');
    if(clip.contrast!==undefined&&clip.contrast!==100)effects.push('contrast('+clip.contrast+'%)');
    if(clip.saturation!==undefined&&clip.saturation!==100)effects.push('saturate('+clip.saturation+'%)');
    if(clip.grayscale)effects.push('grayscale('+clip.grayscale+'%)');
    if(clip.sepia)effects.push('sepia('+clip.sepia+'%)');
    if(clip.hue)effects.push('hue-rotate('+clip.hue+'deg)');
    if(clip.blur)effects.push('blur('+clip.blur+'px)');
    if(effects.length)ctx.filter=effects.join(' ');
    ctx.translate(kx+w/2+motion.tx,ky+h/2+motion.ty);
    ctx.rotate(krot*Math.PI/180);
    ctx.scale(ks*motion.scale,ks*motion.scale);
    const radius=Math.max(0,Math.min(Math.min(w,h)/2,clip.corners||0));
    if(clip.mask==='ellipse'){ctx.beginPath();ctx.ellipse(0,0,w/2,h/2,0,0,Math.PI*2);ctx.clip();}
    else if(radius){ctx.beginPath();ctx.moveTo(-w/2+radius,-h/2);ctx.arcTo(w/2,-h/2,w/2,h/2,radius);ctx.arcTo(w/2,h/2,-w/2,h/2,radius);ctx.arcTo(-w/2,h/2,-w/2,-h/2,radius);ctx.arcTo(-w/2,-h/2,w/2,-h/2,radius);ctx.closePath();ctx.clip();}
    else{ctx.beginPath();ctx.rect(-w/2,-h/2,w,h);ctx.clip();}
    if(motion.wipe){const wp=Math.max(0,Math.min(1,motion.wipe.p)),side=motion.wipe.side;ctx.beginPath();if(side==='left')ctx.rect(-w/2,-h/2,w*wp,h);else if(side==='right')ctx.rect(w/2-w*wp,-h/2,w*wp,h);else if(side==='up')ctx.rect(-w/2,-h/2,w,h*wp);else ctx.rect(-w/2,h/2-h*wp,w,h*wp);ctx.clip()}
    if(clip.blend&&clip.blend!=='normal')ctx.globalCompositeOperation=clip.blend;
    ctx.drawImage(media,-mw*scale/2,-mh*scale/2,mw*scale,mh*scale);
    ctx.filter='none';
    ctx.globalCompositeOperation='source-over';
    if(clip.vignette){const g=ctx.createRadialGradient(0,0,Math.min(w,h)*.28,0,0,Math.max(w,h)*.72);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,'+(clip.vignette/100)+')');ctx.fillStyle=g;ctx.fillRect(-w/2,-h/2,w,h)}
    if(motion.flash){ctx.fillStyle='rgba(255,255,255,'+Math.min(1,motion.flash)+')';ctx.fillRect(-w/2,-h/2,w,h)}
   }
   if(clip.type==='text'){
    const size=clip.fontSize||48,lineHeight=(clip.lineHeight||1.3)*size,align=clip.align||'left';
    const width=clip.width||canvas.width,pad=clip.boxPadding??12;
    let lines=(clip.text||'').split('\\n');
    if(textMotion.reveal!=null){let remaining=Math.ceil(textMotion.reveal*lines.reduce((n,line)=>n+line.length,0));lines=lines.map(line=>{const take=Math.max(0,Math.min(line.length,remaining));remaining-=line.length;return line.slice(0,take)})}
    ctx.translate(kx+motion.tx,ky+motion.ty);
    ctx.rotate(krot*Math.PI/180);
    ctx.scale(ks*motion.scale,ks*motion.scale);
    if(textMotion.blur)ctx.filter='blur('+textMotion.blur+'px)';
    ctx.font=(clip.fontWeight||400)+' '+size+'px '+(clip.fontFamily||'system-ui, sans-serif');
    ctx.textBaseline='top';ctx.textAlign=align;
    if(clip.boxColor){const longest=Math.max(0,...lines.map(line=>ctx.measureText(line).width)),boxWidth=Math.min(width,longest)+pad*2,boxX=align==='center'?-boxWidth/2:align==='right'?-boxWidth:-pad;ctx.fillStyle=clip.boxColor;ctx.fillRect(boxX,-pad*.6,boxWidth,lines.length*lineHeight+pad*1.2)}
    if(clip.shadow){ctx.shadowColor=clip.shadowColor||'rgba(0,0,0,.55)';ctx.shadowBlur=clip.shadowBlur??10;ctx.shadowOffsetY=clip.shadowOffsetY??3}
    if(clip.strokeWidth){ctx.strokeStyle=clip.strokeColor||'#000000';ctx.lineWidth=clip.strokeWidth;ctx.lineJoin='round';lines.forEach((line,index)=>ctx.strokeText(line,0,index*lineHeight,width))}
    ctx.fillStyle=clip.color||'#ffffff';
    lines.forEach((line,index)=>ctx.fillText(line,0,index*lineHeight,width));
   }
  }catch(error){errors.push((clip.title||clip.id)+': '+error.message)}finally{ctx.restore()}
 }
 window.renderErrors=errors;
 parent.postMessage({type:'motion-editor-frame',token,time,errors},'*');
 return errors;
};
window.addEventListener('message',event=>{
 if(event.source!==parent||event.data?.token!==token)return
 if(event.data.type==='motion-editor-seek')window.renderAt(event.data.time).catch(error=>parent.postMessage({type:'motion-editor-frame',token,errors:[error.message]},'*'))
 if(event.data.type==='motion-editor-cover')window.renderAt(event.data.time||0).then(()=>{try{parent.postMessage({type:'motion-editor-cover',token,dataUrl:canvas.toDataURL('image/png')},'*')}catch(error){parent.postMessage({type:'motion-editor-cover',token,error:error.message},'*')}})
});
window.renderAt(0).catch(error=>parent.postMessage({type:'motion-editor-frame',token,errors:[error.message]},'*'));
</script></body></html>`
}
