import React from 'react'
import { tracksOf,trackId,clipKind,duplicateTimeline,deleteTimeline } from '../src/motion-timeline.js'
import { TRANSITIONS,TEXT_ANIMS,COLOR_STYLES,BLEND_MODES } from './motion-presets.js'
import { Icon } from './ui.jsx'
export function MotionInspector({project:p,clip,patch,change,onSelect,onAsk,time=0,onReplace}){
 const [tab,setTab]=React.useState('timing')
 React.useEffect(()=>setTab('timing'),[clip?.id])
 if(!clip)return <div className="me-inspector-empty"><strong>{p.title}</strong><p>{p.width} × {p.height} · {p.fps} fps</p><p>{p.clips.filter(c=>c.type==='video').length} 个视频片段 · {tracksOf(p).length} 条轨道</p><p>在时间线选择片段，或右键片段让 AI 修改。</p>{p.appliedTemplate&&<p>当前模板：{p.appliedTemplate.title} · {p.appliedTemplate.mode==='original'?'原版动效':'结构编排'}</p>}</div>
 const audio=p.clips.find(c=>c.type==='audio'&&clip.linkId&&c.linkId===clip.linkId)||clip
 const tabs=[['timing','剪辑'],...(clip.type!=='audio'?[['visual','画面']]:[]),...(['video','audio'].includes(clip.type)?[['audio','声音']]:[]),...(['text','animation'].includes(clip.type)?[['content',clip.type==='text'?'文字':'代码']]:[])]
 const field=(key,label,{fallback=0,...options}={})=><label key={key}>{label}<input aria-label={label} type="number" step=".1" value={clip[key]??fallback} {...options} onChange={e=>patch({[key]:Number(e.target.value)})}/></label>
 const slider=(key,label,{fallback=100,min=0,max=300}={})=><label key={key}>{label} · {Math.round(clip[key]??fallback)}<input aria-label={label} type="range" min={min} max={max} value={clip[key]??fallback} onChange={e=>patch({[key]:Number(e.target.value)})}/></label>
 const dissolve=()=>{
   const next=p.clips.filter(c=>c.id!==clip.id&&trackId(c)===trackId(clip)&&c.start>=clip.start+clip.duration-.001).sort((a,b)=>a.start-b.start)[0]
   const fade=next?Math.min(.5,clip.duration/2,next.duration/2):Math.min(.5,clip.duration/2)
   if(!next){patch({fadeOut:fade});return}
   change(old=>({...old,clips:old.clips.map(c=>c.id===clip.id?{...c,fadeOut:fade}:c.id===next.id?{...c,fadeIn:fade}:c)}))
 }
 const asset=p.assets.find(row=>row.id===clip.assetId)
 const maxSpeed=asset?Math.max(.25,Math.min(4,(asset.duration-(clip.inPoint||0))/clip.duration)):4
 const speedOptions=[.25,.5,.75,1,1.25,1.5,2,3,4].filter(value=>value<=maxSpeed+.001)
 const kf=clip.keyframes||{}
 const at=Math.max(0,Math.min(clip.duration,time-clip.start))
 const record=values=>{
   const next={...kf}
   for(const [channel,value] of Object.entries(values)){
     const rows=(next[channel]||[]).filter(row=>Math.abs(row.t-at)>.02)
     next[channel]=[...rows,{t:Math.round(at*100)/100,v:value}].sort((a,b)=>a.t-b.t)
   }
   patch({keyframes:next})
 }
 const removeKey=(channel,t)=>patch({keyframes:{...kf,[channel]:(kf[channel]||[]).filter(row=>Math.abs(row.t-t)>.001)}})
 const clearKeys=()=>patch({keyframes:{}})
 const body = <><div className="me-inspector-tabs" role="tablist" aria-label="片段属性分类">{tabs.map(([id,label])=><button role="tab" aria-selected={tab===id} key={id} onClick={()=>setTab(id)}>{label}</button>)}</div><div className="me-inspector-selected"><strong>{clip.title}</strong><small>{({video:'视频',audio:'音频',image:'图片',text:'文字',animation:'动画'})[clip.type]}</small></div><button className="me-ask-clip" onClick={()=>onAsk(clip)}>让阿杜修改此片段 ↗</button>
 {tab==='timing'&&<><label>片段名称<input value={clip.title||''} onChange={e=>patch({title:e.target.value})}/></label><label>所在轨道<select value={trackId(clip)} onChange={e=>patch({trackId:e.target.value})}>{tracksOf(p).filter(t=>t.kind===clipKind(clip)).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><div className="me-fields">{field('start','起点（秒）',{min:0})}{field('duration','时长（秒）',{min:1/p.fps})}{['video','audio'].includes(clip.type)&&field('inPoint','素材入点（秒）',{min:0})}</div>{['video','audio'].includes(clip.type)&&<label>速度<select value={clip.speed||1} onChange={e=>patch({speed:Math.min(Number(e.target.value),maxSpeed)})}>{speedOptions.map(value=><option key={value} value={value}>{value}×</option>)}</select></label>}{clip.linkId&&<p className="me-help">画面与原声联动。移动和裁剪会同步更新。</p>}</>}
 {tab==='visual'&&<><fieldset><legend>变换</legend><div className="me-fields">{field('x','位置 X')}{field('y','位置 Y')}{field('width','宽度',{min:1,fallback:p.width})}{clip.type!=='text'&&field('height','高度',{min:1,fallback:p.height})}{['video','image'].includes(clip.type)&&field('rotation','旋转（度）',{min:-360,max:360})}</div></fieldset><label>不透明度 · {Math.round((clip.opacity??1)*100)}%<input type="range" min="0" max="1" step=".01" value={clip.opacity??1} onChange={e=>patch({opacity:Number(e.target.value)})}/></label>{['video','image'].includes(clip.type)&&<label>画面适配<select value={clip.fit||'contain'} onChange={e=>patch({fit:e.target.value})}><option value="contain">完整显示</option><option value="cover">填满画面</option></select></label>}{['video','image'].includes(clip.type)&&<label>混合模式<select value={clip.blend||'normal'} onChange={e=>patch({blend:e.target.value})}>{BLEND_MODES.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}<button onClick={()=>patch({x:0,y:0,width:p.width,height:p.height,rotation:0,opacity:1,fit:'contain'})}>重置画面变换</button>
   {['video','image'].includes(clip.type)&&<fieldset><legend>蒙版与圆角</legend><div className="me-fields">{field('corners','圆角（像素）',{min:0,max:1000,fallback:0})}</div><label>蒙版形状<select value={clip.mask||'none'} onChange={e=>patch({mask:e.target.value})}><option value="none">矩形</option><option value="ellipse">椭圆</option></select></label><div className="me-style-row"><button type="button" onClick={()=>patch({corners:24})}>圆角 24</button><button type="button" onClick={()=>patch({corners:64})}>圆角 64</button><button type="button" onClick={()=>patch({mask:'ellipse'})}>椭圆蒙版</button><button type="button" onClick={()=>patch({mask:'none',corners:0})}>取消蒙版</button></div></fieldset>}
   {['video','image'].includes(clip.type)&&<fieldset><legend>画面布局</legend><div className="me-style-row"><button type="button" onClick={()=>patch({x:0,y:0,width:p.width,height:p.height})}>全屏</button><button type="button" onClick={()=>patch({x:Math.round(p.width*.55),y:Math.round(p.height*.08),width:Math.round(p.width*.4),height:Math.round(p.height*.35)})}>画中画</button><button type="button" onClick={()=>patch({x:0,y:0,width:Math.round(p.width/2),height:p.height})}>左半屏</button><button type="button" onClick={()=>patch({x:Math.round(p.width/2),y:0,width:Math.round(p.width/2),height:p.height})}>右半屏</button></div></fieldset>}
   {['video','image'].includes(clip.type)&&<fieldset><legend>一键风格</legend><div className="me-style-row">{COLOR_STYLES.map(style=><button key={style.id} type="button" onClick={()=>patch(style.values)}>{style.name}</button>)}</div><button type="button" onClick={()=>{const keys=['brightness','contrast','saturation','grayscale','sepia','hue','vignette','blur','corners','mask'];const values={};keys.forEach(key=>{if(clip[key]!==undefined)values[key]=clip[key]});change(old=>({...old,clips:old.clips.map(c=>['video','image'].includes(c.type)?{...c,...values}:c)}))}}>应用到所有画面</button></fieldset>}
   {['video','image'].includes(clip.type)&&<fieldset><legend>画面调色</legend><div className="me-fields">{slider('brightness','亮度')}{slider('contrast','对比度')}{slider('saturation','饱和度')}{slider('grayscale','灰度',{fallback:0,max:100})}{slider('sepia','褪色',{fallback:0,max:100})}{slider('hue','色相',{fallback:0,min:-180,max:180})}{slider('vignette','暗角',{fallback:0,max:100})}{slider('blur','模糊',{fallback:0,max:50})}</div><button onClick={()=>patch({brightness:100,contrast:100,saturation:100,grayscale:0,sepia:0,hue:0,vignette:0,blur:0})}>恢复原色</button></fieldset>}
   <fieldset><legend>转场</legend><label>入场转场<select value={clip.transitionIn||''} onChange={e=>patch({transitionIn:e.target.value})}>{TRANSITIONS.map(row=><option key={row.id||'none'} value={row.id}>{row.name}</option>)}</select></label><label>出场转场<select value={clip.transitionOut||''} onChange={e=>patch({transitionOut:e.target.value})}>{TRANSITIONS.map(row=><option key={row.id||'none'} value={row.id}>{row.name}</option>)}</select></label><label>转场时长（秒）<input type="number" min=".1" max={Math.min(3,clip.duration)} step=".1" value={clip.transitionDuration||.5} onChange={e=>patch({transitionDuration:Number(e.target.value)})}/></label></fieldset>
   <fieldset><legend>入场 / 出场</legend><div className="me-fields">{field('fadeIn','淡入（秒）',{min:0,fallback:0})}{field('fadeOut','淡出（秒）',{min:0,fallback:0})}</div><button onClick={dissolve}>与下一片段叠化</button></fieldset>
   <fieldset><legend>关键帧 · {at.toFixed(2)}s</legend><div className="me-keyframes"><button type="button" onClick={()=>record({x:clip.x||0,y:clip.y||0})}>记录位置</button><button type="button" onClick={()=>record({scale:1})}>记录缩放</button><button type="button" onClick={()=>record({opacity:clip.opacity??1})}>记录透明度</button><button type="button" onClick={()=>record({rotation:clip.rotation||0})}>记录旋转</button><button type="button" onClick={clearKeys} disabled={!Object.keys(kf).length}>清空关键帧</button></div><div className="me-keyframe-list">{Object.entries(kf).filter(([,rows])=>rows&&rows.length).map(([channel,rows])=><div key={channel}><strong>{({x:'X',y:'Y',scale:'缩放',opacity:'透明度',rotation:'旋转'})[channel]||channel}</strong>{rows.map(row=><button type="button" key={row.t} title="点击删除这个关键帧" onClick={()=>removeKey(channel,row.t)}>{row.t.toFixed(2)}s · {Number(row.v).toFixed(2)}</button>)}</div>)}</div></fieldset></>}
 {tab==='audio'&&<><label>音量 · {Math.round((audio.volume??1)*100)}%<input aria-label="片段音量" type="range" min="0" max="1" step=".01" value={audio.volume??1} onChange={e=>patch({volume:Number(e.target.value)})}/></label><label>首尾淡化（秒）<input type="number" min="0" max={Math.min(3,clip.duration/2)} step=".05" value={audio.audioFade||0} onChange={e=>patch({audioFade:Number(e.target.value)})}/></label><button onClick={()=>patch({volume:(audio.volume??1)>0?0:1})}>{(audio.volume??1)>0?'静音此片段':'恢复声音'}</button><p className="me-help">声音修改会同步到实时预览和导出。</p></>}
 {tab==='content'&&(clip.type==='text'?<>
   <fieldset><legend>排版</legend><label>文字内容<textarea value={clip.text||''} onChange={e=>patch({text:e.target.value})}/></label><div className="me-fields">{field('fontSize','字号',{min:8,fallback:48})}{field('fontWeight','字重',{min:100,max:900,step:100,fallback:400})}{field('lineHeight','行高',{min:.8,max:3,step:.05,fallback:1.3})}</div><label>对齐<select value={clip.align||'left'} onChange={e=>patch({align:e.target.value})}><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label></fieldset>
   <fieldset><legend>文字动画</legend><label>入场动画<select value={clip.textAnim||''} onChange={e=>patch({textAnim:e.target.value})}>{TEXT_ANIMS.map(row=><option key={row.id||'none'} value={row.id}>{row.name}</option>)}</select></label><label>动画时长（秒）<input type="number" min=".1" max={Math.min(3,clip.duration)} step=".1" value={clip.textAnimDuration||.6} onChange={e=>patch({textAnimDuration:Number(e.target.value)})}/></label></fieldset>
   <fieldset><legend>颜色与描边</legend><label>文字颜色<input type="color" value={clip.color||'#ffffff'} onChange={e=>patch({color:e.target.value})}/></label><label>底色<input aria-label="底色" placeholder="留空为透明，如 #0f766e 或 rgba(0,0,0,.5)" value={clip.boxColor||''} onChange={e=>patch({boxColor:e.target.value})}/></label><div className="me-fields">{field('strokeWidth','描边宽度',{min:0,max:20,fallback:0})}</div><label>描边颜色<input type="color" value={clip.strokeColor||'#000000'} onChange={e=>patch({strokeColor:e.target.value})}/></label><label className="me-check"><input type="checkbox" checked={!!clip.shadow} onChange={e=>patch({shadow:e.target.checked})}/> 文字投影</label><button onClick={()=>patch({align:'center',shadow:true,color:'#ffffff',fontWeight:700})}>一键居中大字</button></fieldset>
 </>:<label>动画代码<textarea className="me-code" spellCheck="false" value={clip.code||''} onChange={e=>patch({code:e.target.value})}/></label>)}
 <div className="me-buttons"><button onClick={()=>change(old=>duplicateTimeline(old,[clip.id]))}>复制</button><button onClick={()=>{change(old=>deleteTimeline(old,[clip.id]));onSelect('')}}>删除</button></div></>
 const isText = clip.type === 'text'
 const isMedia = ['video', 'image'].includes(clip.type)
 if (isMedia) {
   const source = p.previewUrls?.[clip.assetId]
   const isTemplate = clip.templateOutput === true
   return <>
     <div className="me-inspector-head me-media-head"><strong><span className="me-media-badge"><Icon name={clip.type === 'video' ? 'film' : 'image'} size={12} /></span>{isTemplate ? '模板成片' : clip.type === 'video' ? '视频' : '图片'}</strong><button type="button" onClick={() => onSelect('')}>返回模板</button></div>
     {isTemplate && <section className="me-template-lock">
       <p>模板成片（动画面）不能手动剪开，要改哪一段，交给阿杜来改。</p>
       <div><button type="button" onClick={() => onAsk?.(clip, '改画面文案')}>改画面文案</button><button type="button" onClick={() => onAsk?.(clip, '换一种风格')}>换一种风格</button><button type="button" onClick={() => onAsk?.(clip, '编辑画面内容')}>编辑画面内容</button></div>
     </section>}
     <section className="me-media-panel">
       <div className="me-media-thumb">{source ? (clip.type === 'video' ? <video src={source} muted preload="metadata" /> : <img src={source} alt="" />) : <Icon name="image" size={22} />}<button type="button" className="me-media-replace" onClick={() => onReplace?.(clip)}>{clip.type === 'video' ? '换一段视频' : '换一张图片'}</button></div>
       <p className="me-drag-hint">可以把{clip.type === 'video' ? '视频' : '照片'}拖到这里或画面上。</p>
       <div className="me-prop-line">显示方式<div className="me-seg" role="group" aria-label="显示方式"><button type="button" aria-pressed={(clip.fit || 'cover') !== 'contain'} onClick={() => patch({ fit: 'cover' })}>填满</button><button type="button" aria-pressed={clip.fit === 'contain'} onClick={() => patch({ fit: 'contain' })}>完整显示</button></div></div>
       <p className="me-drag-hint">＋ 在画面上拖动可以移动位置</p>
       <label className="me-size-row">大小<input aria-label="元素大小" type="range" min="20" max="200" value={Math.round((clip.scale ?? 1) * 100)} onChange={e => patch({ scale: Number(e.target.value) / 100 })} /><output>{Math.round((clip.scale ?? 1) * 100)}%</output></label>
       <label className="me-size-row">透明度<input aria-label="元素透明度" type="range" min="0" max="100" value={Math.round((clip.opacity ?? 1) * 100)} onChange={e => patch({ opacity: Number(e.target.value) / 100 })} /><output>{Math.round((clip.opacity ?? 1) * 100)}%</output></label>
       <label className="me-check"><input type="checkbox" checked={!!clip.hidden} onChange={e => patch({ hidden: e.target.checked })} />隐藏这个元素</label>
       <button type="button" className="me-reset-btn" onClick={() => patch({ x: 0, y: 0, width: p.width, height: p.height, scale: 1, opacity: 1, hidden: false, fit: 'cover', rotation: 0 })}>恢复原样</button>
     </section>
     <details className="me-adv-props"><summary>更多属性</summary>{body}</details>
   </>
 }
 if (!isText) return body
 const nearby = p.clips.filter(c => c.type === 'text' && c.id !== clip.id && c.start < clip.start + clip.duration && c.start + c.duration > clip.start)
 const other = nearby.find(c => c.text && c.text !== clip.text) || null
 const elementCount = (nearby.length + 1)
 const applyStyle = target => {
   const fields = { fontSize: target.fontSize, fontWeight: target.fontWeight, color: target.color, fontFamily: target.fontFamily, align: target.align, lineHeight: target.lineHeight, shadow: target.shadow, strokeWidth: target.strokeWidth, strokeColor: target.strokeColor, textAnim: target.textAnim, textAnimDuration: target.textAnimDuration }
   change(old => ({ ...old, clips: old.clips.map(c => c.type === 'text' ? { ...c, ...fields } : c) }))
 }
 const colors = ['#ffffff', '#f7e7a3', '#f4a3a0', '#c9b6ff', '#a9c7ff', '#f7b7d2', '#b7e2c6', '#ffb86b', '#9be1d3', '#1c1c1c']
 return <>
   <div className="me-inspector-head"><strong>{elementCount} 个元素</strong><button type="button" onClick={() => onSelect('')}>返回模板</button></div>
   <section className="me-text-panel">
     <div className="me-text-sec-head"><span>文本 · 中文</span><button type="button" onClick={() => applyStyle(clip)}>应用</button></div>
     <textarea aria-label="中文文本" value={clip.text || ''} onChange={e => patch({ text: e.target.value })} />
     {other && <>
       <div className="me-text-sec-head"><span>文本 · 外文</span><button type="button" onClick={() => applyStyle(other)}>应用</button></div>
       <textarea aria-label="外文文本" value={other.text || ''} onChange={e => change(old => ({ ...old, clips: old.clips.map(c => c.id === other.id ? { ...c, text: e.target.value } : c) }))} />
     </>}
     <label className="me-prop-line">字号<input aria-label="字号" type="number" min="8" max="400" value={clip.fontSize || 48} onChange={e => patch({ fontSize: Number(e.target.value) })} /></label>
     <div className="me-color-row"><span>颜色</span><div className="me-swatches">{colors.map(color => <button key={color} type="button" style={{ background: color }} className={(clip.color || '#ffffff').toLowerCase() === color ? 'is-on' : ''} aria-label={'颜色 ' + color} onClick={() => patch({ color })} />)}<input type="color" aria-label="自定义文字颜色" value={clip.color || '#ffffff'} onChange={e => patch({ color: e.target.value })} /></div></div>
     <div className="me-font-row"><select aria-label="模板字体" value={clip.fontFamily || ''} onChange={e => patch({ fontFamily: e.target.value })}><option value="">模板字体…</option><option value="system-ui, sans-serif">系统黑体</option><option value="'PingFang SC', sans-serif">苹方</option><option value="'Songti SC', serif">宋体</option><option value="'Kaiti SC', serif">楷体</option></select><label className="me-check"><input type="checkbox" checked={(clip.fontWeight || 400) >= 600} onChange={e => patch({ fontWeight: e.target.checked ? 700 : 400 })} />加粗</label></div>
     <p className="me-drag-hint">＋ 在画面上拖动可以移动位置</p>
     <label className="me-size-row">大小<input aria-label="元素大小" type="range" min="50" max="200" value={Math.round((clip.scale ?? 1) * 100)} onChange={e => patch({ scale: Number(e.target.value) / 100 })} /><output>{Math.round((clip.scale ?? 1) * 100)}%</output></label>
   </section>
   <details className="me-adv-props"><summary>更多属性</summary>{body}</details>
 </>
}
