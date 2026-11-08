// 生成隔离验收数据：一个宽泛目标草案，覆盖定位、选题、脚本、分镜、拍摄、剪辑、发布、复盘。
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '.smoke-workflow-data', 'dsh', 'media-desk')
const file = path.join(root, 'state.json')
const pristine = path.join(__dirname, 'data', 'dsh', 'media-desk', 'state.json')
// 每次从用户数据的副本重建，保证验收从同一起点开始，不依赖上次运行的残留
const state = JSON.parse(fs.readFileSync(fs.existsSync(pristine) ? pristine : file, 'utf8'))

const task = (id, extra) => ({
  id, title: '', group: '工作事项', module: 'content', kind: 'text', executor: 'ai', estimateMin: 30,
  description: '按交付标准完成本事项，把结果写在交付说明里。', deliverable: '可核对的实际产出', acceptance: '产出存在且能被下一位直接使用',
  dependencies: [], startAt: null, endAt: null, dueAt: null, locked: false, spec: {}, video: '新手第一天上班的妆', ...extra,
})

const tasks = [
  task('s1', { title: '账号定位与表达规则', group: '定位', module: 'style', kind: 'text', executor: 'ai', estimateMin: 40, dependencies: [], deliverable: '人群、场景、口吻与视觉规则', acceptance: '能据此判断一条内容是否符合账号定位' }),
  task('s2', { title: '整理竞品账号资料', group: '选题', module: 'home', kind: 'text', executor: 'ai', estimateMin: 60, dependencies: ['s1'], dueAt: '2026-11-07T10:00:00.000Z' }),
  task('s3', { title: '首批选题与脚本', group: '选题', module: 'content', kind: 'script', executor: 'ai', estimateMin: 90, dependencies: ['s2'], startAt: '2026-11-10T09:00:00.000Z', endAt: '2026-11-10T10:00:00.000Z' }),
  task('s4', { title: '分镜与画布', group: '拍摄', module: 'drama', kind: 'shoot', executor: 'me', estimateMin: 60, dependencies: ['s3'], startAt: '2026-11-10T10:00:00.000Z', endAt: '2026-11-10T12:00:00.000Z' }),
  task('s5', { title: '素材拍摄', group: '拍摄', module: 'drama', kind: 'shoot', executor: 'me', estimateMin: 180, dependencies: ['s4'], startAt: '2026-11-10T13:00:00.000Z', endAt: '2026-11-10T16:00:00.000Z' }),
  task('s6', { title: '剪辑成片', group: '剪辑', module: 'autoclip', kind: 'edit', executor: 'me', estimateMin: 150, dependencies: ['s5'], startAt: '2026-11-10T16:30:00.000Z', endAt: '2026-11-10T19:00:00.000Z', locked: true }),
  task('s7', { title: '人工发布', group: '发布', module: 'content', kind: 'publish', executor: 'me', estimateMin: 20, dependencies: ['s6'], startAt: '2026-11-13T18:00:00.000Z', endAt: '2026-11-13T18:30:00.000Z', locked: true }),
  task('s8', { title: '发布后效果复盘', group: '复盘', module: 'insights', kind: 'review', executor: 'ai', estimateMin: 40, dependencies: ['s7'] }),
]

state.workflow = {
  revision: 0, projects: [], tasks: [], receipts: [],
  proposals: [{ id: 'smoke-draft', title: '仿妆账号首批内容', goal: '做一个新手第一天上班的仿妆账号，先把首批视频跑通', summary: '从定位、选题、脚本、分镜、拍摄、剪辑到发布与复盘的跨功能计划', tasks, status: 'draft', createdAt: '2026-11-08T02:00:00.000Z' }],
}
fs.writeFileSync(file, JSON.stringify(state, null, 2))
console.log('seeded', file, tasks.length + ' tasks')
