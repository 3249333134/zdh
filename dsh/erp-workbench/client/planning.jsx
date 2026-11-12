import React from 'react'
import css from './planning.css'
const dayMs = 86400000
const date = value => new Date(value + 'T00:00:00Z')
const iso = value => value.toISOString().slice(0, 10)
export function PlanningView({ tasks, view, open }) {
  const now = new Date(), [month, setMonth] = React.useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  if (view === 'calendar') {
    const first = date(month + '-01'), offset = (first.getUTCDay() + 6) % 7
    const days = Array.from({ length: 42 }, (_, i) => new Date(first.getTime() + (i - offset) * dayMs))
    return <section className="erp-planning"><style>{css}</style><div className="erp-plan-toolbar"><label>显示月份 <input type="month" value={month} onChange={e => { if (e.target.value) setMonth(e.target.value) }} /></label><span>按截止日期显示，点击任务可编辑</span></div><div className="erp-calendar">{['一', '二', '三', '四', '五', '六', '日'].map(d => <strong className="erp-weekday" key={d}>周{d}</strong>)}{days.map(d => <div key={iso(d)} className={iso(d).startsWith(month) ? 'erp-calendar-day' : 'erp-calendar-day is-out'}><time>{d.getUTCDate()}</time>{tasks.filter(t => t.dueDate === iso(d)).map(t => <button key={t.id} onClick={() => open(t)}>{t.status === '已完成' ? '✓ ' : ''}{t.title}</button>)}</div>)}</div><p className="erp-note">未设置截止日期：{tasks.filter(t => !t.dueDate).length} 项，不显示在日期格中。</p></section>
  }
  const scheduled = tasks.filter(t => t.dueDate)
  if (!scheduled.length) return <p className="erp-column-empty">请为任务设置截止日期后查看甘特图；开始日期可在任务详情中填写。</p>
  const starts = scheduled.map(t => date(t.startDate || t.dueDate).getTime()), ends = scheduled.map(t => date(t.dueDate).getTime())
  const min = Math.min(...starts), max = Math.max(...ends), total = Math.round((max - min) / dayMs) + 1
  return <section className="erp-planning"><div className="erp-plan-toolbar"><span>{iso(new Date(min))} — {iso(new Date(max))}</span><span>未设置开始日期的任务显示为单日计划</span></div><div className="erp-gantt">{scheduled.map((t, i) => <div className="erp-gantt-row" key={t.id}><button onClick={() => open(t)}>{t.title}</button><div className="erp-gantt-track"><button title={`${t.startDate || t.dueDate} → ${t.dueDate} · ${t.status}`} style={{ marginLeft: `${((starts[i] - min) / dayMs / total) * 100}%`, width: `${Math.max(1, ((ends[i] - starts[i]) / dayMs + 1) / total * 100)}%` }} onClick={() => open(t)} className={t.status === '已完成' ? 'is-done' : ''}>{t.status}</button></div><time>{t.dueDate}</time></div>)}</div><p className="erp-note">未排期任务：{tasks.length - scheduled.length} 项。</p></section>
}
