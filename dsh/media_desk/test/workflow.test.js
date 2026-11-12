import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from '../src/store.js'
import { WorkflowService, normalizeTasks, validateGraph, schedulePreview, suggestSchedule, estimateTaskTimes } from '../src/workflow.js'
import { productionSpec, imageTotal, allocateShotTimes, shotChecklist } from '../src/production-spec.js'

const at = hour => `2026-11-10T${String(hour).padStart(2, '0')}:00:00.000Z`
const rows = () => [
  { id: 'a', title: '脚本', module: 'content', kind: 'script', executor: 'ai', dependencies: [], startAt: at(9), endAt: at(10) },
  { id: 'b', title: '拍摄', module: 'drama', kind: 'shoot', dependencies: ['a'], startAt: at(10), endAt: at(11) },
  { id: 'c', title: '剪辑', module: 'autoclip', kind: 'edit', dependencies: ['b'], startAt: at(11), endAt: at(12), locked: true },
]
async function fixture(t, callText = async () => ({ text: '# 实际脚本\n开场、过程与结尾。', model: 'test-model' }), native) {
  const root = await mkdtemp(join(tmpdir(), 'media-workflow-')); t.after(() => rm(root, { recursive: true, force: true }))
  const store = new Store(root), service = new WorkflowService(store, callText, native)
  await store.read()
  await store.mutate('', state => { state.workflow = { revision: 0, projects: [], tasks: [], proposals: [{ id: 'draft', title: '测试创作', goal: '拍摄教程', tasks: rows(), status: 'draft' }], receipts: [] } })
  const result = await service.action('confirm', { proposalId: 'draft', requestId: 'confirm', revision: 0 })
  return { root, store, service, workflow: result.workflow }
}
test('制作规格分别计数，镜头时长合计精确且不改变源数据', () => {
  const spec = productionSpec(); assert.equal(imageTotal(spec), 9)
  assert.equal(imageTotal(productionSpec({ imageCount: 0, shotImages: false, coverEnabled: false })), 0)
  assert.throws(() => productionSpec({ durationSec: 10, shotCount: 11 }))
  const shots = [{ seconds: 5 }, { seconds: 9 }, { seconds: 2 }], allocated = allocateShotTimes(shots, 61)
  assert.equal(allocated.reduce((sum, row) => sum + row.seconds, 0), 61)
  assert.equal(shots[0].seconds, 5)
})
test('拒绝重复编号、依赖成环、跨项目依赖和倒置时间', () => {
  assert.throws(() => normalizeTasks([{ ...rows()[0], dependencies: ['missing'] }], 'project'))
  assert.throws(() => normalizeTasks([{ ...rows()[0], dependencies: ['b'] }, { ...rows()[1], dependencies: ['a'] }], 'project'))
  assert.throws(() => normalizeTasks([rows()[0], rows()[0]], 'project'))
  assert.throws(() => normalizeTasks([{ ...rows()[0], endAt: at(8) }], 'project'))
})
test('改期先预览，后续顺延且锁定事项保留并提示冲突', () => {
  const workflow = { revision: 7, tasks: normalizeTasks(rows(), 'project') }
  const preview = schedulePreview(workflow, [{ id: 'a', startAt: at(12), endAt: at(13) }])
  assert.equal(workflow.tasks[0].startAt, at(9))
  assert.equal(preview.changes.find(row => row.id === 'b').after.startAt, at(13))
  assert.equal(preview.changes.some(row => row.id === 'c'), false)
  assert.ok(preview.warnings.some(row => row.id === 'c'))
  assert.throws(() => schedulePreview(workflow, [{ id: 'c', startAt: at(14) }]))
})
test('可用时间未填写时不自动假定工作时间；按依赖和实际窗口排队', () => {
  const tasks = normalizeTasks(rows().slice(0, 2).map(row => ({ ...row, startAt: null, endAt: null })), 'project')
  const workflow = { revision: 1, tasks }
  assert.throws(() => suggestSchedule(workflow, tasks.map(row => row.id), []))
  const preview = suggestSchedule(workflow, tasks.map(row => row.id), [{ startAt: at(9), endAt: at(11) }])
  assert.equal(preview.changes.length, 2)
  assert.ok(Date.parse(preview.changes[1].after.startAt) >= Date.parse(preview.changes[0].after.endAt))
})
test('确认计划幂等，每个具体事项直接成为排期数据；旧内容保留', async t => {
  const { store, service, workflow } = await fixture(t)
  const duplicate = await service.action('confirm', { proposalId: 'draft', revision: 0, requestId: 'confirm' })
  assert.equal(duplicate.workflow.tasks.length, 3); assert.equal(duplicate.repeated, true)
  assert.equal(duplicate.workflow.projects.length, 1)
  assert.ok((await store.read()).items.length > 0)
  assert.equal(workflow.tasks.every(row => row.startAt && row.endAt), true)
})
test('排期确认拒绝陈旧版本；重启保持任务和精确时间', async t => {
  const { root, service, workflow } = await fixture(t)
  const preview = schedulePreview(workflow, [{ id: workflow.tasks[0].id, startAt: at(12), endAt: at(13) }])
  await service.action('schedule-apply', { preview, revision: workflow.revision, requestId: 'move' })
  await assert.rejects(service.action('schedule-apply', { preview, revision: workflow.revision, requestId: 'stale' }), /变化/)
  const reopened = new WorkflowService(new Store(root), async () => { throw new Error('不应在重启或到点调用模型') })
  assert.equal((await reopened.read()).tasks[0].startAt, at(12))
})
test('AI执行需要点击且等待前置任务；实际产物保存后待确认，不自动算完成', async t => {
  let calls = 0
  const { store, service, workflow } = await fixture(t, async () => { calls++; return { text: '# 实际脚本', model: 'test' } })
  assert.equal(calls, 0)
  const task = workflow.tasks[0]
  await service.action('handoff', { id: task.id, revision: workflow.revision, requestId: 'open' })
  const current = await service.read()
  const result = await service.action('execute', { id: task.id, revision: current.revision, requestId: 'execute' })
  await service.jobs.get(task.id)
  const ready = (await service.read()).tasks[0]
  assert.equal(calls, 1); assert.equal(ready.status, 'review'); assert.equal(ready.artifacts[0].model, 'test')
  assert.ok((await store.read()).items.find(row => row.id === ready.links.itemId).drafts.script)
  const delivered = await service.action('deliver', { id: task.id, revision: (await service.read()).revision, requestId: 'deliver' })
  assert.equal(delivered.result.status, 'done')
  assert.equal(result.workflow.tasks[0].status, 'running')
})
test('拍摄不能靠空备注完成；失败和重启中断保留明确阻塞', async t => {
  const { store, service, workflow } = await fixture(t, async () => { throw new Error('模型服务中断') })
  const a = workflow.tasks[0]
  await service.action('execute', { id: a.id, requestId: 'execute' }); await service.jobs.get(a.id)
  assert.equal((await service.read()).tasks[0].status, 'blocked')
  await store.mutate('', state => { state.workflow.tasks[0].status = 'done'; state.workflow.tasks[1].status = 'running'; state.workflow.tasks[1].boot = 'old-process' })
  const recovered = await service.read()
  assert.equal(recovered.tasks[1].status, 'blocked')
  await assert.rejects(service.action('deliver', { id: recovered.tasks[1].id, note: '拍好了' }), /本地素材/)
})
test('新增、拆分、合并重连依赖且保护已办理产物', async t => {
  const { service, workflow } = await fixture(t)
  const first = workflow.tasks[0]
  const split = await service.action('split', { id: first.id, tasks: [{ title: '脚本上半' }, { title: '脚本下半' }] })
  const children = split.result.ids
  assert.deepEqual(split.workflow.tasks.find(row => row.kind === 'shoot').dependencies, children)
  const merged = await service.action('merge', { id: children[0], ids: children, title: '合并脚本' })
  assert.deepEqual(merged.workflow.tasks.find(row => row.kind === 'shoot').dependencies, [merged.result.id])
  validateGraph(merged.workflow.tasks)
})
test('剪辑与发布必须验证实际交付；重复本机交接不重复创建', async t => {
  let calls = 0
  const { store, service, workflow } = await fixture(t, undefined, async () => { calls++; return { links: { clipProjectId: 'real-project' }, artifact: { native: { exportVerified: true } } } })
  await store.mutate('', state => { state.workflow.tasks[0].status = 'done'; state.workflow.tasks[1].status = 'done' })
  const task = (await service.read()).tasks[2]
  await assert.rejects(service.action('deliver', { id: task.id, note: '剪完了' }), /导出/)
  const body = { id: task.id, revision: (await service.read()).revision, requestId: 'native', action: 'clip-export' }
  await service.nativeAction(body)
  const current = await service.read()
  await service.nativeAction({ ...body, revision: current.revision })
  assert.equal(calls, 1)
  const delivered = await service.action('deliver', { id: task.id, note: '核对成片' }); assert.equal(delivered.result.status, 'done')
  assert.ok(workflow.tasks.length)
})


test('宽泛目标先出可编辑草案，确认前不建档；修改后确认才建立正式事项', async t => {
  const plan = {
    title: '仿妆账号首批内容', summary: '从定位到复盘的跨功能计划',
    tasks: [
      { id: 'g1', title: '账号定位与表达规则', group: '定位', module: 'style', kind: 'text', executor: 'ai', estimateMin: 40, dependencies: [], deliverable: '定位说明', acceptance: '人群、场景与口吻写清楚' },
      { id: 'g2', title: '竞品资料整理', group: '选题', module: 'home', kind: 'text', executor: 'ai', estimateMin: 60, dependencies: ['g1'] },
      { id: 'g3', title: '首批选题与脚本', group: '选题', module: 'content', kind: 'script', executor: 'ai', estimateMin: 90, dependencies: ['g2'] },
      { id: 'g4', title: '分镜与画布', group: '拍摄', module: 'drama', kind: 'shoot', executor: 'me', estimateMin: 120, dependencies: ['g3'] },
      { id: 'g5', title: '素材拍摄', group: '拍摄', module: 'drama', kind: 'shoot', executor: 'me', estimateMin: 180, dependencies: ['g4'] },
      { id: 'g6', title: '剪辑成片', group: '剪辑', module: 'autoclip', kind: 'edit', executor: 'me', estimateMin: 150, dependencies: ['g5'] },
      { id: 'g7', title: '人工发布', group: '发布', module: 'content', kind: 'publish', executor: 'me', estimateMin: 20, dependencies: ['g6'] },
      { id: 'g8', title: '效果复盘', group: '复盘', module: 'insights', kind: 'review', executor: 'ai', estimateMin: 40, dependencies: ['g7'] },
    ],
  }
  let calls = 0
  const { service } = await fixture(t, async () => { calls++; return { text: '先说明\n' + JSON.stringify(plan), model: 'stub' } })
  const draft = await service.propose({ goal: '做一个仿妆账号', requestId: 'plan-1' })
  assert.equal(calls, 1)
  assert.equal(draft.result.status, 'draft')
  const before = await service.read()
  assert.equal(before.projects.length, 1)
  // 草案阶段不建立正式事项
  assert.equal(before.tasks.every(row => row.projectId !== draft.result.id), true)
  const edited = draft.result.tasks.map(row => row.id === 'g3' ? { ...row, title: '首批选题与脚本（改）' } : row)
  const confirmed = await service.action('confirm', { proposalId: draft.result.id, revision: before.revision, requestId: 'confirm-1', tasks: edited })
  const after = await service.read()
  const project = after.projects.find(row => row.id === confirmed.result.projectId)
  assert.equal(after.tasks.filter(row => row.projectId === project.id).length, 8)
  assert.ok(after.tasks.some(row => row.title === '首批选题与脚本（改）'))
  const modules = new Set(after.tasks.map(row => row.module))
  assert.ok(['style', 'home', 'content', 'drama', 'autoclip', 'insights'].every(id => modules.has(id)))
})

test('日程查询只返回一次，工作包汇总进度，未定时间进入待安排', async t => {
  const { store, service } = await fixture(t)
  await store.mutate('', state => { state.workflow.tasks[0].group = '脚本'; state.workflow.tasks[0].status = 'done'; state.workflow.tasks[1].group = '脚本'; state.workflow.tasks[1].startAt = null; state.workflow.tasks[1].endAt = null; state.workflow.tasks[1].dueAt = null })
  const agenda = await service.action('agenda', { filter: {} })
  assert.equal(agenda.agenda.entries.length, 2)
  assert.equal(agenda.agenda.unplaced.length, 1)
  assert.equal(new Set(agenda.agenda.entries.map(row => row.id)).size, 2)
  assert.equal(agenda.agenda.entries[0].id, (await service.read()).tasks[0].id)
  const group = agenda.agenda.groups.find(row => row.group === '脚本')
  assert.equal(group.total, 2); assert.equal(group.done, 1); assert.equal(group.ratio, 50)
  assert.equal(agenda.agenda.groups.reduce((sum, row) => sum + row.total, 0), agenda.agenda.total)
})

test('修改项目总目标不覆盖已完成成果；时间改动单独记录并提示前置冲突', async t => {
  const { store, service, workflow } = await fixture(t)
  const projectId = workflow.tasks[0].projectId
  await store.mutate('', state => {
    state.workflow.tasks[0].status = 'done'
    state.workflow.tasks[0].artifacts.push({ id: 'a1', text: '已交付的脚本正文', at: new Date().toISOString() })
    state.workflow.projects[0].history = []
  })
  const before = await service.read()
  await service.action('project-edit', { projectId, goal: '改成做美妆测评账号', revision: before.revision, requestId: 'goal' })
  const after = await service.read()
  assert.equal(after.projects[0].goal, '改成做美妆测评账号')
  assert.equal(after.tasks[0].status, 'done')
  assert.equal(after.tasks[0].artifacts[0].text, '已交付的脚本正文')
  const shoot = after.tasks.find(row => row.kind === 'shoot')
  const edited = await service.action('edit', { id: shoot.id, revision: after.revision, requestId: 'time', patch: { startAt: after.tasks[0].startAt, endAt: after.tasks[0].endAt, description: '改说明' } })
  assert.equal(edited.result.startAt, after.tasks[0].startAt)
  assert.equal(edited.result.conflicts.length, 1)
  assert.equal((await service.read()).tasks[0].status, 'done')
})

test('受阻事项可生成一次修复事项，重复请求不重复创建', async t => {
  const { store, service, workflow } = await fixture(t)
  await store.mutate('', state => { state.workflow.tasks[0].status = 'blocked'; state.workflow.tasks[0].error = '本地转写未安装' })
  const revision = (await service.read()).revision
  const first = await service.action('repair', { id: workflow.tasks[0].id, revision, requestId: 'repair-1' })
  assert.equal(first.result.group, '修复')
  assert.equal(first.result.repairOf, workflow.tasks[0].id)
  const second = await service.action('repair', { id: workflow.tasks[0].id, revision: (await service.read()).revision, requestId: 'repair-2' })
  assert.equal((await service.read()).tasks.filter(row => row.group === '修复').length, 1)
  assert.equal(second.result.id, first.result.id)
})

test('发布交付需要检查清单与人工发布，并记录标题、简介、封面与成片', async t => {
  const { store, service, workflow } = await fixture(t)
  const projectId = workflow.tasks[0].projectId
  await store.mutate('', state => { for (const row of state.workflow.tasks) row.status = 'done' })
  const revision = (await service.read()).revision
  const added = await service.action('add', { projectId, revision, requestId: 'add', task: { title: '人工发布', group: '发布', module: 'content', kind: 'publish', executor: 'me', dependencies: [], estimateMin: 20 } })
  const publish = added.result
  await assert.rejects(service.action('deliver', { id: publish.id, note: '发了', revision: (await service.read()).revision }), /人工发布/)
  await assert.rejects(service.action('deliver', { id: publish.id, published: true, revision: (await service.read()).revision }), /检查清单/)
  const delivered = await service.action('deliver', { id: publish.id, published: true, checklist: true, note: '已在平台发布', url: 'https://example.com/p/1', revision: (await service.read()).revision, requestId: 'deliver-publish' })
  assert.equal(delivered.result.status, 'done')
  const artifact = delivered.result.artifacts.at(-1)
  assert.equal(artifact.manifest.checked, true)
  assert.equal(artifact.manifest.url, 'https://example.com/p/1')
  assert.ok(artifact.manifest.missing.includes('cover'))
})

test('镜头来源按镜头数对齐，准备清单与完成标准跟着来源走', () => {
  const spec = productionSpec({ shotCount: 4, shotSources: ['shoot', 'screen', 'local'] })
  assert.equal(spec.shotSources.length, 4)
  assert.equal(spec.shotSources[3], 'ai')
  const checklist = shotChecklist(spec.shotSources)
  assert.equal(checklist.length, 4)
  assert.equal(checklist[0].label, '实拍')
  assert.ok(checklist[1].prep.length >= 3)
  assert.ok(checklist[1].accept.includes('录屏'))
  assert.equal(imageTotal(spec), 1 + 2 + 4)
  // 关掉分镜参考图后默认来源回落实拍；非法来源被替换而不是留着
  assert.deepEqual(productionSpec({ shotCount: 2, shotImages: false, shotSources: ['bogus'] }).shotSources, ['shoot', 'shoot'])
})

test('跨模块操作只走白名单，陈旧版本拒绝，重复本机请求不重复执行', async t => {
  let calls = 0
  const { store, service, workflow } = await fixture(t, undefined, async () => { calls++; return { links: { clipProjectId: 'p1' }, artifact: { native: { exportVerified: true } } } })
  const task = workflow.tasks[1]
  // 只有前置完成后才允许办理；白名单、版本与去重都在此之后验证
  await store.mutate('', state => { state.workflow.tasks[0].status = 'done' })
  await assert.rejects(service.nativeAction({ id: task.id, action: 'rm-rf', revision: workflow.revision }), /不支持/)
  await assert.rejects(service.nativeAction({ id: task.id, action: 'clip-export', revision: workflow.revision + 99 }), /刷新/)
  const body = { id: task.id, action: 'clip-export', revision: (await service.read()).revision, requestId: 'native-1' }
  await service.nativeAction(body)
  await service.nativeAction({ ...body, revision: (await service.read()).revision })
  assert.equal(calls, 1)
})

test('助手建议的补充事项确认后一次建立并进入预计排期，重复请求不重复创建', async t => {
  const { service, workflow } = await fixture(t)
  const projectId = workflow.tasks[0].projectId
  const body = { projectId, revision: (await service.read()).revision, requestId: 'add-many', tasks: [
    { title: '补充竞品资料', group: '选题', module: 'home', kind: 'text', executor: 'ai', estimateMin: 30 },
    { title: '补拍开场镜头', group: '拍摄', module: 'drama', kind: 'shoot', executor: 'me', estimateMin: 60 },
  ] }
  const added = await service.action('add-many', body)
  assert.equal(added.result.added.length, 2)
  const again = await service.action('add-many', body)
  assert.equal(again.repeated, true)
  const after = await service.read()
  assert.equal(after.tasks.length, 5)
  const agenda = await service.action('agenda', { filter: {} })
  assert.equal(agenda.agenda.unplaced.length, 0)
  assert.ok(added.result.added.every(row => row.startAt && row.endAt && row.timeSource === 'estimate'))
})

test('助手修改稿只追加产物，不改状态，也不能改已完成的交付', async t => {
  const { store, service, workflow } = await fixture(t)
  const task = workflow.tasks[0]
  await store.mutate('', state => { state.workflow.tasks[1].status = 'done' })
  const revised = await service.action('revise', { id: task.id, text: '修改后的开场白', model: 'test', revision: (await service.read()).revision, requestId: 'revise' })
  assert.equal(revised.result.status, 'todo')
  assert.equal(revised.result.artifacts.at(-1).revision, true)
  await store.mutate('', state => { state.workflow.tasks[0].status = 'done' })
  await assert.rejects(service.action('revise', { id: task.id, text: '再改一次' }), /不能保存修改稿/)
})

test('本机办理失败落成受阻并保留已有产物，用户取消不算失败', async t => {
  let mode = 'fail'
  const { store, service, workflow } = await fixture(t, undefined, async () => { throw new Error(mode === 'fail' ? '转写工具未安装' : '已取消素材绑定') })
  const task = workflow.tasks[0]
  await store.mutate('', state => { state.workflow.tasks[0].artifacts.push({ id: 'a0', text: '已保存的草稿', at: new Date().toISOString() }) })
  await assert.rejects(service.nativeAction({ id: task.id, action: 'import-files', revision: (await service.read()).revision, requestId: 'n1' }), /转写/)
  const blocked = (await service.read()).tasks[0]
  assert.equal(blocked.status, 'blocked'); assert.equal(blocked.error, '转写工具未安装'); assert.equal(blocked.artifacts[0].text, '已保存的草稿')
  mode = 'cancel'
  await store.mutate('', state => { state.workflow.tasks[0].status = 'todo' })
  await assert.rejects(service.nativeAction({ id: task.id, action: 'import-files', revision: (await service.read()).revision, requestId: 'n2' }), /取消/)
  assert.equal((await service.read()).tasks[0].status, 'todo')
})
test('自动预计时间从当前时刻往后，遵守依赖且避开已有安排，原时间与锁定不变', () => {
  const tasks = normalizeTasks([
    { id: 'b', title: '分镜', dependencies: ['a'], estimateMin: 60 },
    { id: 'a', title: '脚本', estimateMin: 30 },
    { id: 'c', title: '锁定', locked: true },
    { id: 'd', title: '人工时间', startAt: at(9), endAt: at(10) },
  ], 'project')
  const now = Date.parse('2026-11-09T08:40:00+08:00')
  const booked = [{ id: 'booked', startAt: '2026-11-09T09:00:00+08:00', endAt: '2026-11-09T10:00:00+08:00' }]
  assert.equal(estimateTaskTimes(tasks, booked, now).length, 2)
  const a = tasks.find(row => row.id === 'a'), b = tasks[0]
  assert.equal(a.startAt, '2026-11-09T02:00:00.000Z')
  assert.ok(Date.parse(b.startAt) >= Date.parse(a.endAt))
  assert.equal(tasks[2].startAt, null)
  assert.equal(tasks[3].startAt, at(9))
  const snapshot = JSON.stringify(tasks)
  assert.equal(estimateTaskTimes(tasks, booked, now).length, 0)
  assert.equal(JSON.stringify(tasks), snapshot)
})
test('超长事项跨天预计，晚间创建从次日开始，确认重复不重复排期', async t => {
  const tasks = normalizeTasks([{ id: 'a', title: '长任务', estimateMin: 600 }], 'project')
  estimateTaskTimes(tasks, [], Date.parse('2026-11-09T20:00:00+08:00'))
  assert.equal(tasks[0].startAt, '2026-11-10T01:00:00.000Z')
  assert.equal(tasks[0].endAt, '2026-11-11T02:00:00.000Z')
  const { service, store } = await fixture(t)
  await store.mutate('', state => { state.workflow.proposals.push({ id: 'untimed', title: '全新计划', status: 'draft', tasks: [{ id: 'x', title: '写脚本' }, { id: 'y', title: '制作分镜', dependencies: ['x'] }] }) })
  const result = await service.action('confirm', { proposalId: 'untimed', requestId: 'untimed' })
  const created = result.workflow.tasks.filter(row => row.projectId === result.result.projectId)
  assert.ok(created.every(row => row.startAt && row.endAt && row.timeSource === 'estimate'))
  const again = await service.action('confirm', { proposalId: 'untimed', requestId: 'untimed' })
  assert.equal(again.repeated, true)
  assert.deepEqual(again.workflow.tasks, result.workflow.tasks)
})

test('图片、视频、剪辑执行方式固定分发到正确功能，且不误当文字任务执行', () => {
 const rows=normalizeTasks(['ai-image','ai-video','ai-edit'].map((executionMode,i)=>({id:'mode'+i,title:'办理',executionMode,module:'content',kind:'text',executor:'me'})),'p')
 assert.deepEqual(rows.map(r=>r.module),['drama','drama','autoclip'])
 assert.deepEqual(rows.map(r=>r.kind),['images','video','edit'])
 assert.ok(rows.every(r=>r.executor==='ai'))
})

test('自动影策依赖前置交付，逐项排队并保存实际结果供验收', async t => {
  const calls = []
  const { store } = await fixture(t)
  const service = new WorkflowService(store, () => { throw new Error('应走影策生成') }, async input => {
    calls.push(input.action + ':' + input.mode)
    if (input.action === 'generation-start') return { id: input.mode + '-generation' }
    return { artifact: { text: '真实交付', native: { mode: input.mode, generationId: input.id, resourceId: 'resource-1' } } }
  })
  await store.mutate('', state => {
    const workflow = state.workflow
    workflow.projects[0].autoGenerate = true
    const [first, image, video] = workflow.tasks
    first.status = 'todo'; first.executor = 'me'
    image.executor = 'ai'; image.kind = 'images'; image.executionMode = 'ai-image'
    video.executor = 'ai'; video.kind = 'video'; video.executionMode = 'ai-video'
  })
  await service.advanceQueue()
  assert.deepEqual(calls, [])
  await store.mutate('', state => { state.workflow.tasks[0].status = 'done' })
  await service.advanceQueue()
  await service.advanceQueue()
  assert.deepEqual(calls, ['generation-start:image', 'generation-result:image', 'generation-start:video', 'generation-result:video'])
  const workflow = await service.read()
  assert.deepEqual(workflow.tasks.map(row => row.status), ['done', 'review', 'review'])
  assert.ok(workflow.tasks[2].artifacts.some(row => row.native.generationId === 'video-generation'))
})

test('独立生成保留依赖，保存真实提交与回复，并允许独立验收', async t => {
  const { store, workflow } = await fixture(t)
  const [first, second] = workflow.tasks
  await store.mutate('', state => {
    Object.assign(state.workflow.tasks[1], { kind: 'text', executor: 'ai', executionMode: 'ai-text' })
  })
  const service = new WorkflowService(store, null, async input => {
    if (input.action === 'generation-start') {
      assert.match(input.prompt, /部分前置产物尚未提供/)
      return { id: 'independent-1' }
    }
    return { artifact: { text: '模型实际回复', native: { generationId: input.id, mode: 'text' } } }
  })
  await assert.rejects(service.action('queue-generation', { id: second.id }), /独立生成/)
  await service.action('queue-generation', { id: second.id, independent: true })
  await service.advanceQueue()
  const submitted = (await service.read()).tasks[1]
  assert.equal(submitted.generationTrace.id, 'independent-1')
  assert.equal(submitted.generationTrace.status, 'succeeded')
  assert.match(submitted.generationTrace.prompt, /部分前置产物尚未提供/)
  assert.deepEqual(submitted.dependencies, [first.id])
  assert.equal(submitted.artifacts.at(-1).text, '模型实际回复')
  const delivery = await service.action('deliver', { id: second.id, note: '已核对' })
  assert.equal(delivery.result.status, 'done')
  assert.equal(delivery.workflow.tasks[0].status, 'todo')
})

test('排期办理可在前置未完成时打开影策并关联画布，交付校验仍有效', async t => {
  const calls = []
  const { store, service, workflow } = await fixture(t, undefined, async ({ action, inputs }) => {
    calls.push(action)
    assert.equal(inputs.length, 0)
    return { links: action === 'yingce' ? { yingceProjectId: 'draft-project' } : { yingceCanvasId: 'draft-canvas' } }
  })
  const [first, target] = workflow.tasks
  const opened = await service.action('handoff', { id: target.id, revision: workflow.revision })
  assert.ok(opened.result.links.itemId)
  const again = await service.action('handoff', { id: target.id, revision: opened.workflow.revision })
  assert.equal(again.result.version, opened.result.version)
  assert.equal(again.result.links.itemId, opened.result.links.itemId)
  const project = await service.nativeAction({ id: target.id, action: 'yingce', revision: again.workflow.revision })
  const canvas = await service.nativeAction({ id: target.id, action: 'yingce-canvas', canvasId: 'draft-canvas', revision: project.workflow.revision })
  assert.equal(canvas.result.links.yingceCanvasId, 'draft-canvas')
  assert.deepEqual(calls, ['yingce', 'yingce-canvas'])
  assert.equal(canvas.workflow.tasks.find(row => row.id === first.id).status, 'todo')
  assert.deepEqual(canvas.result.dependencies, [first.id])
  assert.equal(canvas.result.startAt, target.startAt)
  assert.equal((await store.read()).items.filter(item => item.id === opened.result.links.itemId).length, 1)
  await assert.rejects(service.action('deliver', { id: target.id, note: '未验收' }), /前置事项尚未完成/)
})
