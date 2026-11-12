// 图三的月历与周、日视图共用同一份事项和内容数据。
import React from 'react'
import { HotBadge, OriginalLink } from './card.jsx'
import { openItem } from './desk.js'
import { t } from './i18n.js'
import { Stamp, useDayMap } from './stamps.jsx'
import { Dialog, IconButton } from './ui.jsx'
import { MODULE_LABELS, STATUS_LABELS } from './workflow.jsx'
import { STATUS_LABEL, computeStreak, dayKey, displayItem, fmtDate, fmtTime, posterOf, relativeDay, unit } from './util.js'

export const ITEM_DRAG = 'text/media-desk-item'
export const TASK_DRAG = 'text/workbench-task'

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const monthName = new Intl.DateTimeFormat('en', { month: 'long' })
export const scheduleTime = row => row.startAt || row.dueAt

export function intersects(row, date) {
  const day = new Date(date)
  day.setHours(0, 0, 0, 0)
  const next = new Date(day)
  next.setDate(day.getDate() + 1)
  const start = Date.parse(scheduleTime(row))
  const end = Date.parse(row.endAt || scheduleTime(row))
  return start < +next && end >= +day && (end !== +day || start === end)
}

export function canMove(row) {
  return !row.locked && !['done', 'running', 'cancelled'].includes(row.status)
}

export function startDrag(event, row) {
  event.dataTransfer.setData(row.sourceItem ? ITEM_DRAG : TASK_DRAG, row.sourceItem?.id || row.id)
  event.dataTransfer.effectAllowed = 'move'
}

function Thumb({ item }) {
  const poster = posterOf(displayItem(item))
  return <span className="md-cal-thumb">{poster ? <img src={poster} alt="" draggable={false} loading="lazy" /> : null}</span>
}

function RowChip({ row, onOpen }) {
  const item = row.sourceItem
  const time = row.dueAt && !row.startAt ? '截止 ' + fmtTime(row.dueAt) : fmtTime(row.startAt)
  const label = item ? t(STATUS_LABEL[item.status]) : MODULE_LABELS[row.module]
  return (
    <button type="button" className={'md-cal-chip ' + (item ? '' : 'md-cal-workflow-chip') + (row.kind === 'publish' && !item ? ' is-publish' : '')}
      draggable={canMove(row)} onDragStart={event => startDrag(event, row)} onClick={() => onOpen(row)}
      title={[time, row.title, label, row.timeSource === 'estimate' ? '预计' : ''].filter(Boolean).join(' · ')}>
      {item ? <Thumb item={item} /> : null}
      <span className="md-cal-chip-text"><time>{time}{row.timeSource === 'estimate' ? ' · 预计' : ''}{!item && label ? ' · ' + label : ''}</time><span>{row.title}</span></span>
      <HotBadge item={item || {}} />
    </button>
  )
}

export function Calendar({ items, rows, cursor, move, today, onToday, onOpen, onDrop, onDayOpen }) {
  const [over, setOver] = React.useState(null)
  const days = useDayMap()
  const y = cursor.getFullYear()
  const m = cursor.getMonth()
  const first = new Date(y, m, 1).getDay()
  const count = Math.ceil((first + new Date(y, m + 1, 0).getDate()) / 7) * 7
  const dates = Array.from({ length: count }, (_, index) => new Date(y, m, index - first + 1))
  const prefix = dayKey(new Date(y, m, 1)).slice(0, 7)
  const monthIdeas = [...days].reduce((sum, [key, list]) => sum + (key.startsWith(prefix) ? list.length : 0), 0)
  const monthPosts = rows.filter(row => row.kind === 'publish' && scheduleTime(row) && dayKey(scheduleTime(row)).startsWith(prefix)).length
  const streak = computeStreak(items)
  return (
    <section className="md-tile md-cal-tile" aria-label="月历">
      <header className="md-cal-head">
        <div className="md-cal-num">{String(m + 1).padStart(2, '0')}</div>
        <div className="md-cal-month"><span>{y}</span><em>{monthName.format(cursor)}</em></div>
        <dl className="md-cal-stats">
          <div><dt>{t('连续记录')}</dt><dd>{streak}<small>{unit(streak, '天')}</small></dd></div>
          <div><dt>{t('本月灵感')}</dt><dd>{monthIdeas}<small>{t('条')}</small></dd></div>
          <div><dt>{t('本月发布')}</dt><dd>{monthPosts}<small>{t('条')}</small></dd></div>
        </dl>
        <span className="md-grow" />
        <IconButton icon="chevL" label={t('上个月')} onClick={() => move(-1)} />
        <button type="button" className="md-pill is-small" onClick={onToday}>{t('今天')}</button>
        <IconButton icon="chevR" label={t('下个月')} onClick={() => move(1)} />
      </header>
      <div className="md-cal-weeks">{WEEK.map(day => <span key={day}>{t(day)}</span>)}</div>
      <div className="md-cal-grid" aria-label="月历日期" style={{ '--rows': count / 7 }}>
        {dates.map(date => {
          const key = dayKey(date)
          const entries = rows.filter(row => intersects(row, date))
          const ideas = days.get(key)
          const isToday = key === today
          return (
            <div key={key} className={['md-cal-cell', date.getMonth() !== m && 'is-outside', isToday && 'is-today', over === key && 'is-over'].filter(Boolean).join(' ')}
              onDragOver={event => { if (event.dataTransfer.types.some(type => type === ITEM_DRAG || type === TASK_DRAG)) { event.preventDefault(); setOver(key) } }}
              onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOver(null) }}
              onDrop={event => { setOver(null); onDrop(event, date) }}>
              <div className="md-cal-cell-top">
                <span className="md-cal-date">{date.getDate()}</span>
                {ideas?.length || isToday ? <div className="md-cal-stamp"><Stamp list={ideas} today={isToday} label={t('{date}的灵感', { date: fmtDate(date) })} onOpen={() => onDayOpen({ date, ideas })} /></div> : null}
              </div>
              <div className="md-cal-posts">
                {entries.slice(0, 2).map(row => <RowChip key={row.id} row={row} onOpen={onOpen} />)}
                {entries.length > 2 ? <button type="button" className="md-cal-more" onClick={() => onDayOpen({ date })}>{t('还有 {n} 条', { n: entries.length - 2 })}</button> : null}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export function CalendarDay({ detail: { date, ideas }, rows, onClose, onOpen }) {
  return <Dialog title={fmtDate(date) + (ideas ? ' · 灵感' : ' · 排期')} onClose={onClose} width={560}>
    <div className="md-cal-day-list">
      {ideas ? ideas.map(item => <article key={item.id}>
        <button type="button" onClick={() => { onClose(); openItem(item.id) }}>{displayItem(item).title}</button>
        <HotBadge item={item} /><OriginalLink item={item} />
      </article>) : rows.filter(row => intersects(row, date)).map(row => <RowChip key={row.id} row={row} onOpen={entry => { onClose(); onOpen(entry) }} />)}
    </div>
  </Dialog>
}

export function ScheduleRail({ rows, pending, onOpen, selected, onSelect, onEstimate, canEstimate, onUnschedule }) {
  const [over, setOver] = React.useState(false)
  const next = rows.find(row => Date.parse(scheduleTime(row)) >= Date.now() && !['done', 'cancelled'].includes(row.status))
  const tasks = pending.filter(row => !row.sourceItem)
  const content = pending.filter(row => row.sourceItem)
  const ready = content.filter(row => row.sourceItem.production?.status === 'done' || ['draft', 'ready'].includes(row.sourceItem.status))
  const ideas = content.filter(row => !ready.includes(row))
  return (
    <aside className="md-rail-col">
      {next ? <button type="button" className="md-next" onClick={() => onOpen(next)}>
        <span className="md-next-top"><span>{t('下一条')}</span><span>{relativeDay(scheduleTime(next))}</span></span>
        <b>{fmtTime(scheduleTime(next))}</b>
        <p>{next.title}</p>
        <span className="md-next-foot">{next.sourceItem?.platform || MODULE_LABELS[next.module]} · {next.sourceItem ? t(STATUS_LABEL[next.sourceItem.status]) : STATUS_LABELS[next.status]} · {fmtDate(scheduleTime(next))}</span>
      </button> : null}
      <section className={'md-tile md-tray' + (over ? ' is-over' : '')} aria-label={t('待排期')}
        onDragOver={event => { if (event.dataTransfer.types.includes(ITEM_DRAG)) { event.preventDefault(); setOver(true) } }}
        onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOver(false) }}
        onDrop={event => { event.preventDefault(); setOver(false); onUnschedule(event.dataTransfer.getData(ITEM_DRAG)) }}>
        <header className="md-tile-head"><h2>{t('待排期')}</h2><span className="md-tile-meta">{t('拖到日历上')}</span></header>
        <div className="md-tray-scroll">
          {tasks.length ? <>
            <h3>待安排事项 <span>{tasks.length}</span></h3>
            {canEstimate ? <button type="button" className="md-pill is-small md-tray-estimate" onClick={onEstimate}>补齐预计时间</button> : null}
            <div className="md-tray-list">{tasks.map(row => <div className="md-cal-pending" key={row.id}>
              {canMove(row) ? <input type="checkbox" aria-label={'选择排期 ' + row.title} checked={selected.includes(row.id)} onChange={event => onSelect(row.id, event.target.checked)} /> : null}
              <button type="button" className="md-tray-item" draggable={canMove(row)} onDragStart={event => startDrag(event, row)} onClick={() => onOpen(row)}><span>{row.title}</span><small>{MODULE_LABELS[row.module]}</small></button>
            </div>)}</div>
          </> : null}
          {ready.length ? <><h3>{t('已成稿')} <span>{ready.length}</span></h3><div className="md-tray-grid">
            {ready.map(row => {
              const item = row.sourceItem
              const poster = posterOf(displayItem(item))
              return <button type="button" key={row.id} draggable={canMove(row)} className="md-tray-card" onDragStart={event => startDrag(event, row)} onClick={() => onOpen(row)}>
                <span className={'md-tray-cover' + (poster ? '' : ' is-type')}>{poster ? <img src={poster} alt="" loading="lazy" draggable={false} /> : <b>{item.production?.coverText ?? row.title}</b>}</span>
                <span className="md-tray-title">{row.title}</span>
              </button>
            })}
          </div></> : null}
          {ideas.length ? <><h3>{t('灵感')} <span>{ideas.length}</span></h3><div className="md-tray-list">{ideas.map(row => <button type="button" key={row.id} draggable={canMove(row)} className="md-tray-item" onDragStart={event => startDrag(event, row)} onClick={() => onOpen(row)}><Thumb item={row.sourceItem} /><HotBadge item={row.sourceItem} /><span>{row.title}</span></button>)}</div></> : null}
          {!pending.length ? <p className="md-tray-empty">没有待排期的内容或事项。</p> : null}
          <details className="md-agenda-all"><summary>已安排事项（{rows.length}）</summary>{rows.map(row => <div className="md-cal-pending" key={row.id}>
            {!row.sourceItem && canMove(row) ? <input type="checkbox" aria-label={'选择排期 ' + row.title} checked={selected.includes(row.id)} onChange={event => onSelect(row.id, event.target.checked)} /> : null}
            <button type="button" className="md-tray-item" onClick={() => onOpen(row)}><span>{row.title}</span><small>{fmtDate(scheduleTime(row))}</small></button>
          </div>)}</details>
        </div>
      </section>
    </aside>
  )
}
