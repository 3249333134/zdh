import { randomUUID } from 'node:crypto'
import { productionSpec, normalizeShotSources, SHOT_SOURCES } from './production-spec.js'

export const MODULES = { home: '灵感', style: '风格', content: '内容', drama: '影策', autoclip: '剪辑助手', insights: '复盘' }
export const TASK_STATUSES = ['todo', 'running', 'review', 'blocked', 'done', 'cancelled']
// 跨模块调用只允许这几类本机操作，其余一律拒绝
export const NATIVE_ACTIONS = ['import-files', 'yingce', 'yingce-canvas', 'clip-import', 'clip-export']
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }) }
const str = (value, max = 10000) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const stamp = value => { if (!value) return null; const date = new Date(value); if (!Number.isFinite(+date)) fail('时间格式不正确'); return date.toISOString() }
export const emptyWorkflow = () => ({ revision: 0, projects: [], tasks: [], proposals: [], receipts: [] })
export function workflowOf(state) { return state.workflow || emptyWorkflow() }
export function normalizeTasks(input, projectId) {
  if (!Array.isArray(input) || !input.length || input.length > 150) fail('每份计划需要 1–150 个具体事项')
  const tasks = input.map((row, index) => ({
    id: str(row.id, 100) || `task-${index + 1}`, projectId, title: str(row.title, 200), group: str(row.group, 100) || '工作事项', video: str(row.video, 100),
    module: row.module in MODULES ? row.module : 'content', executor: row.executor === 'ai' ? 'ai' : 'me', kind: ['text', 'script', 'shoot', 'images', 'edit', 'publish', 'review'].includes(row.kind) ? row.kind : 'text',
    description: str(row.description), deliverable: str(row.deliverable), acceptance: str(row.acceptance), estimateMin: Math.max(5, Math.min(1440, Number(row.estimateMin) || 30)),
    dependencies: [...new Set(Array.isArray(row.dependencies) ? row.dependencies.map(id => str(id, 100)) : [])],
    startAt: stamp(row.startAt), endAt: stamp(row.endAt), dueAt: stamp(row.dueAt), locked: row.locked === true,
    spec: productionSpec(row.spec), status: 'todo', version: 1, artifacts: [], history: [], links: {},
  }))
  validateGraph(tasks)
  return tasks
}
export function validateGraph(tasks) {
  const ids = new Map(tasks.map(task => [task.id, task]))
  if (ids.size !== tasks.length) fail('任务编号重复')
  for (const task of tasks) {
    if (!task.title) fail('任务名称不能为空')
    if (task.startAt && task.endAt && Date.parse(task.endAt) <= Date.parse(task.startAt)) fail('结束时间必须晚于开始时间')
    if (task.dependencies.some(id => !ids.has(id) || id === task.id)) fail('前置任务无效')
  }
  const done = new Set(), active = new Set()
  const visit = id => { if (active.has(id)) fail('任务依赖不能成环'); if (done.has(id)) return; active.add(id); for (const dep of ids.get(id).dependencies) visit(dep); active.delete(id); done.add(id) }
  tasks.forEach(task => visit(task.id))
}
export function schedulePreview(workflow, changes, cascade = true) {
  const tasks = structuredClone(workflow.tasks)
  const byId = new Map(tasks.map(task => [task.id, task]))
  const original = new Map(workflow.tasks.map(task => [task.id, task]))
  const changed = new Set(), warnings = []
  for (const change of changes) {
    const task = byId.get(change.id); if (!task) fail('任务不存在', 404)
    if (task.locked && !change.unlock) fail(`「${task.title}」时间已锁定`)
    if (['done', 'cancelled'].includes(task.status)) fail('已完成或取消的事项不能改期')
    for (const key of ['startAt', 'endAt', 'dueAt']) if (key in change) task[key] = stamp(change[key])
    changed.add(task.id)
  }
  const ordered = [], visited = new Set()
  const walk = task => { if (visited.has(task.id)) return; visited.add(task.id); task.dependencies.forEach(id => walk(byId.get(id))); ordered.push(task) }
  tasks.forEach(walk)
  for (const task of ordered) {
    if (task.startAt && task.endAt && Date.parse(task.endAt) <= Date.parse(task.startAt)) fail('结束时间必须晚于开始时间')
    for (const id of task.dependencies) {
      const dep = byId.get(id)
      if (dep.status === 'cancelled') warnings.push({ id: task.id, text: `前置事项「${dep.title}」已取消，需要重新核对` })
      const edge = dep.endAt || dep.startAt
      if (!edge || !task.startAt || Date.parse(task.startAt) >= Date.parse(edge)) continue
      if (!cascade || task.locked || ['done', 'cancelled'].includes(task.status)) { warnings.push({ id: task.id, text: `「${task.title}」与前置事项时间冲突${task.locked ? '，已锁定' : ''}` }); continue }
      const delta = Date.parse(edge) - Date.parse(task.startAt)
      for (const key of ['startAt', 'endAt', 'dueAt']) if (task[key]) task[key] = new Date(Date.parse(task[key]) + delta).toISOString()
      changed.add(task.id)
    }
  }
  return { revision: workflow.revision, changes: [...changed].map(id => ({ id, title: byId.get(id).title, before: { startAt: original.get(id).startAt, endAt: original.get(id).endAt, dueAt: original.get(id).dueAt }, after: { startAt: byId.get(id).startAt, endAt: byId.get(id).endAt, dueAt: byId.get(id).dueAt } })), warnings }
}
export function suggestSchedule(workflow, ids, windows) {
  if (!Array.isArray(windows) || !windows.length) fail('请先填写实际可用的时间段')
  const slots = windows.map(row => ({ start: Date.parse(stamp(row.startAt)), end: Date.parse(stamp(row.endAt)) })).sort((a, b) => a.start - b.start)
  if (slots.some((slot, i) => !Number.isFinite(slot.start) || !Number.isFinite(slot.end) || slot.end <= slot.start || i && slot.start < slots[i - 1].end)) fail('可用时间段不能重叠、为空或倒置')
  const tasks = structuredClone(workflow.tasks), targets = new Set(ids), byId = new Map(tasks.map(task => [task.id, task])), changes = [], visited = new Set()
  const plan = task => {
    if (visited.has(task.id)) return; visited.add(task.id)
    task.dependencies.forEach(id => plan(byId.get(id)))
    if (!targets.has(task.id) || task.locked || ['done', 'cancelled'].includes(task.status)) return
    if (task.dependencies.some(id => { const dep = byId.get(id); return !dep.endAt && dep.status !== 'done' })) return
    const earliest = Math.max(0, ...task.dependencies.map(id => Date.parse(byId.get(id).endAt || '') || 0))
    const duration = task.estimateMin * 60000
    for (const slot of slots) {
      let start = Math.max(slot.start, earliest)
      for (const booked of tasks.filter(t => t.id !== task.id && t.executor === task.executor && t.startAt && t.endAt && (!targets.has(t.id) || visited.has(t.id))).sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))) {
        if (start < Date.parse(booked.endAt) && start + duration > Date.parse(booked.startAt)) start = Date.parse(booked.endAt)
      }
      if (start + duration > slot.end) continue
      task.startAt = new Date(start).toISOString(); task.endAt = new Date(start + duration).toISOString()
      changes.push({ id: task.id, startAt: task.startAt, endAt: task.endAt }); return
    }
  }
  tasks.forEach(plan)
  return { ...schedulePreview(workflow, changes, false), unplaced: [...targets].filter(id => !changes.some(row => row.id === id) && !byId.get(id)?.locked) }
}
// 临时预计安排，不代表用户承诺的可用时间，也不启动任何生成任务。
// 使用北京时间 09:00–18:00；已有时间、锁定事项和交付均保持原样。
export function estimateTaskTimes(tasks, existing = [], now = Date.now()) {
  const offset = 8 * 3600000, hour = 3600000
  const nextSlot = value => {
    const local = new Date(value + offset), day = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offset
    if (value < day + 9 * hour) return day + 9 * hour
    if (value >= day + 18 * hour) return day + 33 * hour
    return value
  }
  const addDuration = (start, minutes) => {
    let cursor = start, left = minutes * 60000
    while (left > 0) {
      cursor = nextSlot(cursor)
      const local = new Date(cursor + offset), end = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 18) - offset
      const used = Math.min(left, end - cursor); cursor += used; left -= used
    }
    return cursor
  }
  const byId = new Map([...existing, ...tasks].map(row => [row.id, row])), seen = new Set()
  const booked = [...existing, ...tasks].filter(row => row.startAt && row.endAt && !row.supersededBy && row.status !== 'cancelled')
  const planned = []
  const visit = task => {
    if (seen.has(task.id)) return; seen.add(task.id)
    task.dependencies.forEach(id => { const dep = byId.get(id); if (dep && tasks.includes(dep)) visit(dep) })
    if (task.startAt || task.endAt || task.dueAt || task.locked || task.supersededBy || ['done', 'cancelled', 'running'].includes(task.status)) return
    let start = nextSlot(Math.ceil(now / 1800000) * 1800000)
    for (const id of task.dependencies) { const dep = byId.get(id); start = nextSlot(Math.max(start, Date.parse(dep?.endAt || dep?.startAt || '') || start)) }
    let end = addDuration(start, task.estimateMin)
    for (const row of booked.slice().sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))) {
      if (start < Date.parse(row.endAt) && end > Date.parse(row.startAt)) { start = nextSlot(Date.parse(row.endAt)); end = addDuration(start, task.estimateMin) }
    }
    Object.assign(task, { startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString(), timeSource: 'estimate' })
    booked.push(task); planned.push(task.id)
  }
  tasks.forEach(visit)
  return planned
}
/** 工作包只是事项上的一个分组标签：汇总进度，但不作为排期条目重复计算。 */
export function groupRollup(tasks) {
  const map = new Map()
  for (const task of tasks) {
    if (task.supersededBy || task.status === 'cancelled') continue
    const key = `${task.projectId}:${task.group || '工作事项'}`
    const row = map.get(key) || { projectId: task.projectId, group: task.group || '工作事项', total: 0, done: 0, todo: 0, running: 0, review: 0, blocked: 0, estimateMin: 0, startAt: null, endAt: null, publications: 0 }
    row.total++
    if (['done', 'todo', 'running', 'review', 'blocked'].includes(task.status)) row[task.status]++
    row.estimateMin += Number(task.estimateMin) || 0
    if (task.kind === 'publish') row.publications++
    for (const [key_, op] of [['startAt', Math.min], ['endAt', Math.max]]) {
      const value = Date.parse(task[key_])
      if (!Number.isFinite(value)) continue
      row[key_] = row[key_] === null ? new Date(value).toISOString() : new Date(op(value, Date.parse(row[key_]))).toISOString()
    }
    map.set(key, row)
  }
  return [...map.values()].map(row => ({ ...row, ratio: row.total ? Math.round(row.done / row.total * 100) : 0 }))
}

/**
 * 统一日程查询：事项本身只有一份记录，日历与任务工作台读同一份数据。
 * 父工作包只出现在 groups 汇总里，不重复计入 entries。
 */
export function buildAgenda(workflow, filter = {}) {
  const keys = ['projectId', 'video', 'module', 'executor', 'status']
  const live = workflow.tasks.filter(task => !task.supersededBy && task.status !== 'cancelled')
  const match = task => keys.every(key => !filter[key] || task[key] === filter[key])
  const chosen = live.filter(match)
  const view = task => ({ id: task.id, title: task.title, projectId: task.projectId, group: task.group, video: task.video, module: task.module, kind: task.kind, executor: task.executor, status: task.status, locked: Boolean(task.locked), estimateMin: task.estimateMin, startAt: task.startAt, endAt: task.endAt, dueAt: task.dueAt })
  const entries = chosen.filter(task => task.startAt || task.dueAt)
  return {
    revision: workflow.revision,
    entries: entries.map(view),
    unplaced: chosen.filter(task => !task.startAt && !task.dueAt).map(view),
    groups: groupRollup(chosen),
    publications: entries.filter(task => task.kind === 'publish').map(task => task.id),
    total: chosen.length,
    placed: entries.length,
    unplacedCount: chosen.filter(task => !task.startAt && !task.dueAt).length,
  }
}

/** 依赖边的冲突只提示，不自动改期：改期一律先走预览确认。 */
export function timeConflicts(tasks, task, { startAt = task.startAt } = {}) {
  const byId = new Map(tasks.map(row => [row.id, row]))
  if (!startAt) return []
  return task.dependencies.flatMap(id => {
    const dep = byId.get(id)
    const edge = dep && (dep.endAt || dep.startAt)
    if (!edge || Date.parse(startAt) >= Date.parse(edge)) return []
    return [{ id, text: `开始时间早于前置事项「${dep.title}」的完成时间` }]
  })
}

export class WorkflowService {
  constructor(store, callText, native = null) { this.store = store; this.callText = callText; this.native = native; this.boot = randomUUID(); this.jobs = new Map() }
  async read() {
    const snapshot = workflowOf(await this.store.read())
    if (snapshot.tasks.some(task => task.status === 'running' && task.boot !== this.boot)) await this.change({}, data => { for (const task of data.tasks) if (task.status === 'running' && task.boot !== this.boot) { task.status = 'blocked'; task.error = '上次执行被中断，可重试；已经保存的产物仍保留'; task.version++ } })
    return structuredClone(workflowOf(await this.store.read()))
  }
  async change(body, update) {
    return this.store.mutate('任务工作台', async state => {
      const data = structuredClone(workflowOf(state))
      const receipt = body.requestId && data.receipts.find(row => row.id === body.requestId)
      if (receipt) return { workflow: data, result: receipt.result, repeated: true }
      if (body.revision !== undefined && body.revision !== data.revision) fail('计划已变化，请刷新后重新操作', 409)
      const result = await update(data, state)
      data.revision++
      if (body.requestId) data.receipts = [...data.receipts, { id: body.requestId, result }].slice(-1000)
      state.workflow = data
      return { workflow: data, result }
    }, { undoable: false })
  }
  async propose(body) {
    const previous = (await this.read()).receipts.find(row => row.id === body.requestId)
    if (previous) return { workflow: await this.read(), result: previous.result, repeated: true }
    const goal = str(body.goal); if (!goal) fail('请填写目标')
    const { text } = await this.callText({ system: `你是个人自媒体任务调度助手。将宽泛目标拆解为工作包与最小可执行事项，覆盖所需功能，不强制所有项目走相同流程。首批最多3条视频。只输出JSON {title,summary,tasks:[{id,title,group,video,module,kind,executor,description,deliverable,acceptance,estimateMin,dependencies}]}。module为home/style/content/drama/autoclip/insights。kind为text/script/shoot/images/edit/publish/review。executor为ai/me。AI仅处理文字，拍摄、素材生成、剪辑、发布由me确认。依赖用任务id，禁止循环。不要编造调研数据或已执行的事实；没有资料则创建收集资料事项。不要自动生成日期。通常12-25项。`, user: goal, maxTokens: 10000, signal: AbortSignal.timeout(180000) })
    const start = text.indexOf('{'), end = text.lastIndexOf('}')
    const plan = JSON.parse(text.slice(start, end + 1))
    const tasks = normalizeTasks(plan.tasks, 'draft')
    return this.change(body, data => {
      const proposal = { id: randomUUID(), goal, title: str(plan.title, 200) || goal.slice(0, 80), summary: str(plan.summary), tasks, status: 'draft', createdAt: new Date().toISOString() }
      data.proposals.push(proposal); return proposal
    })
  }
  async action(action, body) {
    if (action === 'plan') {
      const key = 'plan:' + body.requestId
      if (this.jobs.has(key)) return this.jobs.get(key)
      const job = this.propose(body).finally(() => this.jobs.delete(key)); this.jobs.set(key, job); return job
    }
    if (action === 'agenda') return { agenda: buildAgenda(await this.read(), body.filter || {}) }
    if (action === 'schedule-preview') return { preview: schedulePreview(await this.read(), body.changes || [], body.cascade !== false) }
    if (action === 'suggest-schedule') return { preview: suggestSchedule(await this.read(), body.ids || [], body.windows) }
    if (action === 'execute') return this.execute(body)
    if (action === 'handoff') return this.handoff(body)
    return this.change(body, (data, state) => {
      const project = data.projects.find(row => row.id === body.projectId)
      const task = data.tasks.find(row => row.id === body.id)
      if (action === 'confirm') {
        const proposal = data.proposals.find(row => row.id === body.proposalId)
        if (!proposal) fail('计划草案不存在', 404)
        if (proposal.projectId) return { projectId: proposal.projectId }
        const id = randomUUID(), tasks = normalizeTasks(body.tasks || proposal.tasks, id), mapping = new Map(tasks.map(row => [row.id, randomUUID()]))
        tasks.forEach(row => { row.id = mapping.get(row.id); row.dependencies = row.dependencies.map(id => mapping.get(id)); row.history.push({ at: new Date().toISOString(), action: '确认计划' }) })
        estimateTaskTimes(tasks, data.tasks)
        data.projects.push({ id, title: str(body.title, 200) || proposal.title, goal: proposal.goal, summary: proposal.summary, createdAt: new Date().toISOString() })
        data.tasks.push(...tasks); proposal.status = 'confirmed'; proposal.projectId = id; return { projectId: id }
      }
      if (action === 'project-edit') {
        if (!project) fail('项目不存在', 404)
        const patch = {}
        if (body.title !== undefined) { const title = str(body.title, 200); if (!title) fail('项目名称不能为空'); patch.title = title }
        if (body.goal !== undefined) { const goal = str(body.goal); if (!goal) fail('总目标不能为空'); patch.goal = goal }
        if (body.summary !== undefined) patch.summary = str(body.summary)
        if (!Object.keys(patch).length) fail('没有要修改的项目信息')
        // 只改项目说明：已确认的事项、时间与产物原样保留，不因总目标变化被覆盖
        Object.assign(project, patch)
        project.history = [...(project.history || []), { at: new Date().toISOString(), action: '修改项目目标', fields: Object.keys(patch) }].slice(-200)
        const tasks = data.tasks.filter(row => row.projectId === project.id)
        return { project, tasks }
      }
      if (action === 'add') {
        if (!project) fail('项目不存在', 404)
        const row = { ...body.task, id: randomUUID() }, siblings = data.tasks.filter(t => t.projectId === project.id)
        const added = normalizeTasks([...siblings, row], project.id).at(-1)
        estimateTaskTimes([added], data.tasks)
        data.tasks.push(added); return added
      }
      // 助手提出的一组补充事项在用户确认后一次性建立，避免中途失败留下半套计划
      if (action === 'add-many') {
        if (!project) fail('项目不存在', 404)
        const rows = Array.isArray(body.tasks) ? body.tasks : []
        if (!rows.length || rows.length > 20) fail('一次可补充 1–20 项事项')
        const siblings = data.tasks.filter(t => t.projectId === project.id)
        const added = normalizeTasks([...siblings, ...rows.map(row => ({ ...row, id: randomUUID() }))], project.id).slice(siblings.length)
        estimateTaskTimes(added, data.tasks)
        data.tasks.push(...added)
        return { added }
      }
      if (action === 'schedule-apply') {
        const preview = body.preview
        if (preview?.revision !== data.revision) fail('排期已变化，请重新预览', 409)
        const validated = schedulePreview(data, preview.changes.map(row => ({ id: row.id, ...row.after })), false)
        for (const row of validated.changes) { const t = data.tasks.find(t => t.id === row.id); Object.assign(t, row.after); t.timeSource = 'manual'; t.version++; t.history.push({ at: new Date().toISOString(), action: '修改排期', times: row.after }) }
        return validated
      }
      if (action === 'estimate-unscheduled') {
        const targets = data.tasks.filter(row => !body.projectId || row.projectId === body.projectId)
        const ids = estimateTaskTimes(targets, data.tasks)
        for (const row of targets.filter(row => ids.includes(row.id))) { row.version++; row.history.push({ at: new Date().toISOString(), action: '生成预计时间（可调整）' }) }
        return { ids }
      }
      if (!task) fail('事项不存在', 404)
      if (action === 'edit') {
        if (task.status === 'running') fail('请等待本次执行结束后修改', 409)
        const allowed = ['title', 'group', 'video', 'description', 'deliverable', 'acceptance', 'module', 'kind', 'executor', 'estimateMin', 'dependencies', 'locked', 'spec', 'startAt', 'endAt', 'dueAt']
        const patch = Object.fromEntries(allowed.filter(key => key in (body.patch || {})).map(key => [key, body.patch[key]]))
        const normalized = normalizeTasks(data.tasks.filter(row => row.projectId === task.projectId).map(row => row.id === task.id ? { ...row, ...patch } : row), task.projectId).find(row => row.id === task.id)
        for (const key of allowed) task[key] = normalized[key]
        if (['startAt', 'endAt', 'dueAt'].some(key => key in patch)) task.timeSource = 'manual'
        const item = state.items.find(row => row.id === task.links.itemId)
        if (item) item.productionSpec = task.spec
        // 改时间与改说明分开记录；与前置事项冲突只提示，不会顺带改动别的事项
        const conflicts = ['startAt', 'endAt', 'dueAt'].some(key => key in patch) ? timeConflicts(data.tasks, task) : []
        task.version++
        task.history.push({ at: new Date().toISOString(), action: ['startAt', 'endAt', 'dueAt'].some(key => key in patch) ? '修改时间与事项' : '修改事项' })
        return { ...task, conflicts }
      }
      // 助手协助修改：只追加一份修改稿，不改变事项状态，也不覆盖已完成的交付
      if (action === 'revise') {
        if (['running', 'cancelled', 'done'].includes(task.status)) fail('当前状态不能保存修改稿')
        const text = str(body.text, 20000)
        if (!text) fail('没有可保存的修改稿')
        task.artifacts.push({ id: randomUUID(), at: new Date().toISOString(), text, revision: true, ...(str(body.model, 100) ? { model: str(body.model, 100) } : {}) })
        task.version++
        task.history.push({ at: new Date().toISOString(), action: '保存助手修改稿' })
        return task
      }
      if (action === 'repair') {
        const live = data.tasks.find(row => row.repairOf === task.id && row.status !== 'cancelled')
        if (live) return live
        const siblings = data.tasks.filter(row => row.projectId === task.projectId)
        const row = { id: randomUUID(), title: '修复：' + task.title.slice(0, 60), group: '修复', video: task.video, module: task.module, kind: body.kind || (task.kind === 'shoot' ? 'shoot' : 'text'), executor: 'ai', description: String(task.error || '补充失败原因所需的条件后重试原事项').slice(0, 4000), deliverable: '让原事项可以继续办理的条件（素材、授权、服务或转写工具）', acceptance: '修复后原事项能重新开始并产出可核对的交付', estimateMin: 20, dependencies: task.dependencies, status: 'todo' }
        const added = normalizeTasks([...siblings, row], task.projectId).at(-1)
        added.repairOf = task.id
        estimateTaskTimes([added], data.tasks)
        data.tasks.push(added)
        task.repairTaskId = added.id
        task.history.push({ at: new Date().toISOString(), action: '新增修复事项' })
        task.version++
        return added
      }

      if (action === 'cancel') { if (task.status === 'running') fail('执行中不能取消，请等待结果后处理'); task.status = 'cancelled'; task.version++; return task }
      if (action === 'split') {
        if (task.status !== 'todo' || task.links.itemId || task.artifacts.length) fail('仅未办理的待办可拆分，已有产物请新增后续任务')
        const children = body.tasks
        if (!Array.isArray(children) || children.length < 2 || children.length > 20) fail('拆分需要2–20项')
        const replacements = children.map((row, i) => ({ ...task, ...row, id: randomUUID(), title: str(row.title), dependencies: task.dependencies, links: {}, artifacts: [], history: [], status: 'todo', version: 1 }))
        const ids = replacements.map(row => row.id)
        replacements.forEach(row => { if (!row.locked) { row.startAt = null; row.endAt = null; row.dueAt = null } })
        task.status = 'cancelled'; task.supersededBy = ids
        for (const row of data.tasks) if (row.id !== task.id && row.dependencies.includes(task.id)) row.dependencies = [...new Set(row.dependencies.flatMap(id => id === task.id ? ids : [id]))]
        estimateTaskTimes(replacements, data.tasks)
        data.tasks.push(...replacements); validateGraph(data.tasks.filter(row => row.projectId === task.projectId)); return { ids }
      }
      if (action === 'merge') {
        const rows = data.tasks.filter(row => (body.ids || []).includes(row.id))
        if (rows.length < 2 || rows.some(row => row.projectId !== task.projectId || row.status !== 'todo' || row.artifacts.length || Object.keys(row.links).length)) fail('只能合并同项目尚未办理的待办')
        const ids = new Set(rows.map(row => row.id)), id = randomUUID()
        const merged = { ...task, id, title: str(body.title) || rows.map(row => row.title).join('、'), dependencies: [...new Set(rows.flatMap(row => row.dependencies).filter(dep => !ids.has(dep)))], description: rows.map(row => row.description).join('\n'), startAt: null, endAt: null, dueAt: null, locked: false, links: {}, artifacts: [], history: [] }
        rows.forEach(row => { row.status = 'cancelled'; row.supersededBy = [id] })
        for (const row of data.tasks) if (!ids.has(row.id)) row.dependencies = [...new Set(row.dependencies.map(dep => ids.has(dep) ? id : dep))]
        estimateTaskTimes([merged], data.tasks)
        data.tasks.push(merged); validateGraph(data.tasks.filter(row => row.projectId === task.projectId)); return merged
      }
      if (action === 'deliver') {
        if (task.status === 'running' || task.status === 'cancelled') fail('当前状态不能交付')
        const deps = data.tasks.filter(row => task.dependencies.includes(row.id) && row.status !== 'done'); if (deps.length) fail('前置事项尚未完成：' + deps.map(row => row.title).join('、'))
        const note = str(body.note), files = Array.isArray(body.files) ? body.files.slice(0, 100) : []
        if (!note && !files.length && !task.artifacts.length && task.kind !== 'publish') fail('需要填写实际交付内容或绑定素材')
        if (task.kind === 'shoot' && !files.length && !task.artifacts.some(row => row.files?.length)) fail('拍摄事项需要绑定实际本地素材')
        if (task.kind === 'images') {
          const produced = state.items.find(row => row.id === task.links.itemId)?.production
          const saved = [produced?.cover, ...(produced?.images || []), ...(produced?.shots || [])].some(asset => asset?.status === 'done' && asset.src)
          if (!saved && !task.artifacts.some(row => row.files?.some(file => file.kind === 'image'))) fail('图片事项需要实际生成或绑定的图片，文字描述不能替代图片交付')
        }
        if (task.kind === 'edit' && !task.artifacts.some(row => row.native?.exportVerified)) fail('请先从剪辑助手核对已完成的导出')
        if (files.length) fail('素材绑定必须通过本地素材核验接口')
        let manifest = null
        if (task.kind === 'publish') {
          if (!body.published) fail('请明确确认已经人工发布')
          if (!body.checklist) fail('请逐项确认发布检查清单：标题、简介、封面与成片')
          const item = state.items.find(row => row.id === task.links.itemId)
          const production = item?.production
          const upstream = data.tasks.filter(row => task.dependencies.includes(row.id)).flatMap(row => row.artifacts).flatMap(row => row.files || [])
          manifest = {
            title: item?.title || task.video || task.title,
            summary: String(item?.body || production?.article || task.description || '').slice(0, 300),
            cover: production?.cover?.src || '',
            video: [...task.artifacts, { files: upstream }].flatMap(row => row.files || []).find(file => file.kind === 'video')?.path || '',
            url: body.url && /^https:\/\//.test(body.url) ? body.url : '',
            checked: true,
            checkedAt: new Date().toISOString(),
          }
          manifest.missing = ['title', 'summary', 'cover', 'video'].filter(key => !manifest[key])
        }
        const artifact = (note || manifest || body.url) ? { id: randomUUID(), at: new Date().toISOString(), ...(note ? { text: note } : {}), ...(manifest ? { manifest } : {}), ...(body.url && /^https:\/\//.test(body.url) ? { url: body.url } : {}) } : null
        if (artifact) task.artifacts.push(artifact)
        task.status = 'done'; task.version++; task.history.push({ at: new Date().toISOString(), action: '确认交付' })
        if (task.links.itemId && task.kind === 'publish') { const item = state.items.find(row => row.id === task.links.itemId); if (item) { item.status = 'published'; item.publishedAt = new Date().toISOString() } }
        return task
      }
      fail('不支持的事项操作')
    })
  }
  async execute(body) {
    const started = await this.change(body, data => {
      const task = data.tasks.find(row => row.id === body.id); if (!task) fail('事项不存在', 404)
      if (task.status === 'running' || task.status === 'done' || task.status === 'cancelled') fail('当前状态不能开始', 409)
      if (task.executor !== 'ai' || !['text', 'script', 'review'].includes(task.kind)) fail('此事项需要前往功能办理')
      if (task.dependencies.some(id => data.tasks.find(row => row.id === id)?.status !== 'done')) fail('请先完成前置事项')
      task.status = 'running'; task.boot = this.boot; task.error = null; task.version++; return { id: task.id, version: task.version }
    })
    if (!started.repeated) {
      const task = structuredClone(started.workflow.tasks.find(row => row.id === body.id))
      const job = this.runText(task).finally(() => this.jobs.delete(task.id)); this.jobs.set(task.id, job)
    }
    return started
  }
  async runText(task) {
    try {
      const data = await this.read(), project = data.projects.find(row => row.id === task.projectId)
      const inputs = data.tasks.filter(row => task.dependencies.includes(row.id)).map(row => ({ title: row.title, artifacts: row.artifacts }))
      const { text, model } = await this.callText({ system: '你是自媒体工作台事项执行助手。仅输出本事项可直接使用的Markdown交付正文，不修改任何系统状态，不声称完成实拍、检索、图片生成、剪辑或发布。引用已有资料，缺乏实际证据时标注待核实。脚本遵守目标时长与制作规格。', user: JSON.stringify({ project: { title: project.title, goal: project.goal }, task, inputs }), maxTokens: 12000, signal: AbortSignal.timeout(240000) })
      if (!text.trim()) fail('模型未返回交付内容')
      await this.change({}, (data, state) => {
        const current = data.tasks.find(row => row.id === task.id)
        if (current.version !== task.version || current.status !== 'running') fail('事项已发生变化', 409)
        current.artifacts.push({ id: randomUUID(), text, model, at: new Date().toISOString() }); current.status = 'review'; current.version++
        if (current.kind === 'script' && current.links.itemId) {
          const item = state.items.find(row => row.id === current.links.itemId)
          if (item) { item.drafts = { ...item.drafts, script: text }; item.body = text }
        }
      })
    } catch (error) { await this.change({}, data => { const current = data.tasks.find(row => row.id === task.id); if (current?.status === 'running') { current.status = 'blocked'; current.error = error.message; current.version++ } }) }
  }
  async handoff(body) {
    return this.change(body, (data, state) => {
      const task = data.tasks.find(row => row.id === body.id); if (!task) fail('事项不存在', 404)
      if (['cancelled', 'done'].includes(task.status)) return task
      if (task.dependencies.some(id => data.tasks.find(row => row.id === id)?.status !== 'done')) fail('请先完成前置事项')
      if (!task.links.itemId) {
        const shared = task.video && data.tasks.find(row => row.projectId === task.projectId && row.video === task.video && row.links.itemId)
        if (shared) task.links.itemId = shared.links.itemId
        else {
          const id = 'wf-' + randomUUID()
          state.items.push({ id, kind: 'note', title: task.video || task.title, body: task.description, tags: [], audienceIds: [], personaIds: [], status: 'outline', createdAt: new Date().toISOString(), workflowProjectId: task.projectId, productionSpec: task.spec })
          task.links.itemId = id
        }
      }
      const item = state.items.find(row => row.id === task.links.itemId)
      if (item && task.spec) item.productionSpec = task.spec
      task.version++; return task
    })
  }
  async nativeAction(body) {
    if (!this.native) fail('此操作需要独立桌面版', 503)
    if (!NATIVE_ACTIONS.includes(body.action)) fail('不支持的本机事项操作')
    const data = await this.read(), task = data.tasks.find(row => row.id === body.id)
    if (!task) fail('事项不存在', 404)
    // 先按请求编号去重：重复提交即使前置状态已变化，也返回第一次的结果，不重复创建对象
    const existing = data.receipts.find(row => row.id === body.requestId); if (existing) return { workflow: data, result: existing.result, repeated: true }
    if (body.revision !== data.revision) fail('事项已变化，请刷新', 409)
    if (task.status === 'running' || ['done', 'cancelled'].includes(task.status)) fail('当前状态不能办理', 409)
    if (task.dependencies.some(id => data.tasks.find(row => row.id === id)?.status !== 'done')) fail('前置事项未完成')
    const inputs = data.tasks.filter(row => row.projectId === task.projectId && (task.dependencies.includes(row.id) || task.video && row.video === task.video)).flatMap(row => row.artifacts)
    let result
    try {
      result = await this.native({ action: body.action, task, project: data.projects.find(row => row.id === task.projectId), inputs, fileIds: body.fileIds, canvasId: body.canvasId, requestId: body.requestId })
    } catch (error) {
      const message = error?.message || String(error)
      // 用户主动取消不算失败；其余失败落成受阻，便于生成修复事项，已保存的产物不会被清除
      if (!/取消/.test(message)) {
        await this.change({}, current => {
          const now = current.tasks.find(row => row.id === task.id)
          if (!now || now.version !== task.version || now.status === 'running') return
          now.status = 'blocked'; now.error = message; now.version++
          now.history.push({ at: new Date().toISOString(), action: '办理失败', message })
        }).catch(() => {})
      }
      throw error
    }
    return this.change({ ...body, revision: undefined }, current => {
      const now = current.tasks.find(row => row.id === task.id)
      if (now.version !== task.version) fail('对象已变化，已保存的外部产物保留，请重新核对关联', 409)
      now.links = { ...now.links, ...result.links }
      if (result.artifact) now.artifacts.push({ id: randomUUID(), at: new Date().toISOString(), ...result.artifact })
      now.version++; return now
    })
  }
}
