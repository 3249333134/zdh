import React from 'react'
import { createPortal } from 'react-dom'
import { report, setDesk, toast, useDesk } from './desk.js'
import { applyMotionOperations } from '../src/motion-operations.js'
import { editorDocument, validateEditor } from '../src/motion-editor.js'
import { normalizeTimeline,resolveTimeline,tracksOf,trackId,clipKind,locked,linkedIds,moveTimeline,trimTimeline,deleteTimeline,duplicateTimeline,addMediaClip,DEFAULT_TRACKS } from '../src/motion-timeline.js'
import { MotionTimeline } from './motion-timeline.jsx'
import css from './motion-editor.css'
import { MotionInspector } from './motion-inspector.jsx'
import { ChatDock } from './chat.jsx'
import { Dialog, Icon } from './ui.jsx'
import { frameTime,adjacentCut } from '../src/motion-editor-tools.js'
import { MotionTemplatePanel } from './motion-template-panel.jsx'
import { TEXT_PRESETS, STICKERS, SOUND_EFFECTS, COLOR_STYLES, makeTextClip, makeStickerClip, synthesizeSound, synthesizeMusic } from './motion-presets.js'
import { readMotionPackage, parseComposition, mimeOf } from './motion-archive.js'
import { applyOrder, validateOrder, MEP_EXAMPLE } from '../src/motion-mep.js'

const CODE_EXAMPLE = `// 用代码剪视频：直接修改 project.clips 后返回
const visuals = project.clips.filter(c => ['video', 'image'].includes(c.type))
visuals.forEach((clip, index) => {
  helpers.setTransition(clip, index % 2 ? 'slide-left' : 'zoom-in', .7)
  helpers.applyStyle(clip, index % 2 ? 'vivid' : 'cinematic')
})
helpers.addTitle('折纸钉住观点', { start: .5, duration: 3.5 })
return project`

const IS_ELECTRON = typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent)

const projectToCode = p => `// 阿杜 · 剪辑代码
// 这份代码就是当前工程。改完后点「运行并应用」，时间线、预览和导出会同步更新。
// 阿杜的每次 AI 修改也会自动写回这里。

project.title = ${JSON.stringify(p.title)}
project.width = ${p.width}
project.height = ${p.height}
project.fps = ${p.fps}
project.duration = ${p.duration}
project.background = ${JSON.stringify(p.background || '#080d15')}
project.tracks = ${JSON.stringify(p.tracks || [], null, 2)}
project.clips = ${JSON.stringify(p.clips || [], null, 2)}

return project`

export async function editorRequest(action, body = {}, onText, onClip) {
  const response = await fetch('media-desk/motion-editor', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...body, stream: !!onText }), signal: AbortSignal.timeout(['generate','edit-video','subtitles'].includes(action) ? 570000 : 210000) })
  if (response.headers.get('content-type')?.includes('application/x-ndjson')) {
    const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '', result
    while (true) {
      const chunk = await reader.read(); buffer += decoder.decode(chunk.value, { stream: !chunk.done })
      const lines = buffer.split('\n'); buffer = lines.pop()
      for (const line of lines) { if (!line.trim()) continue; const row = JSON.parse(line); if (row.error) throw Error(row.error); if (row.delta) onText?.(row.delta); if (row.clip) onClip?.(row.clip, row.progress); if (row.result) result = row.result }
      if (chunk.done) break
    }
    if (!result) throw Error('生成中断，请重试'); return result
  }
  const result = await response.json()
  if (!response.ok) throw Error(result.error || '创作操作失败')
  return result
}
const uid = () => crypto.randomUUID()
const sample = 'const p = Math.min(1, time / 1.2);\nctx.fillStyle = "#9de8cc";\nctx.beginPath();\nctx.arc(width/2, height/2, 80 + Math.sin(time*2)*20, 0, Math.PI*2);\nctx.fill();\nctx.fillStyle = "#ffffff";\nctx.font = "bold 48px sans-serif";\nctx.textAlign = "center";\nctx.globalAlpha = p;\nctx.fillText("从想法到画面", width/2, height/2 + 150);'
const timeLabel = t => `${Math.floor(t / 60).toString().padStart(2, '0')}:${(t % 60).toFixed(1).padStart(4, '0')}`

export function MotionEditor({ initialTemplateId='', script: sourceScript = '', notes = '', handoffKey, sourceItemId, onClose }) {
  const key = 'md-motion-editor-' + (handoffKey || 'last')
  const [p, setProject] = React.useState(null), [selected, select] = React.useState(''), [time, seek] = React.useState(0)
  const [playing, play] = React.useState(false), [zoom, setZoom] = React.useState(36), [busy, setBusy] = React.useState('')
  const [error, setError] = React.useState(''), [frameErrors, setFrameErrors] = React.useState([]), [dirty, setDirty] = React.useState(false)
  const [instruction, setInstruction] = React.useState(''), [script, setScript] = React.useState(sourceScript), [language, setLanguage] = React.useState('英语')
  const [render, setRender] = React.useState(null), [historyCount, historyChanged] = React.useState(0), [events, setEvents] = React.useState([])
  const [aiProposal, setAiProposal] = React.useState(null)
  const [projects, setProjects] = React.useState([])
  const [liveCode, setLiveCode] = React.useState('')
  const [voices, setVoices] = React.useState([]), [voice, setVoice] = React.useState('')
  const [gesture,setGesture]=React.useState(false)
  const [screening,setScreening]=React.useState(false)
  const [libraryTab,setLibraryTab]=React.useState('media'),[templateSelection,setTemplateSelection]=React.useState(initialTemplateId||'626-16x9'),[templateJob,setTemplateJob]=React.useState('')
  const [mediaMount,setMediaMount]=React.useState(null),[showMedia,setShowMedia]=React.useState(true),[showInspector,setShowInspector]=React.useState(true)
  const [assistantMessages,setAssistantMessages]=React.useState([])
  const [assistantDraft,setAssistantDraft]=React.useState('')
  const [assistantMode,setAssistantMode]=React.useState('auto')
  const assistantInput=React.useRef(null)
  const assistantMore=React.useRef(null)
  const [tourOpen,setTourOpen]=React.useState(false)
  const [codeOpen,setCodeOpen]=React.useState(false)
  const [codeText,setCodeText]=React.useState(CODE_EXAMPLE)
  const [codeMessage,setCodeMessage]=React.useState('')
  const [codeAuto,setCodeAuto]=React.useState(true)
  const [codePrompt,setCodePrompt]=React.useState('')
  const [mepOpen,setMepOpen]=React.useState(false)
  const [mepText,setMepText]=React.useState(JSON.stringify(MEP_EXAMPLE,null,2))
  const [mepMessage,setMepMessage]=React.useState('')
  const [mepChanges,setMepChanges]=React.useState([])
  const [workspaceFolder,setWorkspaceFolder]=React.useState('')
  const [guides, setGuides] = React.useState(false)
  const [mutedPreview, setMutedPreview] = React.useState(false)
  const [previewFit, setPreviewFit] = React.useState('fit')
  const [upperSize,setUpperSize]=React.useState(54)
  const [dragBox,setDragBox]=React.useState(null)
  const inspectorTab = useDesk(s => s.motionInspectorTab || 'assistant')
  const showAssistant = () => {setShowInspector(true);setDesk({motionInspectorTab:'assistant'})}
  const workspace=React.useRef(null),canvasMenu=React.useRef(null)
  React.useLayoutEffect(()=>{
    const update=()=>{const el=workspace.current;if(el)el.style.setProperty('--me-height',`${Math.max(560,window.innerHeight-el.getBoundingClientRect().top-8)}px`)}
    update();window.addEventListener('resize',update);return()=>window.removeEventListener('resize',update)
  },[!!p])
  const resizeWorkspace=e=>{
    e.preventDefault();const start=e.clientY,initial=upperSize,height=workspace.current.clientHeight
    const move=event=>setUpperSize(Math.max(32,Math.min(70,initial+(event.clientY-start)/height*100)))
    const end=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',end)}
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',end,{once:true});window.addEventListener('pointercancel',end,{once:true})
  }
  const history = React.useRef({ undo: [], redo: [] }), iframe = React.useRef(null), audio = React.useRef({}), projectRef = React.useRef(p)
  const saving = React.useRef(null), scriptRef = React.useRef(script)
  const token = React.useRef(uid()).current
  const zoomProject = React.useRef('')
  projectRef.current = p
  scriptRef.current = script
  const log = text => setEvents(rows => [...rows, { time: new Date().toLocaleTimeString(), text }].slice(-30))
  const act = async (name, fn) => { setBusy(name); setError(''); play(false); try { return await fn() } catch (e) { setError(e.message); log('操作未完成：' + e.message); return {error:e.message} } finally { setBusy('') } }
  const load = value => { const normalized=normalizeTimeline(value);projectRef.current = normalized; setProject(normalized); setInstruction(value.editInstruction||''); setDirty(!value.tracks||JSON.stringify(normalized.clips)!==JSON.stringify(value.clips)); setRender(value.renders?.[0] || null); history.current = { undo: [], redo: [] }; historyChanged(n => n + 1); if(zoomProject.current!==normalized.id){zoomProject.current=normalized.id;setZoom(normalized.duration>120?9:normalized.duration>45?12:36)} }
  React.useEffect(() => {
    let live = true
    const id = localStorage.getItem(key)
    ;(id ? editorRequest('read', { id }) : editorRequest('create')).then(value => { if (live) { load(value); if (!sourceScript) setScript(value.script || ''); localStorage.setItem(key, value.id) } }).catch(e => { if (live) setError(e.message) })
    editorRequest('list').then(result => { if (live) setProjects(result.rows) }).catch(() => {})
    editorRequest('voices').then(result => { if (live) { setVoices(result.voices); setVoice(result.voices[0]?.name || '') } }).catch(() => {})
    return () => { live = false }
  }, [key])
  React.useEffect(() => {
    const listener = event => {
      if (event.source !== iframe.current?.contentWindow || event.data?.token !== token) return
      if (event.data.type === 'motion-editor-frame') setFrameErrors(event.data.errors || [])
      if (event.data.type === 'motion-editor-cover') {
        if (event.data.error) { report(new Error('封面导出失败：' + event.data.error)); return }
        const link = document.createElement('a')
        link.href = event.data.dataUrl
        link.download = (projectRef.current?.title || 'motion') + '-封面.png'
        link.click()
        log('已导出当前帧封面')
      }
    }
    window.addEventListener('message', listener); return () => window.removeEventListener('message', listener)
  }, [token])
  React.useEffect(() => { iframe.current?.contentWindow?.postMessage({ type: 'motion-editor-seek', token, time }, '*') }, [time, token, p])
  React.useEffect(() => {
    if (!playing || !p) return
    const start = performance.now(), from = time
    const interval = setInterval(() => { const next = from + (performance.now() - start) / 1000; if (next >= p.duration) { seek(0); play(false) } else seek(next) }, 80)
    return () => clearInterval(interval)
  }, [playing, p?.duration])
  React.useEffect(() => {
    const trackRows=p?.tracks||[]
    const trackFlag=(clip,key)=>{let cur=trackId(clip),guard=0;while(cur&&guard++<12){const t=trackRows.find(r=>r.id===cur);if(t&&t[key])return true;cur=t?.parentId}return false}
    for (const clip of p ? resolveTimeline(p).clips : []) {
      const element = audio.current[clip.id]; if (!element) continue
      if(trackFlag(clip,'hidden')){element.pause();continue}
      const active = time >= clip.start && time < clip.start + clip.duration
      const fade=Math.min(clip.audioFade||0,clip.duration/2),local=time-clip.start
      const rate=clip.speed||1
      element.volume = trackFlag(clip,'muted') ? 0 : Math.max(0,Math.min(1,(clip.volume??1)*(fade?Math.min(1,local/fade,(clip.duration-local)/fade):1)))
      if (element.playbackRate !== rate) element.playbackRate = rate
      if (mutedPreview || !playing || !active || !(clip.volume ?? 1)) element.pause()
      else { const target = (clip.inPoint || 0) + local * rate; if (Math.abs(element.currentTime - target) > .25) element.currentTime = target; element.play().catch(() => {}) }
    }
  }, [time, playing, p, mutedPreview])
  React.useEffect(() => {
    if (render?.state !== 'rendering' || !p) return
    const interval = setInterval(() => editorRequest('status', { id: p.id, renderId: render.id }).then(value => { setRender(value); if (value.state !== 'rendering') log(value.state === 'done' ? '成片已导出，可以播放和下载' : '导出失败：' + value.error) }).catch(e => setError(e.message)), 1500)
    return () => clearInterval(interval)
  }, [render?.state, render?.id, p?.id])
  const change = fn => {
    play(false)
    const old = projectRef.current, next = typeof fn === 'function' ? fn(old) : fn
    history.current.undo.push(old); if (history.current.undo.length > 60) history.current.undo.shift(); history.current.redo = []
    setProject(next); projectRef.current = next; setDirty(true); historyChanged(n => n + 1)
  }
  const patch = fields => {
    const clip=projectRef.current.clips.find(c=>c.id===selected);if(!clip)return
    if(locked(projectRef.current,clip)){setError('请先解锁该轨道再编辑');return}
    change(old=>{
      if(fields.volume!==undefined||fields.audioFade!==undefined){const ids=new Set(linkedIds(old,[selected]));return {...old,clips:old.clips.map(c=>ids.has(c.id)&&(c.type==='audio'||c.type==='video'&&!c.linkId)?{...c,...fields}:c)}}
      if(fields.start!==undefined)return moveTimeline(old,[selected],fields.start-clip.start)
      if(fields.duration!==undefined)return trimTimeline(old,selected,'right',fields.duration-clip.duration)
      if(fields.inPoint!==undefined){const ids=new Set(linkedIds(old,[selected]));const a=old.assets.find(a=>a.id===clip.assetId),value=Math.max(0,Math.min(a.duration-clip.duration,fields.inPoint));return {...old,clips:old.clips.map(c=>ids.has(c.id)?{...c,inPoint:value}:c)}}
      return {...old,clips:old.clips.map(c=>c.id===selected?{...c,...fields}:c)}
    })
  }
  const askClip=(c,hint)=>{select(c.id);showAssistant();setDesk({chatDraft:`只修改选中片段「${c.title}」${hint?'：'+hint+'：':'：'}`});log('已将选中片段交给侧边助手')}
  const undo = direction => { const source = history.current[direction], target = history.current[direction === 'undo' ? 'redo' : 'undo']; if (!source.length) return; target.push(p); const value = source.pop(); setProject({ ...value, revision: p.revision, previewUrls: p.previewUrls, assets: p.assets }); setDirty(true); historyChanged(n => n + 1); play(false) }
  const persist = async (snapshot, scriptText) => {
    validateEditor(snapshot)
    const value = await editorRequest('save', { id: snapshot.id, project: { ...snapshot, script: scriptText, notes: notes || snapshot.notes } })
    const clean = projectRef.current === snapshot && scriptRef.current === scriptText
    const next = clean ? value : { ...projectRef.current, revision: value.revision }
    projectRef.current = next; setProject(next); setDirty(!clean); return value
  }
  const save = async () => { if (saving.current) await saving.current; return persist(projectRef.current, scriptRef.current) }
  React.useEffect(() => {
    if (!dirty || busy || gesture || !p) return
    const timer = setTimeout(() => {
      saving.current = persist(projectRef.current, scriptRef.current).catch(e => { setError('自动保存未完成：' + e.message); throw e }).finally(() => { saving.current = null })
      saving.current.catch(() => {})
    }, 1500)
    return () => clearTimeout(timer)
  }, [dirty, busy, gesture, p, script])
  const add = type => { const clip = { id: uid(), type, title: type === 'animation' ? '自由动画' : '文字', start: Math.min(time, p.duration - 1), duration: Math.min(5, p.duration - Math.min(time, p.duration - 1)), layer: type === 'text' ? 20 : 1, ...(type === 'animation' ? { code: sample } : { text: '双击思考，开始表达', x: 60, y: p.height - 140, width: p.width - 120, fontSize: 48, color: '#ffffff' }) }; change(old => ({ ...old, clips: [...old.clips, clip] })); select(clip.id) }
  const html = React.useMemo(() => p ? editorDocument(p, p.previewUrls || {}, token) : '', [p, token])
  const clip = p?.clips.find(c => c.id === selected)
  const boxOf = c => {
    if (!c) return null
    if (c.type === 'text') {
      const width = c.width || p.width
      const lines = Math.max(1, String(c.text || '').split('\\n').length)
      const height = lines * (c.lineHeight || 1.3) * (c.fontSize || 48)
      const x = c.align === 'center' ? c.x - width / 2 : c.align === 'right' ? c.x - width : c.x
      return { x, y: c.y || 0, width, height }
    }
    return { x: c.x || 0, y: c.y || 0, width: c.width || p.width, height: c.height || p.height }
  }
  const selClip = clip && ['text', 'image', 'video'].includes(clip.type) && time >= clip.start && time < clip.start + clip.duration ? clip : null
  const baseBox = boxOf(selClip)
  const selStyle = baseBox ? { left: `${(baseBox.x + (dragBox?.dx || 0)) / p.width * 100}%`, top: `${(baseBox.y + (dragBox?.dy || 0)) / p.height * 100}%`, width: `${(dragBox?.width ?? baseBox.width) / p.width * 100}%`, height: `${(dragBox?.height ?? baseBox.height) / p.height * 100}%`, transform: `rotate(${dragBox?.rotation ?? selClip.rotation ?? 0}deg)` } : null
  const moveSel = e => {
    if (!selClip || !baseBox) return
    e.preventDefault(); e.stopPropagation()
    const rect = e.currentTarget.parentElement.getBoundingClientRect()
    const startX = e.clientX, startY = e.clientY
    const anchorX = selClip.type === 'text' ? (selClip.align === 'center' ? baseBox.x + baseBox.width / 2 : selClip.align === 'right' ? baseBox.x + baseBox.width : baseBox.x) : baseBox.x
    const delta = ev => ({ dx: (ev.clientX - startX) / rect.width * p.width, dy: (ev.clientY - startY) / rect.height * p.height })
    const move = ev => setDragBox(delta(ev))
    const up = ev => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up)
      const { dx, dy } = delta(ev)
      setDragBox(null)
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) patch({ x: Math.round(Math.max(0, Math.min(p.width, anchorX + dx))), y: Math.round(Math.max(0, Math.min(p.height, baseBox.y + dy))) })
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up)
  }
  const startResize = (e, dir) => {
    if (!selClip || !baseBox) return
    e.preventDefault(); e.stopPropagation()
    const rect = e.currentTarget.closest('.me-canvas-frame').getBoundingClientRect()
    const startX = e.clientX, startY = e.clientY
    let last = { x: baseBox.x, y: baseBox.y, w: baseBox.width, h: baseBox.height }
    const move = ev => {
      const dx = (ev.clientX - startX) / rect.width * p.width, dy = (ev.clientY - startY) / rect.height * p.height
      let x = baseBox.x, y = baseBox.y, w = baseBox.width, h = baseBox.height
      if (dir.includes('e')) w = Math.max(40, baseBox.width + dx)
      if (dir.includes('s')) h = Math.max(30, baseBox.height + dy)
      if (dir.includes('w')) { w = Math.max(40, baseBox.width - dx); x = baseBox.x + (baseBox.width - w) }
      if (dir.includes('n')) { h = Math.max(30, baseBox.height - dy); y = baseBox.y + (baseBox.height - h) }
      last = { x, y, w, h }
      setDragBox({ dx: x - baseBox.x, dy: y - baseBox.y, width: w, height: h })
    }
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up)
      setDragBox(null)
      if (selClip.type === 'text') patch({ width: Math.round(last.w) })
      else patch({ x: Math.round(last.x), y: Math.round(last.y), width: Math.round(last.w), height: Math.round(last.h) })
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up)
  }
  const startRotate = e => {
    if (!selClip || !baseBox) return
    e.preventDefault(); e.stopPropagation()
    const rect = e.currentTarget.closest('.me-canvas-frame').getBoundingClientRect()
    const cx = (baseBox.x + baseBox.width / 2) / p.width * rect.width + rect.left
    const cy = (baseBox.y + baseBox.height / 2) / p.height * rect.height + rect.top
    const angle = ev => Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI
    const start = angle(e), base = selClip.rotation || 0
    let last = base
    const move = ev => { last = Math.round(base + angle(ev) - start); setDragBox({ dx: 0, dy: 0, rotation: last }) }
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up)
      setDragBox(null); patch({ rotation: last })
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up)
  }
  const pickCanvas = e => {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width * p.width, y = (e.clientY - rect.top) / rect.height * p.height
    const hit = resolveTimeline(p).clips.filter(c => ['text', 'image', 'video'].includes(c.type) && !c.hidden && time >= c.start && time < c.start + c.duration).sort((a, b) => (b.layer || 0) - (a.layer || 0)).find(c => { const box = boxOf(c); return box && x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height })
    select(hit ? hit.id : '')
    if (hit) { setShowInspector(true); setDesk({ motionInspectorTab: 'properties' }) }
  }
  const assistantMount=useDesk(s=>s.motionAssistantMount)
  const commandRef=React.useRef(null),commandBusy=React.useRef(false)
  React.useEffect(()=>{setDesk({motionBusy:busy});return()=>setDesk({motionBusy:''})},[busy])
  React.useEffect(()=>{if(!p)return;setDesk({motionController:{projectId:p.id,execute:message=>commandRef.current(message)},motionInspectorTab:'assistant'});return()=>setDesk({motionController:null})},[p?.id])
  if (!p) return <section className="me"><style>{css}</style><p>{error || '正在打开本地创作工程…'}</p><button onClick={onClose}>返回模板中心</button></section>
  const hasVideo = p.assets.some(a => a.kind === 'video')
  const editingVideo = (p.editTarget || (hasVideo ? 'video' : 'animation')) === 'video'
  const editVideo = (override,target) => act('AI 正在剪辑导入视频',async()=>{
    const requestText=typeof override==='string'?override:instruction;setLiveCode('');log('视频剪辑要求：'+(requestText||'按导入视频生成Vlog'))
    const saved=await save()
    const result=await editorRequest('edit-video',{project:saved,instruction:requestText||'按导入视频生成Vlog',targetDuration:target||p.videoTargetDuration||30},delta=>setLiveCode(code=>(code+delta).slice(-60000)))
    change(old=>normalizeTimeline({...old,...result.projectPatch,editTarget:'video'}));select('');seek(0)
    requestAnimationFrame(()=>document.getElementById('motion-free-timeline')?.scrollIntoView({block:'start',behavior:'smooth'}))
    log(result.projectPatch.editSummary);log('视频已剪入时间线，源视频入点、原声和画面文字均可调整')
  })
  const originalTemplate = (_template,targetDuration) => act('正在应用原版模板',async()=>{
    setTemplateJob('正在读取当前剪辑与原始模板…');log('开始制作原版酷炫科技风')
    const current=await save()
    const job=await editorRequest('template-start',{id:current.id,revision:current.revision,template:_template?.id||templateSelection,duration:Math.min(84,targetDuration||current.videoTargetDuration||30)})
    const production=async(action,args={})=>{const response=await fetch('media-desk/motion-production',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,id:job.id,...args}),signal:AbortSignal.timeout(240000)});const value=await response.json();if(!response.ok)throw Error(value.error||'模板制作失败');return value}
    setTemplateJob('AI 正在为原版场景编排本期内容…')
    const result=await production('plan',{script:script.trim()||[current.title,...current.clips.filter(c=>c.type==='text').map(c=>c.text)].join('。'),notes:`使用当前用户视频，不编造经历。源视频 ${job.sourceSeconds.toFixed(1)} 秒。`})
    const ids=job.sourceSeconds<18?['B1']:job.sourceSeconds<26?['B1','B2']:job.sourceSeconds<36?['B1','B2','B4']:['B1','B2','B3','B4']
    const english=job.language==='en'
    const plan={...result.plan,scenes:ids.map(id=>({id,title:result.plan.scenes.find(s=>s.id===id)?.title||current.title.slice(0,45)})),basic:{...(english?{keyword:'This film',explanation:current.title.slice(0,100),heading:'Highlights',points:[current.title.slice(0,40)],left:'Opening',right:'Ending',conclusion:'Details from the current footage',summary:'This episode',action:'Keep this moment'}:{keyword:current.title.slice(0,8),explanation:current.title.slice(0,42),heading:'本期内容',points:[current.title.slice(0,18)],left:'开场',right:'收尾',conclusion:'保留本期视频的变化与细节',summary:'本期记录',action:'记录这一刻'}),...result.plan.basic}}
    setTemplateJob('正在使用原版代码生成预览…');const preview=await production('apply-plan',{plan});if(preview.state==='failed')throw Error(preview.error)
    await production('render');setTemplateJob('正在渲染原版动效，完成后自动加入独立轨道…')
    for(let n=0;n<800;n++){await new Promise(resolve=>setTimeout(resolve,1500));const status=await production('status');if(status.state==='failed')throw Error(status.error);if(status.state!=='done')continue
      const updated=await editorRequest('template-attach',{id:current.id,jobId:job.id});change(updated);select('');seek(0);setTemplateJob('原版动效已加入模板画面与声音轨道');log('原版模板渲染完成，按场景加入可编辑时间线');return
    }
    throw Error('原版渲染仍在进行，请稍后查看制作结果')
  })
  const generate = (override) => act('AI 正在编写动画', async () => {
    const requestText=typeof override==='string'?override:instruction
    log('发送给 AI：' + (requestText || '按本期文案生成动画分镜'))
    setLiveCode('')
    await save()
    const attached = await editorRequest('source', { id:p.id, itemId:sourceItemId || p.sourceItemId, script })
    const prepared = { ...attached, generationMode: attached.generationMode || 'designed', visualStyle: attached.visualStyle || 'cinematic' }
    load(prepared)
    if (prepared.assets.some(a => a.sourceFile)) log('已关联成稿封面与分镜素材：' + prepared.assets.filter(a => a.sourceFile).length + ' 张')
    const result = await editorRequest('generate', { project: prepared, script, notes: notes || prepared.notes, instruction: requestText + (frameErrors.length ? '\n修复预览问题：' + frameErrors.join('；') : ''), selectedId: clip?.type === 'animation' ? clip.id : undefined }, delta => setLiveCode(code => (code + delta).slice(-60000)), (generatedClip, progress) => {
      change(old => ({ ...old, clips: [...old.clips.filter(c => c.id !== generatedClip.id), generatedClip] }))
      select(generatedClip.id); seek(generatedClip.start + Math.min(.5, generatedClip.duration / 2))
      log(`镜头 ${progress.completed}/${progress.total} 已加入时间线：${generatedClip.title}`)
    })
    const ids = new Set(result.clips.map(c => c.id))
    change(old => ({ ...old, clips: [...old.clips.filter(c => !ids.has(c.id)), ...result.clips] })); select(result.clips[0].id)
    log('AI 返回 ' + result.clips.length + ' 个动画片段，已加入时间线，可逐项修改')
  })
  const nativeAudio = async (action,mood) => {
    log(action==='music'?'正在本地生成原创配乐并降低原声区间的配乐音量…':'正在本地识别原视频语音并按剪辑区间对齐字幕…')
    const saved=await save()
    const value=await editorRequest(action,{id:saved.id,mood})
    change(value)
    log(action==='music'?'配乐已加入 A2 音轨，可单独裁剪和调音量':value.subtitleSummary)
    return value
  }
  const runCommand = async message => {
    if(commandBusy.current || busy) throw Error('正在处理上一项操作，请稍候')
    commandBusy.current=true
    setBusy('AI 正在理解当前工程的操作要求');setError('');play(false)
    try {
      const before=projectRef.current
      log('你的要求：'+message)
      const plan=await editorRequest('command',{project:before,selectedId:selected,time,message})
      log('执行计划：'+({finish:'剪辑 → 本地语音字幕 → 配乐',operations:'修改指定片段',music:'生成配乐音轨',subtitles:'本地语音识别',generate:'生成动画',translate:'翻译字幕',speech:'生成配音',export:'导出成片','edit-video':'剪辑导入视频',undo:'撤销修改',answer:'回答问题'}[plan.task]||plan.task))
      setBusy('AI 正在执行：'+plan.task)
      let result
      if (plan.task === 'operations') {
        const next = applyMotionOperations(before, plan.operations, selected)
        const oldById = new Map(before.clips.map(clip => [clip.id, clip]))
        const nextById = new Map(next.clips.map(clip => [clip.id, clip]))
        const rows = [...new Set([...oldById.keys(), ...nextById.keys()])].flatMap(id => {
          const old = oldById.get(id), updated = nextById.get(id)
          if (JSON.stringify(old) === JSON.stringify(updated)) return []
          const fields = old && updated ? Object.keys(updated).filter(key => JSON.stringify(old[key]) !== JSON.stringify(updated[key])) : []
          return [{ id, title: (updated || old).title, detail: !old ? '新增' : !updated ? '删除' : fields.map(key => key + ' → ' + JSON.stringify(updated[key]).slice(0, 100)).join(' · ') }]
        })
        if (!rows.length) return {text:'没有可应用的片段修改。'}
        setAiProposal({ before, next, rows })
        return {text:'修改草案已准备好，请在剪辑工作区核对并应用。'}
      }
      if(plan.task==='undo'){undo('undo');return {text:'已撤销上一步工程修改。'}}
      if(plan.task==='answer')return {text:plan.reply}
      if(['finish','edit-video'].includes(plan.task)){result=await editVideo(plan.instruction||message,plan.targetDuration);if(result?.error)throw Error(result.error)}
      if(plan.task==='generate'){result=await generate(plan.instruction||message);if(result?.error)throw Error(result.error)}
      if(['finish','subtitles'].includes(plan.task)){setBusy('正在本地识别语音字幕');await nativeAudio('subtitles')}
      if(['finish','music'].includes(plan.task)){setBusy('正在生成配乐音轨');await nativeAudio('music',plan.mood)}
      if(plan.task==='translate'){const value=await editorRequest('translate',{project:projectRef.current,language:plan.instruction||language});change(old=>({...old,clips:value.clips}));await save()}
      if(plan.task==='speech'){await save();change(await editorRequest('speech',{id:p.id,voice,text:script}));log('配音已加入音轨')}
      if(plan.task==='export'){const value=await save();setRender(await editorRequest('render',{id:value.id}));return {text:'导出已经开始，进度和成片会显示在预览下方。'}}
      await save()
      syncCode()
      return {text:'已完成。'+(projectRef.current.subtitleSummary||'')+' 配乐、字幕与视频均保留在可编辑轨道中，可选中某一片段继续提出修改。'}
    }catch(e){setError(e.message);log('操作未完成：'+e.message);throw e}
    finally{commandBusy.current=false;setBusy('')}
  }
  commandRef.current=runCommand
  const replaceMedia = file => act('替换素材', async () => {
    await save()
    const before = projectRef.current
    const query = new URLSearchParams({ id: before.id, name: file.name, replace: selected })
    const response = await fetch('media-desk/motion-upload?' + query, { method: 'POST', body: file })
    const result = await response.json()
    if (!response.ok) throw Error(result.error || '替换失败')
    const historyBefore = history.current
    load(result)
    history.current = {undo:[...historyBefore.undo,before],redo:[]}
    historyChanged(n=>n+1)

    syncCode()
    log('已替换素材：' + file.name)
  })
  const browserImport = files => act('导入素材', async () => {
    await save()
    const errors = []
    for (const file of files) {
      try {
        const query = new URLSearchParams({ id: p.id, name: file.name })
        const response = await fetch('media-desk/motion-upload?' + query, { method: 'POST', body: file })
        if (response.status === 404) { load(await editorRequest('import', { id: p.id })); return }
        const result = await response.json()
        if (!response.ok) throw Error(result.error || '导入失败')
        load(result)
      } catch (error) { errors.push(file.name + '：' + error.message) }
    }
    if (errors.length) throw Error(errors.join('；'))
  })
  const chooseMedia = () => {
    const input = workspace.current.querySelector('input[data-motion-upload]')
    input.click()
  }
  const chooseFolder = () => {
    const input = workspace.current.querySelector('input[data-motion-folder]')
    input.click()
  }
  const downloadCover = () => {
    iframe.current?.contentWindow?.postMessage({ type: 'motion-editor-cover', token, time }, '*')
  }
  const addTextPreset = preset => {
    const clip = makeTextClip(preset, p, time)
    change(old => ({ ...old, clips: [...old.clips, clip], duration: Math.max(old.duration, clip.start + clip.duration) }))
    select(clip.id)
    log('已加入文本模板：' + preset.name)
  }
  const addSticker = emoji => {
    const clip = makeStickerClip(emoji, p, time)
    change(old => ({ ...old, clips: [...old.clips, clip], duration: Math.max(old.duration, clip.start + clip.duration) }))
    select(clip.id)
    log('已加入贴纸：' + emoji)
  }
  const addSound = sound => act('生成音效', async () => {
    const blob = await synthesizeSound(sound.id)
    const file = new File([blob], sound.id + '.wav', { type: 'audio/wav' })
    const query = new URLSearchParams({ id: p.id, name: file.name })
    const response = await fetch('media-desk/motion-upload?' + query, { method: 'POST', body: file })
    const result = await response.json()
    if (!response.ok) throw Error(result.error || '音效导入失败')
    const asset = result.assets.find(row => row.name === file.name) || [...result.assets].reverse().find(row => row.kind === 'audio' && row.name.includes(sound.id))
    if (!asset) throw Error('音效已上传，但素材索引未更新')
    const added = result.clips.find(row => row.assetId === asset.id)
    load(result)
    if (added) select(added.id)
    else change(old => addMediaClip(old, asset.id, time))
    log('音效「' + sound.name + '」已加入音轨')
  })
  const importFolder = files => {
    const allowed = /\.(mp4|mov|webm|mkv|png|jpe?g|webp|gif|mp3|wav|m4a|aac|srt)$/i
    const list = files.filter(file => allowed.test(file.name))
    if (!list.length) throw Error('文件夹里没有可导入的音视频、图片或字幕')
    return browserImport(list)
  }
  const importMotionProject = file => act('导入 .motion 工程', async () => {
    const files = await readMotionPackage(file)
    let manifest = {}
    try { manifest = JSON.parse(new TextDecoder().decode(files['motion.json'] || new Uint8Array())) } catch {}
    if (!files['composition.html']) throw Error(manifest.format === 'motiongit-template' ? '这是 MotionGit 模板包，请到模板中心「导入本地 .motion 模板」使用；模板包没有可编辑时间线。' : '这个 .motion 里没有 composition.html，无法还原时间线')
    const parsed = parseComposition(new TextDecoder().decode(files['composition.html']))
    if (!parsed.items.length) throw Error('工程里没有可导入的视频、图片或音频片段')
    setBusy('导入 .motion · 创建工程')
    const created = await editorRequest('create')
    let project = created
    const assets = {}
    const keys = Object.keys(files)
    for (const item of parsed.items) {
      if (assets[item.path]) continue
      const bytes = files[item.path] || files[keys.find(key => key.endsWith('/' + item.path) || key === item.path) || '']
      if (!bytes) continue
      const name = item.path.split('/').pop()
      if (!/\.(mp4|mov|webm|mkv|png|jpe?g|webp|gif|mp3|wav|m4a|aac)$/i.test(name)) continue
      setBusy('导入 .motion · ' + name)
      project = await uploadDemo(created.id, name, new Blob([bytes], { type: mimeOf(name) }))
      assets[item.path] = project.assets.find(row => row.name === name)
    }
    const px = (value, base) => value == null ? null : (typeof value === 'object' ? base * value.percent / 100 : value)
    const clips = []
    for (const item of parsed.items) {
      const asset = assets[item.path]
      if (!asset) continue
      const type = item.tag === 'audio' ? 'audio' : item.tag === 'img' ? 'image' : 'video'
      const width = px(item.style.width, parsed.width) || parsed.width
      const height = px(item.style.height, parsed.height) || parsed.height
      let duration = type === 'image' ? 3 : ((item.outPoint ?? asset.duration) - item.inPoint) / item.speed
      duration = Math.max(.1, Math.min(duration, (asset.duration - item.inPoint) / item.speed))
      const clip = { id: crypto.randomUUID(), type, title: item.path.split('/').pop(), assetId: asset.id, start: Math.max(0, item.start), duration, inPoint: Math.max(0, item.inPoint), speed: item.speed, volume: item.muted ? 0 : item.volume, x: px(item.style.left, parsed.width) || 0, y: px(item.style.top, parsed.height) || 0, width, height, fit: 'cover', hidden: item.hidden, trackId: type === 'audio' ? 'audio-music' : item.section > 0 ? 'overlay' : 'video-main', layer: type === 'audio' ? 0 : 5 }
      if (type !== 'audio' && item.overrides?.fade) { clip.fadeIn = Math.max(0, Number(item.overrides.fade[0]) || 0); clip.fadeOut = Math.max(0, Number(item.overrides.fade[1]) || 0) }
      clips.push(clip)
    }
    if (!clips.length) throw Error('工程里的素材都未能导入')
    const duration = Math.max(1, Math.ceil(Math.max(...clips.map(clip => clip.start + clip.duration)) + 1))
    const next = { ...project, title: manifest.project?.name || file.name.replace(/\.motion$/i, ''), width: parsed.width, height: parsed.height, fps: 30, duration, background: parsed.background || '#080d15', tracks: DEFAULT_TRACKS.map(track => ({ ...track })), clips, notes: '从 .motion 工程导入，已还原为可编辑时间线。' }
    setBusy('导入 .motion · 写入时间线')
    const saved = await editorRequest('save', { id: project.id, project: next })
    localStorage.setItem(key, saved.id)
    load(saved); select(''); seek(0)
    log('已导入 .motion：' + clips.length + ' 个片段，跳过 ' + parsed.skipped + ' 个页面元素')
  })
  const uploadDemo = async (projectId, name, blob) => {
    const file = new File([blob], name, { type: blob.type || 'application/octet-stream' })
    const query = new URLSearchParams({ id: projectId, name })
    const response = await fetch('media-desk/motion-upload?' + query, { method: 'POST', body: file })
    const result = await response.json()
    if (!response.ok) throw Error(result.error || '演示素材导入失败：' + name)
    return result
  }
  const createDemo = () => act('生成演示项目', async () => {
    toast('正在生成演示项目，请稍候…')
    const created = await editorRequest('create')
    let project = created
    const files = {}
    for (const name of ['aurora.jpg', 'poster.jpg', 'v-aurora.mp4', 'v-tide.mp4']) {
      setBusy('生成演示项目 · 导入 ' + name)
      const response = await fetch('media-desk/assets/' + name)
      if (!response.ok) throw Error('演示素材不存在：' + name + '（请重启工作台后再试）')
      project = await uploadDemo(created.id, name, await response.blob())
      files[name] = project.assets.find(row => row.name === name)
      log('导入演示素材：' + name)
    }
    setBusy('生成演示项目 · 合成音效')
    for (const [id, name] of [['whoosh', 'demo-whoosh.wav'], ['whoosh', 'demo-whoosh-b.wav']]) {
      project = await uploadDemo(created.id, name, await synthesizeSound(id))
      files[name] = project.assets.find(row => row.name === name)
    }
    setBusy('生成演示项目 · 合成配乐')
    project = await uploadDemo(created.id, 'demo-music.wav', await synthesizeMusic(24))
    files['demo-music.wav'] = project.assets.find(row => row.name === 'demo-music.wav')
    const uid = () => crypto.randomUUID()
    const clips = []
    const firstScene = 3.5
    let cursor = firstScene
    const media = (name, seconds, extra = {}) => {
      const asset = files[name]
      const duration = Math.min(seconds, asset.duration || seconds)
      clips.push({ id: uid(), type: name.endsWith('.mp4') ? 'video' : 'image', assetId: asset.id, title: name, start: cursor, duration, inPoint: 0, volume: 0, x: 0, y: 0, width: 1280, height: 720, fit: 'cover', trackId: 'video-main', ...extra })
      cursor += duration
    }
    media('aurora.jpg', 4, { keyframes: { scale: [{ t: 0, v: 1 }, { t: 4, v: 1.08 }] }, transitionIn: 'fade', transitionOut: 'dissolve', transitionDuration: .8, brightness: 100, contrast: 105, saturation: 106, vignette: 12 })
    media('poster.jpg', 4, { transitionIn: 'zoom-in', transitionOut: 'wipe-left', transitionDuration: .7, brightness: 102, contrast: 108, saturation: 118, vignette: 18 })
    media('v-aurora.mp4', 4, { transitionIn: 'wipe-left', transitionOut: 'slide-left', transitionDuration: .7, brightness: 98, contrast: 112, saturation: 108 })
    media('v-tide.mp4', 4, { transitionIn: 'slide-left', transitionOut: 'fade', transitionDuration: .8, brightness: 100, contrast: 104, saturation: 104, keyframes: { scale: [{ t: 0, v: 1.04 }, { t: 4, v: 1 }] } })
    const total = Math.ceil(cursor + 3.6)
    const text = fields => clips.push({ id: uid(), type: 'text', title: fields.title, start: fields.start, duration: fields.duration, x: 100, y: 240, width: 1080, fontSize: 56, fontWeight: 700, color: '#1c1c1c', align: 'center', lineHeight: 1.25, trackId: 'captions', layer: 20, ...fields })
    text({ title: '开场标题', text: '折纸钉住观点', start: .6, duration: 2.8, x: 640, y: 240, fontSize: 92, fontWeight: 800, color: '#1c1c1c', textAnim: 'rise', textAnimDuration: .9, trackId: 'titles-1' })
    text({ title: '英文副标题', text: 'Unfold the paper and settle the claim.', start: 1.3, duration: 2.1, x: 640, y: 380, fontSize: 30, fontWeight: 500, color: '#6b6458', textAnim: 'fade', textAnimDuration: .8 })
    text({ title: '说明字幕', text: '三步，把观点折进画面', start: firstScene + .3, duration: 3, x: 640, y: 560, width: 900, fontSize: 48, color: '#ffffff', boxColor: 'rgba(8,13,21,.55)', boxPadding: 18, textAnim: 'typewriter', textAnimDuration: 1, trackId: 'titles-2' })
    text({ title: '结尾卡', text: '关注我\n下一条更好', start: cursor + .6, duration: 3, x: 640, y: 260, fontSize: 76, fontWeight: 800, color: '#1c1c1c', lineHeight: 1.35, textAnim: 'zoom', textAnimDuration: .8, trackId: 'titles-3' })
    clips.push({ id: uid(), type: 'text', title: '贴纸 ✨', text: '✨', start: firstScene + .8, duration: 3, x: 920, y: 90, width: 240, fontSize: 130, align: 'center', color: '#ffffff', layer: 40, trackId: 'overlay', shadow: true, textAnim: 'pop', textAnimDuration: .6 })
    clips.push({ id: uid(), type: 'text', title: '贴纸 🔖', text: '🔖', start: firstScene + 8.5, duration: 2.5, x: 880, y: 110, width: 240, fontSize: 110, align: 'center', color: '#ffffff', layer: 40, trackId: 'overlay-2', shadow: true, textAnim: 'pop', textAnimDuration: .6 })
    clips.push({ id: uid(), type: 'audio', title: '演示配乐', assetId: files['demo-music.wav'].id, start: 0, duration: total, inPoint: 0, volume: .28, audioFade: 1.2, trackId: 'audio-music' })
    for (const [name, start] of [['demo-whoosh.wav', 7.3], ['demo-whoosh-b.wav', 15.3]]) clips.push({ id: uid(), type: 'audio', title: '转场音效', assetId: files[name].id, start, duration: 1.2, inPoint: 0, volume: .55, trackId: 'audio-music' })
    const demo = { ...project, title: '折纸钉住观点 · 演示', width: 1280, height: 720, fps: 30, duration: total, background: '#f8f6f1', tracks: [{id:'captions',name:'字幕',kind:'text'},{id:'video-main',name:'画面',kind:'visual'},{id:'overlay',name:'素材',kind:'visual'},{id:'overlay-1',name:'素材 1',kind:'visual',parentId:'overlay'},{id:'overlay-2',name:'素材 2',kind:'visual',parentId:'overlay'},{id:'titles',name:'文字',kind:'text',parentId:'overlay'},{id:'titles-1',name:'文字 1',kind:'text',parentId:'titles'},{id:'titles-2',name:'文字 2',kind:'text',parentId:'titles'},{id:'titles-3',name:'文字 3',kind:'text',parentId:'titles'},{id:'audio-music',name:'口播',kind:'audio'}], clips, demo: true, script: '折纸钉住观点\nUnfold the paper and settle the claim.\n三步，把观点折进画面。', notes: '演示项目：素材、转场、关键帧、调色、音乐、文字动画与代码剪辑。' }
    setBusy('生成演示项目 · 写入时间线')
    const saved = await editorRequest('save', { id: project.id, project: demo })
    localStorage.setItem(key, saved.id)
    let shown = saved
    try { shown = await editorRequest('waveforms', { id: saved.id }) } catch {}
    load(shown)
    select('')
    seek(1.2)
    log('演示项目已生成：' + clips.length + ' 个片段')
  })
  const makeHelpers = project => {
    const api = {
      uid: () => crypto.randomUUID(),
      log: (...args) => log(args.join(' ')),
      addText: (text, fields = {}) => {
        const clip = { id: crypto.randomUUID(), type: 'text', title: fields.title || String(text).slice(0, 12), text, start: fields.start ?? 0, duration: fields.duration ?? 3, x: 100, y: 300, width: project.width - 200, fontSize: 56, fontWeight: 700, color: '#1c1c1c', align: 'left', lineHeight: 1.3, trackId: 'captions', layer: 20, ...fields }
        project.clips.push(clip)
        return clip
      },
      addTitle: (text, fields = {}) => api.addText(text, { x: project.width / 2, y: 220, width: project.width - 200, fontSize: 84, fontWeight: 800, align: 'center', ...fields }),
      addSubtitle: (text, fields = {}) => api.addText(text, { x: project.width / 2, y: 350, width: project.width - 200, fontSize: 32, fontWeight: 500, align: 'center', ...fields }),
      setTransition: (clip, type, duration = .6) => { clip.transitionIn = type; clip.transitionDuration = duration; return clip },
      applyStyle: (clip, style) => { const row = COLOR_STYLES.find(item => item.id === style || item.name === style); if (row) Object.assign(clip, row.values); return clip },
      setKeyframes: (clip, channel, rows) => { clip.keyframes = { ...(clip.keyframes || {}), [channel]: rows }; return clip },
      trim: (clip, start, duration) => { clip.start = start; clip.duration = duration; return clip },
      setSpeed: (clip, speed) => { clip.speed = speed; return clip },
    }
    return api
  }
  const syncCode = () => { if (projectRef.current) { setCodeText(projectToCode(projectRef.current)); setCodeAuto(true) } }
  const openCode = () => { if (codeAuto || !codeText.trim()) syncCode(); setCodeMessage(''); setCodeOpen(true) }
  const runCode = async () => {
    setBusy('运行剪辑代码'); setError(''); setCodeMessage('')
    try {
      const draft = structuredClone(projectRef.current)
      const result = new Function('project', 'helpers', 'COLOR_STYLES', codeText)(draft, makeHelpers(draft), COLOR_STYLES)
      const next = result && result.clips ? result : draft
      next.clips = normalizeTimeline(next).clips
      validateEditor(next)
      change(() => next)
      await save()
      setCodeAuto(false)
      setCodeMessage('已应用：' + next.clips.length + ' 个片段，可在时间线检查。')
      log('代码剪辑已应用：' + next.clips.length + ' 个片段')
    } catch (error) {
      setCodeMessage('运行失败：' + error.message)
      setError(error.message)
    } finally { setBusy('') }
  }
  const aiEditCode = async () => {
    const ask = codePrompt.trim()
    if (!ask) return
    setCodePrompt('')
    setCodeMessage('阿杜正在按代码修改…')
    try {
      const result = await runCommand(`在剪辑代码层面修改并同步时间线。要求：${ask}\n\n当前代码：\n${codeText}`)
      setCodeMessage((result?.text || '已完成') + ' · 代码与时间线已同步')
    } catch (error) { setCodeMessage('阿杜没有完成修改：' + error.message) }
  }
  const copyCode = async () => {
    try { await navigator.clipboard.writeText(codeText); log('已复制剪辑代码') } catch (error) { report(error) }
  }
  const exportWorkspaceFolder = () => act('导出工程文件夹', async () => {
    const result = await editorRequest('export-workspace', { id: p.id })
    setWorkspaceFolder(result.folder)
    toast('已导出开放工程：' + result.folder)
    log('开放工程已导出：' + result.folder)
  })
  const openWorkspaceFolder = () => act('打开工程文件夹', async () => {
    const result = await editorRequest('open-workspace', { id: p.id, folder: workspaceFolder || undefined })
    if (result.folder) setWorkspaceFolder(result.folder)
    if (!result.opened) toast('工程文件夹：' + result.folder)
  })
  const syncWorkspaceFolder = () => act('同步工程文件夹', async () => {
    const saved = await editorRequest('import-workspace', {})
    localStorage.setItem(key, saved.id)
    load(saved); select(''); seek(0)
    toast('已从文件夹同步为新工程')
  })
  const runMep = async () => {
    setBusy('执行 MEP 工单'); setError(''); setMepMessage(''); setMepChanges([])
    let shouldRender = false
    try {
      const order = JSON.parse(mepText)
      const errors = validateOrder(order)
      if (errors.length) throw Error(errors.join('；'))
      const result = applyOrder(projectRef.current, order)
      validateEditor(result.project)
      change(() => result.project)
      await save()
      setMepChanges([...result.changes, ...result.warnings.map(text => '提示：' + text)])
      setMepMessage('已应用 ' + order.operations.length + ' 个操作 · ' + result.project.clips.length + ' 个片段')
      log('MEP 工单已应用：' + result.changes.length + ' 项变更')
      shouldRender = result.render
    } catch (error) {
      setMepMessage('执行失败：' + error.message)
      setError(error.message)
    } finally { setBusy('') }
    if (shouldRender) exportVideo()
  }
  const copyHandoff = async () => {
    const brief = [
      'ADu Director · Motion 工程交接',
      '工程：' + (p.title || '未命名工程'),
      '画幅：' + p.width + ' × ' + p.height + ' · ' + p.fps + ' fps · ' + p.duration + ' 秒',
      '片段：' + p.clips.length + ' 个 · 轨道：' + tracksOf(p).length + ' 条',
      script.trim() ? '本期文案：\n' + script.trim() : '',
      '请让助手先读取工程，再按当前时间线继续修改；完成后导出 MP4 并回传。',
    ].filter(Boolean).join('\n')
    try { await navigator.clipboard.writeText(brief); log('已复制工程交接说明，可交给第三方助手') } catch (error) { report(error) }
  }
  const exportVideo = () => act('开始导出', async () => {
    const value = await save()
    const job = await editorRequest('render', { id: value.id })
    setRender(job)
    log('导出已开始，使用工程 v' + value.revision)
  })
  const copyMep = async () => {
    const command = ['MEP 1.0', '工程：' + (p.title || '未命名制作'), '画幅：' + p.width + '×' + p.height + ' @ ' + p.fps + 'fps', '时长：' + p.duration + ' 秒', '片段：' + p.clips.length + ' 个', '轨道：' + tracksOf(p).map(track => track.name).join('、'), '请按 Motion 剪辑协议读取本工程并提交修改。'].join('\n')
    try { await navigator.clipboard.writeText(command); log('已复制 MEP 工程命令') } catch (error) { report(error) }
  }
  const sendAssistant = async () => {
    const text = assistantDraft.trim()
    if (!text || busy) return
    setAssistantDraft('')
    setAssistantMessages(rows => [...rows, { role: 'user', text }])
    try {
      const message = assistantMode === 'small' ? '小改：只做最小改动，保留现有剪辑结构。' + text : text
      const result = await runCommand(message)
      setAssistantMessages(rows => [...rows, { role: 'assistant', text: (result?.text || '已完成，可在时间线检查结果。') + ' 已同步到剪辑代码。' }])
    } catch (error) {
      setAssistantMessages(rows => [...rows, { role: 'assistant', text: error.message }])
    }
  }
  const oneClick = () => runCommand(`剪成 ${p.videoTargetDuration||30} 秒。${instruction}。自动剪辑全部导入视频，自动配乐和生成真实语音字幕`).catch(() => {})
  const subtitleOnly = () => runCommand('识别当前视频真实语音生成字幕，保留现有剪辑').catch(() => {})
  const rail = [
    ['media', '素材', 'film'], ['audio', '音频', 'music'], ['sfx', '音效', 'bolt'],
    ['stickers', '贴纸', 'smile'], ['text', '文本', 'text'],
  ]
  const audioAssets = p.assets.filter(asset => asset.kind === 'audio')
  return <section ref={workspace} className={'me me-studio'+(screening?' me-screening':'')} style={{'--me-upper':upperSize+'%'}} aria-label="Motion 创作工作区"><style>{css}</style>
    <input data-motion-upload hidden type="file" multiple accept=".mp4,.mov,.webm,.mkv,.png,.jpg,.jpeg,.webp,.gif,.mp3,.wav,.m4a,.aac,.srt" onChange={e=>{const files=[...e.target.files];e.target.value='';if(files.length)browserImport(files)}} />
    <input data-motion-folder hidden type="file" webkitdirectory="" directory="" multiple onChange={e=>{const files=[...e.target.files];e.target.value='';if(files.length){try{importFolder(files)}catch(error){report(error)}}}} />
    <input data-motion-project hidden type="file" accept=".motion" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)importMotionProject(file)}} />
    <input data-motion-replace hidden type="file" accept="image/*,video/*" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)replaceMedia(file)}} />
    {aiProposal && <div className="me-status" role="region" aria-label="AI 修改草案">
      <strong>AI 修改草案</strong>
      <ul>{aiProposal.rows.map(row=><li key={row.id}>{row.title} · {row.detail}</li>)}</ul>
      <button disabled={!!busy} onClick={()=>act('应用 AI 修改', async ()=>{
        if (projectRef.current !== aiProposal.before) {setAiProposal(null);throw Error('工程已变化，请重新生成修改草案')}
        change(aiProposal.next)
        setAiProposal(null)
        await save()
        syncCode()
      })}>应用修改</button>
      <button onClick={()=>setAiProposal(null)}>取消</button>
    </div>}
    {error && <p className="me-error" role="alert">{error}</p>}
    {busy && <p className="me-status" role="status">{busy}…</p>}
    {assistantMount && createPortal(<div className="me-assistant-controls"><h3>AI 导演 · 当前工程</h3><p className="me-assistant-selection">{clip ? `已选中：${clip.title} · ${timeLabel(clip.start)}` : `全片 · ${p.clips.filter(c=>c.type==='video').length} 个视频片段`}</p><button className="me-primary" disabled={!!busy || !hasVideo} onClick={()=>void runCommand(`剪成 ${p.videoTargetDuration||30} 秒。${instruction}。自动剪辑全部导入视频，自动配乐和生成真实语音字幕`).catch(()=>{})}>一键剪辑 · 配乐 · 字幕</button><div className="me-buttons"><button disabled={!!busy} onClick={()=>void runCommand('为当前成片自动配乐，保留现有剪辑').catch(()=>{})}>自动配乐</button><button disabled={!!busy} onClick={()=>void runCommand('识别当前视频真实语音生成字幕，保留现有剪辑').catch(()=>{})}>识别字幕</button></div><details><summary>制作设置与动画工具</summary><label>本期文案<textarea value={script} onChange={e => { setScript(e.target.value); setDirty(true) }} placeholder="可由灵感、内容直接分配，也可以自行填写" /></label>
      {hasVideo && <label>制作目标<select value={editingVideo?'video':'animation'} onChange={e=>change(old=>({...old,editTarget:e.target.value}))}><option value="video">按指示剪辑导入视频</option><option value="animation">生成动画 / 图文</option></select></label>}
      {editingVideo?<><label>剪辑目标时长（秒）<input type="number" min="3" max="600" value={p.videoTargetDuration||30} onChange={e=>change(old=>({...old,videoTargetDuration:Number(e.target.value)}))}/></label><label className="me-video-consent"><input type="checkbox" checked={p.allowVideoFrames===true} onChange={e=>change(old=>({...old,allowVideoFrames:e.target.checked}))}/>允许将低清关键帧发给已配置 AI 分析画面</label><p className="me-help">原视频保留本地。此模式只按导入视频与下方剪辑要求工作，不使用旧成稿的图片和文案。</p></>:<><label>视觉风格<select value={p.visualStyle || 'cinematic'} onChange={e => change(old => ({...old,visualStyle:e.target.value}))}><option value="cinematic">电影感图文叙事</option><option value="paper">纸面解说</option><option value="studio">简洁科技动效</option></select></label>
      <label>生成方式<select value={p.generationMode || 'designed'} onChange={e => change(old => ({...old,generationMode:e.target.value}))}><option value="designed">导演排版 · 素材优先</option><option value="free">自由编写 Canvas 代码</option></select></label></>}
      <label>{editingVideo?'这次怎么剪？':'这次想怎么制作？'}<textarea value={instruction} onChange={e => {setInstruction(e.target.value);change(old=>({...old,editInstruction:e.target.value}))}} placeholder={editingVideo?'例如：剪成30秒Vlog，去掉开头等待，保留动作变化和原声，加简洁标题。':'例如：做一个15秒科技宣传片，包含粒子、折线图和文字入场。选中动画后可单独重写。'} /></label>
      <button className="me-primary" disabled={!!busy} onClick={editingVideo?editVideo:generate}>{editingVideo?'按要求剪辑导入视频':clip?.type === 'animation' ? 'AI 重写选中动画' : 'AI 生成动画分镜'}</button>
      {!editingVideo && p.assets.some(a => a.sourceFile) && <p className="me-help">已关联 {p.assets.filter(a => a.sourceFile).length} 张成稿素材，用于图文构图。</p>}
      {liveCode && <details open={!!busy}><summary>AI 回答 · 已收到 {liveCode.length} 字符</summary><pre className="me-answer">{liveCode}</pre></details>}
      <p className="me-help">导入一次即可持续使用。选中轨道片段后，在下方对话框提出局部修改。</p>
      <button disabled={!!busy} onClick={() => act('导入素材', async () => { await save(); const value = await editorRequest('import', { id: p.id }); load(value); log('素材已导入时间线') })}>＋ 视频 / 图片 / 音频 / SRT</button>
      <div className="me-buttons"><button onClick={() => add('animation')}>＋ 动画代码</button><button onClick={() => add('text')}>＋ 字幕标题</button></div>
      <label>字幕翻译<select value={language} onChange={e => setLanguage(e.target.value)}>{['英语', '简体中文', '日语', '韩语', '西班牙语', '法语'].map(l => <option key={l}>{l}</option>)}</select></label>
      <button disabled={!!busy || !p.clips.some(c => ['text','animation'].includes(c.type))} onClick={() => act('翻译画面文字', async () => { const value = await editorRequest('translate', { project: p, language }); change(old => ({ ...old, clips: value.clips })); log('画面与字幕已翻译为' + language) })}>AI 翻译画面与字幕</button>
      {voices.length > 0 && <><label>本机配音<select value={voice} onChange={e => setVoice(e.target.value)}>{voices.map(v => <option key={v.name} value={v.name}>{v.name} · {v.culture}</option>)}</select></label><button disabled={!!busy || !script.trim()} onClick={() => act('生成文案配音', async () => { await save(); const value = await editorRequest('speech', { id:p.id, voice, text:script }); load(value); log('配音已加入音轨，可裁剪和调音量') })}>本期文案生成配音</button></>}
      </details><details open={!!busy}><summary>制作过程 · {events.length}</summary>{events.length ? events.map((row, i) => <p key={i}><small>{row.time}</small> {row.text}</p>) : <p>生成、导入和导出过程会显示在这里。</p>}</details>
    </div>,assistantMount)}
    <header className={'me-appbar'+(IS_ELECTRON?' is-electron':'')}>
      <div className="me-appbar-left">
        <button type="button" className="me-appbar-back" aria-label="返回工作台" title="返回工作台" onClick={()=>act('保存并返回', async()=>{if(dirty)await save();onClose()})}><Icon name="chevL" size={16}/></button>
        <input className="me-appbar-title" aria-label="工程名称" value={p.title} onChange={e=>change(old=>({...old,title:e.target.value}))}/>
      </div>
      <div className="me-appbar-center"><button type="button" className="me-appbar-cta" disabled={!!busy} onClick={()=>act('用模板创建副本', async()=>{await save();const copy=await editorRequest('copy-project',{id:p.id});load(copy);localStorage.setItem(key,copy.id);select('');seek(0);toast('已创建可编辑副本')})}><Icon name="spark" size={14}/>用这套模板做我的视频</button></div>
      <div className="me-appbar-right">
        <details className="me-appbar-menu"><summary>素材 <Icon name="chevD" size={10}/></summary><div className="me-appbar-menu-list" onClick={e=>{if(e.target.closest('button'))e.currentTarget.closest('details').open=false}}><button type="button" onClick={chooseMedia}><Icon name="upload" size={12}/>导入图片 / 视频</button><button type="button" onClick={chooseFolder}><Icon name="folder" size={12}/>引用文件夹</button><button type="button" onClick={()=>{setLibraryTab('text');setShowMedia(true)}}><Icon name="text" size={12}/>文字模板</button><button type="button" onClick={()=>{setLibraryTab('stickers');setShowMedia(true)}}><Icon name="smile" size={12}/>贴纸</button><button type="button" onClick={()=>{setLibraryTab('audio');setShowMedia(true)}}><Icon name="music" size={12}/>音频</button><button type="button" onClick={()=>{setLibraryTab('sfx');setShowMedia(true)}}><Icon name="bolt" size={12}/>音效</button></div></details>
        <button type="button" className="me-appbar-icon" aria-label="撤销" title="撤销" disabled={!!busy||!history.current.undo.length} onClick={()=>undo('undo')}><Icon name="undo" size={14}/></button>
        <button type="button" className="me-appbar-icon" aria-label="重做" title="重做" disabled={!!busy||!history.current.redo.length} onClick={()=>undo('redo')}><Icon name="refresh" size={14}/></button>
        <button type="button" className="me-appbar-link" onClick={()=>{if(canvasMenu.current)canvasMenu.current.open=true}}>更多 <Icon name="chevD" size={10}/></button>
        <button type="button" className="me-appbar-export" disabled={!!busy||render?.state==='rendering'} onClick={exportVideo}>导出</button>
      </div>
    </header>
    <div className={'me-workarea'+(!showMedia?' no-media':'')+(!showInspector?' no-inspector':'')}>
      <aside className="me-library" hidden={!showMedia} onDragOver={e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault()}} onDrop={e=>{if(e.dataTransfer.files.length){e.preventDefault();if(!busy)browserImport([...e.dataTransfer.files])}}}>
        <div className="me-library-tabs" role="tablist" aria-label="素材类型">
          {rail.map(([id,label,icon])=><button key={id} role="tab" aria-selected={libraryTab===id} onClick={()=>{setLibraryTab(id);setShowMedia(true)}}><Icon name={icon} size={13}/>{label}</button>)}
        </div>
        {libraryTab==='media'&&<>
          <div className="me-library-content" ref={setMediaMount}/>
          <div className="me-library-foot"><button disabled={!!busy} onClick={chooseFolder}><Icon name="chevD" size={12}/> 引用文件夹</button><span className="me-library-foot-spacer"/><button disabled={!!busy} onClick={chooseMedia}><Icon name="folder" size={13}/> 添加</button></div>
        </>}
        {libraryTab==='audio'&&<>
          <div className="me-library-content"><div className="me-preset-list">
            {audioAssets.map(asset=><article key={asset.id}><div><strong>{asset.name}</strong><small>{timeLabel(asset.duration)}</small></div><div className="me-preset-actions"><button disabled={!!busy} onClick={()=>change(old=>addMediaClip(old,asset.id,time))}>插入播放头</button><button disabled={!!busy} onClick={()=>change(old=>addMediaClip(old,asset.id,Math.max(0,...old.clips.filter(c=>clipKind(c)==='audio').map(c=>c.start+c.duration))))}>追加</button></div></article>)}
            {!audioAssets.length&&<p className="me-library-empty">导入音乐、配音或录音后，可插入音轨。</p>}
          </div></div>
          <div className="me-library-foot"><span className="me-help">共 {audioAssets.length} 条音频</span><span className="me-library-foot-spacer"/><button disabled={!!busy} onClick={chooseMedia}><Icon name="folder" size={13}/> 添加</button></div>
        </>}
        {libraryTab==='sfx'&&<>
          <div className="me-library-content"><div className="me-preset-grid">{SOUND_EFFECTS.map(sound=><button key={sound.id} className="me-preset-card" disabled={!!busy} onClick={()=>addSound(sound)}><Icon name="volume" size={17}/><strong>{sound.name}</strong><small>{sound.hint}</small></button>)}</div></div>
          <div className="me-library-foot"><span className="me-help">点击加入播放头，可自由裁剪与调音量。</span></div>
        </>}
        {libraryTab==='stickers'&&<>
          <div className="me-library-content"><div className="me-sticker-grid">{STICKERS.map(emoji=><button key={emoji} disabled={!!busy} onClick={()=>addSticker(emoji)} aria-label={'添加贴纸 '+emoji}>{emoji}</button>)}</div></div>
          <div className="me-library-foot"><span className="me-help">点击贴纸加入画面。</span></div>
        </>}
        {libraryTab==='text'&&<>
          <div className="me-library-content"><div className="me-preset-list">{TEXT_PRESETS.map(preset=><article key={preset.id}><div><strong>{preset.name}</strong><small>{preset.hint}</small></div><div className="me-preset-actions"><button disabled={!!busy} onClick={()=>addTextPreset(preset)}>加入播放头</button></div></article>)}</div></div>
          <div className="me-library-foot"><span className="me-help">选择样式后可在右侧属性里改字。</span></div>
        </>}
      </aside>
      <main className="me-stage">
      <div className={'me-preview'+(previewFit==='fit'?'':' me-preview-inset')} style={{ aspectRatio: `${p.width}/${p.height}`, '--me-project-ratio': p.width / p.height, '--me-monitor-size': previewFit === 'fit' ? '100' : previewFit }}><div className="me-canvas-frame"><iframe title="动画实时预览" ref={iframe} sandbox="allow-scripts" srcDoc={html} onLoad={() => iframe.current?.contentWindow?.postMessage({ type: 'motion-editor-seek', token, time }, '*')} /><div className="me-canvas-hit" onPointerDown={pickCanvas} />{guides && <div className="me-preview-guides" aria-hidden="true" />}{selStyle&&<div className="me-canvas-select" style={selStyle} onPointerDown={moveSel} title="拖动移动位置"><i className="is-rotate" onPointerDown={startRotate} title="拖动旋转"/>{['nw','n','ne','e','se','s','sw','w'].map(pos=><i key={pos} className={'is-'+pos} onPointerDown={e=>startResize(e,pos)}/>)}</div>}</div><button type="button" className="me-makeof" onClick={()=>setTourOpen(true)}><Icon name="film" size={14}/>看它是怎么做出来的</button><details className="me-canvas-menu" ref={canvasMenu}><summary aria-label="项目菜单" title="项目菜单">更多</summary><div className="me-canvas-menu-list" onClick={e=>{if(e.target.closest('button'))e.currentTarget.closest('details').open=false}}>
<button type="button" disabled={!!busy} onClick={()=>act('保存工程', async()=>{await save();toast('已保存到本地')})}>保存</button>
<button type="button" disabled={!!busy||render?.state==='rendering'} onClick={exportVideo}>导出 MP4</button>
<button type="button" onClick={openCode}>代码剪辑</button>
<button type="button" onClick={()=>setMepOpen(true)}>MEP 工单</button>
<span className="me-menu-sep"/>
<button type="button" disabled={!!busy} onClick={exportWorkspaceFolder}>导出开放工程</button>
<button type="button" disabled={!!busy} onClick={openWorkspaceFolder}>打开工程文件夹</button>
<button type="button" disabled={!!busy} onClick={syncWorkspaceFolder}>从文件夹同步</button>
<span className="me-menu-sep"/>
<button type="button" disabled={!!busy} onClick={()=>act('新建工程', async()=>{if(dirty)await save();const value=await editorRequest('create');load(value);localStorage.setItem(key,value.id);select('');setRender(null);seek(0)})}>新建工程</button>
<button type="button" disabled={!!busy} onClick={()=>workspace.current.querySelector('input[data-motion-project]').click()}>导入 .motion</button>
<button type="button" disabled={!!busy} onClick={createDemo}>生成演示项目</button>
<select aria-label="打开本地工程" value="" disabled={!!busy} onFocus={()=>editorRequest('list').then(result=>setProjects(result.rows)).catch(()=>{})} onChange={e=>{const id=e.target.value;if(id)act('打开工程', async()=>{if(dirty)await save();const value=await editorRequest('read',{id});load(value);setScript(value.script||'');localStorage.setItem(key,id);select('');seek(0)})}}><option value="">打开本地工程…</option>{projects.map(project=><option key={project.id} value={project.id}>{project.title} · v{project.revision}</option>)}</select>
<span className="me-menu-sep"/>
<button type="button" disabled={!!busy||!hasVideo} onClick={oneClick}>一键成片</button>
<button type="button" disabled={!!busy} onClick={subtitleOnly}>识别字幕</button>
<button type="button" onClick={()=>setScreening(!screening)}>{screening?'退出放映':'放映'}</button>
<button type="button" disabled={!!busy} onClick={()=>act('保存并返回', async()=>{if(dirty)await save();onClose()})}>返回工作台</button>
</div></details></div>
      {!!frameErrors.length && <p className="me-error" role="alert">预览：{frameErrors.join('；')}</p>}
      {!p.clips.length && <div className="me-empty"><strong>还没有画面</strong><p>把口播拖到下方时间线，再点上方「AI 一键成片」。</p><div className="me-empty-actions"><button type="button" className="me-primary" disabled={!!busy} onClick={createDemo}>生成演示项目</button><button type="button" disabled={!!busy} onClick={chooseMedia}>导入素材</button></div></div>}
      <div className="me-transport"><div className="me-transport-left"><output>{frameTime(time,p.fps)}</output><span className="me-fps">{p.fps} fps</span><button aria-pressed={guides} onClick={()=>setGuides(!guides)}>参考线</button><select aria-label="预览尺寸" value={previewFit} onChange={e=>setPreviewFit(e.target.value)}><option value="fit">适应</option><option value="75">75%</option><option value="50">50%</option><option value="25">25%</option></select><button aria-pressed={mutedPreview} onClick={()=>setMutedPreview(!mutedPreview)}>{mutedPreview?'恢复监听':'静音监听'}</button></div><div className="me-play-controls"><button aria-label="上一个剪辑点" title="上一个剪辑点" onClick={()=>{play(false);seek(adjacentCut(p,time,-1))}}>Ⅰ‹</button><button aria-label="上一帧" title="上一帧" onClick={()=>{play(false);seek(Math.max(0,time-1/p.fps))}}>‹</button><button className="me-play" aria-label={playing?'暂停':'播放'} title="空格播放 / 暂停" onClick={()=>play(!playing)}>{playing?'Ⅱ':<Icon name="play" size={15}/>}</button><button aria-label="下一帧" title="下一帧" onClick={()=>{play(false);seek(Math.min(p.duration,time+1/p.fps))}}>›</button><button aria-label="下一个剪辑点" title="下一个剪辑点" onClick={()=>{play(false);seek(adjacentCut(p,time,1))}}>›Ⅰ</button></div><div className="me-transport-right"><output>{frameTime(p.duration,p.fps)}</output><button type="button" aria-label="导出当前帧封面" title="导出当前帧封面" onClick={downloadCover}><Icon name="image" size={14}/></button><button aria-label="全屏预览" title="全屏预览" onClick={()=>iframe.current?.closest('.me-preview')?.requestFullscreen?.()}><Icon name="expand" size={14}/></button></div></div><input className="me-preview-seek" aria-label="预览进度" type="range" min="0" max={p.duration} step={1/p.fps} value={time} onChange={e=>{play(false);seek(Number(e.target.value))}}/>

      {editingVideo && p.editSummary && <details><summary>本次剪辑方案</summary><p>{p.editSummary}</p></details>}
      {(p.clips.filter(c => ['audio', 'video'].includes(c.type) && p.assets.find(a => a.id === c.assetId)?.hasAudio)).map(c => <audio hidden key={c.id} ref={el => { audio.current[c.id] = el }} src={p.previewUrls?.[c.assetId]} preload="metadata" />)}
      {render && <div className="me-output">{render.state === 'rendering' ? <><progress value={render.progress || 0} max="100" /> 正在逐帧渲染，v{render.revision} · {render.progress || 0}%</> : render.state === 'failed' ? <p className="me-error">{render.error}</p> : <><h3>已导出 · 工程 v{render.revision}</h3><video controls src={`media-desk/motion-editor/${p.id}/${render.id}/video.mp4`} /><a download={`${p.title}.mp4`} href={`media-desk/motion-editor/${p.id}/${render.id}/video.mp4`}>下载成片 MP4 ↓</a></>}</div>}
    </main><aside className="me-inspector" hidden={!showInspector}><div className="me-panel-title me-side-switch" role="group" aria-label="右侧工具">
      <button aria-pressed={inspectorTab==='properties'} onClick={()=>setDesk({motionInspectorTab:'properties'})}>属性</button>
      <button aria-pressed={inspectorTab==='assistant'} onClick={showAssistant}>阿杜</button>
    </div><div className="me-properties" hidden={inspectorTab!=='properties'}>{!clip&&<div className="me-project-settings">
<label>名称<input aria-label="工程名称" value={p.title} onChange={e=>change(old=>({...old,title:e.target.value}))}/></label>
<label>画幅<select aria-label="画幅" value={`${p.width}x${p.height}`} onChange={e=>{const [width,height]=e.target.value.split('x').map(Number);change(old=>({...old,width,height}))}}>{[['1280x720','16:9 横屏'],['720x1280','9:16 竖屏'],['1080x1080','1:1 方形'],['810x1080','3:4'],['1920x1080','1080p 横屏']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
<label>时长<input aria-label="工程时长" type="number" min="1" max="600" value={p.duration} onChange={e=>{const duration=Number(e.target.value);if(duration>=1&&duration<=600&&p.clips.every(c=>c.start+c.duration<=duration))change(old=>({...old,duration}))}}/></label>
<label>帧率<select aria-label="帧率" value={p.fps} onChange={e=>change(old=>({...old,fps:Number(e.target.value)}))}>{[24,25,30,60].map(f=><option key={f} value={f}>{f} fps</option>)}</select></label>
<label>背景<input aria-label="画布背景色" type="color" value={p.background||'#080d15'} onChange={e=>change(old=>({...old,background:e.target.value}))}/></label>
</div>}<MotionInspector project={p} clip={clip} time={time} patch={patch} change={change} onSelect={select} onAsk={askClip} onReplace={()=>workspace.current?.querySelector('input[data-motion-replace]')?.click()}/></div>
    <div className="me-assistant-pane" hidden={inspectorTab!=='assistant'}>
      <div className="me-assistant-scroll">
        <header className="me-assistant-head"><button type="button" aria-label="展开阿杜面板" title="展开更多制作工具" onClick={()=>{if(assistantMore.current)assistantMore.current.open=true}}><Icon name="expand" size={13}/></button></header>
        <section className="me-assistant-card">
          <h4>直接和阿杜对话</h4>
          <p>在下方输入消息，直接发送给阿杜。</p>
          <button type="button" className="me-assistant-action" onClick={()=>assistantInput.current?.focus()}><Icon name="chat" size={13}/>开始对话</button>
        </section>
        <section className="me-assistant-code-card">
          <h4><Icon name="pen" size={12}/>阿杜 × 代码</h4>
          <p>阿杜的每次修改都会写回同一份剪辑代码；你也可以手改代码，运行时时间线同步更新。</p>
          <button type="button" onClick={openCode}>打开剪辑代码 · {p.clips.length} 个片段</button>
          <pre className="me-code-preview">{projectToCode(p).split('\n').slice(4, 9).join('\n')}</pre>
        </section>
        {assistantMessages.length > 0 && <div className="me-assistant-log" role="log" aria-label="和阿杜的对话">{assistantMessages.map((row, index) => <p key={index} className={'is-' + row.role}><small>{row.role === 'user' ? '你' : '阿杜'}</small>{row.text}{row.role === 'assistant' && <button type="button" className="me-log-code" onClick={openCode}>查看同步的代码</button>}</p>)}</div>}
        <details className="me-assistant-more" ref={assistantMore}><summary>更多制作工具</summary>        <section className="me-assistant-card">
          <h4>交给第三方助手</h4>
          <p>复制工程命令，粘贴到 Codex、Claude Code 等助手的对话里。助手按 MEP（Motion 剪辑协议）提交修改。</p>
          <div className="me-assistant-apps">{['Claude','Cursor','Codex','DeepSeek','即梦','Kimi','Grok','Trae','豆包'].map(name=><span key={name} title={name} data-app={name}>{name.slice(0,1)}</span>)}</div>
          <div className="me-assistant-actions"><button type="button" onClick={copyMep}>MEP</button><button type="button" onClick={copyHandoff}><Icon name="copy" size={13}/>复制命令</button></div>
        </section>
<div className="me-assistant-chat"><ChatDock embedded /></div></details>
      </div>
      <form className="me-assistant-compose" onSubmit={event => { event.preventDefault(); sendAssistant() }}>
        <textarea ref={assistantInput} value={assistantDraft} rows={2} placeholder="给阿杜发消息…" onChange={event => setAssistantDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendAssistant() } }} />
        <div className="me-assistant-compose-foot"><button type="button" className={'me-assistant-mode'+(assistantMode==='small'?' is-on':'')} onClick={()=>setAssistantMode(assistantMode==='small'?'auto':'small')}>小改</button><select aria-label="修改模式" value={assistantMode} onChange={event => setAssistantMode(event.target.value)}><option value="auto">自动</option><option value="small">小改</option></select><button type="submit" className="me-assistant-send" aria-label="发送" disabled={!!busy || !assistantDraft.trim()}><Icon name="send" size={14}/></button></div>
      </form>
    </div></aside></div>
    <div className="me-divider" role="separator" tabIndex="0" aria-label="调整预览与时间线高度" aria-orientation="horizontal" aria-valuemin={32} aria-valuemax={70} aria-valuenow={Math.round(upperSize)} onPointerDown={resizeWorkspace} onKeyDown={e=>{if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();setUpperSize(n=>Math.max(32,Math.min(70,n+(e.key==='ArrowUp'?-3:3))))}}}><span/></div>
    <div id="motion-free-timeline"><MotionTimeline onAsk={askClip} mediaMount={mediaMount} externalMedia project={p} selected={selected} onSelect={id=>{
      select(id)
      const picked=p.clips.find(clip=>clip.id===id)
      if(!picked)return
      setShowInspector(true)
      setDesk({motionInspectorTab:'properties'})
      if(time<picked.start || time>=picked.start+picked.duration){play(false);seek(picked.start)}
    }} time={time} onSeek={seek} playing={playing} onPlay={play} zoom={zoom} onZoom={setZoom} onChange={change}
      onPreview={value=>{setGesture(true);const next={...value,revision:Math.max(value.revision,projectRef.current.revision)};projectRef.current=next;setProject(next)}}
      onCommit={(original,value)=>{if(original===value){setGesture(false);return}history.current.undo.push(original);history.current.redo=[];const next={...value,revision:Math.max(value.revision,projectRef.current.revision)};projectRef.current=next;setProject(next);setGesture(false);setDirty(true);historyChanged(n=>n+1)}}
      onUndo={()=>undo('undo')} onRedo={()=>undo('redo')} canUndo={!!history.current.undo.length} canRedo={!!history.current.redo.length} busy={!!busy}
      onImport={chooseMedia}
      onThumbnails={()=>act('生成视频缩略图',async()=>{await save();load(await editorRequest('thumbnails',{id:p.id}));log('真实视频缩略图已生成')})}
      onWaveforms={()=>act('读取音频波形',async()=>{await save();load(await editorRequest('waveforms',{id:p.id}))})}
    /></div>
    {mepOpen && <Dialog title="MEP 工单" width={760} onClose={()=>setMepOpen(false)}>
      <div className="me-code-editor">
        <p className="me-help">提交一份差异工单，由本地执行器应用并校验；支持 setProject / addText / addClip / removeClip / trim / move / setText / setTransition / applyStyle / setKeyframes / setSpeed / setVolume / addMarker / render。</p>
        {workspaceFolder && <p className="me-workspace-note">当前开放工程：{workspaceFolder}</p>}
        <textarea spellCheck="false" aria-label="MEP 工单" value={mepText} onChange={event=>setMepText(event.target.value)} />
        <div className="me-code-actions"><button type="button" onClick={()=>setMepText(JSON.stringify(MEP_EXAMPLE,null,2))}>插入示例</button><button type="button" onClick={()=>navigator.clipboard.writeText(mepText).then(()=>log('已复制 MEP 工单')).catch(report)}>复制</button><span className="me-code-spacer"/><button type="button" className="me-primary" disabled={!!busy} onClick={runMep}>运行工单</button></div>
        {mepMessage && <p className="me-help" role="status">{mepMessage}</p>}
        {mepChanges.length > 0 && <ul className="me-mep-changes">{mepChanges.map((text,index)=><li key={index}>{text}</li>)}</ul>}
      </div>
    </Dialog>}
    {tourOpen && <Dialog title="它是怎么做出来的" width={760} onClose={()=>setTourOpen(false)}>
      <div className="me-tour">
        <section><h3>1 · 素材</h3><p>{p.assets.length} 个素材，左侧「素材」可以拖入轨道、预览和替换。</p><div className="me-tour-assets">{p.assets.slice(0, 10).map(asset => <span key={asset.id}>{asset.name}</span>)}</div></section>
        <section><h3>2 · 时间线</h3><p>{p.clips.length} 个片段 · {tracksOf(p).length} 条轨道 · {p.duration} 秒。拖动片段改时间，拖两端裁剪，右键可分割。</p><ul>{p.clips.slice(0, 8).map(clip => <li key={clip.id}><b>{clip.title || clip.type}</b><span>{clip.start.toFixed(1)}s → {(clip.start + clip.duration).toFixed(1)}s</span></li>)}</ul></section>
        <section><h3>3 · 动效与调色</h3><p>转场 {p.clips.filter(clip => clip.transitionIn || clip.transitionOut).length} 个 · 关键帧 {p.clips.filter(clip => clip.keyframes && Object.keys(clip.keyframes).length).length} 个 · 文字动画 {p.clips.filter(clip => clip.textAnim).length} 个 · 配乐 {p.clips.filter(clip => clip.type === 'audio').length} 段。</p><p>选中片段后，在右侧「画面 / 文字」属性里继续调整；所有效果预览和导出共用同一渲染器。</p></section>
        <section><h3>4 · 用代码剪视频</h3><p>下面这段代码就是示例做法：给所有画面套用转场和风格，再加一个标题。</p><pre>{CODE_EXAMPLE}</pre><div className="me-tour-actions"><button type="button" onClick={copyCode}>复制代码</button><button type="button" className="me-primary" onClick={()=>{setTourOpen(false);setCodeOpen(true)}}>打开代码剪辑</button></div></section>
      </div>
    </Dialog>}
    {codeOpen && <Dialog title="代码剪视频" width={780} onClose={()=>setCodeOpen(false)}>
      <div className="me-code-editor">
        <p className="me-help">直接修改 project.clips。可用 helpers.addText / addTitle / addSubtitle / setTransition / applyStyle / setKeyframes / trim / setSpeed。运行前会自动校验工程。</p>
        <div className="me-code-ai"><input aria-label="让阿杜改代码" value={codePrompt} placeholder="告诉阿杜怎么改这段代码，例如：标题改成…" onChange={event=>setCodePrompt(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();aiEditCode()}}}/><button type="button" disabled={!!busy||!codePrompt.trim()} onClick={aiEditCode}>让阿杜改</button></div>
        <textarea spellCheck="false" aria-label="剪辑代码" value={codeText} onChange={event=>{setCodeAuto(false);setCodeText(event.target.value)}} />
        <div className="me-code-actions"><button type="button" onClick={()=>{setCodeAuto(false);setCodeText(CODE_EXAMPLE)}}>插入示例</button><button type="button" onClick={syncCode}>载入当前工程代码</button><button type="button" onClick={copyCode}>复制</button><span className="me-code-spacer"/><button type="button" className="me-primary" disabled={!!busy} onClick={runCode}>运行并应用</button></div>
        <p className="me-help">阿杜的 AI 修改会自动写回这份代码；你手改代码并运行后，时间线与预览同步更新。</p>
        {codeMessage && <p className="me-help" role="status">{codeMessage}</p>}
      </div>
    </Dialog>}
  </section>
}

function MotionSceneList({ project, selected, time, onChoose }) {
  const scenes = project.clips
    .filter(clip => ['video', 'image', 'animation'].includes(clip.type))
    .sort((a, b) => a.start - b.start || a.layer - b.layer)
  return <section className="me-scene-list" aria-label="镜头顺序">
    {scenes.length === 0 && <p>添加画面后，可在这里逐镜头预览和编辑。</p>}
    <ol>{scenes.map(scene => <li key={scene.id}>
      <button aria-pressed={selected === scene.id} onClick={() => onChoose(scene)}>
        <strong>{scene.title || '未命名镜头'}</strong>
        <small>{timeLabel(scene.start)} – {timeLabel(scene.start + scene.duration)}
          {time >= scene.start && time < scene.start + scene.duration ? ' · 播放位置' : ''}</small>
      </button>
    </li>)}</ol>
  </section>
}
