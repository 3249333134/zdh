import React from 'react'
import { createPortal } from 'react-dom'
import { addTimelineMarker,frameTime } from '../src/motion-editor-tools.js'
import { Icon } from './ui.jsx'
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
  const [compact,setCompact]=React.useState(true),[menu,setMenu]=React.useState(null),[markerId,setMarkerId]=React.useState('')
  React.useEffect(()=>{if(!menu)return;const close=e=>{if(e.type==='keydown'&&e.key!=='Escape')return;if(e.target.closest?.('.mt-context'))return;setMenu(null)};window.addEventListener('pointerdown',close);window.addEventListener('keydown',close);return()=>{window.removeEventListener('pointerdown',close);window.removeEventListener('keydown',close)}},[menu])
  const [query,setQuery]=React.useState(''),[kind,setKind]=React.useState('all')
  const [ids,setIds]=React.useState([]),[snap,setSnap]=React.useState(true),[linked,setLinked]=React.useState(true),[bin,setBin]=React.useState(true)
  const scroll=React.useRef(null),tracks=tracksOf(p),current=p.clips.find(c=>c.id===selected)
  React.useEffect(()=>{setIds(old=>selected?(old.includes(selected)?old:[selected]):[])},[selected])
  React.useEffect(()=>{if(!playing||!scroll.current)return;const x=time*zoom,left=scroll.current.scrollLeft,width=scroll.current.clientWidth-180;if(x<left||x>left+width-30)scroll.current.scrollLeft=Math.max(0,x-width*.25)},[time,playing,zoom])
  const choose=(id,multi=false)=>{const next=multi?(ids.includes(id)?ids.filter(i=>i!==id):[...ids,id]):[id];setIds(next);onSelect(next.includes(id)?id:next.at(-1)||'')}
  const apply=fn=>{if(!busy)onChange(fn)}
  const remove=ripple=>apply(old=>deleteTimeline(old,ids,{linked,ripple}))
  const split=()=>apply(old=>splitTimeline(old,ids,time,{linked}))
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
  const extent=Math.min(600,Math.max(p.duration+10,30)),tick=zoom<20?10:zoom>70?1:5
  const visibleTracks=tracks.filter(t=>!hideEmpty||p.clips.some(c=>trackId(c)===t.id)||(!p.clips.length&&['video-main','audio-main'].includes(t.id)))
  const laneHeight=compact?43:59
  const assets=p.assets.filter(a=>(kind==='all'||a.kind===kind)&&a.name.toLowerCase().includes(query.toLowerCase()))
  const media=<><div className="mt-library-filter"><input aria-label="搜索项目素材" placeholder="搜索素材…" value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="素材类型" value={kind} onChange={e=>setKind(e.target.value)}><option value="all">全部素材</option><option value="video">视频</option><option value="audio">音频</option><option value="image">图片</option></select></div><div className="mt-bin" aria-label="多段素材库">{assets.map(a=><article key={a.id} draggable onDragStart={e=>e.dataTransfer.setData('application/x-motion-asset',a.id)}><div className="mt-asset-preview">{a.kind==='video'?<video src={p.previewUrls?.[a.id]} muted preload="metadata"/>:a.kind==='image'?<img src={p.previewUrls?.[a.id]} alt="" loading="lazy"/>:<span>♫</span>}</div><strong title={a.name}>{a.name}</strong><small>{a.kind==='image'?'图片':stamp(a.duration)}</small><div><button disabled={busy} onClick={()=>addAsset(a.id,time)}>插入播放头</button><button disabled={busy} onClick={()=>addAsset(a.id,mainEnd)}>追加</button></div></article>)}{!assets.length&&<p>{p.assets.length?'没有匹配的素材':'导入单个或多个视频，拖入轨道即可编辑。'}</p>}</div></>
  return <section className={'me-timeline mt-editor'+(compact?' mt-compact':'')} aria-label="多轨自由剪辑时间线">
    <header className="me-timeline-tools"><strong>时间线</strong><button aria-pressed={hideEmpty} onClick={()=>setHideEmpty(!hideEmpty)}>{hideEmpty?'显示空轨':'隐藏空轨'}</button><button aria-pressed={compact} onClick={()=>setCompact(!compact)}>{compact?'展开轨道':'紧凑轨道'}</button><button disabled={busy||!canUndo} onClick={onUndo}>撤销</button><button disabled={busy||!canRedo} onClick={onRedo}>重做</button><button disabled={!ids.length||busy} onClick={split}>分割 S</button><button disabled={!ids.length||busy} onClick={()=>remove(false)}>删除</button><button disabled={!ids.length||busy} onClick={()=>remove(true)} title="移除选中时段，并让全部轨道后续内容前移">波纹删除</button><button aria-pressed={snap} onClick={()=>setSnap(!snap)}>吸附 {snap?'开':'关'}</button><button aria-pressed={linked} onClick={()=>setLinked(!linked)}>影音联动 {linked?'开':'关'}</button><label>缩放<input type="range" aria-label="时间线缩放" min="8" max="160" value={zoom} onChange={e=>onZoom(Number(e.target.value))}/></label><button onClick={()=>{const width=scroll.current?.clientWidth||900;onZoom(Math.max(8,Math.min(160,(width-190)/p.duration)))}}>适应窗口</button></header>
    <div className="mt-secondary">{!externalMedia&&<button onClick={()=>setBin(!bin)}>{bin?'收起素材库':'素材库'}</button>}<button disabled={busy} onClick={onImport}>＋ 导入多个素材</button><button disabled={busy} onClick={onWaveforms}>音频波形</button><button disabled={busy} onClick={onThumbnails}>视频缩略图</button><button title="在播放头添加标记 · M" disabled={busy||(p.markers?.length||0)>=100} onClick={()=>apply(old=>addTimelineMarker(old,time))}>＋ 标记 M</button><button disabled={busy||tracks.length>=24} onClick={()=>addTrack('visual')}>＋ 画面轨</button><button disabled={busy||tracks.length>=24} onClick={()=>addTrack('audio')}>＋ 音轨</button><button disabled={busy||tracks.length>=24} onClick={()=>addTrack('text')}>＋ 字幕轨</button><button disabled={busy||!current||current.type!=='video'||(current.volume??1)<=0||!p.assets.find(a=>a.id===current.assetId)?.hasAudio} onClick={()=>apply(old=>separateAudio(old,ids))}>分离原声</button><button disabled={busy||!ids.length} onClick={()=>apply(old=>duplicateTimeline(old,ids,{linked}))}>复制 Ctrl+D</button><span>Shift 多选 · 拖动两端裁剪 · 跨轨拖放 · 方向键逐帧微调</span></div>
    {externalMedia ? (mediaMount && createPortal(media,mediaMount)) : (bin && media)}
    {markerId&&p.markers?.find(m=>m.id===markerId)&&<div className="mt-marker-edit"><span>时间线标记</span><input aria-label="标记名称" value={p.markers.find(m=>m.id===markerId).title} onChange={e=>apply(old=>({...old,markers:old.markers.map(m=>m.id===markerId?{...m,title:e.target.value.slice(0,80)}:m)}))}/><button onClick={()=>apply(old=>({...old,markers:old.markers.filter(m=>m.id!==markerId)}))}>移除标记</button><button onClick={()=>setMarkerId('')}>完成</button></div>}
    <div className="me-scroll mt-scroll" ref={scroll}><div style={{minWidth:180+extent*zoom}}><div className="me-ruler mt-ruler"><span>轨道 / 图层</span><div style={{width:extent*zoom}} onPointerDown={scrub}>{Array.from({length:Math.ceil(extent/tick)},(_,i)=>i*tick).map(t=><small key={t} style={{left:t*zoom}}>{stamp(t)}</small>)}{(p.markers||[]).map(m=><button key={m.id} aria-label={`标记 ${m.title} ${frameTime(m.time,p.fps)}`} title={m.title} className="mt-marker" style={{left:m.time*zoom}} onPointerDown={e=>e.stopPropagation()} onClick={()=>{onPlay(false);onSeek(m.time);setMarkerId(m.id)}}>◆</button>)}<i className="mt-head" style={{left:time*zoom}}/></div></div>
      {visibleTracks.map(track=>{const index=tracks.findIndex(t=>t.id===track.id)
        const clips=p.clips.filter(c=>trackId(c)===track.id).sort((a,b)=>a.start-b.start),ends=[],lanes=new Map()
        for(const c of clips){let lane=ends.findIndex(end=>end<=c.start+.00001);if(lane<0)lane=ends.length;ends[lane]=c.start+c.duration;lanes.set(c.id,lane)}
        return <div className={'me-track mt-track'+(track.locked?' is-locked':'')} data-track-id={track.id} key={track.id}><div className="mt-track-label"><input aria-label="轨道名称" value={track.name} onChange={e=>trackPatch(track.id,{name:e.target.value})}/><div>{track.kind==='audio'&&<button aria-label={track.name+'静音'} aria-pressed={!!track.muted} onClick={()=>trackPatch(track.id,{muted:!track.muted})}>静音</button>}{track.kind!=='audio'&&<button aria-label={track.name+'隐藏'} aria-pressed={!!track.hidden} onClick={()=>trackPatch(track.id,{hidden:!track.hidden})}>隐藏</button>}<button aria-label={track.name+'锁定'} aria-pressed={!!track.locked} onClick={()=>trackPatch(track.id,{locked:!track.locked})}>锁定</button><button title="轨道上移" onClick={()=>reorder(index,-1)}>↑</button><button title="轨道下移" onClick={()=>reorder(index,1)}>↓</button></div></div><div className="me-track-area mt-track-area" style={{width:extent*zoom,height:Math.max(compact?56:76,ends.length*laneHeight+14)}} onPointerDown={e=>{if(e.target===e.currentTarget){setIds([]);onSelect('');onSeek(Math.max(0,Math.min(p.duration,(e.clientX-e.currentTarget.getBoundingClientRect().left)/zoom)))}}} onDragOver={e=>{if(!track.locked)e.preventDefault()}} onDrop={e=>{e.preventDefault();const assetId=e.dataTransfer.getData('application/x-motion-asset');const asset=p.assets.find(a=>a.id===assetId);if(!asset||track.locked)return;const at=Math.max(0,(e.clientX-e.currentTarget.getBoundingClientRect().left)/zoom);apply(old=>{const next=addMediaClip(old,assetId,at),newIds=new Set(old.clips.map(c=>c.id));return {...next,clips:next.clips.map(c=>!newIds.has(c.id)&&clipKind(c)===track.kind?{...c,trackId:track.id}:c)}})}}>
          <i className="me-playhead" style={{left:time*zoom}}/>{clips.map(c=>{const asset=p.assets.find(a=>a.id===c.assetId);return <div key={c.id} role="button" tabIndex="0" aria-label={`${c.title} ${stamp(c.start)} 时长 ${c.duration.toFixed(2)}秒`} className={'me-clip mt-clip mt-'+clipKind(c)+(ids.includes(c.id)?' is-selected':'')} style={{left:c.start*zoom,width:Math.max(8,c.duration*zoom),top:(lanes.get(c.id)||0)*laneHeight+7}} onKeyDown={e=>{if(e.key==='Enter')choose(c.id,e.shiftKey)}} onContextMenu={e=>{e.preventDefault();choose(c.id);setMenu({id:c.id,x:Math.min(e.clientX,window.innerWidth-210),y:Math.min(e.clientY,window.innerHeight-235)})}} onPointerDown={e=>drag(e,c)}><b onPointerDown={e=>drag(e,c,'left')} title="裁剪起点"/><div className="mt-clip-body">{c.type==='video'&&asset?.filmstripFrames&&p.previewUrls?.[asset.id+'-thumb']&&<div className="mt-filmstrip" aria-hidden="true">{Array.from({length:Math.min(8,Math.max(1,Math.ceil(c.duration*zoom/80)))},(_,i)=>{const count=Math.min(8,Math.max(1,Math.ceil(c.duration*zoom/80))),position=Math.min(11,Math.floor(((c.inPoint||0)+c.duration*i/count)/asset.duration*12));return <i key={i} style={{backgroundImage:`url("${p.previewUrls[asset.id+'-thumb']}")`,backgroundSize:'1200% 100%',backgroundPosition:`${position/11*100}% 50%`}}/>})}</div>}<span>{c.linkId?'↔ ':''}{c.title||asset?.name||c.type}</span>{c.type==='audio'?<Wave asset={asset} clip={c}/>:<small>{stamp(c.inPoint||0)} · {c.duration.toFixed(1)}s</small>}</div><b onPointerDown={e=>drag(e,c,'right')} title="裁剪终点"/></div>})}
        </div></div>
      })}</div></div>
    {menu&&createPortal(<div className="mt-context" role="menu" aria-label="片段操作" style={{left:menu.x,top:menu.y}}>{[
      ['chat','让 AI 修改此片段',()=>onAsk?.(p.clips.find(c=>c.id===menu.id))],
      ['clock','跳到片段开头',()=>{onPlay(false);onSeek(p.clips.find(c=>c.id===menu.id).start)}],
      ['copy','复制片段',()=>apply(old=>duplicateTimeline(old,[menu.id],{linked}))],
      ['film','在播放头分割',()=>apply(old=>splitTimeline(old,[menu.id],time,{linked}))],
      ['trash','删除片段',()=>apply(old=>deleteTimeline(old,[menu.id],{linked}))],
    ].map(([icon,label,action])=><button key={label} role="menuitem" disabled={busy||(label==='在播放头分割'&&!(time>p.clips.find(c=>c.id===menu.id)?.start&&time<p.clips.find(c=>c.id===menu.id)?.start+p.clips.find(c=>c.id===menu.id)?.duration))} onClick={()=>{action();setMenu(null)}}><Icon name={icon} size={14}/>{label}</button>)}</div>,document.body)}
  </section>
}
