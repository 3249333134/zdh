import { Script } from 'node:vm'
import { randomUUID } from 'node:crypto'
import { extractJson } from './ai.js'
import { validateEditor } from './motion-editor.js'
import { designedSceneCode } from './motion-design.js'

export function animationBody(text) {
  const fenced = /```(?:javascript|js)?\s*([\s\S]*?)```/i.exec(text)
  let code = (fenced ? fenced[1] : text).trim()
  if (/^(?:function\s*\w*\s*\(|\([^)]*\)\s*=>)/.test(code)) code = code.slice(code.indexOf('{') + 1, code.lastIndexOf('}'))
  if (!code || code.length > 40000) throw Error('动画代码为空或过长')
  new Script('(function(ctx,time,duration,width,height,assets,motion){' + code + '\n})')
  return code
}

export function fitAnimationPlan(project, plan, onText) {
  if (!Array.isArray(plan?.clips) || !plan.clips.length || plan.clips.length > 24) throw Error('AI 分镜规划无效，单次可生成 1–24 镜')
  const seconds = value => {
    if (typeof value === 'string' && /^\d+(?::\d+){1,2}(?:\.\d+)?$/.test(value.trim())) return value.trim().split(':').reduce((sum, part) => sum * 60 + Number(part), 0)
    return value === undefined || value === null || value === '' ? NaN : Number(value)
  }
  let cursor = 0, repaired = false
  const timings = plan.clips.map(c => {
    let start = seconds(c?.start), duration = seconds(c?.duration)
    if (!Number.isFinite(start) || start < 0) { start = cursor; repaired = true }
    if (!Number.isFinite(duration) || duration <= 0) { duration = project.duration / plan.clips.length; repaired = true }
    cursor = start + duration
    return { start, duration }
  })
  const span = Math.max(...timings.map(c => c.start + c.duration))
  const scale = span > project.duration ? project.duration / span : 1
  const totalFrames = Math.floor(project.duration * project.fps)
  const clips = plan.clips.map((c, index) => {
    const timing = timings[index]
    const startFrame = Math.max(0, Math.min(totalFrames - 1, Math.floor(timing.start * scale * project.fps)))
    const endFrame = Math.max(startFrame + 1, Math.min(totalFrames, Math.round((timing.start + timing.duration) * scale * project.fps)))
    return { id: randomUUID(), type: 'animation', title: String(c?.title || '动画'), start: startFrame / project.fps, duration: (endFrame - startFrame) / project.fps, layer: Number.isFinite(c?.layer) ? c.layer : 1, code: '', ...(c?.design && typeof c.design === 'object' ? {design:c.design} : {}) }
  })
  if (scale < 1) onText?.(`\nAI 分镜原排期为 ${span.toFixed(1)} 秒，已自动适配到工程的 ${project.duration} 秒，保留全部 ${clips.length} 镜。\n`)
  else if (repaired) onText?.('\n已自动补齐分镜时间，按工程帧率对齐。\n')
  validateEditor({ ...project, clips })
  return clips
}

export async function generateAnimation({ project, selectedId, instruction, script, notes, call, onText, onClip }) {
  const selected = project.clips.find(c => c.id === selectedId && c.type === 'animation')
  const designed = project.generationMode === 'designed'
  const direction = '画面按电影感图文叙事制作：优先使用提供的真实封面、配图与分镜素材，统一色彩、字体、版式；每镜只有一个清晰视觉主角，标题应大且简洁。禁止用几根线假画人物、手、枪、城堡，禁止空背景上只放一个小物件和小字。无图片时用有信息层次的大字排版、对比图文或步骤动效。不得编造原文没有的数字与事实。'
  const designSchema = '每镜必须提供 design:{layout:"poster|statement|compare|steps|metric",title:"画面大标题，中文建议4–16字",subtitle:"辅助说明，最多40字",highlight:"可选强调词，最多8字",imageId:"从提供的图片id选择",left:"对比左侧",right:"对比右侧",points:["步骤1","步骤2","步骤3"],value:"仅原文明确存在的数字"}。poster是全幅素材加大标题，statement是重点句，compare是双列对比，steps是步骤，metric是数据特写。不要返回JavaScript代码。'
  let plan
  if (selected) {
    let design
    if (designed) {
      onText?.('\n正在重新设计这一镜的构图与文字…\n')
      const answer=await call({system:direction+'只返回 JSON {design:{...}}。'+designSchema,user:JSON.stringify({instruction,script,notes,scene:selected,style:project.visualStyle||'cinematic',assets:project.assets.map(({id,name,kind})=>({id,name,kind}))}),maxTokens:1500,onText})
      const result=extractJson(answer.text);design=result.design||result.clips?.[0]?.design
      if(!design||typeof design!=='object')throw Error('这一镜未返回有效构图，请重新设计')
    }
    plan = { clips: [{ id: selected.id, title: selected.title, start: selected.start, duration: selected.duration, layer: selected.layer,design }] }
  }
  else {
    onText?.('\n正在规划分镜…\n')
    let failure
    for (let attempt = 0; attempt < 2; attempt++) {
      const answer = await call({ system: '为动画视频规划时间线，只返回严格 JSON {clips:[{title,start,duration,layer'+(designed?',design':'')+'}]}。不要返回代码。start/duration 单位秒，正数，所有片段不得超出工程总时长。分镜数量由内容与用户要求决定，不固定为6镜。未指定时优先2到4个片段。单次最多24镜，可多次追加。不同镜头可以独立制作。长文案应提炼适合目标时长的画面要点，时间安排以工程总时长为准。'+(designed?direction+designSchema:''), user: JSON.stringify({ instruction, script, notes, width: project.width, height: project.height, duration: project.duration,style:project.visualStyle||'cinematic',assets:project.assets.map(({id,name,kind})=>({id,name,kind})), ...(failure ? { repair: '上次返回格式无效，请返回完整 JSON', error: failure } : {}) }), maxTokens: designed?6000:1800, onText })
      try { plan = extractJson(answer.text); fitAnimationPlan(project, plan); failure = null; break } catch (error) { failure = error.message }
      onText?.('\n正在修正分镜规划格式…\n')
    }
    if (failure) throw Error('分镜规划未完成：' + failure)
  }
  const clips = selected ? [{ ...selected, code: '', ...(plan.clips[0].design?{design:plan.clips[0].design}:{}) }] : fitAnimationPlan(project, plan, onText)
  validateEditor({ ...project, clips })
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i]
    onText?.(`\n—— 镜头 ${i + 1}/${clips.length}：${clip.title} ——\n`)
    if(designed){
      clip.code=designedSceneCode(clip.design||{}, {title:clip.title,assets:project.assets,style:project.visualStyle||'cinematic',index:i})
      animationBody(clip.code)
      onText?.(clip.code+'\n')
      await onClip?.(clip,{completed:i+1,total:clips.length});continue
    }
    const system = direction+'只输出可执行的 JavaScript Canvas 2D 动画函数体，不要 JSON、说明、函数声明或代码外的文字。已有参数 ctx,time,duration,width,height,assets,motion。motion.scene({layout:"poster",title,subtitle,highlight,imageId}) 可以直接绘制专业图文动画。time 是本片段内秒数，用于确定性动画；ctx 是 CanvasRenderingContext2D。素材可用 ctx.drawImage(assets[素材ID],...)。禁止网络、DOM、import、require、异步、随机值、无限循环。颜色用有效字符串，动态rgba使用模板字符串。每镜代码尽量不超过80行。不得使用未定义变量。按原文语言绘制可见文字。'
    const brief = { instruction, script, notes, scene: clip, scenes: clips.map(({ code, ...c }) => c), width: project.width, height: project.height, assets: project.assets.map(({ id, name, kind }) => ({ id, name, kind })), previousCode: selected?.code }
    let previousCode, failure
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await call({ system, user: JSON.stringify(attempt ? { ...brief, previousCode, syntaxError: failure, instruction: '修复语法错误，返回完整可执行函数体。' + instruction } : brief), maxTokens: 4200, onText })
      previousCode = result.text
      try { clip.code = animationBody(result.text); failure = null; break } catch (error) { failure = error.message; onText?.('\n正在修正这镜的代码语法…\n') }
    }
    if (failure) throw Error('镜头「' + clip.title + '」代码未通过检查：' + failure)
    await onClip?.(clip, { completed: i + 1, total: clips.length })
  }
  return { clips }
}

export async function translateEditor({ project, language, call }) {
  let clips = project.clips.map(clip => ({ ...clip }))
  const text = clips.filter(c => c.type === 'text')
  if (text.length) {
    const result = await call({ system: '翻译字幕，保留事实数字与换行。只返回严格 JSON {clips:[{id,text}]}，保留每个 id。', user: JSON.stringify({ language, clips: text.map(({ id, text }) => ({ id, text })) }), maxTokens: 6000 })
    const translated = extractJson(result.text)
    if (!Array.isArray(translated.clips) || text.some(c => typeof translated.clips.find(t => t.id === c.id)?.text !== 'string')) throw Error('字幕翻译不完整，请重新翻译')
    clips = clips.map(c => c.type === 'text' ? { ...c, text: translated.clips.find(t => t.id === c.id).text } : c)
  }
  for (const clip of clips.filter(c => c.type === 'animation')) {
    const result = await generateAnimation({ project, selectedId: clip.id, instruction: '只将现有代码中显示到画面的文字翻译为' + language + '。保持原有绘制逻辑、颜色、坐标和动画效果，不要重新设计。', call })
    clip.code = result.clips[0].code
  }
  validateEditor({ ...project, clips })
  return { clips }
}
