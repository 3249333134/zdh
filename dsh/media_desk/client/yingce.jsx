import React from 'react'
import { useDesk } from './desk.js'
import { t, useLang } from './i18n.js'
import { syncCanvasPreferences } from './workbench-settings.jsx'
import { observeYingce } from './yingce-agent.js'

export function YingceView() {
  const language = useLang()
  const configuredUrl = useDesk(s => s.settings?.yingce?.webUrl)
  const [attempt, retry] = React.useReducer(value => value + 1, 0)
  const [status, setStatus] = React.useState({ loading: true, error: '' })
  const frame = React.useRef(null)
  React.useEffect(observeYingce, [])
  React.useEffect(() => {
    const sync = () => syncCanvasPreferences(frame.current)
    const observer = new MutationObserver(sync)
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
    sync()
    return () => observer.disconnect()
  }, [configuredUrl, language])
  let origin = ''
  try {
    const url = new URL(configuredUrl)
    if (['http:', 'https:'].includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) origin = url.origin
  } catch {}

  React.useEffect(() => {
    const controller = new AbortController()
    setStatus({ loading: true, error: '' })
    if (!origin) {
      setStatus({ loading: false, error: t('请在设置中填写影策本机前端地址。') })
      return () => controller.abort()
    }
    fetch('media-desk/yingce/status', { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(t('影策服务检查失败，请重试。'))
        const result = await response.json()
        if (!result.enabled || !result.web?.reachable || result.web.status >= 400) throw new Error(t('影策服务尚未就绪，请重新启动工作台后重试。'))
        setStatus({ loading: false, error: '' })
      })
      .catch(error => { if (!controller.signal.aborted) setStatus({ loading: false, error: error.message }) })
    return () => controller.abort()
  }, [origin, attempt])

  if (status.loading || status.error) return (
    <section className="md-yc-message" aria-live="polite">
      <p>{status.error || t('正在打开影策…')}</p>
      {status.error ? <button type="button" className="md-btn" onClick={retry}>{t('重试')}</button> : null}
    </section>
  )
  return <iframe ref={frame} onLoad={() => syncCanvasPreferences(frame.current)} key={`${origin}-${attempt}`} className="md-yc-frame" src={`${origin}/create`} title={t('影策完整工作台')} allow="clipboard-read; clipboard-write; microphone; camera; fullscreen" allowFullScreen />
}
