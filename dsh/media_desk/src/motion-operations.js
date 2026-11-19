import { validateEditor } from './motion-editor.js'
import { locked, linkedIds, moveTimeline, trimTimeline, deleteTimeline, splitTimeline, duplicateTimeline, tracksOf } from './motion-timeline.js'

// Only this allowlist may mutate the editor. Model output never executes as application code.
export function applyMotionOperations(project, operations, selectedId) {
  if (!Array.isArray(operations) || operations.length > 30) throw Error('编辑操作无效')
  let next = structuredClone(project)
  for (const op of operations) {
    if(op.type==='track') {
      const track=tracksOf(next).find(t=>t.id===op.trackId)
      if(!track)throw Error('轨道不存在')
      const patch={};for(const key of ['muted','hidden','locked'])if(typeof op[key]==='boolean')patch[key]=op[key]
      if(typeof op.name==='string')patch.name=op.name.slice(0,80)
      next.tracks=tracksOf(next).map(t=>t.id===track.id?{...t,...patch}:t);continue
    }
    const id = op.id || selectedId, clip = next.clips.find(c => c.id === id)
    if (!clip) throw Error('请先选择需要修改的片段，或说出片段名称')
    if (locked(next, clip)) throw Error('该片段所在轨道已锁定，请先解锁')
    if (next.clips.some(c=>linkedIds(next,[id]).includes(c.id)&&locked(next,c))) throw Error('联动原声轨道已锁定，请先解锁')
    if (op.type === 'move') next = moveTimeline(next, [id], Number(op.start) - clip.start)
    else if (op.type === 'trim') next = trimTimeline(next, id, 'right', Number(op.duration) - clip.duration)
    else if (op.type === 'split') {
      const at=Number(op.time);if(!Number.isFinite(at)||at<=clip.start||at>=clip.start+clip.duration)throw Error('分割位置需要位于片段内')
      next=splitTimeline(next,[id],at)
    }
    else if (op.type === 'duplicate') next=duplicateTimeline(next,[id])
    else if (op.type === 'delete') next = deleteTimeline(next, [id])
    else if(op.type==='transform'){if(!['video','image','text'].includes(clip.type))throw Error('此片段不支持画面变换');const fields={};for(const key of ['x','y','width','height','opacity','rotation'])if(op[key]!==undefined)fields[key]=Number(op[key]);if(op.fit!==undefined)fields.fit=op.fit;next.clips=next.clips.map(c=>c.id===id?{...c,...fields}:c)}
    else if(op.type==='fade'){const ids=new Set(linkedIds(next,[id]));next.clips=next.clips.map(c=>ids.has(c.id)&&(c.type==='audio'||c.type==='video'&&!c.linkId)?{...c,audioFade:Number(op.seconds)}:c)}
    else if (op.type === 'source' || op.type === 'volume') {
      const ids = new Set(linkedIds(next, [id]))
      next.clips = next.clips.map(c => ids.has(c.id) ? {...c, ...(op.type === 'source' ? {inPoint:Number(op.inPoint)} : c.type === 'audio' || c.type === 'video' && !c.linkId ? {volume:Number(op.volume)} : {})} : c)
    } else if (op.type === 'text' && clip.type === 'text') next.clips = next.clips.map(c => c.id === id ? {...c,text:String(op.text).slice(0,2000)} : c)
    else if (op.type === 'caption') next.clips.push({id:crypto.randomUUID(),type:'text',title:'片段字幕',text:String(op.text).slice(0,2000),start:clip.start,duration:clip.duration,trackId:'captions',layer:30,x:next.width*.06,y:next.height*.84,width:next.width*.88,fontSize:Math.round(next.width*.032),color:'#ffffff',boxColor:'rgba(0,0,0,.58)'})
    else throw Error('暂不支持这项片段操作，请具体说明要裁剪、移动、换入点、调音量或改字幕')
    // Keep transcribed captions attached to the actual retained source interval.
    if (clip.type === 'video' && ['move','trim','delete','source'].includes(op.type)) {
      const changed=next.clips.find(c=>c.id===id)
      next.clips=next.clips.flatMap(c=>{
        if(c.sourceClipId!==id)return [c]
        if(!changed||op.type==='source')return []
        const start=c.start+(changed.start-clip.start),end=Math.min(start+c.duration,changed.start+changed.duration)
        return end>start?[{...c,start,duration:end-start}]:[]
      })
    }
  }
  return validateEditor(next)
}

