const fs = require('node:fs')
const path = require('node:path')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function openDesk(win) {
  for (let i = 0; i < 60; i++) {
    const ready = await win.webContents.executeJavaScript(`(()=>{if(document.querySelector('.md-nav'))return true;const b=[...document.querySelectorAll('button,a,[role="button"]')].find(el=>el.textContent.trim()==='自媒体工作台');b?.click();return false})()`)
    if (ready) return
    await sleep(250)
  }
  throw new Error('工作台页面未就绪')
}
function api(win) {
  const origin = new URL(win.webContents.getURL()).origin
  const state = async () => (await win.webContents.session.fetch(origin + '/media-desk/state')).json()
  const post = async (action, body = {}) => {
    const current = await state()
    const response = await win.webContents.session.fetch(origin + '/media-desk/workflow/' + action, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ revision: current.state.workflow?.revision || 0, ...body }) })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || String(response.status))
    return result
  }
  return { state, post }
}
exports.refresh = async (win, logs) => {
  const { post } = api(win), result = await post('estimate-unscheduled')
  fs.writeFileSync(path.join(logs, 'schedule-refresh.json'), JSON.stringify({ at: new Date().toISOString(), scheduled: result.result.ids.length }))
  await win.webContents.reload()
  await openDesk(win)
  await win.webContents.executeJavaScript(`[...document.querySelectorAll('.md-nav button')].find(el => el.textContent === '排期')?.click()`)
}
exports.check = async (win, logs) => {
  const checks = [], report = { checks }, { state, post } = api(win)
  const run = code => win.webContents.executeJavaScript(code)
  const assert = (name, ok) => { checks.push({ name, ok: !!ok }); if (!ok) throw new Error(name) }
  const click = text => run(`(()=>{const b=[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===${JSON.stringify(text)}); b?.click(); return !!b})()`)
  const nav = async text => { await run(`[...document.querySelectorAll('.md-nav button')].find(el=>el.textContent===${JSON.stringify(text)})?.click()`); await sleep(600) }
  const shot = async name => { await sleep(400); fs.writeFileSync(path.join(logs, name + '.png'), (await win.webContents.capturePage()).toPNG()) }
  const layout = () => run(`(()=>{const outer=document.querySelector('.md-content-page,.md-schedule-page'), tabs=document.querySelector('.md-content-tabs'), head=document.querySelector('.md-workflow-page .md-page-head,.md-agenda-page .md-page-head');return !!outer&&!!tabs&&!!head&&tabs.getBoundingClientRect().bottom<=head.getBoundingClientRect().top&&outer.scrollWidth<=outer.clientWidth+1})()`)
  try {
    let current = await state(), projectId = current.state.workflow.projects[0]?.id
    if (!projectId) throw new Error('隔离数据没有测试项目')
    await post('estimate-unscheduled')
    const added = await post('add', { projectId, task: { title: '排期直达剪辑测试', module: 'autoclip', kind: 'edit', estimateMin: 30, dependencies: [] } })
    const clipTask = added.result
    assert('新增事项自动填入预计时间', clipTask.startAt && clipTask.endAt && clipTask.timeSource === 'estimate')
    await win.webContents.reload(); await openDesk(win)
    win.show(); win.setSize(1440, 960)
    await nav('内容'); assert('宽屏内容页签和标题不重叠', await layout()); await shot('task-layout-content-wide')
    await nav('排期'); assert('宽屏排期页签和标题不重叠', await layout()); await shot('task-layout-calendar-wide')
    await click('日'); await sleep(300)
    const date = new Date(clipTask.startAt), key = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
    await run(`(()=>{const i=document.querySelector('input[aria-label="查看日期"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,${JSON.stringify(key)});i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}))})()`)
    await sleep(350)
    assert('日历存在预计事项', await run(`!![...document.querySelectorAll('.md-agenda-chip')].find(el=>el.textContent.includes('排期直达剪辑测试'))`))
    await run(`[...document.querySelectorAll('.md-agenda-chip')].find(el=>el.textContent.includes('排期直达剪辑测试')).click()`)
    assert('日历任务提供直接办理入口', await run(`document.body.innerText.includes('去剪辑助手办理 →')`)); await shot('task-layout-quick-action')
    await click('去剪辑助手办理 →'); await sleep(1600)
    assert('直接跳转剪辑助手并携带事项', await run(`!!document.querySelector('iframe[title*="AutoClip"]') && document.querySelector('.md-task-strip')?.textContent.includes('排期直达剪辑测试')`))
    win.setSize(1050, 800); await run("document.querySelector('button[aria-label=\"收起对话\"]')?.click()"); await nav('内容'); assert('窄屏内容无横向溢出或重叠', await layout()); await shot('task-layout-content-narrow')
    await nav('排期'); assert('窄屏排期无横向溢出或重叠', await layout()); await shot('task-layout-calendar-narrow')
    current = await state(); const persisted = current.state.workflow.tasks.find(row => row.id === clipTask.id)
    assert('跳转不重建事项或虚报完成', persisted.status === 'todo' && current.state.workflow.tasks.filter(row => row.id === clipTask.id).length === 1)
    report.ok = true
  } catch (error) { report.ok = false; report.error = error.stack; await shot('task-layout-failure') }
  fs.writeFileSync(path.join(logs, 'task-layout-check.json'), JSON.stringify(report, null, 2))
}
