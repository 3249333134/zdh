import { mkdir, copyFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { CrmStore, stages } from '../src/crm-store.js'
import { LocalStore, statuses } from '../src/local-store.js'

// Run while the desktop is closed. Existing records are retained; named samples are only added once.
const root = fileURLToPath(new URL('../data/dsh/erp-workbench/', import.meta.url))
const backup = fileURLToPath(new URL(`../data/backups/before-test-data-${Date.now()}/`, import.meta.url))
await mkdir(backup, { recursive: true })
for (const name of ['local-workbench.json', 'local-crm.json']) {
  try { await copyFile(join(root, name), join(backup, name)) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
}
const day = offset => {
  const date = new Date(`${new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date())}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10)
}
const crm = new CrmStore(root), projects = new LocalStore(root)
let customers = await crm.read(), work = await projects.read()
const added = { companies: 0, contacts: 0, opportunities: 0, activities: 0, projects: 0, tasks: 0 }
async function addCrm(entity, field, value) {
  const existing = customers[entity].find(row => row[field] === value[field] && (entity === 'companies' || row.companyId === value.companyId))
  if (existing) return existing
  customers = await crm.change({ action: 'save', entity, value, revision: customers.revision }); added[entity]++
  return customers[entity].at(-1)
}
const scenarios = [
  ['启明精工（测试）', '精密制造', '苏州', '潜在客户', '王晓明', '自动化产线一期', 280000, '采购', '赵'],
  ['云桥数科（测试）', '软件服务', '杭州', '意向客户', '李佳', '企业管理平台试点', 86000, '技术', '钱'],
  ['海川物流（测试）', '物流仓储', '上海', '意向客户', '张晨', '仓储管理升级', 150000, '运营', '孙'],
  ['晨光食品（测试）', '食品加工', '无锡', '意向客户', '王晓明', '包装设备采购', 420000, '采购', '吴'],
  ['新禾商贸（测试）', '商贸零售', '南京', '合作客户', '李佳', '客户管理系统交付', 68000, '业务', '郑'],
  ['远景医疗（测试）', '医疗器械', '合肥', '暂停跟进', '张晨', '设备维保年度合作', 36000, '设备', '冯'],
]
for (let i = 0; i < scenarios.length; i++) {
  const [name, industry, city, status, owner, dealName, amount, role, surname] = scenarios[i]
  const company = await addCrm('companies', 'name', { name, industry, city, status, owner, website: '', description: `本地虚构测试客户 ${i + 1}。用于测试资料编辑、客户筛选、联系人关联、销售阶段和跟进记录，不会联系真实客户。` })
  for (let j = 0; j < 2; j++) await addCrm('contacts', 'name', { companyId: company.id, name: `${surname}${j ? '主管' : '经理'}（测试）`, role: j ? '项目执行对接人' : `${role}负责人`, email: `test-${i + 1}-${j + 1}@example.com`, phone: '', description: '虚构联系人；可修改、删除并测试客户关联。电话留空，避免误用真实号码。' })
  await addCrm('opportunities', 'name', { companyId: company.id, name: `${dealName}（测试）`, amount, stage: stages[i], owner, closeDate: day(i === 4 ? -1 : i + 3), description: `测试商机，当前为「${stages[i]}」。可编辑金额、负责人、成交日期和阶段，观察销售管道及汇总金额变化。金额均为虚构人民币金额。` })
  await addCrm('activities', 'subject', { companyId: company.id, subject: `${dealName}：需求沟通（测试）`, kind: ['电话', '会议', '邮件', '拜访', '其他', '电话'][i], date: day(-i), owner, nextDate: day(i - 2), content: '测试沟通记录：已确认业务背景和预期交付物。下一步补充需求清单、确认预算和时间。可修改内容或下次跟进日期。' })
  await addCrm('activities', 'subject', { companyId: company.id, subject: `${dealName}：方案回访（测试）`, kind: '会议', date: day(-1), owner, nextDate: day(i + 2), content: i === 4 ? '测试赢单回访：合同已确认，转入交付准备。' : i === 5 ? '测试输单复盘：本期预算调整，保留客户资料等待后续机会。' : '测试方案回访：梳理客户疑问，明确负责人和下次沟通日期。' })
}
for (const [name, description] of [
  ['启明精工交付（测试）', '虚构交付项目：覆盖需求、采购、装配、验收和培训。可测试负责人、优先级、逾期显示及任务状态。'],
  ['新禾CRM上线（测试）', '虚构系统上线项目：覆盖资料整理、功能配置、测试和上线验收。'],
]) {
  let project = work.projects.find(p => p.name === name)
  if (!project) { work = await projects.change({ action: 'save-project', revision: work.revision, value: { name, description } }); project = work.projects.at(-1); added.projects++ }
  const titles = ['确认需求与验收标准', '整理资料与基础配置', '提交实施方案', '检查测试问题', '完成用户培训', '提交验收交付物']
  for (let i = 0; i < titles.length; i++) {
    const title = `${titles[i]}（测试）`
    if (work.tasks.some(t => t.projectId === project.id && t.title === title)) continue
    work = await projects.change({ action: 'save-task', revision: work.revision, value: { projectId: project.id, title, description: `本地测试任务。交付要求：${titles[i]}，并记录处理结果。可以修改标题、负责人、截止日期以及状态。`, status: statuses[i % 4], priority: ['紧急', '高', '中', '低'][i % 4], assigneeId: work.members[i % work.members.length]?.id || '', dueDate: day(i - 2) } }); added.tasks++
  }
}
const report = { added, totals: { companies: customers.companies.length, contacts: customers.contacts.length, opportunities: customers.opportunities.length, activities: customers.activities.length, projects: work.projects.length, tasks: work.tasks.length }, backup }
await writeFile(new URL('../data/test-data-report.json', import.meta.url), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
