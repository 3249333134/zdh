import React from 'react'
import { createPortal } from 'react-dom'
import { addTimelineMarker,frameTime } from '../src/motion-editor-tools.js'
import { Icon } from './ui.jsx'
import { toast } from './desk.js'
import { tracksOf,trackId,clipKind,locked,moveTimeline,trimTimeline,splitTimeline,deleteTimeline,duplicateTimeline,separateAudio,addMediaClip } from '../src/motion-timeline.js'
const stamp=t=>`${Math.floor(t/60).toString().padStart(2,'0')}:${(t%60).toFixed(1).padStart(4,'0')}`
function Wave({asset,clip}) {
  if(!asset?.peaks?.length)return null
  const duration=asset.peaksDuration||asset.duration
  const from=Math.floor((clip.inPoint||0)/duration*asset.peaks.length),count=Math.max(1,Math.ceil(clip.duration/duration*asset.peaks.length))
  const peaks=asset.peaks.slice(from,from+count)
  if(!peaks.length)return null
  return <svg className="mt-wave" viewBox={`0 0 ${peaks.length} 30`} preserveAspectRatio="none" aria-label="实际音频波形">{peaks.map((v,i)=><path key={i} d={`M${i} ${15-v*14}V${15+v*14}`} stroke="currentColor" strokeWidth=".8"/>)}</svg>
}
export function MotionTimeline({project:p,selected,onSelect,time,onSeek,playing,onPlay,zoom,onZoom,onChange,onPreview,onCommit,onUndo,onRedo,canUndo,canRedo,busy,onImport,onWaveforms,onThumbnails,onAsk,mediaMount,externalMedia=false}) {
  const [hideEmpty,setHideEmpty]=React.useState(true)
  const [density,setDensity]=React.useState('compact')
  const compact=density==='compact',[menu,setMenu]=React.useState(null),[markerId,setMarkerId]=React.useState('')
  React.useEffect(()=>{if(!menu)return;const close=e=>{if(e.type==='keydown'&&e.key!=='Escape')return;if(e.target.closest?.('.mt-context'))return;setMenu(null)};window.addEventListener('pointerdown',close);window.addEventListener('keydown',close);return()=>{window.removeEventListener('pointerdown',close);window.removeEventListener('keydown',close)}},[menu])
  const [query,setQuery]=React.useState(''),[kind,setKind]=React.useState('all'),[tool,setTool]=React.useState('select')
  const [ids,setIds]=React.useState([]),[snap,setSnap]=React.useState(true),[linked,setLinked]=React.useState(true),[bin,setBin]=React.useState(true)
  const scroll=React.useRef(null),tracks=tracksOf(p),current=p.clips.find(c=>c.id===selected)
  React.useEffect(()=>{setIds(old=>selected?(old.includes(selected)?old:[selected]):[])},[selected])
  React.useEffect(()=>{if(!playing||!scroll.current)return;const x=time*zoom,left=scroll.current.scrollLeft,width=scroll.current.clientWidth-180;if(x<left||x>left+width-30)scroll.current.scrollLeft=Math.max(0,x-width*.25)},[time,playing,zoom])
  const choose=(id,multi=false)=>{const next=multi?(ids.includes(id)?ids.filter(i=>i!==id):[...ids,id]):[id];setIds(next);onSelect(next.includes(id)?id:next.at(-1)||'')}
  const apply=fn=>{if(!busy)onChange(fn)}
  const templateClip=clip=>clip?.templateOutput===true
  const protectedMessage=()=>toast('模板成片（动画面）不能手动剪开，要改哪一段，交给阿杜来改')
  const remove=ripple=>apply(old=>deleteTimeline(old,ids,{linked,ripple}))
  const split=()=>{if(ids.some(id=>templateClip(p.clips.find(c=>c.id===id)))){protectedMessage();return}apply(old=>splitTimeline(old,ids,time,{linked}))}
  React.useEffect(()=>{
    const key=e=>{
      if(busy||e.target.closest?.('input,textarea,select,[contenteditable="true"]'))return
      const ctrl=e.ctrlKey||e.metaKey
      if(ctrl&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?onRedo():onUndo();return}
      if(ctrl&&e.key.toLowerCase()==='y'){e.preventDefault();onRedo();return}
      if(e.code==='Space'&&!e.target.closest?.('button')){e.preventDefault();onPlay(!playing);return}
      if(['Delete','Backspace'].includes(e.key)&&ids.length){e.preventDefault();remove(e.shiftKey);return}
      if(ctrl&&e.key.toLowerCase()==='d'&&ids.length){e.preventDefault();apply(old=>duplicateTimeline(old,ids,{linked}));return}
      if(e.key.toLowerCase()==='m'&&!ctrl){e.preventDefault();apply(old=>addTimelineMarker(old,time));return}
      if(e.key.toLowerCase()==='s'&&!ctrl&&ids.length){e.preventDefault();split();return}
      if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const delta=(e.key==='ArrowLeft'?-1:1)*(e.shiftKey?10:1)/p.fps;if(ids.length)apply(old=>moveTimeline(old,ids,delta,{linked}));else onSeek(Math.max(0,Math.min(p.duration,time+delta)))}
    }
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)
  },[busy,ids,linked,p,playing,time])
  const trackPatch=(id,fields)=>apply(old=>({...old,tracks:tracksOf(old).map(t=>t.id===id?{...t,...fields}:t)}))
  const addTrack=kind=>{setHideEmpty(false);apply(old=>({...old,tracks:[{id:crypto.randomUUID(),kind,name:kind==='visual'?'新画面轨':kind==='audio'?'新音轨':'新字幕轨'},...tracksOf(old)]}))}
  const reorder=(index,delta)=>apply(old=>{const rows=[...tracksOf(old)],next=index+delta;if(next<0||next>=rows.length)return old;[rows[index],rows[next]]=[rows[next],rows[index]];return {...old,tracks:rows}})
  const drag=(e,clip,edge)=>{
    if(e.button!==0)return
    e.preventDefault();e.stopPropagation();choose(clip.id,e.shiftKey||e.ctrlKey||e.metaKey)
    if(busy||locked(p,clip))return
    if(templateClip(clip)&&(edge||tool==='blade')){protectedMessage();return}
    if(tool==='blade'&&!edge){const rect=e.currentTarget.getBoundingClientRect(),at=clip.start+(e.clientX-rect.left)/zoom;if(at>clip.start+.05&&at<clip.start+clip.duration-.05)apply(old=>splitTimeline(old,[clip.id],at,{linked}));return}
    const original=p,x=e.clientX,moving=ids.includes(clip.id)?ids:[clip.id]
    let result=p,raf,last
    onPlay(false)
    const update=event=>{
      const delta=(event.clientX-x)/zoom,target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-track-id]')?.dataset.trackId
      result=edge?trimTimeline(original,clip.id,edge,delta,{linked}):moveTimeline(original,moving,delta,{linked,targetTrack:target,snap:snap&&!event.altKey,playhead:time,threshold:8/zoom})
      onPreview(result)
      const rect=scroll.current?.getBoundingClientRect();if(rect&&event.clientX>rect.right-30)scroll.current.scrollLeft+=18;else if(rect&&event.clientX<rect.left+200)scroll.current.scrollLeft-=18
    }
    const move=event=>{last={clientX:event.clientX,clientY:event.clientY,altKey:event.altKey};if(!raf)raf=requestAnimationFrame(()=>{raf=null;update(last)})}
    const up=()=>{if(raf){cancelAnimationFrame(raf);update(last)}window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);onCommit(original,result)}
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',up,{once:true});window.addEventListener('pointercancel',up,{once:true})
  }
  const scrub=e=>{
    e.preventDefault();onPlay(false);const el=e.currentTarget,rect=el.getBoundingClientRect()
    const update=event=>onSeek(Math.max(0,Math.min(p.duration,Math.round((event.clientX-rect.left)/zoom*p.fps)/p.fps)))
    update(e);const end=()=>{window.removeEventListener('pointermove',update);window.removeEventListener('pointerup',end)};window.addEventListener('pointermove',update);window.addEventListener('pointerup',end,{once:true})
  }
  const addAsset=(id,at)=>apply(old=>addMediaClip(old,id,at))
  const mainEnd=Math.max(0,...p.clips.filter(c=>trackId(c)==='video-main').map(c=>c.start+c.duration))
  const extent=Math.min(600,Math.max(p.duration+10,30)),tick=zoom>=30?2:zoom>=8?5:10
  const tickLabel=t=>String(Math.floor(t/60)).padStart(2,'0')+':'+String(Math.round(t%60)).padStart(2,'0')
  const [collapsed,setCollapsed]=React.useState({})
  const childrenOf = id => tracks.filter(t => (t.parentId || '') === (id || ''))
  const descendantsOf = id => childrenOf(id).flatMap(k => [k, ...descendantsOf(k.id)])
  const hasClip = id => p.clips.some(c => trackId(c) === id)
  const hasContent = id => hasClip(id) || descendantsOf(id).some(k => hasClip(k.id))
  const flatten = (parentId, depth, rows) => {
    for (const track of childrenOf(parentId)) {
      rows.push({ track, depth })
      if (!collapsed[track.id]) flatten(track.id, depth + 1, rows)
    }
    return rows
  }
  const visibleTracks = flatten('', 0, []).filter(({ track }) => !hideEmpty || !p.clips.length || hasContent(track.id))
  const isHiddenTrack = track => { let cur = track, guard = 0; while (cur && guard++ < 12) { if (cur.hidden) return true; cur = cur.parentId ? tracks.find(t => t.id === cur.parentId) : null } return false }
  const laneHeight=density==='compact'?16:density==='large'?40:28
  const [imageGrid,setImageGrid]=React.useState(true)
  const [unusedOnly,setUnusedOnly]=React.useState(false)
  const usedIds=new Set(p.clips.map(c=>c.assetId).filter(Boolean))
  const unusedAssets=p.assets.filter(a=>!usedIds.has(a.id))
  const binAssets=externalMedia?p.assets.filter(a=>a.kind!=='audio'):p.assets
  const assets=binAssets.filter(a=>(kind==='all'||a.kind===kind)&&(!unusedOnly||!usedIds.has(a.id))&&a.name.toLowerCase().includes(query.toLowerCase()))
  const media=<>
    <div className="mt-library-filter">
      <div className="mt-asset-tabs" role="group" aria-label="素材类型">
        {Object.entries(externalMedia?{all:'全部',video:'视频',image:'图片'}:{all:'全部',video:'视频',image:'图片',audio:'音频'}).map(([value,label])=>
          <button key={value} type="button" aria-pressed={kind===value} onClick={()=>setKind(value)}>{label}</button>)}
        <span className="mt-filter-spacer"/>
        <button type="button" className="mt-mini" title="网格视图" aria-label="网格视图" aria-pressed={imageGrid} onClick={()=>setImageGrid(true)}><Icon name="grid" size={13}/></button>
        <button type="button" className="mt-mini" title="列表视图" aria-label="列表视图" aria-pressed={!imageGrid} onClick={()=>setImageGrid(false)}><Icon name="list" size={13}/></button>
        <button type="button" className="mt-mini" title="导入素材" aria-label="导入素材" disabled={busy} onClick={onImport}><Icon name="upload" size={13}/></button>
      </div>
      <label className="mt-search"><Icon name="search" size={13}/><input aria-label="搜索素材" placeholder="搜索素材" value={query} onChange={e=>setQuery(e.target.value)}/></label>
    </div>
    {imageGrid ? <div className="mt-bin mt-bin-grid" aria-label="多段素材库">
      {assets.map(a=>{
        const uses=p.clips.filter(clip=>clip.assetId===a.id).length
        return <article key={a.id} draggable onDragStart={e=>e.dataTransfer.setData('application/x-motion-asset',a.id)}>
          <div className="mt-asset-preview">
            {a.kind==='video'?<video src={p.previewUrls?.[a.id]} muted preload="metadata"/>:a.kind==='image'?<img src={p.previewUrls?.[a.id]} alt="" loading="lazy"/>:<span>♫</span>}
            {a.kind!=='image'&&<small className="mt-asset-duration">{stamp(a.duration)}</small>}
            <small className={'mt-asset-uses'+(uses?'':' is-unused')} aria-label={uses?'时间线引用 '+uses+' 次':'未使用'}>{uses?'片中':'未用'}</small>
          </div>
          <strong title={a.name}>{a.name}</strong><small>{uses>0?'×'+uses:'未使用'}</small>
          <div><button disabled={busy} onClick={()=>addAsset(a.id,time)}>插入播放头</button><button disabled={busy} onClick={()=>addAsset(a.id,mainEnd)}>追加</button></div>
        </article>
      })}
      {!assets.length&&<div className="mt-bin-empty"><strong>{p.assets.length?'没有匹配的素材':'暂无素材'}</strong><p>{p.assets.length?'换个关键词试试。':'把视频、图片或音乐拖到这里'}</p>{!p.assets.length&&<button type="button" disabled={busy} onClick={onImport}>导入素材</button>}</div>}
    </div> : <div className="mt-bin mt-bin-list" aria-label="素材列表">
      <div className="mt-list-head"><span>名称 <Icon name="chevD" size={10}/></span><span>时长</span></div>
      {assets.map(a=>{
        const uses=p.clips.filter(clip=>clip.assetId===a.id).length
        return <article key={a.id} draggable onDragStart={e=>e.dataTransfer.setData('application/x-motion-asset',a.id)} onDoubleClick={()=>addAsset(a.id,time)} title="拖到时间线，或双击插入播放头">
          <span className="mt-list-thumb">{a.kind==='video'?<video src={p.previewUrls?.[a.id]} muted preload="metadata"/>:a.kind==='image'?<img src={p.previewUrls?.[a.id]} alt="" loading="lazy"/>:<Icon name="music" size={13}/>}</span>
          <span className={'mt-list-tag'+(uses?'':' is-unused')}>{uses?'片中':'未用'}</span>
          <strong>{a.name}</strong>
          <small>{a.kind==='image'?'—':stamp(a.duration)}</small>
        </article>
      })}
      {!assets.length&&<div className="mt-bin-empty"><strong>{p.assets.length?'没有匹配的素材':'暂无素材'}</strong><p>{p.assets.length?'换个关键词试试。':'把视频、图片或音乐拖到这里'}</p>{!p.assets.length&&<button type="button" disabled={busy} onClick={onImport}>导入素材</button>}</div>}
    </div>}
    <button type="button" className={'mt-unused'+(unusedOnly?' is-on':'')} onClick={()=>setUnusedOnly(!unusedOnly)}><Icon name="folder" size={16}/><span><strong>模板里没用到的文件</strong><small>可拖入时间线的模板设计素材</small></span><b>{unusedAssets.length}</b><Icon name="chevR" size={13}/></button>
  </>
  const extras=<>
    <button disabled={busy} onClick={onImport}>＋ 导入多个素材</button>
    <button disabled={busy} onClick={onWaveforms}>音频波形</button>
    <button disabled={busy} onClick={onThumbnails}>视频缩略图</button>
    <button title="在播放头添加标记 · M" disabled={busy||(p.markers?.length||0)>=100} onClick={()=>apply(old=>addTimelineMarker(old,time))}>＋ 标记 M</button>
    <button disabled={busy||tracks.length>=24} onClick={()=>addTrack('visual')}>＋ 画面轨</button>
    <button disabled={busy||tracks.length>=24} onClick={()=>addTrack('audio')}>＋ 音轨</button>
    <button disabled={busy||tracks.length>=24} onClick={()=>addTrack('text')}>＋ 字幕轨</button>
    <button disabled={busy||!current||current.type!=='video'||(current.volume??1)<=0||!p.assets.find(a=>a.id===current.assetId)?.hasAudio} onClick={()=>apply(old=>separateAudio(old,ids))}>分离原声</button>
    <button disabled={busy||!ids.length} onClick={()=>apply(old=>duplicateTimeline(old,ids,{linked}))}>复制 Ctrl+D</button>
    <button disabled={busy||!p.assets.some(a=>a.kind==='audio'&&a.peaks?.length)} onClick={()=>{
      const asset=p.assets.find(a=>a.kind==='audio'&&a.peaks?.length)
      if(!asset)return
      const peaks=asset.peaks,duration=asset.peaksDuration||asset.duration,max=Math.max(...peaks)||1
      const markers=[];let last=-1
      peaks.forEach((v,i)=>{const at=i/peaks.length*duration;if(v>max*.72&&at-last>.35){markers.push({id:crypto.randomUUID(),time:at,title:'节拍'});last=at}})
      if(markers.length)apply(old=>({...old,markers:[...(old.markers||[]),...markers].slice(0,100)}))
    }}>识别节拍</button>
  </>
  return <section className={'me-timeline mt-editor'+(density==='compact'?' mt-compact':density==='large'?' mt-large':'')+(tool==='blade'?' mt-blade':'')} aria-label="多轨自由剪辑时间线">
    {!externalMedia&&<header className="me-timeline-tools"><strong>时间线</strong><button aria-pressed={hideEmpty} onClick={()=>setHideEmpty(!hideEmpty)}>{hideEmpty?'显示空轨':'隐藏空轨'}</button><button aria-pressed={compact} onClick={()=>setDensity(compact?"normal":"compact")}>{compact?'展开轨道':'紧凑轨道'}</button><button disabled={busy||!canUndo} onClick={onUndo}>撤销</button><button disabled={busy||!canRedo} onClick={onRedo}>重做</button><button disabled={!ids.length||busy} onClick={split}>分割 S</button><button disabled={!ids.length||busy} onClick={()=>remove(false)}>删除</button><button disabled={!ids.length||busy} onClick={()=>remove(true)} title="移除选中时段，并让全部轨道后续内容前移">波纹删除</button><button aria-pressed={snap} onClick={()=>setSnap(!snap)}>吸附 {snap?'开':'关'}</button><button aria-pressed={linked} onClick={()=>setLinked(!linked)}>影音联动 {linked?'开':'关'}</button><label>缩放<input type="range" aria-label="时间线缩放" min="8" max="160" value={zoom} onChange={e=>onZoom(Number(e.target.value))}/></label><button onClick={()=>{const width=scroll.current?.clientWidth||900;onZoom(Math.max(8,Math.min(160,(width-190)/p.duration)))}}>适应窗口</button></header>}
    {!externalMedia&&<div className="mt-secondary">{!externalMedia&&<button onClick={()=>setBin(!bin)}>{bin?'收起素材库':'素材库'}</button>}{extras}<span>Shift 多选 · 拖动两端裁剪 · 跨轨拖放 · 方向键逐帧微调</span></div>}
    {externalMedia ? (mediaMount && createPortal(media,mediaMount)) : (bin && media)}
    {markerId&&p.markers?.find(m=>m.id===markerId)&&<div className="mt-marker-edit"><span>时间线标记</span><input aria-label="标记名称" value={p.markers.find(m=>m.id===markerId).title} onChange={e=>apply(old=>({...old,markers:old.markers.map(m=>m.id===markerId?{...m,title:e.target.value.slice(0,80)}:m)}))}/><button onClick={()=>apply(old=>({...old,markers:old.markers.filter(m=>m.id!==markerId)}))}>移除标记</button><button onClick={()=>setMarkerId('')}>完成</button></div>}
    <div className="mt-body">
    <div className="mt-tools" aria-label="时间线工具">
      <button type="button" className={tool==='select'?'is-on':''} aria-pressed={tool==='select'} title="选择" aria-label="选择" onClick={()=>setTool('select')}><Icon name="cursor" size={14}/></button>
      <button type="button" className={tool==='blade'?'is-on':''} aria-pressed={tool==='blade'} title="刀片：点击片段在点击处分割" aria-label="刀片" onClick={()=>setTool('blade')}><Icon name="film" size={14}/></button>
      <button type="button" title="吸附" aria-label="吸附" aria-pressed={snap} onClick={()=>setSnap(!snap)}><Icon name="spark" size={14}/></button>
      <button type="button" title="影音联动" aria-label="影音联动" aria-pressed={linked} onClick={()=>setLinked(!linked)}><Icon name="link" size={14}/></button>
      <button type="button" title="隐藏空轨" aria-label="隐藏空轨" aria-pressed={hideEmpty} onClick={()=>setHideEmpty(!hideEmpty)}><Icon name="eye" size={14}/></button>
      <button type="button" title="定位到声音" aria-label="定位到声音" onClick={()=>{if(scroll.current)scroll.current.scrollTop=scroll.current.scrollHeight}}><Icon name="music" size={14}/></button>
      <details className="mt-tools-more"><summary title="更多工具" aria-label="更多工具"><Icon name="more" size={15}/></summary><div className="mt-tools-menu">
        <button type="button" onClick={()=>setHideEmpty(!hideEmpty)}>{hideEmpty?'显示空轨':'隐藏空轨'}</button>
        <button type="button" onClick={()=>setDensity(compact?'normal':'compact')}>{compact?'展开轨道':'紧凑轨道'}</button>
        <button type="button" disabled={busy||!canUndo} onClick={onUndo}>撤销</button>
        <button type="button" disabled={busy||!canRedo} onClick={onRedo}>重做</button>
        <button type="button" disabled={!ids.length||busy} onClick={split}>在播放头分割</button>
        <button type="button" disabled={!ids.length||busy} onClick={()=>remove(false)}>删除</button>
        <button type="button" disabled={!ids.length||busy} onClick={()=>remove(true)}>波纹删除</button>
        <button type="button" onClick={()=>setSnap(!snap)}>吸附：{snap?'开':'关'}</button>
        <button type="button" onClick={()=>setLinked(!linked)}>影音联动：{linked?'开':'关'}</button>
        <button type="button" onClick={()=>{const width=scroll.current?.clientWidth||900;onZoom(Math.max(8,Math.min(160,(width-100)/p.duration)))}}>适应窗口</button>
        <div className="mt-tools-sep"/>
        {extras}
      </div></details>
    </div>
    <div className="me-scroll mt-scroll" ref={scroll}><div style={{minWidth:180+extent*zoom}}><div className="me-ruler mt-ruler"><span className="mt-ruler-clock">{frameTime(time,p.fps)}</span><div style={{width:extent*zoom}} onPointerDown={scrub}>{Array.from({length:Math.ceil(extent/tick)},(_,i)=>i*tick).map(t=><small key={t} style={{left:t*zoom}}>{tickLabel(t)}</small>)}{(p.markers||[]).map(m=><button key={m.id} aria-label={`标记 ${m.title} ${frameTime(m.time,p.fps)}`} title={m.title} className="mt-marker" style={{left:m.time*zoom}} onPointerDown={e=>e.stopPropagation()} onClick={()=>{onPlay(false);onSeek(m.time);setMarkerId(m.id)}}>◆</button>)}<i className="mt-head" style={{left:time*zoom}}/></div></div>
      {visibleTracks.map(({track,depth})=>{const index=tracks.findIndex(t=>t.id===track.id)
        const kids=childrenOf(track.id)
        const clips=p.clips.filter(c=>trackId(c)===track.id).sort((a,b)=>a.start-b.start)
        const descendants=descendantsOf(track.id)
        const groupCount=kids.length?p.clips.filter(c=>[track.id,...descendants.map(k=>k.id)].includes(trackId(c))).length:clips.length
        const baseH=track.kind==='audio'?(density==='compact'?40:density==='large'?58:44):(density==='compact'?18:density==='large'?40:28)
        return <div className={'me-track mt-track'+(track.locked?' is-locked':'')+(depth?' is-child':'')+(isHiddenTrack(track)?' is-hidden':'')} data-track-id={track.id} key={track.id}><div className="mt-track-label" style={{paddingLeft:10+depth*9}}><div className="mt-track-head">{kids.length?<button type="button" className={'mt-track-toggle'+(collapsed[track.id]?' is-on':'')} title={collapsed[track.id]?'展开子轨':'收起子轨'} aria-label={collapsed[track.id]?'展开子轨':'收起子轨'} onClick={()=>setCollapsed(old=>({...old,[track.id]:!old[track.id]}))}><Icon name="chevR" size={10}/></button>:depth?<span className="mt-track-child-chevron">›</span>:<span className="mt-track-toggle-space"/>}{track.kind==='text'?<b className="mt-track-letter">T</b>:track.kind==='audio'?<b className="mt-track-letter is-audio">J</b>:<Icon name="film" size={11}/>}<input aria-label="轨道名称" value={track.name} onChange={e=>trackPatch(track.id,{name:e.target.value})}/><small className="mt-track-badge">· {track.id==='overlay'?p.assets.filter(a=>a.kind!=='audio').length:kids.length?groupCount:clips.length} {track.kind==='text'?'句':track.kind==='audio'?'段':'个'}</small></div><div>{track.kind==='audio'&&<button aria-label={track.name+'静音'} aria-pressed={!!track.muted} title="静音" onClick={()=>trackPatch(track.id,{muted:!track.muted})}><Icon name="volume" size={11}/></button>}{track.kind!=='audio'&&<button aria-label={track.name+'隐藏'} aria-pressed={!!track.hidden} title="隐藏" onClick={()=>trackPatch(track.id,{hidden:!track.hidden})}><Icon name="eye" size={11}/></button>}<button aria-label={track.name+'锁定'} aria-pressed={!!track.locked} title="锁定" onClick={()=>trackPatch(track.id,{locked:!track.locked})}><Icon name="lock" size={11}/></button><button title="轨道上移" aria-label="轨道上移" onClick={()=>reorder(index,-1)}>↑</button><button title="轨道下移" aria-label="轨道下移" onClick={()=>reorder(index,1)}>↓</button></div></div><div className="me-track-area mt-track-area" style={{width:extent*zoom,height:collapsed[track.id]&&kids.length?(track.kind==='audio'?26:16):Math.max(baseH,laneHeight+2)}} onPointerDown={e=>{if(e.target===e.currentTarget){setIds([]);onSelect('');onSeek(Math.max(0,Math.min(p.duration,(e.clientX-e.currentTarget.getBoundingClientRect().left)/zoom)))}}} onDragOver={e=>{if(!track.locked)e.preventDefault()}} onDrop={e=>{e.preventDefault();const assetId=e.dataTransfer.getData('application/x-motion-asset');const asset=p.assets.find(a=>a.id===assetId);if(!asset||track.locked)return;const at=Math.max(0,(e.clientX-e.currentTarget.getBoundingClientRect().left)/zoom);apply(old=>{const next=addMediaClip(old,assetId,at),newIds=new Set(old.clips.map(c=>c.id));return {...next,clips:next.clips.map(c=>!newIds.has(c.id)&&clipKind(c)===track.kind?{...c,trackId:track.id}:c)}})}}>
          {collapsed[track.id]?<span className="mt-lane-hint">{kids.length?'已收起 '+kids.length+' 个子轨 · '+groupCount+' 个片段':clips.length+' 个片段已收起'}</span>:<>{!clips.length&&<span className="mt-lane-hint">{kids.length?kids.length+' 个子轨 · '+groupCount+' 个片段':track.id==='effects'?'等待口播素材':track.id==='video-main'?'+ 选择素材，开始编排':track.kind==='audio'?'音乐、音效与对白将在这里编排':track.kind==='text'?'字幕与标题会显示在这里':'拖入素材到这里'}</span>}<i className="me-playhead" style={{left:time*zoom}}/>{clips.map((c,ci)=>{const asset=p.assets.find(a=>a.id===c.assetId);return <div key={c.id} role="button" tabIndex="0" aria-label={`${c.title} ${stamp(c.start)} 时长 ${c.duration.toFixed(2)}秒`} className={'me-clip mt-clip mt-'+clipKind(c)+(ids.includes(c.id)?' is-selected':'')} style={{left:c.start*zoom,width:Math.max(8,c.duration*zoom),top:1}} onKeyDown={e=>{if(e.key==='Enter')choose(c.id,e.shiftKey)}} onContextMenu={e=>{e.preventDefault();choose(c.id);setMenu({id:c.id,x:Math.min(e.clientX,window.innerWidth-210),y:Math.min(e.clientY,window.innerHeight-235)})}} onPointerDown={e=>drag(e,c)}><b onPointerDown={e=>drag(e,c,'left')} title="裁剪起点"/><div className="mt-clip-body">{c.type==='audio'&&<Icon name="music" size={11}/>}{c.type==='video'&&p.previewUrls?.[c.assetId]&&<video className="mt-clip-thumb" src={p.previewUrls[c.assetId]} muted preload="metadata" aria-hidden="true"/>}{c.type==='image'&&p.previewUrls?.[c.assetId]&&<img className="mt-clip-thumb" src={p.previewUrls[c.assetId]} alt="" aria-hidden="true"/>}{c.type==='video'&&asset?.filmstripFrames&&p.previewUrls?.[asset.id+'-thumb']&&<div className="mt-filmstrip" aria-hidden="true">{Array.from({length:Math.min(8,Math.max(1,Math.ceil(c.duration*zoom/80)))},(_,i)=>{const count=Math.min(8,Math.max(1,Math.ceil(c.duration*zoom/80))),position=Math.min(11,Math.floor(((c.inPoint||0)+c.duration*i/count)/asset.duration*12));return <i key={i} style={{backgroundImage:`url("${p.previewUrls[asset.id+'-thumb']}")`,backgroundSize:'1200% 100%',backgroundPosition:`${position/11*100}% 50%`}}/>})}</div>}<span>{['video','image','animation'].includes(c.type)?String(ci+1)+' ':''}{c.linkId?'↔ ':''}{c.title||asset?.name||c.type}</span>{c.type==='audio'?<Wave asset={asset} clip={c}/>:null}<small className="mt-clip-duration">{c.type==='audio'?c.duration.toFixed(1)+'s':Math.round(c.duration)+'秒'}</small></div><b onPointerDown={e=>drag(e,c,'right')} title="裁剪终点"/></div>})}</>}
        </div></div>
      })}</div></div></div>
    {menu&&createPortal(<div className="mt-context" role="menu" aria-label="片段操作" style={{left:menu.x,top:menu.y}}>{[
      ['chat','让 AI 修改此片段',()=>onAsk?.(p.clips.find(c=>c.id===menu.id))],
      ['clock','跳到片段开头',()=>{onPlay(false);onSeek(p.clips.find(c=>c.id===menu.id).start)}],
      ['copy','复制片段',()=>apply(old=>duplicateTimeline(old,[menu.id],{linked}))],
      ['film','在播放头分割',()=>apply(old=>splitTimeline(old,[menu.id],time,{linked}))],
      ['trash','删除片段',()=>apply(old=>deleteTimeline(old,[menu.id],{linked}))],
    ].map(([icon,label,action])=><button key={label} role="menuitem" disabled={busy||(label==='在播放头分割'&&!(time>p.clips.find(c=>c.id===menu.id)?.start&&time<p.clips.find(c=>c.id===menu.id)?.start+p.clips.find(c=>c.id===menu.id)?.duration))} onClick={()=>{action();setMenu(null)}}><Icon name={icon} size={14}/>{label}</button>)}</div>,document.body)}
    <div className="mt-status">
      <span>{stamp(p.duration)} · {p.clips.filter(c=>['video','image','animation'].includes(c.type)).length} 镜</span>
      <span className="mt-status-spacer" />
      <span className="mt-view-labels" aria-label="视图"><span>画面文字</span><span>按键</span><span>镜头</span><span>整片</span></span><span className="mt-density" aria-label="轨道高度">轨道高度<span>{[['compact','紧凑'],['normal','标准'],['large','大']].map(([value,label])=><button type="button" key={value} className={density===value?'is-on':''} onClick={()=>setDensity(value)}>{label}</button>)}</span></span>
      <button type="button" onClick={()=>{const width=scroll.current?.clientWidth||900;onZoom(Math.max(8,Math.min(160,(width-190)/p.duration)))}}>适应窗口</button>
      <label>缩放<input type="range" aria-label="时间线缩放" min="8" max="160" value={zoom} onChange={e=>onZoom(Number(e.target.value))}/></label>
      <span>{Math.round(zoom/36*100)}%</span>
    </div>
  </section>
}
