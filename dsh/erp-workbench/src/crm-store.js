import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { LocalStore } from './local-store.js'
export const stages = ['线索', '需求确认', '方案报价', '商务谈判', '赢单', '输单']
const fail = message => { throw Object.assign(new Error(message), { status: 400 }) }
function str(value = '', max = 200, required = false) {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) fail('请填写有效内容，并检查字段长度。')
  return value.trim()
}
function date(value = '') {
  if (!value) return ''
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail('请输入有效日期。')
  return value
}
export function crmSeed() {
  const companies = [
    { id: 'crm-c1', name: '华辰制造（示例）', industry: '装备制造', city: '苏州', website: 'https://example.com', owner: '王晓明', status: '意向客户', description: '示例数据：关注装配效率与设备升级。' },
    { id: 'crm-c2', name: '远航科技（示例）', industry: '软件服务', city: '杭州', website: '', owner: '李佳', status: '合作客户', description: '示例数据：计划推进数字化管理。' },
    { id: 'crm-c3', name: '青禾供应链（示例）', industry: '物流供应链', city: '上海', website: '', owner: '张晨', status: '潜在客户', description: '示例数据：需要梳理仓储与交付流程。' },
  ]
  const contacts = companies.map((c, i) => ({ id: `crm-p${i + 1}`, companyId: c.id, name: ['陈经理（示例）', '周主管（示例）', '林经理（示例）'][i], role: ['采购负责人', '项目负责人', '运营负责人'][i], email: `contact${i + 1}@example.com`, phone: '', description: '虚构联系人，仅用于体验，不会发送邮件或消息。' }))
  const opportunities = stages.slice(0, 5).map((stage, i) => ({ id: `crm-o${i + 1}`, companyId: companies[i % 3].id, name: ['设备升级一期', '管理平台试点', '仓储流程优化', '设备维保续约', '数字化培训'][i] + '（示例）', amount: [180000, 68000, 96000, 32000, 12000][i], stage, owner: ['王晓明', '李佳', '张晨'][i % 3], closeDate: '', description: '示例商机；金额为演示人民币金额。' }))
  const activities = [{ id: 'crm-a1', companyId: companies[0].id, subject: '首次需求沟通（示例）', kind: '电话', content: '客户关注交付周期，下一步整理设备清单。此记录为示例。', date: new Date().toLocaleDateString('sv-SE'), owner: '王晓明', nextDate: '' }]
  return { version: 1, revision: 0, companies, contacts, opportunities, activities, notes: [], tasks: [] }
}
export class CrmStore extends LocalStore {
  constructor(root) {
    super(root); this.file = join(root, 'local-crm.json'); this.seed = crmSeed
    this.validate = data => data.version === 1 && ['companies', 'contacts', 'opportunities', 'activities'].every(key => Array.isArray(data[key])) && Number.isInteger(data.revision)
  }
  async read() { const data = await super.read(); return { ...data, notes: data.notes || [], tasks: data.tasks || [] } }
  apply(data, command) {
    data.notes ||= []; data.tasks ||= []
    const { entity, action } = command, input = command.value || {}
    if (!['companies', 'contacts', 'opportunities', 'activities', 'notes', 'tasks'].includes(entity)) fail('记录类型无效。')
    const collection = data[entity]
    const previous = input.id ? collection.find(row => row.id === input.id) : null
    if (input.id && !previous) fail('记录不存在，请刷新后重试。')
    if (action === 'delete') {
      if (!previous) fail('请选择要删除的记录。')
      if (entity === 'companies' && ['contacts', 'opportunities', 'activities', 'tasks', 'notes'].some(key => data[key].some(row => row.companyId === input.id))) fail('此客户仍有关联记录，请先处理联系人、商机、跟进、待办和笔记。')
      data[entity] = collection.filter(row => row.id !== input.id); return
    }
    if (action !== 'save') fail('操作无效。')
    let row
    if (entity === 'companies') {
      if (!['潜在客户', '意向客户', '合作客户', '暂停跟进'].includes(input.status)) fail('客户状态无效。')
      const website = str(input.website, 500)
      if (website) { try { const url = new URL(website); if (!['http:', 'https:'].includes(url.protocol)) fail('网址必须使用 http 或 https。') } catch { fail('请输入完整的 http 或 https 网址。') } }
      row = { name: str(input.name, 120, true), industry: str(input.industry), city: str(input.city), owner: str(input.owner), status: input.status, website, description: str(input.description, 5000) }
    } else {
      if (!data.companies.some(c => c.id === input.companyId)) fail('请选择有效的客户公司。')
      if (entity === 'notes') {
        row = { name: str(input.name, 120, true), description: str(input.description, 5000, true), owner: str(input.owner) }
      } else if (entity === 'tasks') {
        if (!['待办', '进行中', '已完成'].includes(input.status)) fail('待办状态无效。')
        row = { name: str(input.name, 120, true), description: str(input.description, 5000), owner: str(input.owner), status: input.status, dueDate: date(input.dueDate) }
      } else if (entity === 'contacts') {
        const email = str(input.email)
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('邮箱格式无效。')
        row = { name: str(input.name, 120, true), role: str(input.role), email, phone: str(input.phone, 60), description: str(input.description, 5000) }
      } else if (entity === 'opportunities') {
        if (!stages.includes(input.stage)) fail('商机阶段无效。')
        if ((typeof input.amount !== 'number' && typeof input.amount !== 'string') || String(input.amount).trim() === '' || !Number.isFinite(Number(input.amount)) || Number(input.amount) < 0 || Number(input.amount) > 1e12 || Math.abs(Number(input.amount) * 100 - Math.round(Number(input.amount) * 100)) > .001) fail('请输入有效金额，最多两位小数。')
        row = { name: str(input.name, 120, true), amount: Number(input.amount), stage: input.stage, owner: str(input.owner), closeDate: date(input.closeDate), description: str(input.description, 5000) }
      } else {
        if (!['电话', '会议', '邮件', '拜访', '其他'].includes(input.kind)) fail('跟进类型无效。')
        row = { subject: str(input.subject, 120, true), kind: input.kind, content: str(input.content, 5000, true), date: date(input.date), owner: str(input.owner), nextDate: date(input.nextDate) }
        if (!row.date) fail('请填写跟进日期。')
      }
      row.companyId = input.companyId
    }
    if (previous) Object.assign(previous, row, { updatedAt: new Date().toISOString() })
    else collection.push({ ...row, id: randomUUID(), createdAt: new Date().toISOString() })
  }
}
