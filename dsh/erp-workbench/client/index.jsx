import React from 'react'
import css from './style.css'
import workbenchUi from './workbench-ui.css'
import { LocalWorkbench } from './local.jsx'
import { CrmWorkbench } from './crm.jsx'

function Workbench() {
  const [mode, setMode] = React.useState('local')
  const [openedCrm, setOpenedCrm] = React.useState(false)
  const [status, setStatus] = React.useState(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const [revision, setRevision] = React.useState(0)
  async function check() {
    setBusy(true); setError('')
    try {
      const response = await fetch(mode === 'twenty' ? '/erp-workbench/twenty-status' : '/erp-workbench/status', { credentials: 'same-origin' })
      if (!response.ok) throw new Error(response.status === 403 ? 'DSH 会话已失效，请重新打开工作台。' : '连接检查失败，请稍后重试。')
      setStatus({ ...await response.json(), mode })
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  React.useEffect(() => { setStatus(null); if (['kaneo', 'twenty'].includes(mode)) check() }, [mode])
  const currentStatus = status?.mode === mode ? status : null
  const url = currentStatus?.url || (mode === 'twenty' ? 'http://127.0.0.1:13580' : 'http://127.0.0.1:13570')
  return <section className="erp-root">
    <style>{css + workbenchUi}</style>
    <header className="erp-toolbar"><h1>erp系统工作台</h1>
      <nav aria-label="工作台导航"><button aria-pressed={mode === 'local'} onClick={() => setMode('local')}>项目任务</button><button aria-pressed={mode === 'crm'} onClick={() => { setOpenedCrm(true); setMode('crm') }}>客户管理</button></nav>
      <span className="erp-spacer" />
      <details className="erp-services"><summary>{mode === 'kaneo' ? 'Kaneo 服务' : mode === 'twenty' ? 'Twenty 服务' : '服务连接'}</summary><div className="erp-service-menu">{[['kaneo', 'Kaneo 服务'], ['twenty', 'Twenty 服务']].map(([key, label]) => <button key={key} onClick={event => { event.currentTarget.closest('details').open = false; setMode(key) }}>{label}</button>)}</div></details>
      {['kaneo', 'twenty'].includes(mode) ? <><button disabled={busy} onClick={() => { setRevision(x => x + 1); check() }}>{busy ? '正在检查…' : '刷新连接'}</button><a href={url} target="_blank" rel="noreferrer">独立打开 ↗</a></> : null}
    </header>
    <div className="erp-screen" hidden={mode !== 'local'}><LocalWorkbench /></div>
    {openedCrm ? <div className="erp-screen" hidden={mode !== 'crm'}><CrmWorkbench /></div> : null}
    {['kaneo', 'twenty'].includes(mode) ? <>{error ? <p role="alert" className="erp-alert">{error}</p> : null}
    {currentStatus?.ready ? <iframe key={`${mode}-${revision}`} title={mode === 'twenty' ? 'Twenty CRM 客户管理' : 'Kaneo 企业工作管理'} src={url} /> : <main className="erp-empty">
      <div className="erp-mark" aria-hidden="true">E</div><h2>{busy || !currentStatus ? '正在连接工作管理服务' : '工作管理服务尚未启动'}</h2>
      <p>{mode === 'twenty' ? '连接完整 Twenty CRM，统一管理客户关系。' : '项目、任务、看板和团队协作，集中在一个工作空间。'}</p>
      {!busy && currentStatus ? <><p>{mode === 'twenty' ? '请运行本目录的「部署Twenty.ps1」。完整服务需要 Docker；无需 Docker 可直接使用顶部「客户管理」。' : '首次使用，请运行本目录的「部署Kaneo.ps1」。需要先安装并启动 Docker Desktop。完成后点击刷新连接。'}</p><button onClick={check}>重新连接</button></> : null}
      <p className="erp-note">使用 {mode === 'twenty' ? 'Twenty' : 'Kaneo'} 独立账号登录；成员权限由对应服务管理。无法内嵌时可点击「独立打开」。</p>
    </main>}</> : null}
  </section>
}
function Icon({ size = 22 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16M5 9h2m4 4h2m4-5h2"/></svg> }
export const inject = ['slots']
export function apply(ctx) {
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'erp-workbench' }, Workbench))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'erp-workbench', order: 6, label: () => 'erp系统工作台' }, Icon))
}
