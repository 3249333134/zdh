import React from 'react'
import { createPortal } from 'react-dom'
import { setDesk, useDesk } from './desk.js'
import { applyMotionOperations } from '../src/motion-operations.js'
import { editorDocument, validateEditor } from '../src/motion-editor.js'
import { normalizeTimeline,resolveTimeline,tracksOf,trackId,clipKind,locked,linkedIds,moveTimeline,trimTimeline,deleteTimeline,duplicateTimeline } from '../src/motion-timeline.js'
import { MotionTimeline } from './motion-timeline.jsx'
import css from './motion-editor.css'
import { MotionInspector } from './motion-inspector.jsx'
import { Icon } from './ui.jsx'
import { frameTime,adjacentCut } from '../src/motion-editor-tools.js'
import { MotionTemplatePanel } from './motion-template-panel.jsx'

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
  const [projects, setProjects] = React.useState([])
  const [liveCode, setLiveCode] = React.useState('')
  const [voices, setVoices] = React.useState([]), [voice, setVoice] = React.useState('')
  const [gesture,setGesture]=React.useState(false)
  const [screening,setScreening]=React.useState(false)
  const [libraryTab,setLibraryTab]=React.useState(initialTemplateId?'templates':'media'),[templateSelection,setTemplateSelection]=React.useState(initialTemplateId||'626-16x9'),[templateJob,setTemplateJob]=React.useState('')
  const [mediaMount,setMediaMount]=React.useState(null),[showMedia,setShowMedia]=React.useState(true),[showInspector,setShowInspector]=React.useState(true)
  const [upperSize,setUpperSize]=React.useState(52)
  const workspace=React.useRef(null)
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
  projectRef.current = p
  scriptRef.current = script
  const log = text => setEvents(rows => [...rows, { time: new Date().toLocaleTimeString(), text }].slice(-30))
  const act = async (name, fn) => { setBusy(name); setError(''); play(false); try { return await fn() } catch (e) { setError(e.message); log('操作未完成：' + e.message); return {error:e.message} } finally { setBusy('') } }
  const load = value => { const normalized=normalizeTimeline(value);projectRef.current = normalized; setProject(normalized); setInstruction(value.editInstruction||''); setDirty(!value.tracks||JSON.stringify(normalized.clips)!==JSON.stringify(value.clips)); setRender(value.renders?.[0] || null); history.current = { undo: [], redo: [] }; historyChanged(n => n + 1) }
  React.useEffect(() => {
    let live = true
    const id = localStorage.getItem(key)
    ;(id ? editorRequest('read', { id }) : editorRequest('create')).then(value => { if (live) { load(value); if (!sourceScript) setScript(value.script || ''); localStorage.setItem(key, value.id) } }).catch(e => { if (live) setError(e.message) })
    editorRequest('list').then(result => { if (live) setProjects(result.rows) }).catch(() => {})
    editorRequest('voices').then(result => { if (live) { setVoices(result.voices); setVoice(result.voices[0]?.name || '') } }).catch(() => {})
    return () => { live = false }
  }, [key])
  React.useEffect(() => {
    const listener = event => { if (event.source === iframe.current?.contentWindow && event.data?.token === token && event.data.type === 'motion-editor-frame') setFrameErrors(event.data.errors || []) }
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
    for (const clip of p ? resolveTimeline(p).clips : []) {
      const element = audio.current[clip.id]; if (!element) continue
      const active = time >= clip.start && time < clip.start + clip.duration
      const fade=Math.min(clip.audioFade||0,clip.duration/2),local=time-clip.start
      element.volume = Math.max(0,Math.min(1,(clip.volume??1)*(fade?Math.min(1,local/fade,(clip.duration-local)/fade):1)))
      if (!playing || !active || !(clip.volume ?? 1)) element.pause()
      else { const target = time - clip.start + (clip.inPoint || 0); if (Math.abs(element.currentTime - target) > .25) element.currentTime = target; element.play().catch(() => {}) }
    }
  }, [time, playing, p])
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
  const askClip=c=>{select(c.id);setDesk({dockOpen:true,chatDraft:`只修改选中片段「${c.title}」：`});log('已将选中片段交给侧边助手')}
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
  const assistantMount=useDesk(s=>s.motionAssistantMount)
  const commandRef=React.useRef(null),commandBusy=React.useRef(false)
  React.useEffect(()=>{setDesk({motionBusy:busy});return()=>setDesk({motionBusy:''})},[busy])
  React.useEffect(()=>{if(!p)return;setDesk({motionController:{projectId:p.id,execute:message=>commandRef.current(message)},dockOpen:true});return()=>setDesk({motionController:null})},[p?.id])
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
      if(plan.task==='operations') {change(applyMotionOperations(projectRef.current,plan.operations,selected));await save();log('片段修改已完成，可在轨道中撤销');return {text:'已完成片段修改。'+(plan.reply||'')+' 其他片段保持原样，可在时间线撤销。'}}
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
      return {text:'已完成。'+(projectRef.current.subtitleSummary||'')+' 配乐、字幕与视频均保留在可编辑轨道中，可选中某一片段继续提出修改。'}
    }catch(e){setError(e.message);log('操作未完成：'+e.message);throw e}
    finally{commandBusy.current=false;setBusy('')}
  }
  commandRef.current=runCommand
  return <section ref={workspace} className={'me me-studio'+(screening?' me-screening':'')} style={{'--me-upper':upperSize+'%'}} aria-label="Motion 创作工作区"><style>{css}</style>
    <header className="me-head"><div><button onClick={() => act('保存并返回', async () => { if (dirty) await save(); onClose() })}>← 模板中心</button><strong>Motion · 剪辑工作区</strong><div className="me-mode-switch" role="group" aria-label="编辑视图"><button aria-pressed={!screening} onClick={()=>setScreening(false)}>剪辑</button><button aria-pressed={screening} onClick={()=>setScreening(true)}>放映</button></div><span>{dirty ? '有未保存修改' : '已保存到本地'} · v{p.revision}</span></div><div>
      <select aria-label="打开本地工程" value="" disabled={!!busy} onFocus={() => editorRequest('list').then(result => setProjects(result.rows)).catch(() => {})} onChange={e => { const id = e.target.value; if (id) act('打开工程', async () => { if (dirty) await save(); const value = await editorRequest('read', { id }); load(value); setScript(value.script || ''); localStorage.setItem(key, id); select(''); seek(0) }) }}><option value="">打开本地工程…</option>{projects.map(project => <option key={project.id} value={project.id}>{project.title} · v{project.revision}</option>)}</select>
      <button disabled={!!busy} onClick={() => act('新建工程', async () => { if (dirty) await save(); const value = await editorRequest('create'); load(value); localStorage.setItem(key, value.id); select(''); setRender(null); seek(0) })}>新建</button>
      <button disabled={!!busy} onClick={() => act('保存工程', save)}>保存工程</button>
      <button disabled={!!busy} onClick={()=>act('导入视频',async()=>{await save();load(await editorRequest('import',{id:p.id}));setDesk({dockOpen:true});log('素材已导入，可在助手中一键剪辑、配乐和字幕')})}>＋ 导入视频 / 多个素材</button><button onClick={()=>setDesk({dockOpen:true})}>AI 助手</button>
      <button aria-pressed={libraryTab==='templates'&&showMedia} onClick={()=>{setShowMedia(true);setLibraryTab('templates')}}>模板</button><button aria-pressed={libraryTab==='media'&&showMedia} onClick={()=>{if(libraryTab==='media')setShowMedia(!showMedia);else{setShowMedia(true);setLibraryTab('media')}}}>素材库</button><button aria-pressed={showInspector} onClick={()=>setShowInspector(!showInspector)}>片段属性</button>
      <button className="me-primary" disabled={!!busy || render?.state === 'rendering'} onClick={() => act('开始导出', async () => { const value = await save(); const job = await editorRequest('render', { id: value.id }); setRender(job); log('导出已开始，使用工程 v' + value.revision) })}>{render?.state === 'rendering' ? `导出 ${render.progress || 0}%` : '导出 MP4'}</button>
    </div></header>
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
    <div className={'me-workarea'+(!showMedia?' no-media':'')+(!showInspector?' no-inspector':'')}>
      <aside className="me-library" hidden={!showMedia}><div className="me-panel-title"><button aria-pressed={libraryTab==='media'} onClick={()=>setLibraryTab('media')}>素材 {p.assets.length}</button><button aria-pressed={libraryTab==='templates'} onClick={()=>setLibraryTab('templates')}>模板</button></div><div className="me-library-actions" hidden={libraryTab!=='media'}><button disabled={!!busy} onClick={()=>act('导入多个素材',async()=>{await save();load(await editorRequest('import',{id:p.id}));log('素材已导入')})}>＋ 导入素材</button><button onClick={()=>add('text')}>＋ 文字</button><button onClick={()=>add('animation')}>＋ 动画</button></div><div className="me-library-content" hidden={libraryTab!=='media'} ref={setMediaMount}/><div className="me-library-content" hidden={libraryTab!=='templates'}><MotionTemplatePanel project={p} selectedId={templateSelection} onSelect={setTemplateSelection} busy={!!busy} job={templateJob} onOriginal={originalTemplate}/></div></aside>
      <main className="me-stage"><div className="me-panel-title"><strong>{p.appliedTemplate ? p.appliedTemplate.title+' · '+(p.appliedTemplate.mode==='original'?'原版动效':'结构编排') : '节目预览'}</strong><span>{p.width} × {p.height} · {p.fps} fps</span></div><div className="me-project"><input aria-label="工程名称" value={p.title} onChange={e => change(old => ({ ...old, title: e.target.value }))} />
      <select aria-label="画幅" value={`${p.width}x${p.height}`} onChange={e => { const [width, height] = e.target.value.split('x').map(Number); change(old => ({ ...old, width, height })) }}>
        {[['1280x720', '16:9 横屏'], ['720x1280', '9:16 竖屏'], ['1080x1080', '1:1 方形'], ['810x1080', '3:4'], ['1920x1080', '1080p 横屏']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select><label>秒<input type="number" min="1" max="600" value={p.duration} onChange={e => { const duration = Number(e.target.value); if (duration >= 1 && duration <= 600 && p.clips.every(c => c.start + c.duration <= duration)) change(old => ({ ...old, duration })) }} /></label>
      <select aria-label="帧率" value={p.fps} onChange={e => change(old => ({ ...old, fps: Number(e.target.value) }))}>{[24, 25, 30, 60].map(f => <option key={f} value={f}>{f} fps</option>)}</select></div>
      <div className="me-preview" style={{ aspectRatio: `${p.width}/${p.height}` }}><iframe title="动画实时预览" ref={iframe} sandbox="allow-scripts" srcDoc={html} onLoad={() => iframe.current?.contentWindow?.postMessage({ type: 'motion-editor-seek', token, time }, '*')} /></div>
      {!!frameErrors.length && <p className="me-error" role="alert">预览：{frameErrors.join('；')}</p>}
      {!p.clips.length && <p className="me-empty">导入一段或多段视频，再让右侧助手完成剪辑。</p>}
      <div className="me-transport"><div className="me-play-controls"><button aria-label="上一个剪辑点" title="上一个剪辑点" onClick={()=>{play(false);seek(adjacentCut(p,time,-1))}}>Ⅰ‹</button><button aria-label="上一帧" title="上一帧" onClick={()=>{play(false);seek(Math.max(0,time-1/p.fps))}}>‹</button><button className="me-play" aria-label={playing?'暂停':'播放'} title="空格播放 / 暂停" onClick={()=>play(!playing)}>{playing?'Ⅱ':<Icon name="play" size={15}/>}</button><button aria-label="下一帧" title="下一帧" onClick={()=>{play(false);seek(Math.min(p.duration,time+1/p.fps))}}>›</button><button aria-label="下一个剪辑点" title="下一个剪辑点" onClick={()=>{play(false);seek(adjacentCut(p,time,1))}}>›Ⅰ</button></div><output>{frameTime(time,p.fps)} <span>/ {frameTime(p.duration,p.fps)}</span></output><button aria-label="全屏预览" title="全屏预览" onClick={()=>iframe.current?.parentElement.requestFullscreen?.()}><Icon name="expand" size={14}/></button></div><input className="me-preview-seek" aria-label="预览进度" type="range" min="0" max={p.duration} step={1/p.fps} value={time} onChange={e=>{play(false);seek(Number(e.target.value))}}/>

      {editingVideo && p.editSummary && <details><summary>本次剪辑方案</summary><p>{p.editSummary}</p></details>}
      {(p.clips.filter(c => ['audio', 'video'].includes(c.type) && p.assets.find(a => a.id === c.assetId)?.hasAudio)).map(c => <audio hidden key={c.id} ref={el => { audio.current[c.id] = el }} src={p.previewUrls?.[c.assetId]} preload="metadata" />)}
      {render && <div className="me-output">{render.state === 'rendering' ? <><progress value={render.progress || 0} max="100" /> 正在逐帧渲染，v{render.revision} · {render.progress || 0}%</> : render.state === 'failed' ? <p className="me-error">{render.error}</p> : <><h3>已导出 · 工程 v{render.revision}</h3><video controls src={`media-desk/motion-editor/${p.id}/${render.id}/video.mp4`} /><a download={`${p.title}.mp4`} href={`media-desk/motion-editor/${p.id}/${render.id}/video.mp4`}>下载成片 MP4 ↓</a></>}</div>}
    </main><aside className="me-inspector" hidden={!showInspector}><div className="me-panel-title"><strong>{clip ? '片段属性' : '工程信息'}</strong><span>{({video:'视频',image:'图片',audio:'音频',text:'文字',animation:'动画'})[clip?.type]||'项目'}</span></div><MotionInspector project={p} clip={clip} patch={patch} change={change} onSelect={select} onAsk={askClip}/></aside></div>
    <div className="me-divider" role="separator" tabIndex="0" aria-label="调整预览与时间线高度" aria-orientation="horizontal" aria-valuemin={32} aria-valuemax={70} aria-valuenow={Math.round(upperSize)} onPointerDown={resizeWorkspace} onKeyDown={e=>{if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();setUpperSize(n=>Math.max(32,Math.min(70,n+(e.key==='ArrowUp'?-3:3))))}}}><span/></div>
    <div id="motion-free-timeline"><MotionTimeline onAsk={askClip} mediaMount={mediaMount} externalMedia project={p} selected={selected} onSelect={select} time={time} onSeek={seek} playing={playing} onPlay={play} zoom={zoom} onZoom={setZoom} onChange={change}
      onPreview={value=>{setGesture(true);const next={...value,revision:Math.max(value.revision,projectRef.current.revision)};projectRef.current=next;setProject(next)}}
      onCommit={(original,value)=>{if(original===value){setGesture(false);return}history.current.undo.push(original);history.current.redo=[];const next={...value,revision:Math.max(value.revision,projectRef.current.revision)};projectRef.current=next;setProject(next);setGesture(false);setDirty(true);historyChanged(n=>n+1)}}
      onUndo={()=>undo('undo')} onRedo={()=>undo('redo')} canUndo={!!history.current.undo.length} canRedo={!!history.current.redo.length} busy={!!busy}
      onImport={()=>act('导入多个素材',async()=>{await save();load(await editorRequest('import',{id:p.id}));log('素材已顺序加入轨道，原声已分离并联动')})}
      onThumbnails={()=>act('生成视频缩略图',async()=>{await save();load(await editorRequest('thumbnails',{id:p.id}));log('真实视频缩略图已生成')})}
      onWaveforms={()=>act('读取音频波形',async()=>{await save();load(await editorRequest('waveforms',{id:p.id}))})}
    /></div>
  </section>
}
