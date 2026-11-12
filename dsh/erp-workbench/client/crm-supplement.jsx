import React from 'react'
import { EditorDialog } from './editor-dialog.jsx'
export function SupplementEditor({ entity, record, data, busy, error, save, remove, close }) {
  const [draft, setDraft] = React.useState(record), [confirm, setConfirm] = React.useState(false)
  const task = entity === 'tasks'
  const field = key => ({ value: draft[key] || '', onChange: e => setDraft({ ...draft, [key]: e.target.value }) })
  return <EditorDialog title={task ? '客户待办' : '客户笔记'} busy={busy} error={error} close={close}>{requestClose => <aside className="erp-editor crm-editor"><header><h3>{task ? '客户待办' : '客户笔记'}</h3><button disabled={busy} onClick={requestClose}>关闭</button></header><form onSubmit={e => { e.preventDefault(); save(draft) }}>
    <div className="erp-editor-fields">
    <label>所属客户<select required {...field('companyId')}><option value="">请选择客户</option>{data.companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <label>标题<input autoFocus required maxLength={120} {...field('name')} /></label>
    <label>{task ? '负责人' : '记录人'}<input maxLength={200} {...field('owner')} /></label>
    {task ? <><label>状态<select {...field('status')}>{['待办', '进行中', '已完成'].map(s => <option key={s}>{s}</option>)}</select></label><label>截止日期<input type="date" {...field('dueDate')} /></label></> : null}
    <label>{task ? '交付要求' : '笔记正文'}<textarea required={!task} maxLength={5000} rows={8} {...field('description')} /></label></div><footer className="erp-editor-actions"><button type="button" disabled={busy} onClick={requestClose}>取消</button><button className="erp-primary" disabled={busy}>{busy ? '保存中…' : '保存记录'}</button></footer>
  </form>{record.id ? <div className="erp-delete">{confirm ? <><p>确定删除此记录？</p><button disabled={busy} onClick={() => remove(record.id)}>确认删除</button><button onClick={() => setConfirm(false)}>取消</button></> : <button disabled={busy} className="erp-danger" onClick={() => setConfirm(true)}>删除记录</button>}</div> : null}</aside>}</EditorDialog>
}
