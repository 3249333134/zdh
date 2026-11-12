import React from 'react'
import { setDesk, report, useDesk, openItem, dispatchOps } from './desk.js'
import { Dialog } from './ui.jsx'
import { Calendar, CalendarDay, ScheduleRail, ITEM_DRAG, TASK_DRAG, canMove, intersects, scheduleTime, startDrag } from './schedule.jsx'
import { dayKey, displayItem, fmtTime } from './util.js'
import { useWorkflow, workflowRequest, handleTask, TaskFilters, filterTasks, STATUS_LABELS, MODULE_LABELS, localTime, fmtTaskTime, SchedulePreview, groupRollup, GroupSummary } from './workflow.jsx'

const startDay = date => { const result = new Date(date); result.setHours(0, 0, 0, 0); return result }
const plusDays = (date, count) => { const next = new Date(date); next.setDate(next.getDate() + count); return next }

export function TaskScheduler() {
  const workflow = useWorkflow()
  const items = useDesk(s => s.state.items)
  const projectId = useDesk(s => s.scheduleProjectId)
  const focusDate = useDesk(s => s.scheduleFocusDate)
  const [filter, setFilter] = React.useState({})
  const [view, setView] = React.useState('month')
  const [cursor, setCursor] = React.useState(() => startDay(new Date()))
  const [preview, setPreview] = React.useState(null)
  const [editing, setEditing] = React.useState(null)
  const [batch, setBatch] = React.useState(false)
  const [selected, setSelected] = React.useState([])
  const [suggest, setSuggest] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [dayDetail, setDayDetail] = React.useState(null)
  const scrollRef = React.useRef(null)
  React.useEffect(() => {
    if (!projectId) return
    setFilter({ projectId })
    if (focusDate) setCursor(startDay(new Date(focusDate)))
    setDesk({ scheduleProjectId: null, scheduleFocusDate: null })
  }, [projectId, focusDate])
  React.useEffect(() => { if (view !== 'month' && scrollRef.current) scrollRef.current.scrollTop = 8 * 42 }, [view, cursor])
  const move = direction => setCursor(view === 'month' ? new Date(cursor.getFullYear(), cursor.getMonth() + direction, 1) : plusDays(cursor, direction * (view === 'week' ? 7 : 1)))
  const onToday = () => setCursor(startDay(new Date()))

  const linked = new Set(workflow.tasks.filter(row => row.kind === 'publish' && row.status !== 'cancelled' && !row.supersededBy && scheduleTime(row)).map(row => row.links?.itemId))
  const content = items.filter(item => !linked.has(item.id)).map(item => ({
    id: 'content:' + item.id,
    title: displayItem(item).title,
    startAt: item.scheduledAt || item.publishedAt,
    module: 'content',
    kind: 'publish',
    executor: 'me',
    status: item.status === 'published' ? 'done' : 'todo',
    sourceItem: item,
  }))
  const tasks = filterTasks([...workflow.tasks, ...content], filter).filter(row => filter.status === 'cancelled' || row.status !== 'cancelled')
  const rows = tasks.filter(scheduleTime).sort((a, b) => Date.parse(scheduleTime(a)) - Date.parse(scheduleTime(b)))
  const pending = tasks.filter(row => !scheduleTime(row))
  const groups = groupRollup(filterTasks(workflow.tasks, { projectId: filter.projectId }))
  const selectedTasks = tasks.filter(row => selected.includes(row.id) && !row.sourceItem && canMove(row))
  const pendingTasks = pending.filter(row => !row.sourceItem && canMove(row))
  const onSelect = (id, checked) => setSelected(ids => checked ? [...ids, id] : ids.filter(value => value !== id))
  const onOpen = row => row.sourceItem ? openItem(row.sourceItem.id) : setEditing(row)
  const requestPreview = async changes => {
    try { setPreview((await workflowRequest('schedule-preview', { changes })).preview) } catch (error) { report(error) }
  }
  const updateItemTime = (item, date, hour) => {
    if (!item || item.status === 'published') return
    const start = date ? new Date(date) : null
    const old = item.scheduledAt ? new Date(item.scheduledAt) : null
    start?.setHours(hour ?? old?.getHours() ?? 20, old?.getMinutes() ?? 0, 0, 0)
    dispatchOps([{ op: 'schedule_item', id: item.id, scheduledAt: start?.toISOString() ?? null }], { label: start ? '修改排期' : '取消排期' })
  }
  const drop = (event, date, hour) => {
    event.preventDefault()
    const itemId = event.dataTransfer.getData(ITEM_DRAG)
    if (itemId) {
      updateItemTime(content.find(row => row.sourceItem.id === itemId)?.sourceItem, date, hour)
      return
    }
    const id = event.dataTransfer.getData(TASK_DRAG)
    const task = tasks.find(row => row.id === id)
    if (!task || !canMove(task)) return
    const start = new Date(date)
    const old = scheduleTime(task) ? new Date(scheduleTime(task)) : null
    start.setHours(hour ?? old?.getHours() ?? 9, old?.getMinutes() ?? 0, 0, 0)
    const duration = task.endAt && task.startAt ? Date.parse(task.endAt) - Date.parse(task.startAt) : task.estimateMin * 60000
    const dueAt = task.dueAt && old ? new Date(Date.parse(task.dueAt) + (+start - +old)).toISOString() : null
    if (task.dueAt && !task.startAt) {
      requestPreview([{ id, dueAt }])
    } else {
      requestPreview([{ id, startAt: start.toISOString(), endAt: new Date(+start + duration).toISOString(), ...(dueAt ? { dueAt } : {}) }])
    }
  }
  const estimate = async () => {
    setBusy(true)
    try { await workflowRequest('estimate-unscheduled', { projectId: filter.projectId }) } catch (error) { report(error) } finally { setBusy(false) }
  }
  const timeDays = view === 'day' ? [cursor] : Array.from({ length: 7 }, (_, index) => plusDays(cursor, index - (cursor.getDay() + 6) % 7))
  const timeColumns = { gridTemplateColumns: '44px repeat(' + timeDays.length + ', minmax(90px,1fr))' }

  return <>
  <div className="md-page md-schedule-page">
    <div className="md-agenda-toolbar md-unified-toolbar">
      <div className="md-agenda-view-switch" aria-label="排期视图">{[['month', '月'], ['week', '周'], ['day', '日']].map(([id, label]) => <button type="button" aria-pressed={view === id} className={view === id ? 'is-on' : ''} onClick={() => setView(id)} key={id}>{label}</button>)}</div>
      {view !== 'month' ? <><button className="md-btn" onClick={() => move(-1)}>上一页</button><button className="md-btn" onClick={onToday}>今天</button><button className="md-btn" onClick={() => move(1)}>下一页</button></> : null}
      <input type="date" aria-label="查看日期" value={dayKey(cursor)} onChange={event => { if (event.target.value) setCursor(new Date(event.target.value + 'T00:00:00')) }} />
      <button className="md-btn" disabled={!selectedTasks.length} onClick={() => setBatch(true)}>批量安排{selectedTasks.length ? '（' + selectedTasks.length + '）' : ''}</button>
      <button className="md-btn" disabled={!selectedTasks.length && !pendingTasks.length} onClick={() => setSuggest(true)}>建议排期</button>
      <span className="md-grow" />
      <button className="md-btn" onClick={() => setDesk({ view: 'content', focusId: null, workflowProjectFocusId: filter.projectId || null })}>任务工作台</button>
    </div>
    <details className="md-unified-filters"><summary>筛选与工作包{Object.values(filter).some(Boolean) ? ' · 筛选中' : ''}</summary>
      <TaskFilters value={filter} onChange={setFilter} workflow={workflow} />
      {groups.length ? <GroupSummary groups={groups} /> : null}
    </details>
    <div className="md-schedule md-unified-schedule">
      {view === 'month' ? <Calendar items={items} rows={rows} cursor={cursor} today={dayKey(new Date())} move={move} onToday={onToday} onOpen={onOpen} onDrop={drop} onDayOpen={setDayDetail} /> :
        <section className={'md-agenda-calendar view-' + view} aria-label="事项时间表">
          <div className="md-agenda-day-labels" style={timeColumns}><span />{timeDays.map(date => <strong key={dayKey(date)}>{date.getMonth() + 1}/{date.getDate()} 周{'日一二三四五六'[date.getDay()]}</strong>)}</div>
          <div className="md-agenda-time-scroll" ref={scrollRef}>
            <div className="md-agenda-time-grid" style={timeColumns}>
              <div className="md-agenda-hour-labels">{Array.from({ length: 24 }, (_, hour) => <span key={hour} style={{ top: hour * 42 }}>{String(hour).padStart(2, '0')}:00</span>)}</div>
              {timeDays.map(date => <div className="md-agenda-day" key={dayKey(date)} onDragOver={event => { if (event.dataTransfer.types.some(type => type === ITEM_DRAG || type === TASK_DRAG)) event.preventDefault() }} onDrop={event => {
                const rect = event.currentTarget.getBoundingClientRect()
                drop(event, date, Math.max(0, Math.min(23, Math.floor((event.clientY - rect.top) / 42))))
              }}>
                {Array.from({ length: 24 }, (_, hour) => <i key={hour} style={{ top: hour * 42 }} />)}
                {rows.filter(row => intersects(row, date)).map(row => {
                  const dayStart = +startDay(date)
                  const start = Math.max(dayStart, Date.parse(scheduleTime(row)))
                  const end = Math.min(+plusDays(date, 1), Date.parse(row.endAt || scheduleTime(row)))
                  return <button type="button" key={row.id} draggable={canMove(row)} onDragStart={event => startDrag(event, row)} onClick={() => onOpen(row)}
                    className={'md-agenda-chip state-' + row.status + (row.kind === 'publish' ? ' is-publication' : '')}
                    style={{ top: (start - dayStart) / 60000 * .7, height: Math.max(36, (end - start) / 60000 * .7) }} title={row.title}>
                    <small>{row.kind === 'publish' ? '发布 · ' : ''}{row.dueAt && !row.startAt ? '截止 ' : ''}{fmtTime(scheduleTime(row))}{row.timeSource === 'estimate' ? ' · 预计' : ''}</small><strong>{row.title}</strong>
                  </button>
                })}
              </div>)}
            </div>
          </div>
        </section>}
      <ScheduleRail rows={rows} pending={pending} selected={selected} onSelect={onSelect} onOpen={onOpen} onEstimate={estimate} canEstimate={!busy && pendingTasks.length > 0} onUnschedule={id => updateItemTime(items.find(item => item.id === id && item.scheduledAt && !linked.has(id)), null)} />
    </div>
  </div>
    {dayDetail ? <CalendarDay detail={dayDetail} rows={rows} onClose={() => setDayDetail(null)} onOpen={onOpen} /> : null}
    {editing ? <TimeEditor task={editing} onClose={() => setEditing(null)} onPreview={async changes => { setEditing(null); await requestPreview(changes) }} /> : null}
    {batch ? <BatchTime tasks={selectedTasks} onClose={() => setBatch(false)} onPreview={async changes => { setBatch(false); await requestPreview(changes) }} /> : null}
    {suggest ? <Availability onClose={() => setSuggest(false)} onPreview={async windows => {
      try {
        const ids = (selectedTasks.length ? selectedTasks : pendingTasks).map(task => task.id)
        const result = await workflowRequest('suggest-schedule', { ids, windows })
        setSuggest(false)
        setPreview(result.preview)
      } catch (error) { report(error) }
    }} /> : null}
    {preview ? <Dialog title="核对排期变更" width={760} onClose={() => setPreview(null)}><SchedulePreview preview={preview} busy={busy} onCancel={() => setPreview(null)} onApply={async () => {
      setBusy(true)
      try { await workflowRequest('schedule-apply', { preview }); setPreview(null) } catch (error) { report(error) } finally { setBusy(false) }
    }} /></Dialog> : null}
  </>
}
function TimeEditor({ task, onClose, onPreview }) {
  const [times, setTimes] = React.useState({ startAt: localTime(task.startAt), endAt: localTime(task.endAt), dueAt: localTime(task.dueAt) })
  const setStart = value => {
    const start = value ? new Date(value) : null
    // 只填开始时间时，按预计用时补一个建议结束时间；跨天也允许，可再手动改
    const end = start && !times.endAt ? new Date(+start + task.estimateMin * 60000) : null
    setTimes({ ...times, startAt: value, ...(end ? { endAt: localTime(end.toISOString()) } : {}) })
  }
  const crossDay = times.startAt && times.endAt && new Date(times.endAt).toDateString() !== new Date(times.startAt).toDateString()
  return <Dialog title={'事项安排 · ' + task.title} onClose={onClose} width={560}><div className="md-form"><div className="md-agenda-task-action"><span className={'md-task-state state-' + task.status}>{STATUS_LABELS[task.status]}</span><span>{MODULE_LABELS[task.module]} · {task.estimateMin} 分钟{task.timeSource === 'estimate' ? ' · 临时预计，可调整' : ''}</span><button className="md-btn is-primary" disabled={task.status === 'cancelled'} onClick={() => { onClose(); handleTask(task) }}>去{MODULE_LABELS[task.module]}办理 →</button></div><p className="md-agenda-task-description">{task.description || task.deliverable}</p>{[['startAt', '开始'], ['endAt', '结束'], ['dueAt', '截止']].map(([key, label]) => <label className="md-field" key={key}><span>{label}</span><input type="datetime-local" value={times[key]} onChange={event => key === 'startAt' ? setStart(event.target.value) : setTimes({ ...times, [key]: event.target.value })} /></label>)}<p>{task.locked ? '时间已锁定，请先到事项详情解锁。' : '跨天事项会在日历上连续显示。移动后将预览对后续事项的影响。'}</p>{crossDay ? <p className="md-muted">这是跨天安排：{fmtTaskTime(times.startAt)} → {fmtTaskTime(times.endAt)}</p> : null}<button className="md-btn" onClick={() => { onClose(); setDesk({ workflowDialog: task.id, activeTaskId: task.id }) }}>要求与办理</button><button className="md-btn is-primary" disabled={task.locked} onClick={() => onPreview([{ id: task.id, ...Object.fromEntries(Object.entries(times).map(([key, value]) => [key, value ? new Date(value).toISOString() : null])) }])}>预览改期</button></div></Dialog>
}
function BatchTime({ tasks, onClose, onPreview }) {
  const [start, setStart] = React.useState('')
  const eligible = tasks.filter(task => !task.locked && !['done', 'cancelled'].includes(task.status))
  const skipped = tasks.filter(task => !eligible.includes(task))
  return <Dialog title="批量依次安排" onClose={onClose} width={560}><label className="md-field"><span>第一项开始时间；后续按预计用时依次安排</span><input type="datetime-local" value={start} onChange={event => setStart(event.target.value)} /></label><p>{eligible.map(task => task.title).join(' → ') || '没有可安排的事项'}</p>{skipped.length ? <p className="md-muted">{skipped.map(task => task.title).join('、')} 已锁定或已完成，不会被移动。</p> : null}<p className="md-muted">安排会按顺序连排，长任务可以跨天；确认前会先预览。</p><button className="md-btn is-primary" disabled={!start || !eligible.length} onClick={() => { let cursor = Date.parse(start); onPreview(eligible.map(task => { const startAt = new Date(cursor).toISOString(); cursor += task.estimateMin * 60000; return { id: task.id, startAt, endAt: new Date(cursor).toISOString() } })) }}>预览</button></Dialog>
}
function Availability({ onClose, onPreview }) {
  const [windows, setWindows] = React.useState([{ startAt: '', endAt: '' }])
  return <Dialog title="填写实际可用时间" onClose={onClose} width={620}><p>不默认假定你的工作时间。优先安排所选事项；未选择时安排当前筛选下的待安排事项。</p>{windows.map((row, index) => <div className="md-task-field-grid" key={index}>{[['startAt', '从'], ['endAt', '至']].map(([key, label]) => <label className="md-field" key={key}><span>{label}</span><input type="datetime-local" value={row[key]} onChange={event => setWindows(windows.map((item, i) => i === index ? { ...item, [key]: event.target.value } : item))} /></label>)}</div>)}<button className="md-btn" onClick={() => setWindows([...windows, { startAt: '', endAt: '' }])}>增加时间段</button><button className="md-btn is-primary" disabled={windows.some(row => !row.startAt || !row.endAt)} onClick={() => onPreview(windows.map(row => ({ startAt: new Date(row.startAt).toISOString(), endAt: new Date(row.endAt).toISOString() })))}>生成排期预览</button></Dialog>
}
