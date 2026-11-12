import React from 'react'
import { EditorDialog } from './editor-dialog.jsx'
import css from './crm.css'
import { SupplementEditor } from './crm-supplement.jsx'
const stages = ['线索', '需求确认', '方案报价', '商务谈判', '赢单', '输单']
const names = { companies: '客户公司', contacts: '联系人', opportunities: '商机', activities: '跟进记录', tasks: '客户待办', notes: '客户笔记' }
const money = n => new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 2 }).format(n)
const today = () => new Date().toLocaleDateString('sv-SE')
function empty(entity, companyId = '') {
  if (['tasks', 'notes'].includes(entity)) return { companyId, name: '', description: '', owner: '', status: '待办', dueDate: '' }
  return { companies: { name: '', industry: '', city: '', website: '', owner: '', status: '潜在客户', description: '' }, contacts: { companyId, name: '', role: '', email: '', phone: '', description: '' }, opportunities: { companyId, name: '', amount: '', stage: '线索', owner: '', closeDate: '', description: '' }, activities: { companyId, subject: '', kind: '电话', content: '', date: today(), owner: '', nextDate: '' } }[entity]
}
async function request(command) {
  const response = await fetch('/erp-workbench/crm', { credentials: 'same-origin', ...(command ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(command) } : {}) })
  const body = await response.json()
  if (!response.ok) throw Error(response.status === 404 ? '客户管理后台尚未更新。请关闭整个 ERP 工作台后，从桌面快捷方式重新启动。' : body.error || '客户数据加载失败，请重试。')
  return { ...body, tasks: body.tasks || [], notes: body.notes || [] }
}
function Editor({ entity, record, data, busy, error, save, remove, close, related }) {
  const [draft, setDraft] = React.useState(record)
  const [confirm, setConfirm] = React.useState(false)
  if (['tasks', 'notes'].includes(entity)) return <SupplementEditor {...{ entity, record, data, busy, error, save, remove, close }} />
  const field = (key, label, type = 'text', required = false, options = null) => <label key={key}>{label}{options ? <select value={draft[key]} required={required} onChange={e => setDraft({ ...draft, [key]: e.target.value })}>{options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select> : type === 'textarea' ? <textarea maxLength={5000} rows={5} required={required} value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })} /> : <input data-field={key} autoFocus={key === 'name' || key === 'subject'} type={type} required={required} maxLength={key === 'name' || key === 'subject' ? 120 : 500} min={type === 'number' ? 0 : undefined} max={type === 'number' ? 1e12 : undefined} step={type === 'number' ? '.01' : undefined} value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })} />}</label>
  const opts = items => items.map(s => [s, s])
  return <EditorDialog title={`${record.id ? '编辑' : '新建'}${names[entity]}`} busy={busy} error={error} close={close}>{requestClose => <aside className="erp-editor crm-editor">
    <header><h3>{record.id ? '编辑' : '新建'}{names[entity]}</h3><button onClick={requestClose} disabled={busy}>关闭</button></header>
    <form onSubmit={e => { e.preventDefault(); save(draft) }}>
      <div className="erp-editor-fields">
      {entity !== 'companies' ? field('companyId', '所属客户', 'text', true, [['', '请选择客户'], ...data.companies.map(c => [c.id, c.name])]) : null}
      {entity === 'activities' ? <>{field('subject', '跟进主题', 'text', true)}{field('kind', '沟通方式', 'text', true, opts(['电话', '会议', '邮件', '拜访', '其他']))}{field('date', '跟进日期', 'date', true)}{field('owner', '跟进人')}{field('nextDate', '下次跟进', 'date')}{field('content', '沟通内容与下一步', 'textarea', true)}</> : <>{field('name', entity === 'companies' ? '公司名称' : entity === 'contacts' ? '联系人姓名' : '商机名称', 'text', true)}
        {entity === 'companies' ? <>{field('industry', '行业')}{field('city', '城市')}{field('website', '公司网址', 'url')}{field('owner', '负责人')}{field('status', '客户状态', 'text', true, opts(['潜在客户', '意向客户', '合作客户', '暂停跟进']))}</> : entity === 'contacts' ? <>{field('role', '职务')}{field('phone', '电话', 'tel')}{field('email', '邮箱', 'email')}</> : <>{field('amount', '预计金额（人民币）', 'number', true)}{field('stage', '商机阶段', 'text', true, opts(stages))}{field('owner', '负责人')}{field('closeDate', '预计成交日期', 'date')}</>}
        {field('description', '备注说明', 'textarea')}</>}
    {entity === 'companies' && record.id ? <div className="crm-related"><h4>客户关联</h4>{['contacts', 'opportunities', 'activities'].map(key => <button key={key} disabled={busy} onClick={() => { if (JSON.stringify(draft) === JSON.stringify(record)) related(key, record.id); else requestClose() }}>{names[key]} · {data[key].filter(r => r.companyId === record.id).length}</button>)}</div> : null}
      </div><footer className="erp-editor-actions"><button type="button" disabled={busy} onClick={requestClose}>取消</button><button type="submit" className="erp-primary" disabled={busy}>{busy ? '保存中…' : '保存记录'}</button></footer>
    </form>
    {record.id ? <div className="erp-delete">{confirm ? <><p>确定删除此记录？此操作无法撤销。</p><button className="erp-danger" disabled={busy} onClick={() => remove(record.id)}>确认删除</button><button disabled={busy} onClick={() => setConfirm(false)}>取消</button></> : <button className="erp-danger" disabled={busy} onClick={() => setConfirm(true)}>删除记录</button>}</div> : null}
  </aside>}</EditorDialog>
}
export function CrmWorkbench() {
  const [data, setData] = React.useState(null), [entity, setEntity] = React.useState('companies'), [view, setView] = React.useState('board')
  const [companyId, setCompanyId] = React.useState(''), [search, setSearch] = React.useState(''), [draft, setDraft] = React.useState(null)
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState(''), [notice, setNotice] = React.useState('')
  async function load() { setError(''); try { setData(await request()) } catch (err) { setError(err.message) } }
  React.useEffect(() => { load() }, [])
  async function mutate(action, value) {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try { setData(await request({ entity, action, value, revision: data.revision })); setDraft(null); setNotice('已保存到本机') }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  function tab(key) { setEntity(key); setDraft(null); setSearch(''); setError('') }
  function backup() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'erp-crm-backup.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const company = id => data.companies.find(c => c.id === id)?.name || '未关联客户'
  const filtered = data ? data[entity].filter(r => (!companyId || (entity === 'companies' ? r.id : r.companyId) === companyId) && Object.values(r).join(' ').toLowerCase().includes(search.toLowerCase())) : []
  const columns = { companies: ['公司名称', '行业 / 城市', '负责人', '客户状态'], contacts: ['姓名', '所属客户', '职务', '联系方式'], opportunities: ['商机', '所属客户', '阶段', '金额（人民币）', '负责人'], activities: ['主题', '所属客户', '沟通方式', '跟进日期', '下次跟进'], tasks: ['待办', '客户', '负责人', '状态', '截止日期'], notes: ['标题', '客户', '记录人', '内容摘要', '更新时间'] }[entity]
  return <div className="erp-local crm-root"><style>{css}</style>
    <div className="erp-local-note"><span>客户工作区</span><span className="erp-spacer" /><button disabled={!data || busy} onClick={backup}>导出客户备份</button></div>
    {error ? <div className="erp-alert" role="alert">{error} <button disabled={busy} onClick={load}>刷新数据</button></div> : null}
    {!data ? <div className="erp-loading">{error ? '请检查后重试。' : '正在打开客户管理…'}</div> : <>
      <nav className="crm-tabs" aria-label="客户管理模块">{Object.entries(names).map(([key, label]) => <button key={key} aria-pressed={entity === key} disabled={busy} onClick={() => tab(key)}>{label}<span>{data[key].length}</span></button>)}</nav>
      <div className="erp-workspace"><main className="erp-project-main crm-main">
        <div className="erp-project-heading"><div><h2>{names[entity]}</h2><p>{entity === 'companies' ? '把客户资料、联系人员与销售进展串在一起。' : entity === 'contacts' ? '集中管理客户联系人，点击姓名查看和编辑。' : entity === 'opportunities' ? '从线索到成交，让每一个机会都有清晰的下一步。' : '记录沟通结果与下次跟进日期。'}</p></div><span role="status" className="erp-save-notice">{notice}</span></div>
        <div className="erp-project-summary"><span>{data.companies.length} 家客户</span><span>{data.contacts.length} 位联系人</span><span>在谈 {money(data.opportunities.filter(o => !['赢单', '输单'].includes(o.stage)).reduce((n, o) => n + o.amount, 0))}</span><span>赢单 {money(data.opportunities.filter(o => o.stage === '赢单').reduce((n, o) => n + o.amount, 0))}</span></div>
        <div className="erp-filters">{entity === 'opportunities' ? <nav aria-label="商机视图"><button aria-pressed={view === 'board'} onClick={() => setView('board')}>销售管道</button><button aria-pressed={view === 'list'} onClick={() => setView('list')}>列表</button></nav> : null}
          <input aria-label="搜索客户记录" type="search" placeholder={`搜索${names[entity]}…`} value={search} onChange={e => setSearch(e.target.value)} />
          <select aria-label="筛选客户公司" value={companyId} onChange={e => setCompanyId(e.target.value)}><option value="">全部客户</option>{data.companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><span className="erp-record-count">{filtered.length} / {data[entity].length} 条</span>{search || companyId ? <button onClick={() => { setSearch(''); setCompanyId('') }}>清除筛选</button> : null}<span className="erp-spacer" />
          <button className="erp-primary" disabled={busy || (entity !== 'companies' && !data.companies.length)} onClick={() => setDraft(empty(entity, companyId || data.companies[0]?.id || ''))}>＋ 新建{names[entity]}</button>
        </div>
        {entity === 'opportunities' && view === 'board' ? <div className="erp-board crm-pipeline">{stages.map((stage, index) => <section className="erp-column" key={stage}><h3><i className={`erp-dot erp-dot-${index === 4 ? 3 : index === 5 ? 0 : 1}`} />{stage}<span>{filtered.filter(o => o.stage === stage).length}</span></h3><p className="crm-stage-total">{money(filtered.filter(o => o.stage === stage).reduce((n, o) => n + o.amount, 0))}</p>
          {filtered.filter(o => o.stage === stage).map(o => <button className="erp-task" key={o.id} onClick={() => setDraft(o)}><strong>{o.name}</strong><p>{company(o.companyId)}</p><div className="crm-deal-amount">{money(o.amount)}</div><footer><span>{o.owner || '未分配'}</span><time>{o.closeDate || '未定成交日期'}</time></footer></button>)}
          {!filtered.some(o => o.stage === stage) ? <p className="erp-column-empty">暂无商机</p> : null}<button disabled={busy || !data.companies.length} className="erp-add-task" onClick={() => setDraft({ ...empty(entity, companyId || data.companies[0]?.id), stage })}>＋ 添加商机</button>
        </section>)}</div> : <div className="erp-table-wrap"><table><thead><tr>{columns.map(c => <th key={c}>{c}</th>)}</tr></thead><tbody>{filtered.map(row => <tr key={row.id}><td><button className="erp-task-link" onClick={() => setDraft(row)}>{row.name || row.subject}</button></td>
          {entity === 'companies' ? <><td>{[row.industry, row.city].filter(Boolean).join(' / ') || '—'}</td><td>{row.owner || '未分配'}</td><td><span className="crm-tag">{row.status}</span></td></> : entity === 'contacts' ? <><td>{company(row.companyId)}</td><td>{row.role || '—'}</td><td>{row.email || row.phone || '未填写'}{row.email && row.phone ? <div>{row.phone}</div> : null}</td></> : ['tasks', 'notes'].includes(entity) ? <><td>{company(row.companyId)}</td><td>{row.owner || '未分配'}</td><td>{entity === 'tasks' ? row.status : row.description.slice(0, 80)}</td><td>{entity === 'tasks' ? row.dueDate || '未设置' : (row.updatedAt || row.createdAt || '').slice(0, 10)}</td></> : entity === 'opportunities' ? <><td>{company(row.companyId)}</td><td>{row.stage}</td><td>{money(row.amount)}</td><td>{row.owner || '未分配'}</td></> : <><td>{company(row.companyId)}</td><td>{row.kind}</td><td>{row.date}</td><td>{row.nextDate || '未设置'}</td></>}
        </tr>)}</tbody></table>{!filtered.length ? <p className="erp-column-empty">没有匹配记录。调整筛选，或新建{names[entity]}。</p> : null}</div>}
        <p className="crm-footnote">本地客户管理提供独立数据存储，不会自动同步到 Twenty。完整系统请使用顶部「Twenty 服务」。</p>
      </main>{draft ? <Editor key={`${entity}-${draft.id || 'new'}`} entity={entity} record={draft} data={data} busy={busy} error={error} save={value => mutate('save', value)} remove={id => mutate('delete', { id })} close={() => setDraft(null)} related={(key, id) => { tab(key); setCompanyId(id) }} /> : null}</div>
    </>}
  </div>
}
