// 独立验收脚本：任务工作台 + 统一排期，用隔离数据（.smoke-workflow-data）走通计划、排期、改期与重启。
const fs = require('node:fs')
const path = require('node:path')

module.exports = async (win, logs, { data } = {}) => {
  const origin = new URL(win.webContents.getURL()).origin
  const run = code => win.webContents.executeJavaScript(code)
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
  const checks = []
  const record = (name, ok, detail = '') => { checks.push({ name, ok: Boolean(ok), detail }); if (!ok) throw new Error(name + (detail ? '：' + detail : '')) }
  const state = async () => (await win.webContents.session.fetch(origin + '/media-desk/state')).json()
  const post = async (action, body = {}) => {
    const current = await state()
    const response = await win.webContents.session.fetch(origin + '/media-desk/workflow/' + action, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ revision: current.state.workflow?.revision ?? 0, ...body }) })
    const result = await response.json()
    if (!response.ok) throw Object.assign(new Error(`${action} ${response.status}: ${result.error}`), { status: response.status })
    return result
  }
  const resume = process.argv.includes('--smoke-workflow-resume')
  const report = { phase: resume ? 'resume' : 'first', checks }

  const nav = async label => {
    await run(`[...document.querySelectorAll('.md-nav button')].find(el => el.textContent === ${JSON.stringify(label)})?.click()`)
    await sleep(500)
  }
  const shot = async name => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { fs.writeFileSync(path.join(logs, name), (await win.webContents.capturePage()).toPNG()); return } catch (error) { win.show(); win.focus(); await sleep(500) }
    }
    throw new Error('截图失败：' + name)
  }

  try {
    win.show(); win.focus()
    let current = await state()
    report.workflowRevision = current.state.workflow?.revision

    if (resume) {
      const first = JSON.parse(fs.readFileSync(path.join(logs, 'smoke-workflow.json'), 'utf8'))
      const workflow = current.state.workflow
      record('重启后项目保留', workflow.projects.some(row => row.id === first.expect.projectId), first.expect.projectId)
      record('重启后事项数量一致', workflow.tasks.length === first.expect.taskCount, `${workflow.tasks.length}/${first.expect.taskCount}`)
      record('重启后时间保留', workflow.tasks.find(row => row.id === first.expect.deliveredId)?.startAt === first.expect.deliveredStartAt, String(workflow.tasks.find(row => row.id === first.expect.deliveredId)?.startAt))
      record('重启后锁定标记保留', workflow.tasks.filter(row => row.locked).map(row => row.id).join() === first.expect.lockedIds.join(), workflow.tasks.filter(row => row.locked).map(row => row.title).join('、'))
      record('重启后交付记录保留', workflow.tasks.find(row => row.id === first.expect.deliveredId)?.artifacts.length >= 1)
      record('关闭期间不后台执行', workflow.tasks.every(row => row.status !== 'running'))
      await nav('内容')
      await sleep(800)
      const reminder = await run(`document.querySelector('.md-task-reminder')?.innerText || ''`)
      report.reminder = reminder
      record('重新打开后汇总到期事项', reminder.includes('到期'))
      await shot('workflow-resume.png')
    } else {
      // 1. 宽泛目标 → 草案 → 修改 → 确认
      const probeGet = await win.webContents.session.fetch(origin + '/media-desk/workflow')
      report.probeGet = { status: probeGet.status }
      const probePost = await win.webContents.session.fetch(origin + '/media-desk/workflow/agenda', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filter: {} }) })
      report.probePost = { status: probePost.status, text: (await probePost.text()).slice(0, 200) }
      const draft = current.state.workflow.proposals.find(row => row.status === 'draft')
      record('存在可编辑草案', Boolean(draft), draft?.title)
      record('草案跨多个功能分发', draft.tasks.length >= 6, draft.tasks.map(row => row.module).join(','))
      const editedTasks = draft.tasks.map(row => row.id === 's3' ? { ...row, title: '首批选题与脚本（已改）' } : row)
      const confirmed = await post('confirm', { proposalId: draft.id, title: draft.title, tasks: editedTasks, requestId: 'smoke-confirm' })
      const projectId = confirmed.result.projectId
      const confirmedAt = await state()
      const tasks = confirmedAt.state.workflow.tasks.filter(row => row.projectId === projectId)
      record('确认后建立正式事项', tasks.length === draft.tasks.length, `${tasks.length}/${draft.tasks.length}`)
      record('确认前不建立事项', draft.status === 'draft')
      record('修改后的草案内容生效', tasks.some(row => row.title === '首批选题与脚本（已改）'))

      // 2. 每项具体事项都进入排期或待安排，且只出现一次
      const agenda = (await post('agenda', { filter: {} })).agenda
      const ids = [...agenda.entries, ...agenda.unplaced].map(row => row.id)
      record('每项事项均进入排期或待安排', ids.length === agenda.total && new Set(ids).size === ids.length, `${ids.length}/${agenda.total}`)
      record('工作包汇总不重复计算', agenda.groups.reduce((sum, row) => sum + row.total, 0) === agenda.total)
      const publish = tasks.find(row => row.kind === 'publish')
      record('发布节点单独标识', agenda.publications.includes(publish.id))

      // 3. 精确时间 + 前置改期顺延 + 锁定冲突
      const script = tasks.find(row => row.module === 'content' && row.kind === 'script')
      const shoot = tasks.find(row => row.title === '素材拍摄')
      const lockedClip = tasks.find(row => row.locked)
      const preview = (await post('schedule-preview', { changes: [{ id: script.id, startAt: '2026-11-10T11:00:00.000Z', endAt: '2026-11-10T12:00:00.000Z' }] })).preview
      record('改期预览包含后续顺延', preview.changes.length >= 3, preview.changes.map(row => row.title).join('、'))
      record('锁定事项不移动并提示冲突', preview.warnings.some(row => row.text.includes('已锁定')) && !preview.changes.some(row => row.id === lockedClip.id) && !preview.changes.some(row => row.id === publish.id), JSON.stringify(preview.warnings))
      await post('schedule-apply', { preview, requestId: 'smoke-apply' })
      const afterApply = (await state()).state.workflow.tasks
      record('确认后两边时间一致', afterApply.find(row => row.id === script.id).startAt === '2026-11-10T11:00:00.000Z')
      record('顺延后的后续时间已更新', afterApply.find(row => row.id === shoot.id).startAt !== tasks.find(row => row.id === shoot.id).startAt)
      record('锁定的时间保持', afterApply.find(row => row.id === lockedClip.id).startAt === tasks.find(row => row.id === lockedClip.id).startAt && afterApply.find(row => row.id === publish.id).startAt === tasks.find(row => row.id === publish.id).startAt)

      // 4. 批量安排两项待安排事项
      const pending = afterApply.filter(row => !row.startAt && !row.dueAt && row.projectId === projectId)
      const batch = pending.slice(0, 2)
      record('存在待安排事项', batch.length === 2, String(pending.length))
      let cursor = Date.parse('2026-11-12T01:00:00.000Z')
      const changes = batch.map(row => { const startAt = new Date(cursor).toISOString(); cursor += row.estimateMin * 60000; return { id: row.id, startAt, endAt: new Date(cursor).toISOString() } })
      await post('schedule-apply', { preview: (await post('schedule-preview', { changes })).preview, requestId: 'smoke-batch' })
      const afterBatch = (await state()).state.workflow.tasks
      record('批量排期已写入', batch.every(row => afterBatch.find(task => task.id === row.id).startAt), batch.map(row => row.title).join('、'))

      // 5. 重复请求与版本冲突
      const firstTask = afterBatch.find(row => row.projectId === projectId && row.dependencies.length === 0 && row.status === 'todo')
      const itemCount = (await state()).state.items.length
      await post('handoff', { id: firstTask.id, requestId: 'smoke-handoff' })
      const second = await post('handoff', { id: firstTask.id, requestId: 'smoke-handoff' })
      record('重复请求不重复创建对象', second.repeated === true && (await state()).state.items.length === itemCount + 1, `${itemCount}`)
      let conflict = null
      try {
        const stale = await state()
        await win.webContents.session.fetch(origin + '/media-desk/workflow/edit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ revision: stale.state.workflow.revision - 5, requestId: 'smoke-conflict', id: firstTask.id, patch: { title: '冲突' } }) }).then(async response => { if (!response.ok) conflict = response.status })
      } catch (error) { conflict = error.status }
      record('陈旧版本被拒绝', conflict === 409, String(conflict))

      // 6. 交付一条文字事项，工作台与排期读到同一状态
      await post('deliver', { id: firstTask.id, note: '已完成本事项的正文与要点。', requestId: 'smoke-deliver' })
      const delivered = (await state()).state.workflow.tasks.find(row => row.id === firstTask.id)
      record('文字事项交付记录', delivered.status === 'done' && delivered.artifacts.length === 1)
      record('排期与工作台状态一致', (await post('agenda', { filter: {} })).agenda.entries.find(row => row.id === firstTask.id).status === 'done')

      // 7. 界面：宽窄窗口
      await nav('内容')
      await sleep(900)
      let body = await run('document.body.innerText')
      record('任务工作台可见', body.includes('任务工作台') && body.includes(draft.title), body.slice(0, 120))
      for (const [width, height, name] of [[1440, 960, 'workflow-wide.png'], [1100, 780, 'workflow-narrow.png']]) {
        win.setSize(width, height)
        await sleep(700)
        const layout = await run(`(() => { const page = document.querySelector('.md-workflow-page'); const box = page.getBoundingClientRect(); return { overflow: page.scrollWidth - page.clientWidth, width: Math.round(box.width), docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth } })()`)
        record(`任务工作台 ${width} 宽度不溢出`, layout.overflow <= 2 && layout.docOverflow <= 2, JSON.stringify(layout))
        await shot(name)
      }
      win.setSize(1440, 960)
      await sleep(400)
      await nav('排期')
      await sleep(800)
      body = await run('document.body.innerText')
      record('统一排期为任务日历', body.includes('统一排期') && body.includes('待安排'))
      await shot('schedule-wide.png')
      win.setSize(1100, 780)
      await sleep(700)
      const schedLayout = await run(`(() => { const page = document.querySelector('.md-agenda-page'); return { overflow: page.scrollWidth - page.clientWidth, docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth } })()`)
      record('排期 1100 宽度不溢出', schedLayout.overflow <= 2 && schedLayout.docOverflow <= 2, JSON.stringify(schedLayout))
      await shot('schedule-narrow.png')
      win.setSize(1440, 960)

      report.expect = {
        projectId,
        taskCount: tasks.length,
        deliveredId: firstTask.id,
        deliveredStartAt: afterBatch.find(row => row.id === firstTask.id).startAt,
        lockedIds: afterBatch.filter(row => row.locked).map(row => row.id),
      }
    }
    report.ok = true
  } catch (error) {
    report.ok = false; report.error = error.message
    fs.writeFileSync(path.join(logs, 'smoke-workflow.json'), JSON.stringify(report, null, 2))
    throw error
  }
  fs.writeFileSync(path.join(logs, 'smoke-workflow.json'), JSON.stringify(report, null, 2))
}
