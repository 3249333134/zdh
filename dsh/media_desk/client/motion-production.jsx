import React from 'react'
import { toast } from './desk.js'

async function request(action, body) {
  const response = await fetch('media-desk/motion-production', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || '制作请求失败')
  return result
}

export function MotionProduction({ script, onScriptChange, notes, handoffKey, preferredLanguage }) {
  const [language, setLanguage] = React.useState(preferredLanguage)
  const [job, setJob] = React.useState(null)
  const [busy, setBusy] = React.useState('')
  const [error, setError] = React.useState('')
  const [plan, setPlan] = React.useState(null)
  const [instruction, setInstruction] = React.useState('')
  const [face, setFace] = React.useState({ cx: .5, cy: .35, h: .22 })
  const fields = { keyword: '关键词', explanation: '概念说明', heading: '小标题', points: '要点（每行一条）', left: '对比左侧', right: '对比右侧', conclusion: '对比结论', summary: '收束总结', action: '结尾行动' }
  const required = { B1: ['keyword', 'explanation'], B2: ['heading', 'points'], B3: ['heading', 'left', 'right', 'conclusion'], B4: ['summary', 'action'] }
  const storage = handoffKey ? sessionStorage : localStorage
  const storageKey = handoffKey ? 'media-desk-motion-job-' + handoffKey : 'media-desk-motion-last-job'
  React.useEffect(() => {
    const id = storage.getItem(storageKey)
    if (id) request('status', { id }).then(result => {
      if (result.language === preferredLanguage) setJob(previous => previous || result)
    }).catch(() => {})
  }, [storage, storageKey, preferredLanguage])
  React.useEffect(() => {
    if (job?.state !== 'rendering') return
    const timer = setInterval(() => request('status', { id: job.id }).then(result => {
      setError('')
      setJob(current => current?.id === result.id ? result : current)
    }).catch(error => setError(error.message)), 2500)
    return () => clearInterval(timer)
  }, [job?.id, job?.state])

  const doAction = async (action, args = {}) => {
    setBusy(action)
    setError('')
    try {
      let current = job
      if (!current) {
        current = await request('create', { language })
        setJob(current)
        storage.setItem(storageKey, current.id)
      }
      const result = await request(action, { id: current.id, ...args })
      if (action === 'plan') setPlan(result.plan)
      else {
        setJob(result)
        if (action === 'revise') {
          storage.setItem(storageKey, result.id)
          setPlan(current.plan || null)
        }
      }
    } catch (error) { setError(error.message) }
    finally { setBusy('') }
  }
  const reset = () => {
    storage.removeItem(storageKey)
    setJob(null)
    setPlan(null)
    setError('')
  }
  const canEdit = !job || job.state === 'draft'
  const media = job && `media-desk/motion-production/${job.id}`
  const rawError = error || job?.error || ''
  const missing = /needs-binding: basic\.(\w+)/.exec(rawError)
  const message = missing ? `镜头缺少「${fields[missing[1]] || missing[1]}」。点击修改内容并重新制作，AI 会重新检查方案。` : rawError
  return <section className="md-motion-section" id="motion-production">
    <div className="md-motion-heading"><h2>AI 自动剪辑</h2>
      {job && job.state !== 'rendering' && <button className="md-btn" type="button" disabled={Boolean(busy)} onClick={reset}>新建制作</button>}
    </div>
    <p>用文案或 SRT 编排代码动效，添加人物视频后一起合成画面。当前模板支持横屏、最多 84 秒，人物素材应覆盖完整成片。</p>
    {canEdit && <>
      <label className="md-motion-version">模板语言
        <select value={job?.language || language} disabled={Boolean(job || busy)} onChange={event => setLanguage(event.target.value)}>
          <option value="zh">简体中文</option><option value="en">英语</option>
        </select>
      </label>
      <textarea aria-label="本期文案" maxLength={8000} placeholder="粘贴要配上动效的文案" value={script} disabled={Boolean(busy)} onChange={event => onScriptChange(event.target.value)} />
      <div className="md-motion-actions">
        <button className="md-btn" type="button" disabled={Boolean(busy)} onClick={() => doAction('pick', { kind: 'voice' })}>{job?.voiceName || '选择口播视频或音频'}</button>
        <button className="md-btn" type="button" disabled={Boolean(busy)} onClick={() => doAction('pick', { kind: 'presenter' })}>{job?.presenterName || '添加人物画面'}</button>
        <button className="md-btn" type="button" disabled={Boolean(busy)} onClick={() => doAction('pick', { kind: 'subtitle' })}>{job?.subtitleName || '选择 SRT 字幕'}</button>
        <button className="md-btn is-primary" type="button" disabled={Boolean(busy) || !(script.trim() || job?.subtitleName)} onClick={() => doAction('plan', { script, notes })}>{plan ? '重新 AI 编排' : 'AI 编排镜头'}</button>
      </div>
    </>}
    {busy === 'plan' && <p role="status">AI 正在编排并检查各镜头必填内容…</p>}
    {busy === 'apply-plan' && <p role="status">正在按当前镜头生成实际预览…</p>}
    {canEdit && plan && <div className="md-motion-plan">
      <div className="md-motion-layers"><strong>A · 代码动效层</strong><span>{plan.scenes.length} 个动效镜头</span><strong>B · 素材层</strong><span>{job?.presenterName || '未添加人物画面'} · {job?.subtitleName || '未添加 SRT'}</span></div>
      <label>告诉 AI 怎么改<textarea value={instruction} maxLength={2000} disabled={Boolean(busy)} placeholder="例如：先讲冲突，再做两个观点的对比，结尾保留一个问题" onChange={event => setInstruction(event.target.value)} /></label>
      <button className="md-btn" type="button" disabled={Boolean(busy) || !instruction.trim()} onClick={() => doAction('plan', { script, notes, instruction, previousPlan: plan })}>按要求修改方案</button>
      <label>视频标题<input value={plan.title} disabled={Boolean(busy)} onChange={event => setPlan({ ...plan, title: event.target.value })} /></label>
      {plan.scenes.map((scene, index) => <fieldset key={scene.id}>
        <legend>{index + 1} · {scene.title}</legend>
        {required[scene.id].map(key => <label key={key}>{fields[key]}<textarea disabled={Boolean(busy)} value={key === 'points' ? (plan.basic[key] || []).join('\n') : plan.basic[key] || ''} onChange={event => setPlan({ ...plan, basic: { ...plan.basic, [key]: key === 'points' ? event.target.value.split('\n') : event.target.value } })} /></label>)}
      </fieldset>)}
      {job?.presenterName && <fieldset><legend>人物在原始画面中的位置</legend><p>按原始画面比例设置人物中心与脸部高度，再检查实际预览。</p>
        {Object.entries({ cx:'水平中心', cy:'垂直中心', h:'脸部高度' }).map(([key, label]) => <label key={key}>{label}<input type="number" min=".01" max="1" step=".01" value={face[key]} disabled={Boolean(busy)} onChange={event => setFace({ ...face, [key]: Number(event.target.value) })} /></label>)}
      </fieldset>}
      <details><summary>查看动效编排参数</summary><pre className="md-motion-code">{JSON.stringify(plan, null, 2)}</pre></details>
      <button className="md-btn is-primary" type="button" disabled={Boolean(busy)} onClick={() => doAction('apply-plan', { plan, face })}>合成动效和素材预览</button>
    </div>}
    {job?.scenes?.length > 0 && <p>{job.scenes.map(scene => scene.title).join(' → ')} · {Math.round(job.duration)} 秒</p>}
    {job?.state === 'preview' && <>
      <img className="md-motion-production-preview" src={media + '/preview.png'} alt="用本期内容渲染的预览帧" />
      <button className="md-btn is-primary" type="button" disabled={Boolean(busy)} onClick={() => doAction('render')}>导出 MP4</button>
    </>}
    {job?.state === 'rendering' && <p role="status">正在本机渲染完整视频并合成音轨…</p>}
    {job && ['preview', 'done', 'failed'].includes(job.state) && <button className="md-btn" type="button" disabled={Boolean(busy)} onClick={() => doAction('revise')}>修改内容并重新制作</button>}
    {job?.state === 'done' && <>
      <video className="md-motion-production-preview" src={media + '/video-with-audio.mp4'} controls preload="metadata" />
      <button className="md-btn" type="button" onClick={async () => {
        try { await navigator.clipboard.writeText(job.output); toast('已复制成片路径') } catch (error) { setError(error.message) }
      }}>复制成片文件路径</button>
    </>}
    {message && <p role="alert">{message}</p>}
  </section>
}
