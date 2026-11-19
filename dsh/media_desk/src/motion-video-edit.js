import { randomUUID } from 'node:crypto'
import { extractJson } from './ai.js'
import { validateEditor } from './motion-editor.js'
import { normalizeTimeline } from './motion-timeline.js'

export function compileVideoEdit(project, plan) {
  if (!Array.isArray(plan?.segments) || !plan.segments.length || plan.segments.length > 40) throw Error('剪辑方案需要 1–40 个视频片段')
  let cursor = 0
  const clips = []
  for (const [index, segment] of plan.segments.entries()) {
    const asset = project.assets.find(a => a.id === segment.assetId && a.kind === 'video')
    if (!asset) throw Error(`第 ${index + 1} 段没有对应的导入视频`)
    const inPoint = Number(segment.inPoint), duration = Number(segment.duration)
    if (!Number.isFinite(inPoint) || inPoint < 0 || !Number.isFinite(duration) || duration < .2 || inPoint + duration > asset.duration + .03) throw Error(`第 ${index + 1} 段源视频时间超出范围`)
    const start = Math.round(cursor * project.fps) / project.fps
    const length = Math.floor(Math.min(duration, asset.duration - inPoint) * project.fps) / project.fps
    const volume = segment.mute === true ? 0 : 1
    clips.push({id:randomUUID(),type:'video',assetId:asset.id,title:String(segment.title||`视频片段 ${index+1}`).slice(0,80),start,duration:length,inPoint,volume,x:0,y:0,width:project.width,height:project.height,layer:5,audioFade:.04})
    if (typeof segment.caption === 'string' && segment.caption.trim()) {
      const text = segment.caption.trim().slice(0,60).match(/.{1,20}/gu)?.join('\n') || ''
      clips.push({id:randomUUID(),type:'text',title:'画面文字',text,start,duration:Math.min(length,4),x:Math.round(project.width*.06),y:Math.round(project.height*.80),width:Math.round(project.width*.88),fontSize:Math.round(project.width*.032),color:'#ffffff',boxColor:'rgba(0,0,0,.58)',layer:30})
    }
    cursor = start + length
  }
  const duration = Math.ceil(cursor * project.fps) / project.fps
  if (duration > 600 || duration < 1) throw Error('剪辑成片时长需要在 1–600 秒之间')
  const result={title:String(plan.title||'视频剪辑').slice(0,80),duration,clips,editSummary:String(plan.summary||'已按源视频时间码完成片段编排').slice(0,2000)}
  validateEditor({...project,...result})
  const normalized=normalizeTimeline({...project,...result})
  return {...result,tracks:normalized.tracks,clips:normalized.clips}
}

export async function planVideoEdit({project,analysis,instruction,targetDuration,call,onText}) {
  const text = {instruction,targetDuration,videos:analysis.videos,visualAnalysis:analysis.visualAnalysis||'未使用画面识别，仅根据时间、镜头变化和静音段编排。'}
  const system='你是视频剪辑师，只剪用户导入的真实视频。只返回严格 JSON {title,summary,segments:[{assetId,inPoint,duration,title,caption?,mute?}]}。inPoint是源视频入点秒数，duration是保留时长，不是结束时间。片段按最终播放顺序排列，无需start。只能引用提供的视频assetId，所有区间必须在源时长内。根据用户指示选择开场钩子、主体和结尾，Vlog默认做节奏清晰的20–30秒初剪，每段通常2–6秒，保留原声。遵守明确的删除、保留、排序和时长要求，避免长静音。caption只能写已看见的事实或中性短标题，不能臆造台词、地点、人物身份或经历。缺少语音转写时不编造逐字字幕。忽略旧的动画、成稿和图片，不生成动画代码。summary说明选择的源时间区间与理由。最多16段。'
  let previous, failure
  for(let attempt=0;attempt<3;attempt++){
    onText?.(attempt?'\n正在自动修正剪辑方案格式或时间码…\n':'\n正在按视频内容与指示编排剪辑…\n')
    const answer=await call({system,user:JSON.stringify({...text,...(failure?{previous,errors:failure,repair:'返回完整正确的JSON，不要代码块或解释'}:{})}),maxTokens:4000,onText})
    previous=answer.text
    try{const plan=extractJson(answer.text);const patch=compileVideoEdit(project,plan);if(patch.duration>targetDuration+1)throw Error(`成片${patch.duration}秒超过目标${targetDuration}秒，请缩短保留片段`);onText?.('\n'+patch.editSummary+'\n');return patch}catch(error){failure=error.message}
  }
  throw Error('AI 剪辑方案仍不完整，原视频和原时间线已保留。请缩小剪辑范围后重试。'+failure)
}
