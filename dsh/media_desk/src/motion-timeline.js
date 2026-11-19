const uid = () => globalThis.crypto.randomUUID()
export const DEFAULT_TRACKS = [
  {id:'captions',name:'字幕 / 标题',kind:'text'},
  {id:'effects',name:'A · 动画 / 动效',kind:'visual'},
  {id:'overlay',name:'V2 · 叠加画面',kind:'visual'},
  {id:'video-main',name:'V1 · 主视频',kind:'visual'},
  {id:'audio-main',name:'A1 · 原声',kind:'audio'},
  {id:'audio-music',name:'A2 · 配乐 / 配音',kind:'audio'},
]
export const clipKind = clip => clip.type === 'audio' ? 'audio' : clip.type === 'text' ? 'text' : 'visual'
export const trackId = clip => clip.trackId || ({text:'captions',animation:'effects',audio:'audio-music'}[clip.type] || 'video-main')
export function tracksOf(p) { return p.tracks?.length ? p.tracks : DEFAULT_TRACKS.map(t=>({...t})) }
export const locked = (p,c) => tracksOf(p).find(t=>t.id===trackId(c))?.locked === true
export function linkedIds(p,ids,linked=true) {
  const keys=new Set(p.clips.filter(c=>ids.includes(c.id)&&c.linkId).map(c=>c.linkId))
  return p.clips.filter(c=>ids.includes(c.id)||(linked&&keys.has(c.linkId))).map(c=>c.id)
}
export function resolveTimeline(p) {
  const tracks=tracksOf(p)
  return {...p,clips:p.clips.map(c=>{
    const index=tracks.findIndex(t=>t.id===trackId(c)),track=tracks[index]
    return {...c,hidden:!!c.hidden||!!track?.hidden,volume:track?.muted?0:(c.volume??1),layer:(tracks.length-Math.max(0,index))*100+(c.layer||0)*.001}
  })}
}
export function separateAudio(p,ids=p.clips.map(c=>c.id)) {
  const clips=[]
  for(const c of p.clips){
    const asset=p.assets.find(a=>a.id===c.assetId)
    if(c.type==='video'&&ids.includes(c.id)&&asset?.hasAudio&&(c.volume??1)>0&&!locked(p,c)){
      const linkId=c.linkId||uid()
      clips.push({...c,volume:0,trackId:trackId(c),linkId})
      clips.push({id:uid(),type:'audio',title:'原声 · '+(c.title||asset.name),assetId:c.assetId,start:c.start,duration:c.duration,inPoint:c.inPoint||0,volume:c.volume??1,audioFade:c.audioFade||0,trackId:'audio-main',linkId})
    }else clips.push({...c,trackId:trackId(c)})
  }
  return {...p,tracks:tracksOf(p),clips}
}
export function normalizeTimeline(p) {
  let tracks=tracksOf(p)
  const video=p.clips.filter(c=>c.type==='video'),animation=p.clips.filter(c=>c.type==='animation')
  if(!p.tracks&&video.length&&animation.length&&Math.max(...animation.map(c=>c.layer||0))<Math.min(...video.map(c=>c.layer||0))){
    tracks=[...tracks];const a=tracks.findIndex(t=>t.id==='effects'),v=tracks.findIndex(t=>t.id==='video-main');[tracks[a],tracks[v]]=[tracks[v],tracks[a]]
  }
  return separateAudio({...p,tracks})
}
export function moveTimeline(p,ids,delta,{linked=true,targetTrack,snap=false,playhead=0,threshold=.12}={}) {
  const selected=new Set(linkedIds(p,ids,linked)),moving=p.clips.filter(c=>selected.has(c.id))
  if(!moving.length||moving.some(c=>locked(p,c)))return p
  const track=tracksOf(p).find(t=>t.id===targetTrack)
  if(track?.locked)return p
  let shift=Math.round(delta*p.fps)/p.fps
  if(snap){
    const anchors=[0,playhead,...p.clips.filter(c=>!selected.has(c.id)).flatMap(c=>[c.start,c.start+c.duration])]
    let best=threshold
    for(const c of moving)for(const edge of [c.start,c.start+c.duration])for(const anchor of anchors){const distance=anchor-(edge+shift);if(Math.abs(distance)<best){best=Math.abs(distance);shift+=distance}}
  }
  shift=Math.max(-Math.min(...moving.map(c=>c.start)),Math.min(600-Math.max(...moving.map(c=>c.start+c.duration)),shift))
  shift=Math.round(shift*p.fps)/p.fps
  const clips=p.clips.map(c=>selected.has(c.id)?{...c,start:Math.max(0,c.start+shift),...(track&&ids.includes(c.id)&&track.kind===clipKind(c)?{trackId:track.id}:{})}:c)
  return {...p,clips,duration:Math.min(600,Math.max(p.duration,...clips.map(c=>c.start+c.duration)))}
}
export function trimTimeline(p,id,edge,delta,{linked=true}={}) {
  const primary=p.clips.find(c=>c.id===id);if(!primary)return p
  const ids=new Set(linkedIds(p,[id],linked)),group=p.clips.filter(c=>ids.has(c.id))
  if(group.some(c=>locked(p,c)))return p
  let shift=Math.round(delta*p.fps)/p.fps
  if(edge==='left'){
    const minimum=Math.max(...group.map(c=>-Math.min(c.start,['video','audio'].includes(c.type)?c.inPoint||0:c.start)))
    shift=Math.max(minimum,Math.min(Math.min(...group.map(c=>c.duration))-1/p.fps,shift))
  }else{
    const maximum=Math.min(...group.map(c=>{const a=p.assets.find(a=>a.id===c.assetId);return Math.min(600-c.start-c.duration,['video','audio'].includes(c.type)?a.duration-(c.inPoint||0)-c.duration:600)}))
    shift=Math.max(1/p.fps-Math.min(...group.map(c=>c.duration)),Math.min(maximum,shift))
  }
  const clips=p.clips.map(c=>{
    if(!ids.has(c.id))return c
    if(edge==='right')return {...c,duration:c.duration+shift,animationDuration:c.animationDuration||c.duration}
    return {...c,start:c.start+shift,duration:c.duration-shift,inPoint:Math.max(0,(c.inPoint||0)+shift),animationOffset:Math.max(0,(c.animationOffset||0)+shift),animationDuration:c.animationDuration||c.duration}
  })
  return {...p,clips,duration:Math.max(p.duration,...clips.map(c=>c.start+c.duration))}
}
export function splitTimeline(p,ids,time,{linked=true}={}) {
  const selected=new Set(linkedIds(p,ids,linked)),newLinks=new Map(),at=Math.round(time*p.fps)/p.fps
  const clips=p.clips.flatMap(c=>{
    if(!selected.has(c.id)||locked(p,c)||at<=c.start+.0001||at>=c.start+c.duration-.0001)return [c]
    const offset=at-c.start
    if(c.linkId&&!newLinks.has(c.linkId))newLinks.set(c.linkId,uid())
    return [{...c,duration:offset,animationDuration:c.animationDuration||c.duration},{...c,id:uid(),start:at,duration:c.duration-offset,inPoint:(c.inPoint||0)+offset,animationOffset:(c.animationOffset||0)+offset,animationDuration:c.animationDuration||c.duration,linkId:c.linkId?newLinks.get(c.linkId):undefined}]
  })
  return {...p,clips}
}
export function deleteTimeline(p,ids,{linked=true,ripple=false}={}) {
  const selected=new Set(linkedIds(p,ids,linked))
  if(p.clips.some(c=>selected.has(c.id)&&locked(p,c)))return p
  if(!ripple)return {...p,clips:p.clips.filter(c=>!selected.has(c.id))}
  const ranges=[]
  for(const c of p.clips.filter(c=>selected.has(c.id)).sort((a,b)=>a.start-b.start)){
    const end=c.start+c.duration,last=ranges.at(-1)
    if(last&&c.start<=last.end)last.end=Math.max(last.end,end);else ranges.push({start:c.start,end})
  }
  if(p.clips.some(c=>locked(p,c)&&ranges.some(r=>c.start+c.duration>r.start)))return p
  const removedBefore=t=>ranges.reduce((sum,r)=>sum+Math.max(0,Math.min(t,r.end)-r.start),0)
  const links=new Map()
  const clips=p.clips.filter(c=>!selected.has(c.id)).flatMap(c=>{
    let pieces=[{start:c.start,end:c.start+c.duration}]
    for(const r of ranges)pieces=pieces.flatMap(s=>s.end<=r.start||s.start>=r.end?[s]:[...(s.start<r.start?[{start:s.start,end:r.start}]:[]),...(s.end>r.end?[{start:r.end,end:s.end}]:[])])
    return pieces.filter(s=>s.end-s.start>=1/p.fps-.001).map((s,i)=>{
      const key=c.linkId+':'+s.start+':'+s.end;if(c.linkId&&!links.has(key))links.set(key,uid())
      return {...c,id:i?uid():c.id,start:s.start-removedBefore(s.start),duration:s.end-s.start,inPoint:(c.inPoint||0)+s.start-c.start,animationOffset:(c.animationOffset||0)+s.start-c.start,animationDuration:c.animationDuration||c.duration,linkId:c.linkId?links.get(key):undefined}
    })
  })
  return {...p,clips,duration:Math.max(1,p.duration-ranges.reduce((n,r)=>n+r.end-r.start,0))}
}
export function duplicateTimeline(p,ids,{linked=true}={}) {
  const selected=new Set(linkedIds(p,ids,linked)),group=p.clips.filter(c=>selected.has(c.id))
  if(!group.length||group.some(c=>locked(p,c)))return p
  const offset=Math.max(...group.map(c=>c.start+c.duration))-Math.min(...group.map(c=>c.start)),links=new Map()
  const copies=group.map(c=>{if(c.linkId&&!links.has(c.linkId))links.set(c.linkId,uid());return {...c,id:uid(),title:(c.title||'')+' 副本',start:c.start+offset,linkId:c.linkId?links.get(c.linkId):undefined}})
  if(copies.some(c=>c.start+c.duration>600))return p
  return {...p,clips:[...p.clips,...copies],duration:Math.max(p.duration,...copies.map(c=>c.start+c.duration))}
}
export function addMediaClip(p,assetId,time) {
  const asset=p.assets.find(a=>a.id===assetId);if(!asset)return p
  const start=Math.max(0,Math.min(599,time)),duration=Math.min(asset.kind==='image'?5:asset.duration,600-start)
  const clip={id:uid(),type:asset.kind,title:asset.name,assetId,start,duration,inPoint:0,volume:1,x:0,y:0,width:p.width,height:p.height,trackId:asset.kind==='audio'?'audio-music':'video-main'}
  return normalizeTimeline({...p,clips:[...p.clips,clip],duration:Math.max(p.clips.length?p.duration:1,start+duration)})
}
