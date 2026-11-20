import React from 'react'
import { AutoClipView } from './autoclip.jsx'
import { openItem, report, setDesk, toast, useDesk } from './desk.js'
import { workflowRequest } from './workflow.jsx'
import { MotionProduction } from './motion-production.jsx'
import { MotionEditor } from './motion-editor.jsx'
import catalogCss from './motion.css'

import templates from './motion-catalog.json'

const library = 'https://motiongit.com/templates'
const source = 'https://github.com/motiontemplates/all'
const categories = { all: '全部', product: '产品宣传', talk: '口播视频', explainer: '动画解说', industry: '行业模板', art: '视觉艺术', life: '生活记录', innovation: '创新区', preview: '预览' }
const groupOf = row => row.category === 'open' ? 'talk' : row.category
const covers = row => 'media-desk/motion-cover/' + row.id + new URL(row.poster).pathname.match(/\.[a-z]+$/i)?.[0].toLowerCase()
const matchesFile = (file, row) => (file.template === row.id || file.template === row.slug) && (!row.language || file.name.endsWith('-'+row.language+'.motion'))

function Poster({ row }) {
  return <img src={covers(row)} alt="" decoding="async" loading="lazy" data-id={row.id} onError={event => {
    const img = event.currentTarget
    if (img.getAttribute('src') !== row.poster) img.src = row.poster
    else img.hidden = true
  }} />
}

async function readLibrary() {
  const response = await fetch('media-desk/motion-library', { cache: 'no-store' })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || '本地模板库读取失败')
  return result
}

export function MotionView() {
  const workflow = useDesk(s => s.workflow || s.state?.workflow)
  const taskId = useDesk(s => s.activeTaskId)
  const handoff = useDesk(s => s.motionHandoff)
  const legacyRequested = useDesk(s => s.clipLegacyRequested)
  const [legacy, setLegacy] = React.useState(false)
  const [editor, setEditor] = React.useState(false)
  const [editorTemplate,setEditorTemplate]=React.useState('')
  const [template, setTemplate] = React.useState(templates[0].id)
  const [detail, setDetail] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [category, setCategory] = React.useState('all')
  const [ratio, setRatio] = React.useState('')
  const [sort, setSort] = React.useState('featured')
  const [savedOnly, setSavedOnly] = React.useState(false)
  const [saved, setSaved] = React.useState([])
  const [libraryError, setLibraryError] = React.useState('')
  const [version, setVersion] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [script, setScript] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const bodyRef = React.useRef(null)
  const listOffset = React.useRef(0)
  React.useLayoutEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = detail ? 0 : listOffset.current }, [detail])
  React.useEffect(() => {
    let active = true
    readLibrary().then(result => { if (active) setSaved(result.rows) })
      .catch(error => { if (active) setLibraryError(error.message) })
    return () => { active = false }
  }, [])
  React.useEffect(() => {
    if (!handoff) return
    setScript(handoff.script)
    setNotes(handoff.notes)
    setTemplate('626-16x9')
    setVersion('')
    setLegacy(false)
    setEditor(true)
    setDetail(true)
  }, [handoff])
  React.useLayoutEffect(() => {
    if (handoff && detail && template === '626-16x9' && !legacy) {
      document.getElementById('motion-production')?.scrollIntoView({ block: 'start' })
    }
  }, [handoff, detail, template, legacy])
  React.useEffect(() => {
    if (!legacyRequested) return
    setLegacy(true)
    setDesk({ clipLegacyRequested: false })
  }, [legacyRequested])
  const task = workflow?.tasks.find(row => row.id === taskId && row.module === 'autoclip')
  const project = workflow?.projects.find(row => row.id === task?.projectId)
  const upstream = task ? workflow.tasks.filter(row => task.dependencies.includes(row.id)) : []
  const files = [...new Map([...upstream, ...(task ? [task] : [])]
    .flatMap(row => row.artifacts || []).flatMap(row => row.files || [])
    .filter(file => file.path).map(file => [file.path, file])).values()]
  const outputs = (task?.artifacts || []).filter(row => row.native?.motionExport).flatMap(row => row.files || [])
  const selected = templates.find(row => row.id === template)
  const selectedFiles = saved.filter(row => matchesFile(row, selected))
  const localFile = selectedFiles.find(row => row.path === version) || selectedFiles[0]
  const builtIn = selected.runtimeReady === true
  const savedIds = new Set(templates.filter(row => saved.some(file => matchesFile(file, row))).map(row => row.id))
  const openTemplate = id => {
    listOffset.current = bodyRef.current?.scrollTop || 0
    setTemplate(id); setVersion(''); setDetail(true)
  }
  const shown = templates.filter(row =>
    (category === 'all' || groupOf(row) === category) && (!ratio || row.ratio === ratio) &&
    (!savedOnly || savedIds.has(row.id)) &&
    `${row.title} ${row.owner || ''} ${categories[groupOf(row)]} ${row.slug || ''} ${row.summary || ''}`.toLowerCase().includes(query.trim().toLowerCase()),
  )
  if (sort === 'title') shown.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
  const copyBrief = async () => {
    const brief = [
      '使用我提供的原始 .motion 模板制作视频。先读取模板的素材要求，核对口播和字幕时间，再做预览，经我确认后导出 MP4。',
      `模板：${selected.title}`,
      localFile ? `本机模板：${localFile.path}` : selected.url && `下载地址：${selected.url}`,
      project && `项目：${project.title}`,
      task && `事项：${task.title}`,
      task?.description,
      task?.deliverable && `交付要求：${task.deliverable}`,
      task?.acceptance && `验收标准：${task.acceptance}`,
      script.trim() && `本期文案：\n${script.trim()}`,
      ...upstream.flatMap(row => (row.artifacts || []).filter(artifact => artifact.text).map(artifact => `${row.title}：\n${artifact.text}`)),
      files.length && `本机素材：\n${files.map(file => file.path).join('\n')}`,
      notes.trim() && `本次补充：\n${notes.trim()}`,
    ].filter(Boolean).join('\n\n')
    try { await navigator.clipboard.writeText(brief); toast('已复制 Motion 制作说明') } catch (error) { report(error) }
  }
  const importTemplate = async file => {
    setBusy(true)
    setLibraryError('')
    try {
      const query = new URLSearchParams({ id: 'template', name: file.name })
      const response = await fetch('media-desk/motion-upload?' + query, { method: 'POST', body: file })
      const result = await response.json()
      if (!response.ok) throw Error(result.error || '模板导入失败')
      setSaved(result.rows)
      setDetail(false)
      toast('模板已保存到本机')
    } catch (error) { setLibraryError(error.message); report(error) }
    finally { setBusy(false) }
  }
  const importExport = async () => {
    setBusy(true)
    try {
      await workflowRequest('native', { id: task.id, action: 'motion-export' })
      toast('已核对 MP4 并关联当前事项')
    } catch (error) {
      if (!/取消/.test(error.message)) report(error)
    } finally { setBusy(false) }
  }
  if (editor) return <MotionEditor initialTemplateId={editorTemplate} script={script} notes={notes} sourceItemId={handoff?.itemId} handoffKey={handoff?.itemId || handoff?.key} onClose={() => setEditor(false)} />
  return <div className="md-motion">
    {legacy ? <>
      <div className="md-motion-legacy"><button type="button" className="md-btn" onClick={() => setLegacy(false)}>返回 Motion</button><span>AutoClip 项目</span></div>
      <div className="md-motion-frame"><AutoClipView /></div>
    </> : <div className="md-motion-body" ref={bodyRef}>
      <style>{catalogCss}</style>
      <header className="md-motion-nav">
        <strong>Motion</strong><button type="button" className="md-motion-nav-home" onClick={() => setDetail(false)}>模板中心</button>
        <button type="button" className="md-btn" onClick={() => setEditor(true)}>创作工作区 · 代码 / 时间线</button>
        <a href={source} target="_blank" rel="noreferrer">GitHub 模板合集 ↗</a>
        <a className="md-motion-official" href={library} target="_blank" rel="noreferrer">官方模板中心 ↗</a>
        <button type="button" className="md-btn" onClick={() => setLegacy(true)}>旧剪辑项目</button>
      </header>
      <section className="md-motion-section">
        <label>导入本地 .motion 模板 <input type="file" accept=".motion" disabled={busy} onChange={event=>{
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void importTemplate(file)
        }}/></label>
        {saved.some(row=>row.template.startsWith('motiongit-')) && <details open>
          <summary>已导入的 MotionGit 模板</summary>
          <ul>{saved.filter(row=>row.template.startsWith('motiongit-')).map(row=><li key={row.path}>{row.name}</li>)}</ul>
          <p className="md-muted">个人发布包保存在本机。受保护的模板需由 MotionGit 授权运行时打开。</p>
        </details>}
      </section>
      {!detail ? <>
        <div className="md-motion-hero">
          <div><p className="md-motion-index">模板目录 · {templates.length} 项</p><h1>视频模板，<span>换一组内容就是新视频。</span></h1><p>从口播、品牌叙事到知识讲解。仅展示已导入原包、已接入本机渲染的模板。选择模板后直接应用到剪辑工作区。</p></div>
          <dl><div><dt>模板条目</dt><dd>{templates.length}</dd></div><div><dt>已保存</dt><dd>{savedIds.size}</dd></div></dl>
        </div>
        <section className="md-motion-catalog" aria-label="视频模板">
          <div className="md-motion-filters" aria-label="模板分类">
            {Object.entries(categories).filter(([value])=>value==='all'||templates.some(row=>groupOf(row)===value)).map(([value, label]) => <button type="button" key={value} aria-pressed={category === value} onClick={() => setCategory(value)}>{label}<small>{value === 'all' ? templates.length : templates.filter(row => groupOf(row) === value).length}</small></button>)}
          </div>
          <div className="md-motion-search">
            <input type="search" aria-label="搜索模板、作者、类别" placeholder="搜索模板、作者、类别" value={query} onChange={event => setQuery(event.target.value)} />
            <div className="md-motion-segments" aria-label="画幅">
              {['',...new Set(templates.map(t=>t.ratio))].map(value => <button key={value} type="button" aria-pressed={ratio === value} onClick={() => setRatio(value)}>{value || '全部画幅'}</button>)}
            </div>
            <div className="md-motion-segments" aria-label="排序">
              <button type="button" aria-pressed={sort === 'featured'} onClick={() => setSort('featured')}>精选</button>
              <button type="button" aria-pressed={sort === 'title'} onClick={() => setSort('title')}>按名称</button>
            </div>
          </div>
          <div className="md-motion-list-head">
            <div className="md-motion-segments" aria-label="保存状态">
              <button type="button" aria-pressed={!savedOnly} onClick={() => setSavedOnly(false)}>全部模板</button>
              <button type="button" aria-pressed={savedOnly} onClick={() => setSavedOnly(true)}>已保存 {savedIds.size}</button>
            </div>
            <p className="md-motion-count" role="status">{shown.length} 个结果</p>
          </div>
          {libraryError && <p role="status">本地模板库暂不可用。{libraryError}</p>}
          {shown.length ? <div className="md-motion-grid">{shown.map(row => <article key={row.id} className="md-motion-tile">
            <button type="button" className="md-motion-poster" aria-label={`查看 ${row.title}`} onClick={() => openTemplate(row.id)}>
              <strong>{row.title}</strong>
              <Poster row={row} />
              {row.demo && <span className="md-motion-play" aria-hidden="true">▷</span>}
              <small>{row.ratio}</small>
            </button>
            <button type="button" className="md-motion-title" onClick={() => openTemplate(row.id)}>{row.title}</button>
            <div className="md-motion-meta"><span>{row.owner || 'MotionGit'} · {categories[groupOf(row)]}</span><strong>原版可用</strong></div>
          </article>)}</div> : <p className="md-motion-empty">{savedOnly ? '没有符合条件的本地模板。' : '没有匹配的模板，试试其他关键词。'}</p>}
        </section>
      </> : <>
        <header className="md-motion-detail-head">
          <button type="button" className="md-motion-nav-home" onClick={() => setDetail(false)}>← 返回模板中心</button>
          <h1>{selected.title}</h1><p>{selected.summary}</p><p>{selected.demoLabel}</p>
          <small>{[selected.ratio, selected.width && `${selected.width} × ${selected.height}`, selected.fps && `${selected.fps} fps`, selected.version].filter(Boolean).join(' · ')}</small>
        </header>
        <div className="md-motion-detail-grid">
          <div className="md-motion-player">
            {selected.demo ? <video key={selected.id} poster={covers(selected)} controls playsInline preload="metadata">
              <source src={'media-desk/motion-demo/'+selected.id+'.mp4'} type="video/mp4" />
              <source src={selected.demo} type="video/mp4" />
            </video> : <Poster row={selected} />}
          </div>
          <aside className="md-motion-section">
            <h2>获取并使用模板</h2>
            <p>{localFile ? '已保存到本机，可直接用于制作。' : selected.downloadType === 'coming-soon' ? '仓库仅提供 Demo，模板尚未开放下载。' : '从官网下载原包，再导入本地模板库。'}</p>
            <div className="md-motion-side-actions">
              <button className="md-btn is-primary" type="button" onClick={()=>{setEditorTemplate(selected.id);setEditor(true)}}>应用到剪辑工作区</button>
              {localFile && <button type="button" className="md-btn is-primary" onClick={copyBrief}>复制本地制作说明</button>}
              {selected.url && <a className="md-btn" href={selected.url} target="_blank" rel="noreferrer">打开 MotionGit ↗</a>}
              
              {selected.repository && <a href={selected.repository} target="_blank" rel="noreferrer">查看仓库资料 ↗</a>}
            </div>
            {selected.materials && <details><summary>所需素材</summary><p>{selected.materials}</p></details>}
          </aside>
        </div>
      {builtIn && <MotionProduction key={(handoff?.key||'motion')+'-'+selected.language} script={script} onScriptChange={setScript} notes={notes}
        handoffKey={handoff?.key} preferredLanguage={selected.language||'zh'} />}
      <section className="md-motion-section" aria-labelledby="md-motion-brief">
        <div className="md-motion-heading"><h2 id="md-motion-brief">制作说明</h2>
          {handoff?.itemId ? <button className="md-btn" type="button" onClick={() => {
            setDesk({ view: handoff.source === '灵感' ? 'home' : 'content' })
            openItem(handoff.itemId)
          }}>查看{handoff.source}原稿</button> : task ? <span className="md-muted">{task.title}</span> : null}
        </div>
        {handoff && <p className="md-muted">来自{handoff.source} · {handoff.title}</p>}
        <p>{selected.title} · {localFile ? '使用已保存的本地模板' : '先到官网预览并下载模板，然后保存到本地'}</p>
        {localFile && <label className="md-motion-version">本地模板
          <select value={localFile.path} onChange={event => setVersion(event.target.value)}>
            {selectedFiles.map(row => <option key={row.path} value={row.path}>{row.name} · {new Date(row.savedAt).toLocaleString('zh-CN')}</option>)}
          </select>
        </label>}
        {files.length > 0 && <p className="md-muted">已带入 {files.length} 个本机素材路径。</p>}
        <textarea aria-label="补充制作要求" maxLength={8000} placeholder="可补充画幅、字幕或需要重点呈现的内容" value={notes} onChange={event => setNotes(event.target.value)} />
        <div className="md-motion-actions">
          <button type="button" className="md-btn is-primary" onClick={copyBrief}>复制制作说明</button>
          {!localFile && selected.url && <a className="md-btn" href={selected.url} target="_blank" rel="noreferrer">官网下载 ↗</a>}
          <a className="md-btn" href="https://www.adudir.com/beta/" target="_blank" rel="noreferrer">阿杜导演 ↗</a>
          <a className="md-btn" href="https://motiongit.com/ai?lang=zh" target="_blank" rel="noreferrer">本地制作指南 ↗</a>
        </div>
      </section>
      {task?.kind === 'edit' && <section className="md-motion-section" aria-labelledby="md-motion-export">
        <h2 id="md-motion-export">交付成片</h2>
        <p>在制作工具里导出后，选择 MP4 关联到当前剪辑事项。</p>
        {outputs.length > 0 && <ul>{outputs.map((file, index) => <li key={index}>{file.name}</li>)}</ul>}
        <div className="md-motion-actions">
          <button type="button" className="md-btn" disabled={busy || ['running', 'done', 'cancelled'].includes(task.status)} onClick={importExport}>{busy ? '正在核对…' : '选择已导出的 MP4'}</button>
          <button type="button" className="md-btn" onClick={() => setDesk({ workflowDialog: task.id })}>查看事项与提交</button>
        </div>
      </section>}
      </>}
    </div>}
  </div>
}
