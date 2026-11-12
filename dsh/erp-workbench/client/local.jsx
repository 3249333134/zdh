import React from 'react'
import { EditorDialog } from './editor-dialog.jsx'
import { PlanningView } from './planning.jsx'
import planningCss from './planning.css'
const statuses = ['待办', '进行中', '待验收', '已完成']
const priorities = ['低', '中', '高', '紧急']
const blank = projectId => ({ projectId, title: '', description: '', status: '待办', priority: '中', assigneeId: '', dueDate: '' })
async function request(command) {
  const response = await fetch('/erp-workbench/local', { credentials: 'same-origin', ...(command ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(command) } : {}) })
  const body = await response.json()
  if (!response.ok) throw Error(body.error || '加载失败，请重新打开工作台。')
  return body
}
function TaskEditor({ task, data, busy, error, onSave, onDelete, onClose }) {
  const [draft, setDraft] = React.useState({ startDate: '', labels: '', subtasks: [], comments: [], ...task })
  const [subtask, setSubtask] = React.useState(''), [comment, setComment] = React.useState('')
  const [deleting, setDeleting] = React.useState(false)
  const title = React.useRef(null)
  React.useEffect(() => { title.current?.focus() }, [])
  const field = key => ({ value: draft[key], onChange: e => setDraft({ ...draft, [key]: e.target.value }) })
  return <EditorDialog title={task.id ? '任务详情' : '新建任务'} busy={busy} error={error} close={onClose}>{requestClose => <aside className="erp-editor">
    <header><h3>{task.id ? '任务详情' : '新建任务'}</h3><button type="button" onClick={requestClose} disabled={busy} aria-label="关闭任务详情">关闭</button></header>
    <form onSubmit={e => { e.preventDefault(); onSave(draft) }}>
      <div className="erp-editor-fields">
      <label>任务标题<input ref={title} required maxLength={120} {...field('title')} placeholder="需要完成什么？" /></label>
      <label>所属项目<select {...field('projectId')}>{data.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <div className="erp-form-pair"><label>状态<select {...field('status')}>{statuses.map(s => <option key={s}>{s}</option>)}</select></label><label>优先级<select {...field('priority')}>{priorities.map(s => <option key={s}>{s}</option>)}</select></label></div>
      <div className="erp-form-pair"><label>负责人<select {...field('assigneeId')}><option value="">未分配</option>{data.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label>截止日期<input type="date" {...field('dueDate')} /></label></div>
      <label>任务说明<textarea rows={7} maxLength={5000} {...field('description')} placeholder="背景、交付物和验收要求…" /></label>
      <label>开始日期<input type="date" {...field('startDate')} /></label>
      <label>标签（逗号分隔）<input maxLength={300} {...field('labels')} placeholder="采购，交付，待确认" /></label>
      <details><summary>子任务和评论</summary><fieldset className="erp-task-extras"><legend>子任务 · {draft.subtasks.filter(s => s.done).length}/{draft.subtasks.length}</legend>{draft.subtasks.map((s, i) => <div key={i}><label><input type="checkbox" checked={s.done} onChange={e => setDraft({ ...draft, subtasks: draft.subtasks.map((row, n) => n === i ? { ...row, done: e.target.checked } : row) })} />{s.title}</label><button type="button" aria-label={`删除子任务${i + 1}`} onClick={() => setDraft({ ...draft, subtasks: draft.subtasks.filter((_, n) => n !== i) })}>删除</button></div>)}<input aria-label="新增子任务" maxLength={200} value={subtask} onChange={e => setSubtask(e.target.value)} /><button type="button" disabled={!subtask.trim() || draft.subtasks.length >= 100} onClick={() => { setDraft({ ...draft, subtasks: [...draft.subtasks, { title: subtask.trim(), done: false }] }); setSubtask('') }}>添加子任务</button></fieldset>
      <fieldset className="erp-task-extras"><legend>本地评论</legend>{draft.comments.map((c, i) => <p key={i}>{c}</p>)}<textarea aria-label="新增评论" rows={3} maxLength={2000} value={comment} onChange={e => setComment(e.target.value)} /><button type="button" disabled={!comment.trim() || draft.comments.length >= 100} onClick={() => { setDraft({ ...draft, comments: [...draft.comments, comment.trim()] }); setComment('') }}>添加评论</button><p className="erp-note">添加后点击「保存任务」一起保存。</p></fieldset>
      </details></div>
      <footer className="erp-editor-actions"><button type="button" disabled={busy} onClick={requestClose}>取消</button><button className="erp-primary" type="submit" disabled={busy}>{busy ? '正在保存…' : '保存任务'}</button></footer>
    </form>
    {task.id ? <div className="erp-delete">{deleting ? <><p>确定删除这项任务？此操作无法撤销。</p><button disabled={busy} className="erp-danger" onClick={() => onDelete(task.id)}>确认删除</button><button disabled={busy} onClick={() => setDeleting(false)}>取消</button></> : <button disabled={busy} className="erp-danger" onClick={() => setDeleting(true)}>删除任务</button>}</div> : null}
  </aside>}</EditorDialog>
}
function ProjectEditor({ project, busy, error, save, close }) {
  const [draft, setDraft] = React.useState(project)
  const title = project.id ? '编辑项目' : '新建项目'
  return <EditorDialog title={title} busy={busy} error={error} close={close}>{requestClose => <aside className="erp-editor"><header><h3>{title}</h3><button disabled={busy} onClick={requestClose}>关闭</button></header><form onSubmit={e => { e.preventDefault(); save(draft) }}>
    <div className="erp-editor-fields">
    <label>项目名称<input autoFocus required maxLength={120} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
    <label>项目说明<textarea rows={2} maxLength={5000} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
    </div><footer className="erp-editor-actions"><button disabled={busy} type="button" onClick={requestClose}>取消</button><button className="erp-primary" disabled={busy} type="submit">保存项目</button></footer>
  </form></aside>}</EditorDialog>
}

export function LocalWorkbench() {
  const [data, setData] = React.useState(null)
  const [projectId, setProjectId] = React.useState('')
  const [view, setView] = React.useState('board')
  const [search, setSearch] = React.useState('')
  const [owner, setOwner] = React.useState('all')
  const [priority, setPriority] = React.useState('all')
  const [draft, setDraft] = React.useState(null)
  const [projectDraft, setProjectDraft] = React.useState(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const [notice, setNotice] = React.useState('')
  const [membersOpen, setMembersOpen] = React.useState(false), [memberName, setMemberName] = React.useState('')
  async function load() {
    setError('')
    try { const next = await request(); setData(next); setProjectId(id => next.projects.some(p => p.id === id) ? id : next.projects[0]?.id || '') }
    catch (err) { setError(err.message) }
  }
  React.useEffect(() => { load() }, [])
  async function change(action, value) {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const next = await request({ action, value, revision: data.revision })
      setData(next); setDraft(null); setProjectDraft(null); setNotice('已保存到本机')
      if (action === 'save-project' && !value.id) setProjectId(next.projects.at(-1).id)
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  function exportData() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = 'erp-workbench-backup.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const project = data?.projects.find(p => p.id === projectId)
  const projectTasks = data?.tasks.filter(t => t.projectId === projectId) || []
  const tasks = projectTasks.filter(t => `${t.title} ${t.description}`.toLowerCase().includes(search.toLowerCase()) && (owner === 'all' || t.assigneeId === owner) && (priority === 'all' || t.priority === priority))
  const member = id => data.members.find(m => m.id === id)?.name || '未分配'
  const today = new Date(); const dateNow = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const overdue = t => t.status !== '已完成' && t.dueDate && t.dueDate < dateNow
  return <div className="erp-local">
    <style>{planningCss}</style>
    <div className="erp-local-note"><span>项目工作区</span><span className="erp-spacer" /><button disabled={!data || busy} onClick={exportData}>导出备份</button></div>
    {error ? <div className="erp-alert" role="alert">{error} <button disabled={busy} onClick={load}>刷新数据</button></div> : null}
    {!data ? <div className="erp-loading" role="status">{error ? '数据尚未加载，请重试。' : '正在打开本地工作空间…'}</div> : <>
      <div className="erp-project-bar"><label>项目<select aria-label="当前项目" value={projectId} onChange={e => { setProjectId(e.target.value); setDraft(null); setProjectDraft(null) }}>{data.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button disabled={busy} onClick={() => { setDraft(null); setProjectDraft({ name: '', description: '' }) }}>＋ 新建项目</button><span className="erp-spacer" /><span role="status" className="erp-save-notice">{notice}</span></div>
      {projectDraft ? <ProjectEditor key={projectDraft.id || 'new'} project={projectDraft} busy={busy} error={error} save={p => change('save-project', p)} close={() => setProjectDraft(null)} /> : null}
      <div className="erp-member-toolbar"><button aria-expanded={membersOpen} onClick={() => setMembersOpen(!membersOpen)}>本地成员 · {data.members.length}</button>{membersOpen ? <form onSubmit={e => { e.preventDefault(); change('save-member', { name: memberName }); setMemberName('') }}><span>{data.members.map(m => m.name).join('、')}</span><input aria-label="新增成员姓名" required maxLength={80} value={memberName} onChange={e => setMemberName(e.target.value)} placeholder="新成员姓名" /><button disabled={busy || !memberName.trim()}>添加成员</button><small>本地分工名单，不创建登录账号。</small></form> : null}</div>
      <div className="erp-workspace">
        <main className="erp-project-main">
          <div className="erp-project-heading"><div><h2>{project?.name || '创建第一个项目'}</h2><p>{project?.description}</p></div><button disabled={busy || !project} onClick={() => { setDraft(null); setProjectDraft(project) }}>编辑项目</button></div>
          <div className="erp-project-summary"><span>{projectTasks.length} 项任务</span><span>{projectTasks.filter(t => t.status === '已完成').length} 项已完成</span><span>{projectTasks.filter(overdue).length} 项逾期</span></div>
          <div className="erp-filters"><nav aria-label="任务视图">{[['board', '看板'], ['list', '列表'], ['calendar', '日历'], ['gantt', '甘特图']].map(([key, label]) => <button key={key} aria-pressed={view === key} onClick={() => setView(key)}>{label}</button>)}</nav>
            <input type="search" aria-label="搜索任务" placeholder="搜索任务…" value={search} onChange={e => setSearch(e.target.value)} />
            <select aria-label="筛选负责人" value={owner} onChange={e => setOwner(e.target.value)}><option value="all">全部负责人</option><option value="">未分配</option>{data.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
            <select aria-label="筛选优先级" value={priority} onChange={e => setPriority(e.target.value)}><option value="all">全部优先级</option>{priorities.map(p => <option key={p}>{p}</option>)}</select>
            <span className="erp-record-count">{tasks.length} / {projectTasks.length} 项</span>{search || owner !== 'all' || priority !== 'all' ? <button onClick={() => { setSearch(''); setOwner('all'); setPriority('all') }}>清除筛选</button> : null}<span className="erp-spacer" /><button className="erp-primary" disabled={busy || !project} onClick={() => { setProjectDraft(null); setDraft(blank(projectId)) }}>＋ 新建任务</button>
          </div>
          {['calendar', 'gantt'].includes(view) ? <PlanningView tasks={tasks} view={view} open={setDraft} /> : view === 'board' ? <div className="erp-board">{statuses.map((status, index) => <section className="erp-column" key={status}><h3><i className={`erp-dot erp-dot-${index}`} />{status}<span>{tasks.filter(t => t.status === status).length}</span></h3>
            {tasks.filter(t => t.status === status).map(task => <button key={task.id} className="erp-task" onClick={() => setDraft(task)}><span className={`erp-priority erp-priority-${priorities.indexOf(task.priority)}`}>{task.priority}优先级</span><strong>{task.title}</strong><p>{task.description}</p><footer><span className="erp-assignee">{member(task.assigneeId)}</span><time className={overdue(task) ? 'erp-overdue' : ''}>{task.dueDate || '无截止日期'}</time></footer></button>)}
            {!tasks.some(t => t.status === status) ? <p className="erp-column-empty">暂无任务</p> : null}
            <button className="erp-add-task" disabled={busy} onClick={() => setDraft({ ...blank(projectId), status })}>＋ 添加任务</button>
          </section>)}</div> : <div className="erp-table-wrap"><table><thead><tr><th>任务</th><th>状态</th><th>优先级</th><th>负责人</th><th>截止日期</th></tr></thead><tbody>{tasks.map(task => <tr key={task.id}><td><button className="erp-task-link" onClick={() => setDraft(task)}>{task.title}</button></td><td><select aria-label={`更新${task.title}的状态`} value={task.status} disabled={busy} onChange={e => change('save-task', { ...task, status: e.target.value })}>{statuses.map(status => <option key={status}>{status}</option>)}</select></td><td>{task.priority}</td><td>{member(task.assigneeId)}</td><td className={overdue(task) ? 'erp-overdue' : ''}>{task.dueDate || '—'}</td></tr>)}</tbody></table>{!tasks.length ? <p className="erp-column-empty">没有符合条件的任务。试试调整筛选，或新建任务。</p> : null}</div>}
        </main>
        {draft ? <TaskEditor key={draft.id || 'new'} task={draft} data={data} busy={busy} error={error} onSave={t => change('save-task', t)} onDelete={id => change('delete-task', { id })} onClose={() => setDraft(null)} /> : null}
      </div>
    </>}
  </div>
}
