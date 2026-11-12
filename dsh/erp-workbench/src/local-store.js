import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export const statuses = ['待办', '进行中', '待验收', '已完成']
export const priorities = ['低', '中', '高', '紧急']
const fail = message => { throw Object.assign(new Error(message), { status: 400 }) }
const text = (value, max, required = false) => {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) fail('请填写有效内容，标题不超过 120 字，说明不超过 5000 字。')
  return value.trim()
}
const date = value => {
  if (value === '') return ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail('截止日期无效。')
  return value
}
export function seed() {
  const day = offset => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
  const projects = [{ id: 'delivery', name: '设备交付', description: '示例项目 · 从需求确认到交付验收，体验完整任务流转。' }, { id: 'website', name: '官网改版', description: '示例项目 · 协调设计、内容与上线准备。' }]
  const members = ['王晓明', '李佳', '张晨'].map((name, i) => ({ id: `member-${i}`, name }))
  const rows = [
    ['delivery', '确认客户需求与交付清单', '已完成', '高', 0, -2, '核对设备型号、数量与交付标准，形成双方确认的清单。'],
    ['delivery', '整理供应商报价', '进行中', '高', 1, 1, '比较交期与报价，提交采购评审。'],
    ['delivery', '编制装配与测试计划', '进行中', '中', 2, 3, '明确装配步骤、测试项目和验收条件。'],
    ['delivery', '评审交付方案', '待验收', '紧急', 0, 0, '检查方案完整性，确认客户现场条件。'],
    ['delivery', '准备现场培训材料', '待办', '中', 1, 7, '整理操作手册、常见问题与培训议程。'],
    ['delivery', '核对备件清单', '待办', '低', 2, 5, '按设备清单核对备用件。'],
    ['website', '梳理页面结构', '已完成', '中', 1, -1, '明确首页、产品介绍与联系页面的信息结构。'],
    ['website', '完成首页设计', '进行中', '高', 2, 2, '提交桌面与移动端设计稿。'],
    ['website', '审核产品介绍文案', '待验收', '中', 0, 4, '检查产品参数、术语和表达。'],
    ['website', '执行上线前检查', '待办', '高', 2, 8, '检查链接、表单和不同屏幕下的显示。'],
  ]
  return { version: 1, revision: 0, projects, members, tasks: rows.map(([projectId, title, status, priority, owner, offset, description], i) => ({ id: `sample-${i + 1}`, projectId, title, status, priority, assigneeId: members[owner].id, dueDate: day(offset), description, createdAt: new Date().toISOString() })) }
}

export class LocalStore {
  constructor(root) { this.file = join(root, 'local-workbench.json'); this.tail = Promise.resolve(); this.seed = seed; this.validate = data => data.version === 1 && Array.isArray(data.projects) && Array.isArray(data.tasks) }
  async read() {
    await this.tail
    try {
      const data = JSON.parse(await readFile(this.file, 'utf8'))
      if (!this.validate(data)) throw Error('本地数据格式无法识别，请先备份后检查数据文件。')
      return data
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      return this.change({ action: 'initialize' })
    }
  }
  change(command) {
    const pending = this.tail.then(async () => {
      let data
      try { data = JSON.parse(await readFile(this.file, 'utf8')) }
      catch (error) { if (error.code !== 'ENOENT') throw error; data = this.seed() }
      if (!this.validate(data)) throw Error('本地数据格式无法识别，请先备份后检查数据文件。')
      if (command.action !== 'initialize') {
        if (command.revision !== data.revision) throw Object.assign(new Error('数据已被其他窗口更新，请刷新后重试。'), { status: 409 })
        this.apply(data, command)
        data.revision++
      }
      await mkdir(join(this.file, '..'), { recursive: true })
      const temp = `${this.file}.${randomUUID()}.tmp`
      await writeFile(temp, JSON.stringify(data, null, 2), { encoding: 'utf8', flag: 'wx' })
      await rename(temp, this.file)
      return data
    })
    this.tail = pending.catch(() => {})
    return pending
  }
  apply(data, command) {
    const input = command.value || {}
    if (command.action === 'save-member') {
      const name = text(input.name, 80, true)
      if (input.id) {
        const member = data.members.find(m => m.id === input.id)
        if (!member) fail('成员不存在。')
        member.name = name
      } else data.members.push({ id: randomUUID(), name })
      return
    }
    if (command.action === 'save-project') {
      const name = text(input.name, 120, true), description = text(input.description ?? '', 5000)
      if (input.id) {
        const project = data.projects.find(p => p.id === input.id)
        if (!project) fail('项目不存在。')
        Object.assign(project, { name, description })
      } else data.projects.push({ id: randomUUID(), name, description })
      return
    }
    if (command.action === 'delete-task') {
      if (!data.tasks.some(t => t.id === input.id)) fail('任务不存在。')
      data.tasks = data.tasks.filter(t => t.id !== input.id)
      return
    }
    if (command.action !== 'save-task') fail('不支持的操作。')
    if (!data.projects.some(p => p.id === input.projectId)) fail('请选择有效项目。')
    if (!statuses.includes(input.status) || !priorities.includes(input.priority)) fail('状态或优先级无效。')
    if (input.assigneeId && !data.members.some(m => m.id === input.assigneeId)) fail('负责人不存在。')
    const task = { projectId: input.projectId, title: text(input.title, 120, true), description: text(input.description ?? '', 5000), status: input.status, priority: input.priority, assigneeId: input.assigneeId || '', dueDate: date(input.dueDate ?? '') }
    const previousTask = data.tasks.find(t => t.id === input.id)
    task.startDate = date(input.startDate ?? previousTask?.startDate ?? '')
    if (task.startDate && task.dueDate && task.startDate > task.dueDate) fail('开始日期不能晚于截止日期。')
    task.labels = text(input.labels ?? previousTask?.labels ?? '', 300)
    task.subtasks = input.subtasks ?? previousTask?.subtasks ?? []
    task.comments = input.comments ?? previousTask?.comments ?? []
    if (!Array.isArray(task.subtasks) || task.subtasks.length > 100 || !Array.isArray(task.comments) || task.comments.length > 100) fail('子任务或评论数量无效。')
    task.subtasks = task.subtasks.map(s => ({ title: text(s?.title, 200, true), done: s?.done === true }))
    task.comments = task.comments.map(s => text(s, 2000, true))
    if (input.id) {
      const previous = data.tasks.find(t => t.id === input.id)
      if (!previous) fail('任务不存在。')
      Object.assign(previous, task, { updatedAt: new Date().toISOString() })
    } else data.tasks.push({ ...task, id: randomUUID(), createdAt: new Date().toISOString() })
  }
}
