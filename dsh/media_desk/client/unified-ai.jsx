import React from 'react'
import { lang } from './i18n.js'

export function UnifiedAISettings() {
  const [form, setForm] = React.useState(null)
  const [message, setMessage] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const en = lang() === 'en'
  React.useEffect(() => {
    fetch('media-desk/unified-ai').then(async response => {
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      setForm({ ...result.config, apiKey: '' })
    }).catch(error => setMessage(error.message))
  }, [])
  const save = async event => {
    event.preventDefault(); setBusy(true); setMessage('')
    try {
      const response = await fetch('media-desk/unified-ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      setForm({ ...result.config, apiKey: '' })
      setMessage(en ? 'Saved across all modules. Reopen the workbench to refresh the assistant.' : '已同步到各模块。重新打开工作台后，全局助手使用新配置。')
    } catch (error) { setMessage(error.message) } finally { setBusy(false) }
  }
  return <div className="md-settings-general">
    <h3>{en ? 'Shared AI' : '通用 AI'}</h3>
    <p className="md-muted">{en ? 'One configuration for the assistant, content, Yingce and AutoClip. Keys stay on this computer.' : '全局助手、内容创作、影策和剪辑助手共用。密钥仅保存在本机。'}</p>
    {form ? <form className="md-form" onSubmit={save}>
      {[
        ['name', en ? 'Service' : '服务名称'], ['baseUrl', en ? 'Service URL' : '服务地址'],
        ['apiKey', en ? 'API key' : 'API 密钥'], ['textModel', en ? 'Text and vision model' : '文字与理解模型'],
        ['imageModel', en ? 'Image model' : '图片模型'], ['videoModel', en ? 'Video model' : '视频模型'],
      ].map(([key, label]) => <label className="md-field" key={key}><span>{label}</span><input type={key === 'apiKey' ? 'password' : key === 'baseUrl' ? 'url' : 'text'} autoComplete="off" value={form[key] || ''} placeholder={key === 'apiKey' && form.hasKey ? (en ? 'Saved; leave blank to keep' : '已保存，留空保留现有密钥') : ''} onChange={event => setForm({ ...form, [key]: event.target.value })} required={['name', 'baseUrl', 'textModel'].includes(key)} /></label>)}
      <button className="md-btn is-primary" type="submit" disabled={busy}>{en ? (busy ? 'Saving…' : 'Save for all pages') : (busy ? '同步中…' : '保存到整个工作台')}</button>
    </form> : null}
    <p role="status">{message}</p>
  </div>
}
