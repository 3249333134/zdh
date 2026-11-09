import React from 'react'
import { setDesk, useDesk } from './desk.js'
import { lang, t, useLang } from './i18n.js'
import { SettingsDialog } from './settings.jsx'
import { Dialog, IconButton } from './ui.jsx'
import { StyleView } from './style.jsx'
import { UnifiedAISettings } from './unified-ai.jsx'

const SECTIONS = [
  ['general', '通用与成稿', ''],
  ['style', '风格与写作规则', ''],
  ['ai', '通用 AI', ''],
  ['channels', '影策模型管理', '/admin/channels'],
  ['autoclip', '剪辑助手配置', ''],
  ['account', '创作偏好', '/settings?section=preferences'],
  ['storage', '本地素材索引', '/assets'],
  ['knowledge', '知识与技能', '/admin/ecommerce/library'],
  ['tools', '插件与工具', '/admin/workbench-tools'],
  ['system', '系统管理', '/admin/settings/runtime-policy'],
]
let themeController = null
export function setWorkbenchThemeController(controller) { themeController = controller }

export function canvasOrigin(settings) {
  try {
    const url = new URL(settings?.yingce?.webUrl)
    return ['http:', 'https:'].includes(url.protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ? url.origin : ''
  } catch { return '' }
}

export async function syncCanvasPreferences(frame) {
  if (!frame) return
  const origin = frame.src ? new URL(frame.src).origin : ''
  let ai
  try {
    const response = await fetch('media-desk/unified-ai')
    if (response.ok) {
      const { config } = await response.json()
      ai = { textModel: config.textModel, imageModel: config.imageModel, videoModel: config.videoModel, canvasChannelId: config.canvasChannelId }
    }
  } catch {}
  if (origin) frame.contentWindow?.postMessage({ type: 'media-workbench:preferences', language: lang(), dark: document.body.hasAttribute('data-ds-dark-theme'), ai }, origin)
}

export function WorkbenchToolbar({ children }) {
  useLang()
  const [expanded, setExpanded] = React.useState(false)
  const container = React.useRef(null)
  React.useEffect(() => {
    if (!expanded) return
    const close = event => { if (!container.current?.contains(event.target)) setExpanded(false) }
    const key = event => { if (event.key === 'Escape') setExpanded(false) }
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', key) }
  }, [expanded])
  const open = section => setDesk({ settingsOpen: true, settingsSection: section, settingsPath: null })
  return <div className="md-workbench-controls" aria-label={t('全局配置')}>
    <IconButton icon="gear" label={t('自媒体工作台设置')} onClick={() => open('ai')} />
    <div className="md-more-wrap" ref={container}>
    <IconButton icon="more" label={t('更多')} aria-expanded={expanded} aria-controls="md-more-menu" onClick={() => setExpanded(value => !value)} />
    {expanded ? <div className="md-more-menu" id="md-more-menu" role="group" aria-label={t('更多功能')}>
    <button type="button" className="md-btn" onClick={() => open('general')}>{lang() === 'en' ? 'English' : '中文'}</button>
    <IconButton icon="moon" label={t('切换全局主题')} onClick={() => {
      if (themeController) themeController(document.body.hasAttribute('data-ds-dark-theme') ? 'light' : 'dark')
      else open('general')
    }} />
    <button type="button" className="md-btn" onClick={() => open('account')}>{t('创作偏好')}</button>
    {children}
    </div> : null}
    </div>
  </div>
}

export function WorkbenchSettings() {
  useLang()
  const open = useDesk(s => s.settingsOpen)
  const requestedSection = useDesk(s => s.settingsSection ?? 'general')
  const settings = useDesk(s => s.settings)
  const origin = canvasOrigin(settings)
  const entry = SECTIONS.find(row => row[0] === requestedSection) ?? SECTIONS[0]
  const section = entry[0]
  const customPath = useDesk(s => s.settingsPath)
  const frame = React.useRef(null)
  React.useEffect(() => {
    const receive = event => {
      if (event.origin === 'http://127.0.0.1:13002' && event.data?.type === 'media-workbench:clip-settings') {
        const frames = [...document.querySelectorAll('iframe')].filter(frame => frame.src.startsWith('http://127.0.0.1:13002/'))
        if (frames.some(frame => frame.contentWindow === event.source)) setDesk({ settingsOpen: true, settingsSection: 'ai', settingsPath: null })
        return
      }
      const creativeFrame = document.querySelector('.md-yc-frame')
      if (!origin || event.origin !== origin || event.source !== creativeFrame?.contentWindow || event.data?.type !== 'media-workbench:settings') return
      const path = event.data.path
      if (['/wallet', '/admin/announcements', '/admin/banner-announcements', '/admin/feedbacks', '/admin/credit-operations', '/admin/payments', '/admin/redemption-codes'].includes(path)) return
      if (typeof path !== 'string' || !(path === '/settings' || path === '/wallet' || path === '/admin' || path.startsWith('/admin/'))) return
      const match = SECTIONS.find(row => row[2].split('?')[0] === path)
      setDesk({ settingsOpen: true, settingsSection: match?.[0] ?? 'system', settingsPath: path === '/settings' ? null : path })
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [origin])
  React.useEffect(() => {
    const sync = () => syncCanvasPreferences(frame.current)
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
    return () => observer.disconnect()
  }, [open, section, settings?.language])
  if (!open) return null
  const frameUrl = origin ? new URL(customPath || entry[2], origin) : null
  frameUrl?.searchParams.set('workbenchSettings', '1')
  return <Dialog title={t('自媒体工作台设置')} onClose={() => setDesk({ settingsOpen: false })} width={1240}>
    <div className="md-workbench-settings">
      <nav className="md-settings-nav" aria-label={t('设置分类')}>
        {SECTIONS.map(([id, label]) => <button type="button" key={id} aria-current={section === id ? 'page' : undefined} onClick={() => setDesk({ settingsSection: id, settingsPath: null })}>{t(label)}</button>)}
      </nav>
      <section className="md-settings-pane" aria-label={t(entry[1])}>
        {section === 'general' ? <div className="md-settings-general">
          <p className="md-muted">{t('适用于灵感、内容、排期、影策、复盘和风格页面。')}</p>
          <button type="button" className="md-btn" onClick={() => setDesk({ modelPickOpen: true })}>{t('助手模型')}</button>
          <SettingsDialog embedded managed />
        </div> : section === 'ai' ? <UnifiedAISettings /> : section === 'autoclip' ? <iframe className="md-settings-frame" title="剪辑助手配置" src="http://127.0.0.1:13002/#/settings" /> : section === 'style' ? <StyleView /> : origin ? <iframe key={`${section}-${customPath}`} ref={frame} className="md-settings-frame" title={t(entry[1])} src={frameUrl.href} onLoad={() => syncCanvasPreferences(frame.current)} /> : <p>{t('请先配置本机服务地址。')}</p>}
      </section>
    </div>
  </Dialog>
}
