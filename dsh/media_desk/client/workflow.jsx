import React from 'react'
import { getDesk, setDesk, useDesk, loadDesk, report, openItem, startProduce } from './desk.js'
import { Dialog, Icon } from './ui.jsx'
import { DEFAULT_SPEC, productionSpec, imageTotal, SHOT_SOURCES, normalizeShotSources, shotChecklist, shotSourceSummary } from '../src/production-spec.js'
import { callYingce } from './yingce-agent.js'

export const MODULE_LABELS = { home: '灵感', style: '风格', content: '内容', drama: '影策', autoclip: '剪辑助手', insights: '复盘' }
export const STATUS_LABELS = { todo: '待开始', running: '处理中', review: '待确认', blocked: '受阻', done: '完成', cancelled: '已取消' }
export const KIND_LABELS = { text: '资料／文字', script: '脚本', shoot: '拍摄／素材', images: '图片／分镜', edit: '剪辑', publish: '人工发布', review: '复盘' }
const EMPTY = { revision: 0, projects: [], tasks: [], proposals: [] }
export const useWorkflow = () => useDesk(s => s.workflow || s.state?.workflow || EMPTY)
export const localTime = value => value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''
export const fmtTaskTime = value => value ? new Date(value).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '待安排'
const files = artifacts => (artifacts || []).flatMap(row => row.files || [])
const taskFiles = (workflow, task) => [...files(task.artifacts), ...files(workflow.tasks.filter(row => task.dependencies.includes(row.id)).flatMap(row => row.artifacts))]

export async function workflowRequest(action, body = {}) {
  const data = getDesk().workflow || getDesk().state?.workflow || EMPTY
  const response = await fetch('media-desk/workflow' + (action ? '/' + action : ''), action ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ revision: data.revision, requestId: crypto.randomUUID(), ...body }) } : {})
  const result = await response.json()
  if (!response.ok) {
    if (response.status === 409) await workflowRequest('')
    throw new Error(result.error || '任务操作失败')
  }
  if (result.workflow) setDesk({ workflow: result.workflow })
  return result
}
export async function agendaRequest(filter = {}) {
  const result = await fetch('media-desk/workflow/agenda', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filter }) })
  const data = await result.json()
  if (!result.ok) throw new Error(data.error || '日程查询失败')
  return data.agenda
}

/** 工作包汇总：只是事项上的分组标签，不作为排期条目重复出现。 */
export function groupRollup(tasks) {
  const map = new Map()
  for (const task of tasks) {
    if (task.supersededBy || task.status === 'cancelled') continue
    const key = `${task.projectId}:${task.group || '工作事项'}`
    const row = map.get(key) || { key, projectId: task.projectId, group: task.group || '工作事项', total: 0, done: 0, blocked: 0, review: 0, running: 0, todo: 0, estimateMin: 0, publications: 0 }
    row.total++
    if (row[task.status] !== undefined) row[task.status]++
    row.estimateMin += Number(task.estimateMin) || 0
    if (task.kind === 'publish') row.publications++
    map.set(key, row)
  }
  return [...map.values()].map(row => ({ ...row, ratio: row.total ? Math.round(row.done / row.total * 100) : 0 }))
}

export function WorkflowRuntime() {
  const workflow = useWorkflow()
  const [now, setNow] = React.useState(Date.now())
  const [dismissed, dismiss] = React.useState(false)
  React.useEffect(() => {
    workflowRequest('').catch(() => {})
    const poll = setInterval(() => { workflowRequest('').catch(() => {}); setNow(Date.now()) }, 10000)
    const refresh = () => workflowRequest('').catch(() => {})
    window.addEventListener('focus', refresh)
    return () => { clearInterval(poll); window.removeEventListener('focus', refresh) }
  }, [])
  const due = workflow.tasks.filter(task => ['todo', 'review', 'blocked'].includes(task.status) && (task.dueAt || task.startAt) && Date.parse(task.dueAt || task.startAt) <= now)
  const overdue = due.filter(task => task.dueAt && Date.parse(task.dueAt) <= now)
  const pending = due.filter(task => !overdue.includes(task))
  const rows = [...overdue, ...pending]
  return <>{due.length && !dismissed ? <div className="md-task-reminder" role="status">
    <div className="md-task-reminder-head"><strong>{due.length} 项事项到期／逾期</strong>{overdue.length ? <span className="md-task-reminder-overdue">{overdue.length} 项已逾期</span> : null}<span style={{ flex: 1 }} /><button aria-label="暂时关闭提醒" onClick={() => dismiss(true)}>×</button></div>
    <div className="md-task-reminder-list">{rows.slice(0, 5).map(task => <button className="md-task-reminder-row" key={task.id} onClick={() => setDesk({ workflowDialog: task.id })}><span className={'md-task-state state-' + task.status}>{STATUS_LABELS[task.status]}</span><span className="md-task-reminder-title">{task.title}</span><small>{fmtTaskTime(task.dueAt || task.startAt)}{overdue.includes(task) ? ' · 逾期' : ' · 到期'}</small></button>)}{rows.length > 5 ? <small className="md-muted">还有 {rows.length - 5} 项，到排期查看。</small> : null}</div>
    <div className="md-task-reminder-foot"><button onClick={() => setDesk({ view: 'schedule', focusId: null, taskStripOpen: false })}>到排期查看</button><span>到点只提醒，不会自动调用模型或生成素材。</span></div>
  </div> : null}<TaskDialog /><ProductionSetup /></>
}

export function TaskStrip() {
  const id = useDesk(s => s.activeTaskId), open = useDesk(s => s.taskStripOpen), workflow = useWorkflow()
  const task = workflow.tasks.find(task => task.id === id)
  if (!task) return null
  const project = workflow.projects.find(row => row.id === task.projectId)
  const materials = taskFiles(workflow, task)
  const open_ = () => setDesk({ taskStripOpen: !open })
  return <div className={'md-task-strip' + (open ? ' is-open' : '')}>
    <div className="md-task-strip-main"><small>{project?.title} · {task.group}{task.video ? ' · ' + task.video : ''}</small><strong>{task.title}</strong></div>
    <span className="md-task-strip-meta">{STATUS_LABELS[task.status]} · {fmtTaskTime(task.startAt)}</span>
    <button className="md-btn" aria-expanded={open} onClick={open_}>要求与交付</button>
    <button className="md-btn is-primary" onClick={() => handleTask(task)}>去办理</button>
    <button className="md-icon-btn" aria-label="退出当前事项上下文" onClick={() => setDesk({ activeTaskId: null, taskStripOpen: false })}>×</button>
    {open ? <div className="md-task-strip-detail">
      <dl>
        <div><dt>要做什么</dt><dd>{task.description || '未填写'}</dd></div>
        <div><dt>交付物</dt><dd>{task.deliverable || '未填写'}</dd></div>
        <div><dt>完成标准</dt><dd>{task.acceptance || '未填写'}</dd></div>
        <div><dt>已有素材</dt><dd>{materials.length ? materials.map(file => <span className="md-task-file" key={file.id}>{file.name}</span>) : '还没有绑定素材'}{task.artifacts.some(row => row.text) ? ' · 已有文字交付 ' + task.artifacts.filter(row => row.text).length + ' 份' : ''}</dd></div>
        <div><dt>所属功能</dt><dd>{MODULE_LABELS[task.module]} · {task.executor === 'ai' ? 'AI 执行' : '我执行'} · 预计 {task.estimateMin} 分钟</dd></div>
      </dl>
    </div> : null}
  </div>
}

export function SpecFields({ value, onChange }) {
  const spec = { ...DEFAULT_SPEC, ...value }
  return <div className="md-spec-fields">
    {[['durationSec', '脚本时长（秒）', 10, 1800], ['shotCount', '镜头数', 1, 120], ['imageCount', '正文配图（张）', 0, 20]].map(([key, label, min, max]) => <label className="md-field" key={key}><span>{label}</span><input type="number" min={min} max={max} value={spec[key]} onChange={event => onChange({ ...spec, [key]: Number(event.target.value), ...(key === 'shotCount' ? { shotSources: normalizeShotSources(Number(event.target.value), spec.shotSources, spec.shotImages ? 'ai' : 'shoot') } : {}) })} /></label>)}
    <label><input type="checkbox" checked={spec.coverEnabled} onChange={event => onChange({ ...spec, coverEnabled: event.target.checked })} /> 生成封面</label>
    <label><input type="checkbox" checked={spec.shotImages} onChange={event => onChange({ ...spec, shotImages: event.target.checked })} /> 逐镜生成参考图</label>
    <p className="md-muted">生成前共 {imageTotal(spec)} 张图片：封面 {spec.coverEnabled ? 1 : 0}＋配图 {spec.imageCount}＋分镜图 {spec.shotImages ? spec.shotCount : 0}。按服务商实际计费。</p>
  </div>
}

function ShotSourceFields({ spec, onChange }) {
  const sources = normalizeShotSources(spec.shotCount, spec.shotSources, spec.shotImages ? 'ai' : 'shoot')
  const set = (index, source) => onChange({ ...spec, shotSources: sources.map((row, i) => i === index ? source : row) })
  const summary = shotSourceSummary(sources)
  const totalMinutes = Math.max(10, spec.shotCount * 5)
  return <div className="md-shot-sources">
    <p className="md-muted">每个镜头写清来源；{summary.map(row => `${row.label} ${row.count}`).join('、')}。拍摄类事项预计 {Math.round(totalMinutes / 60 * 10) / 10} 小时（每组约 5 分钟）。</p>
    <div className="md-shot-source-grid">{sources.map((source, index) => <label key={index} className="md-shot-source"><span>镜头 {index + 1}</span><select value={source} onChange={event => set(index, event.target.value)}>{Object.entries(SHOT_SOURCES).map(([id, row]) => <option key={id} value={id}>{row.label}</option>)}</select><small>{SHOT_SOURCES[source].prep[0]}</small></label>)}</div>
    <details><summary>按来源展开准备清单与完成标准</summary>{shotChecklist(sources).map(row => <article key={row.index} className="md-shot-checklist"><strong>镜头 {row.index} · {row.label}</strong><ul>{row.prep.map(text => <li key={text}>{text}</li>)}</ul><p>完成标准：{row.accept}</p></article>)}</details>
  </div>
}

function ProductionSetup() {
  const id = useDesk(s => s.productionSetupId)
  const item = useDesk(s => s.state?.items.find(row => row.id === id))
  const settings = useDesk(s => s.settings)
  const [spec, setSpec] = React.useState(DEFAULT_SPEC), [busy, setBusy] = React.useState(false)
  React.useEffect(() => { if (id) setSpec(item?.productionSpec || { ...DEFAULT_SPEC, imageCount: settings?.imageCount ?? 2, shotCount: settings?.shotCount || 6 }) }, [id])
  if (!id || !item) return null
  return <Dialog title="本条视频的制作规格" onClose={() => setDesk({ productionSetupId: null })} width={620}>
    <p>{item.title}</p><SpecFields value={spec} onChange={setSpec} /><ShotSourceFields spec={spec} onChange={setSpec} />
    {item.production ? <p className="md-muted">将生成新版本，旧脚本与素材记录保留。此操作会重新调用模型。</p> : null}
    <button className="md-btn is-primary" disabled={busy || item.production?.status === 'running'} onClick={async () => { try { productionSpec(spec); setBusy(true); if (await startProduce(id, spec)) setDesk({ productionSetupId: null }) } catch (error) { report(error) } finally { setBusy(false) } }}>{busy ? '启动中…' : `确认规格并生成（${imageTotal(spec)} 张图片）`}</button>
  </Dialog>
}

export function TaskFilters({ value, onChange, workflow }) {
  return <div className="md-task-filters">{[
    ['projectId', '全部项目', workflow.projects.map(row => [row.id, row.title])],
    ['video', '全部视频', [...new Set(workflow.tasks.map(row => row.video).filter(Boolean))].map(value => [value, value])],
    ['module', '全部功能', Object.entries(MODULE_LABELS)], ['executor', '我和 AI', [['me', '我'], ['ai', 'AI']]], ['status', '全部状态', Object.entries(STATUS_LABELS)],
  ].map(([key, label, options]) => <select key={key} aria-label={label} value={value[key] || ''} onChange={event => onChange({ ...value, [key]: event.target.value })}><option value="">{label}</option>{options.map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select>)}</div>
}
export const filterTasks = (tasks, filter) => tasks.filter(task => !task.supersededBy && Object.entries(filter).every(([key, value]) => !value || task[key] === value))

export async function handleTask(task) {
  try {
    const result = await workflowRequest('handoff', { id: task.id })
    await loadDesk()
    const current = result.result
    setDesk({ activeTaskId: task.id, workflowDialog: null, view: task.module, focusId: null, taskStripOpen: false })
    if (task.module === 'content' && current.links.itemId) openItem(current.links.itemId)
    if (task.module === 'drama') {
      const linked = await workflowRequest('native', { id: task.id, action: 'yingce' })
      let context
      for (let attempt = 0; attempt < 60; attempt++) {
        try { context = await callYingce('context'); break } catch { await new Promise(resolve => setTimeout(resolve, 400)) }
      }
      if (!context) throw new Error('影策尚未就绪，请重试办理；已建立项目会复用')
      if (linked.result.links.yingceCanvasId) await callYingce('execute', { action: { op: 'open_canvas', id: linked.result.links.yingceCanvasId }, context })
      else {
        let canvasId = localStorage.getItem('md-workflow-canvas:' + task.id)
        if (canvasId) await callYingce('execute', { action: { op: 'open_canvas', id: canvasId }, context })
        else {
          const created = await callYingce('execute', { action: { op: 'create_canvas', title: task.video || task.title }, context }, 'workflow-canvas-' + task.id)
          canvasId = /画布已保存：([^\s]+)/.exec(created.text)?.[1]
          if (canvasId) localStorage.setItem('md-workflow-canvas:' + task.id, canvasId)
        }
        if (!canvasId) throw new Error('画布未返回保存标识，请核对影策')
        for (let attempt = 0; attempt < 40; attempt++) { context = await callYingce('context'); if (context.id === canvasId && Array.isArray(context.nodes)) break; await new Promise(resolve => setTimeout(resolve, 300)) }
        if (context.id !== canvasId || !Array.isArray(context.nodes)) throw new Error('画布编辑器未就绪')
        await callYingce('execute', { action: { op: 'add_node', id: canvasId, nodeId: 'wf-' + task.id, title: '本事项的拍摄与分镜要求', text: [task.description, task.deliverable, task.acceptance].filter(Boolean).join('\n') }, context }, 'workflow-node-' + task.id)
        await workflowRequest('native', { id: task.id, action: 'yingce-canvas', canvasId })
      }
    }
    if (task.module === 'autoclip' && current.links.clipProjectId) setDesk({ clipProjectPath: '/project/' + current.links.clipProjectId })
  } catch (error) { report(error) }
}

function depths(tasks) {
  const byId = new Map(tasks.map(row => [row.id, row])), depth = new Map(), visiting = new Set()
  const visit = id => {
    if (depth.has(id)) return depth.get(id)
    if (visiting.has(id)) return 0
    visiting.add(id)
    const row = byId.get(id)
    const value = row ? 1 + Math.max(-1, ...row.dependencies.filter(dep => byId.has(dep)).map(visit)) : 0
    visiting.delete(id); depth.set(id, value); return value
  }
  tasks.forEach(row => visit(row.id))
  return tasks.map(row => ({ task: row, depth: depth.get(row.id) || 0 }))
}

export function GroupSummary({ groups }) {
  if (!groups.length) return null
  return <div className="md-group-summary">{groups.map(group => <div key={group.key} className={'md-group-card state-' + (group.blocked ? 'blocked' : group.ratio >= 100 ? 'done' : 'todo')}><small>{group.publications ? '含发布节点' : '工作包'}</small><strong>{group.group}</strong><div className="md-group-bar"><i style={{ width: group.ratio + '%' }} /></div><span>{group.done}/{group.total} 已交付 · 预计 {group.estimateMin} 分钟{group.blocked ? ` · ${group.blocked} 项受阻` : ''}</span></div>)}</div>
}

function ProjectGoal({ project }) {
  const [goal, setGoal] = React.useState(project.goal), [busy, setBusy] = React.useState(false)
  React.useEffect(() => setGoal(project.goal), [project.goal, project.id])
  return <Dialog title="项目总目标" width={620} onClose={() => setDesk({ projectGoalId: null })}><p className="md-muted">只修改项目目标与说明。已有事项、时间和交付物不会被覆盖；需要调整事项时请单独修改。</p>{project.history?.length ? <p className="md-muted">最近修改：{fmtTaskTime(project.history.at(-1).at)}</p> : null}<label className="md-field"><span>总目标</span><textarea rows={4} value={goal} onChange={event => setGoal(event.target.value)} /></label><button className="md-btn is-primary" disabled={busy || !goal.trim()} onClick={async () => { setBusy(true); try { await workflowRequest('project-edit', { projectId: project.id, goal }); setDesk({ projectGoalId: null }) } catch (error) { report(error) } finally { setBusy(false) } }}>保存总目标</button></Dialog>
}

export function WorkflowBoard() {
  const workflow = useWorkflow(), [filter, setFilter] = React.useState({}), [goal, setGoal] = React.useState(''), [busy, setBusy] = React.useState(false)
  const [proposal, setProposal] = React.useState(null), [layout, setLayout] = React.useState('list'), [selected, setSelected] = React.useState([])
  const goalProject = useDesk(s => s.projectGoalId)
  const tasks = filterTasks(workflow.tasks, filter)
  const groups = groupRollup(filterTasks(workflow.tasks, { projectId: filter.projectId }))
  const project = workflow.projects.find(row => row.id === filter.projectId)
  const generate = async () => { setBusy(true); try { const result = await workflowRequest('plan', { goal }); setProposal(structuredClone(result.result)) } catch (error) { report(error) } finally { setBusy(false) } }
  const layers = depths(tasks.filter(task => filter.status === 'cancelled' || task.status !== 'cancelled'))
  const maxDepth = Math.max(0, ...layers.map(row => row.depth))
  return <div className="md-page md-workflow-page">
    <header className="md-page-head"><div><h1>任务工作台</h1><p className="md-page-sub">输入宽泛目标 → 拆出事项 → 确认时间 → 分发到各功能 → 成果与进度回流。</p></div><button className="md-btn" onClick={() => setDesk({ view: 'schedule' })}>统一排期</button></header>
    <details className="md-task-create" open={!workflow.projects.length || undefined}><summary>＋ 新建计划 · 输入目标让 AI 拆解</summary><section className="md-task-brief"><label className="md-field"><span>这次想完成什么？</span><textarea value={goal} onChange={event => setGoal(event.target.value)} placeholder="例如：我要做一个王者荣耀仿妆账号，先准备首批视频和拍摄计划。" rows={3} /></label><button className="md-btn is-primary" disabled={busy || !goal.trim()} onClick={generate}>{busy ? '正在拆解目标…' : 'AI 拆计划'}</button><small>先核对事项与交付标准；确认后自动填入可调整的预计时间，同步排期，不自动执行生成。</small></section></details>
    {workflow.proposals.filter(row => row.status === 'draft').length ? <div className="md-draft-plans">未确认草案：{workflow.proposals.filter(row => row.status === 'draft').map(row => <button className="md-btn" key={row.id} onClick={() => setProposal(structuredClone(row))}>{row.title}</button>)}</div> : null}
    <div className="md-project-strip"><button className={!filter.projectId ? 'is-on' : ''} onClick={() => setFilter({ ...filter, projectId: '' })}>全部项目</button>{workflow.projects.map(row => { const group = workflow.tasks.filter(task => task.projectId === row.id && !task.supersededBy && task.status !== 'cancelled'); return <button className={filter.projectId === row.id ? 'is-on' : ''} key={row.id} onClick={() => setFilter({ ...filter, projectId: row.id })}>{row.title}<small>{group.filter(task => task.status === 'done').length}/{group.length} 已交付</small></button> })}</div>
    {project ? <div className="md-project-goal"><div><small>项目总目标</small><p>{project.goal}</p></div><button className="md-btn" onClick={() => setDesk({ projectGoalId: project.id })}>修改总目标</button></div> : null}
    <TaskFilters value={filter} onChange={setFilter} workflow={workflow} />
    <details className="md-work-package-summary"><summary>工作包进度 · {groups.length} 组</summary><GroupSummary groups={groups} /></details>
    <div className="md-task-actions"><button className="md-btn" onClick={() => setLayout(layout === 'list' ? 'graph' : 'list')}>{layout === 'list' ? '依赖流程图' : '事项列表'}</button><button className="md-btn" disabled={!filter.projectId} onClick={() => setDesk({ workflowDialog: 'new', workflowProjectId: filter.projectId })}>新增事项</button><button className="md-btn" disabled={selected.length < 2} onClick={async () => { try { await workflowRequest('merge', { id: selected[0], ids: selected, title: '合并事项' }); setSelected([]) } catch (error) { report(error) } }}>合并选中待办</button></div>
    {!tasks.length ? <div className="md-workflow-empty"><Icon name="list" size={30} /><h3>从一个目标开始</h3><p>确认计划后，具体事项会同时进入这里和排期。</p></div> : layout === 'graph' ? <div className="md-task-graph" style={{ gridTemplateColumns: `repeat(${maxDepth + 1},minmax(240px,1fr))` }}>{Array.from({ length: maxDepth + 1 }, (_, depth) => <div className="md-task-layer" key={depth}><h3>第 {depth + 1} 步</h3>{layers.filter(row => row.depth === depth).map(({ task }) => <div className={'md-task-node state-' + task.status} key={task.id}><small>{task.group} · {MODULE_LABELS[task.module]}</small><button onClick={() => setDesk({ workflowDialog: task.id })}>{task.title}</button><p>{task.dependencies.map(id => workflow.tasks.find(row => row.id === id)?.title).filter(Boolean).map(title => '← ' + title).join('；') || '起点事项'}</p><span>{STATUS_LABELS[task.status]} · {task.executor === 'ai' ? 'AI' : '我'}</span></div>)}</div>)}</div> : <div className="md-task-table-wrap"><table className="md-task-table"><thead><tr><th>选</th><th>具体事项／工作包</th><th>功能</th><th>执行</th><th>时间安排</th><th>状态</th><th>办理</th></tr></thead><tbody>
      {[...new Set(tasks.map(task => task.group || '工作事项'))].map(group => {
        const rows = tasks.filter(task => (task.group || '工作事项') === group), rollup = groups.find(row => row.group === group)
        return <React.Fragment key={group}><tr className="md-task-group-row"><td colSpan={7}><strong>{group}</strong><span>{rollup ? `${rollup.done}/${rollup.total} 已交付 · ${rollup.ratio}%` : ''}</span><i><b style={{ width: (rollup?.ratio || 0) + '%' }} /></i></td></tr>
          {rows.map(task => <tr key={task.id}><td><input type="checkbox" aria-label={'选择' + task.title} checked={selected.includes(task.id)} onChange={event => setSelected(event.target.checked ? [...selected, task.id] : selected.filter(id => id !== task.id))} /></td><td><button className="md-task-title" onClick={() => setDesk({ workflowDialog: task.id })}>{task.title}</button><small>{task.group}{task.video ? ' · ' + task.video : ''}</small></td><td>{MODULE_LABELS[task.module]}</td><td>{task.executor === 'ai' ? 'AI' : '我'}</td><td>{fmtTaskTime(task.startAt)}{task.endAt ? <small>至 {fmtTaskTime(task.endAt)}</small> : null}</td><td><span className={'md-task-state state-' + task.status}>{STATUS_LABELS[task.status]}</span></td><td><button className="md-btn" onClick={() => setDesk({ workflowDialog: task.id })}>查看／办理</button></td></tr>)}
        </React.Fragment>
      })}
    </tbody></table></div>}
    {proposal ? <PlanEditor proposal={proposal} onChange={setProposal} onClose={() => setProposal(null)} /> : null}
    {goalProject ? <ProjectGoal project={workflow.projects.find(row => row.id === goalProject)} /> : null}
  </div>
}

function PlanEditor({ proposal, onChange, onClose }) {
  const [busy, setBusy] = React.useState(false)
  const update = (index, patch) => onChange({ ...proposal, tasks: proposal.tasks.map((task, i) => i === index ? { ...task, ...patch } : task) })
  const modules = Object.entries(MODULE_LABELS).map(([id, label]) => [label, proposal.tasks.filter(task => task.module === id).length]).filter(([, count]) => count)
  const estimate = proposal.tasks.reduce((sum, task) => sum + (Number(task.estimateMin) || 0), 0)
  return <Dialog title="核对任务计划" width={1100} onClose={onClose}><div className="md-plan-editor"><label className="md-field"><span>项目名称</span><input value={proposal.title} onChange={event => onChange({ ...proposal, title: event.target.value })} /></label><p>{proposal.summary}</p><p className="md-muted">{proposal.tasks.length} 项事项 · 预计 {Math.round(estimate / 60 * 10) / 10} 小时 · 分发到 {modules.map(([label, count]) => `${label} ${count}`).join('、')}。确认后按依赖及预计用时自动安排临时预计时间（北京时间 09:00–18:00），可在排期中逐项修改；已有时间不覆盖。</p>
    {proposal.tasks.map((task, index) => <section key={task.id} className="md-plan-row"><TaskFields task={task} tasks={proposal.tasks} onChange={patch => update(index, patch)} compact /><button className="md-btn" onClick={() => onChange({ ...proposal, tasks: proposal.tasks.filter(row => row.id !== task.id).map(row => ({ ...row, dependencies: row.dependencies.filter(id => id !== task.id) })) })}>删除此项</button></section>)}
    <button className="md-btn" onClick={() => onChange({ ...proposal, tasks: [...proposal.tasks, { id: crypto.randomUUID(), title: '新事项', group: '工作事项', module: 'content', executor: 'me', kind: 'text', estimateMin: 30, dependencies: [], spec: DEFAULT_SPEC }] })}>＋ 添加事项</button>
    <button className="md-btn is-primary" disabled={busy} onClick={async () => { setBusy(true); try { const result = await workflowRequest('confirm', { proposalId: proposal.id, title: proposal.title, tasks: proposal.tasks }); setDesk({ workflowProjectId: result.result.projectId }); onClose() } catch (error) { report(error) } finally { setBusy(false) } }}>确认计划并同步排期（{proposal.tasks.length} 项）</button>
  </div></Dialog>
}

function TaskFields({ task, tasks, onChange, compact = false }) {
  return <div className="md-task-form">
    <label className="md-field"><span>事项名称</span><input value={task.title || ''} onChange={event => onChange({ title: event.target.value })} /></label>
    <div className="md-task-field-grid">{[['group', '工作包'], ['video', '关联视频／选题']].map(([key, label]) => <label className="md-field" key={key}><span>{label}</span><input value={task[key] || ''} onChange={event => onChange({ [key]: event.target.value })} /></label>)}
    <label className="md-field"><span>所属功能</span><select value={task.module} onChange={event => onChange({ module: event.target.value })}>{Object.entries(MODULE_LABELS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
    <label className="md-field"><span>执行方式</span><select value={task.executor} onChange={event => onChange({ executor: event.target.value })}><option value="me">我办理</option><option value="ai">AI 文字任务</option></select></label>
    <label className="md-field"><span>事项类型</span><select value={task.kind} onChange={event => onChange({ kind: event.target.value })}>{Object.entries(KIND_LABELS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
    <label className="md-field"><span>预计用时（分钟）</span><input type="number" min="5" max="1440" value={task.estimateMin} onChange={event => onChange({ estimateMin: Number(event.target.value) })} /></label></div>
    {[['description', '要做什么'], ['deliverable', '交付物'], ['acceptance', '完成标准']].map(([key, label]) => <label className="md-field" key={key}><span>{label}</span><textarea rows={compact ? 2 : 3} value={task[key] || ''} onChange={event => onChange({ [key]: event.target.value })} /></label>)}
    <label className="md-field"><span>前置事项（按 Ctrl／⌘ 多选）</span><select multiple size={Math.min(4, Math.max(2, tasks.length - 1))} value={task.dependencies || []} onChange={event => onChange({ dependencies: [...event.target.selectedOptions].map(option => option.value) })}>{tasks.filter(row => row.id !== task.id && row.status !== 'cancelled').map(row => <option key={row.id} value={row.id}>{row.title}</option>)}</select></label>
  </div>
}

export function SchedulePreview({ preview, onApply, onCancel, busy }) {
  return <div className="md-schedule-preview"><p>确认后统一同步到任务工作台与排期。锁定的后续事项不会移动。</p>{preview.changes.map(row => <article key={row.id}><strong>{row.title}</strong><p>{fmtTaskTime(row.before.startAt)} → {fmtTaskTime(row.after.startAt)} 至 {fmtTaskTime(row.after.endAt)}</p></article>)}{preview.warnings.map((row, index) => <p className="md-task-error" key={index}>{row.text}</p>)}{preview.unplaced?.length ? <p>另有 {preview.unplaced.length} 项因可用时间不足或前置时间未定，保留待安排。</p> : null}<div className="md-task-actions"><button className="md-btn" onClick={onCancel}>不改了</button><button className="md-btn is-primary" disabled={busy || !preview.changes.length} onClick={onApply}>确认安排 {preview.changes.length} 项</button></div></div>
}

function TaskDialog() {
  const id = useDesk(s => s.workflowDialog), projectId = useDesk(s => s.workflowProjectId), workflow = useWorkflow()
  const items = useDesk(s => s.state?.items || [])
  const current = workflow.tasks.find(row => row.id === id)
  const [form, setForm] = React.useState(null), [note, setNote] = React.useState(''), [url, setUrl] = React.useState(''), [published, setPublished] = React.useState(false)
  const [times, setTimes] = React.useState({ startAt: '', endAt: '', dueAt: '' }), [preview, setPreview] = React.useState(null), [pendingPatch, setPendingPatch] = React.useState(null), [checks, setChecks] = React.useState({}), [busy, setBusy] = React.useState(false)
  React.useEffect(() => {
    if (!id) return
    setForm(structuredClone(current || { title: '', module: 'content', kind: 'text', executor: 'me', group: '工作事项', dependencies: [], estimateMin: 30, spec: DEFAULT_SPEC }))
    setTimes({ startAt: localTime(current?.startAt), endAt: localTime(current?.endAt), dueAt: localTime(current?.dueAt) })
    setNote(''); setUrl(''); setPublished(false); setPreview(null); setPendingPatch(null); setChecks({})
  }, [id, current?.version])
  if (!id || !form) return null
  const close = () => setDesk({ workflowDialog: null })
  const act = async (action, body = {}) => { setBusy(true); try { return await workflowRequest(action, { id, ...body }) } catch (error) { report(error); return null } finally { setBusy(false) } }
  const peers = workflow.tasks.filter(row => row.projectId === (current?.projectId || projectId))
  const item = items.find(row => row.id === current?.links?.itemId)
  const production = item?.production
  const materials = current ? taskFiles(workflow, current) : []
  const checklist = current && current.kind === 'publish' ? [
    { key: 'title', label: '标题', ready: Boolean(item?.title || current.video || current.title), value: item?.title || current.video || current.title },
    { key: 'summary', label: '简介', ready: Boolean(item?.body || production?.article), value: String(item?.body || production?.article || '').slice(0, 80) },
    { key: 'cover', label: '封面', ready: Boolean(production?.cover?.src), value: production?.cover?.src ? '已有封面图' : '还没有封面' },
    { key: 'video', label: '成片', ready: materials.some(file => file.kind === 'video'), value: materials.find(file => file.kind === 'video')?.name || '还没有成片' },
  ] : []
  const timesChanged = current && ['startAt', 'endAt', 'dueAt'].some(key => (times[key] ? new Date(times[key]).toISOString() : null) !== (current[key] || null))
  const save = async () => {
    if (!current) { if (await act('add', { projectId, task: { ...form, ...times } })) close(); return }
    const patch = { ...form }
    for (const key of ['startAt', 'endAt', 'dueAt']) delete patch[key]
    if (!timesChanged) { if (await act('edit', { patch })) close(); return }
    // 改时间一律先预览：顺延与锁定冲突在确认前可见，不直接覆盖后续事项
    setBusy(true)
    try {
      const result = await workflowRequest('schedule-preview', { changes: [{ id, ...Object.fromEntries(Object.entries(times).map(([key, value]) => [key, value ? new Date(value).toISOString() : null])) }] })
      setPendingPatch(patch); setPreview(result.preview)
    } catch (error) { report(error) } finally { setBusy(false) }
  }
  const applyPreview = async () => {
    setBusy(true)
    try {
      await workflowRequest('schedule-apply', { preview })
      if (pendingPatch) await workflowRequest('edit', { id, patch: pendingPatch })
      setPreview(null); setPendingPatch(null); close()
    } catch (error) { report(error) } finally { setBusy(false) }
  }
  return <Dialog title={current ? '事项办理 · ' + current.title : '新增事项'} width={880} onClose={close}><div className="md-task-detail">
    {current ? <p><span className={'md-task-state state-' + current.status}>{STATUS_LABELS[current.status]}</span> · {MODULE_LABELS[current.module]} · {fmtTaskTime(current.startAt)}{current.endAt ? ' 至 ' + fmtTaskTime(current.endAt) : ''}{current.locked ? ' · 时间已锁定' : ''}</p> : null}
    {current?.error ? <p className="md-task-error" role="alert">{current.error}{current.status === 'blocked' ? <span className="md-task-actions"><button className="md-btn" disabled={busy} onClick={() => act('repair')}>新增修复事项</button><button className="md-btn" disabled={busy} onClick={async () => { if (current.executor === 'ai' && ['text', 'script', 'review'].includes(current.kind)) { if (await act('execute')) setDesk({ activeTaskId: id }) } else await handleTask(current) }}>重试</button></span> : null}</p> : null}
    {current?.conflicts?.length ? <p className="md-task-error">{current.conflicts.map(row => row.text).join('；')}</p> : null}
    {current?.dependencies.length ? <div className="md-task-dependencies">前置交付：{current.dependencies.map(dep => { const task = workflow.tasks.find(row => row.id === dep); return <button className="md-btn" key={dep} onClick={() => setDesk({ workflowDialog: dep })}>{task?.title} · {STATUS_LABELS[task?.status]}</button> })}</div> : null}
    <TaskFields task={form} tasks={peers} onChange={patch => setForm({ ...form, ...patch })} />
    <details open={form.kind === 'shoot' || form.kind === 'images'}><summary>本条视频的制作规格与镜头来源</summary><SpecFields value={form.spec} onChange={spec => setForm({ ...form, spec })} /><ShotSourceFields spec={form.spec} onChange={spec => setForm({ ...form, spec })} /></details>
    <fieldset className="md-task-times"><legend>时间安排</legend><div className="md-task-field-grid">{[['startAt', '开始'], ['endAt', '结束'], ['dueAt', '截止']].map(([key, label]) => <label className="md-field" key={key}><span>{label}</span><input type="datetime-local" value={times[key] || ''} onChange={event => setTimes({ ...times, [key]: event.target.value })} /></label>)}</div><label><input type="checkbox" checked={form.locked || false} onChange={event => setForm({ ...form, locked: event.target.checked })} /> 锁定时间（联动改期时不移动）</label><small className="md-muted">留空即进入待安排；改期先预览对后续事项的影响再确认。</small></fieldset>
    <div className="md-task-actions"><button className="md-btn" disabled={busy} onClick={save}>{current ? '保存事项与时间' : '建立事项'}</button>
    {current ? <><button className="md-btn is-primary" disabled={busy || ['done', 'cancelled', 'running'].includes(current.status)} onClick={async () => { if (current.executor === 'ai' && ['text', 'script', 'review'].includes(current.kind)) { const prepared = await act('handoff'); if (prepared) { setDesk({ activeTaskId: id }); await act('execute') } } else await handleTask(current) }}>开始／去办理</button><button className="md-btn" onClick={() => { setDesk({ activeTaskId: id, dockOpen: true, taskStripOpen: true }); close() }}>让全局助手帮我</button></> : null}</div>
    {preview ? <SchedulePreview preview={preview} busy={busy} onApply={applyPreview} onCancel={() => setPreview(null)} /> : null}
    {current && current.status === 'todo' ? <details><summary>拆分／取消事项</summary><label className="md-field"><span>每行一项，至少两项；新事项继承前置依赖</span><textarea id="md-task-split" rows={3} /></label><button className="md-btn" onClick={async () => { const titles = document.getElementById('md-task-split').value.split('\n').map(value => value.trim()).filter(Boolean); if (await act('split', { tasks: titles.map(title => ({ title })) })) close() }}>拆为独立待办</button><button className="md-btn" onClick={async () => { if (await act('cancel')) close() }}>取消此事项</button></details> : null}
    {current ? <><h3>交付与素材</h3>
      {materials.length ? <div className="md-task-materials">{materials.map(file => <span key={file.id} className="md-task-file">{file.name} · {file.path}</span>)}</div> : <p className="md-muted">还没有绑定实际素材。拍摄与素材类事项需要绑定本地文件后才能交付。</p>}
      <div className="md-task-actions"><button className="md-btn" disabled={busy} onClick={() => act('native', { action: 'import-files' })}>绑定本地素材</button>{current.module === 'autoclip' ? <><button className="md-btn" disabled={busy} onClick={async () => { if (await act('native', { action: 'clip-import' })) { const task = (getDesk().workflow?.tasks || []).find(row => row.id === id); if (task?.links.clipProjectId) setDesk({ clipProjectPath: '/project/' + task.links.clipProjectId, view: 'autoclip' }); close() } }}>确认素材并创建剪辑项目</button><button className="md-btn" disabled={busy} onClick={() => act('native', { action: 'clip-export' })}>核对剪辑导出</button></> : null}{current.module === 'drama' ? <button className="md-btn" disabled={busy} onClick={() => act('native', { action: 'yingce' })}>建立／核对影策交付</button> : null}</div>
      {current.artifacts.map(artifact => <article className="md-task-artifact" key={artifact.id}><small>{fmtTaskTime(artifact.at)} {artifact.model || ''}</small>{artifact.text ? <pre>{artifact.text}</pre> : null}{artifact.files?.map(file => <p key={file.id}>{file.name} · {file.path}</p>)}{artifact.manifest ? <p>发布清单：{artifact.manifest.title} · {artifact.manifest.summary ? '有简介' : '缺简介'} · {artifact.manifest.cover ? '有封面' : '缺封面'} · {artifact.manifest.video ? '有成片' : '缺成片'}{artifact.manifest.url ? ' · ' + artifact.manifest.url : ''}{artifact.manifest.missing?.length ? ' · 待补：' + artifact.manifest.missing.join('、') : ''}</p> : null}{artifact.native ? <p>{artifact.native.exportVerified ? '已验证导出文件' : '已关联模块产物'}</p> : null}</article>)}
      {current.kind === 'publish' ? <div className="md-publish-checklist"><p>发布任务交付：标题、简介、封面、成片。请先在平台人工发布，再逐项确认。</p>{checklist.map(row => <label key={row.key} className={row.ready ? '' : 'is-missing'}><input type="checkbox" checked={Boolean(checks[row.key])} onChange={event => setChecks({ ...checks, [row.key]: event.target.checked })} /> <strong>{row.label}</strong> {row.ready ? row.value : row.value + '（需要先补齐）'}</label>)}<label className="md-field"><span>发布链接（可选）</span><input type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://" /></label><label><input type="checkbox" checked={published} onChange={event => setPublished(event.target.checked)} /> 我已在平台人工发布</label></div> : null}
      <label className="md-field"><span>本次实际交付／修改后的正文</span><textarea rows={5} value={note} onChange={event => setNote(event.target.value)} placeholder="填写实际完成的内容、素材说明，或粘贴修改后的正文。" /></label>
      <button className="md-btn is-primary" disabled={busy || ['done', 'cancelled', 'running'].includes(current.status)} onClick={async () => {
        if (current.kind === 'publish') {
          const missing = checklist.filter(row => !row.ready)
          if (missing.length) { report(new Error('发布交付还缺：' + missing.map(row => row.label).join('、') + '。请先补齐再登记发布结果')); return }
          if (checklist.some(row => !checks[row.key])) { report(new Error('请逐项勾选发布检查清单')); return }
        }
        const saved = await act('deliver', { note, url, published, checklist: current.kind === 'publish' ? true : undefined })
        if (saved) close()
      }}>确认交付完成</button>
      <details><summary>执行记录</summary>{current.history.map((row, index) => <p key={index}>{fmtTaskTime(row.at)} · {row.action}</p>)}</details></> : null}
  </div></Dialog>
}
