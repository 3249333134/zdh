// 侧边对话：一句话改一切。解析和执行都在 Host，这里只负责展示回执。
import React from 'react'
import { clearChat, openItem, report, sendChat, setDesk, toast, undo, useDesk } from './desk.js'
import { MODULE_LABELS, useWorkflow, workflowRequest } from './workflow.jsx'
import { t } from './i18n.js'
import { Icon, IconButton } from './ui.jsx'

const SUGGESTIONS = [
  '记一下：地铁广告牌那句「慢一点也算到达」可以当开头',
  '接下来有什么排期？',
  '以后标题都不要超过 20 个字',
  '把今天最好的灵感一键成稿',
]

function Receipt({ receipt }) {
  const clickable = receipt.kind === 'item' && receipt.target
  const Tag = clickable ? 'button' : 'div'
  return (
    <Tag type={clickable ? 'button' : undefined} className="md-receipt" onClick={clickable ? () => openItem(receipt.target) : undefined}>
      <span className="md-receipt-check"><Icon name="check" size={11} stroke={2.2} /></span>
      <span>{receipt.text}</span>
    </Tag>
  )
}

function Message({ message, canUndoThis, actions = null }) {
  if (message.role === 'user') return <div className="md-msg is-user">{message.text}</div>
  return (
    <div className="md-msg is-bot">
      <p>{message.text}</p>
      {message.receipts?.map((receipt, index) => <Receipt key={index} receipt={receipt} />)}
      {message.errors?.map((error, index) => <p key={index} className="md-msg-error">{error}</p>)}
      {message.notice ? <p className="md-msg-note">{message.notice}</p> : null}
      {actions}
      <footer>
        <span>{message.engine === 'local' ? t('本地规则') : ''}</span>
        {canUndoThis ? <button type="button" onClick={undo}><Icon name="undo" size={12} />{t('撤销')}</button> : null}
      </footer>
    </div>
  )
}

/** 对话面板：首页的助手和成稿工作区共用。每条灵感有自己的对话。 */
export function ChatPanel({ itemId, head, top = null, suggestions, placeholder, disabled = false, intro = true, messageActions = null }) {
  const all = useDesk(s => s.state.chat)
  const chat = React.useMemo(() => all.filter(m => (m.itemId ?? null) === (itemId ?? null)), [all, itemId])
  const thinking = useDesk(s => s.thinking)
  const quote = useDesk(s => s.chatQuote)
  const text = useDesk(s => s.chatDraft)
  const setText = value => setDesk({ chatDraft: value })
  const scroller = React.useRef(null)
  const input = React.useRef(null)

  React.useEffect(() => {
    if (scroller.current) scroller.current.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }, [chat.length, thinking])
  React.useLayoutEffect(() => {
    const el = input.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }, [text])
  React.useEffect(() => {
    if (quote) input.current?.focus()
  }, [quote])

  const send = (value) => {
    const message = (value ?? text).trim()
    if (!message || thinking || disabled) return
    setText('')
    sendChat(message)
  }
  const lastBot = [...chat].reverse().find(m => m.role === 'assistant')

  return (
    <div className="md-chat">
      <header className="md-dock-head" data-window-drag="">{head}</header>
      <div className="md-dock-scroll" ref={scroller} aria-live="polite">
        {top}
        {chat.length === 0 && intro ? (
          <div className="md-dock-intro">
            <h3>{t('说一句话，')}<br />{t('剩下的我来补全。')}</h3>
            <p>{t('选题、灵感、内容、排期、风格和写作标准，都可以直接说。每一步都能撤销。')}</p>
          </div>
        ) : chat.map(message => <Message key={message.id} message={message} canUndoThis={message === lastBot && message.undoable} actions={messageActions ? messageActions(message) : null} />)}
        {thinking ? <div className="md-msg is-bot"><span className="md-shimmer">{t('正在处理……')}</span></div> : null}
      </div>
      {suggestions?.length ? (
        <div className="md-suggest">
          {suggestions.slice(0, chat.length ? 2 : 4).map(row => <button type="button" key={row} onClick={() => send(row)} disabled={thinking || disabled}>{row}</button>)}
        </div>
      ) : null}
      <form className="md-composer" onSubmit={(event) => { event.preventDefault(); send() }}>
        {quote ? (
          <div className="md-composer-ctx">
            <Icon name="target" size={12} />
            <span>{quote.text ? t('{label}：{text}', { label: quote.label, text: quote.text }) : quote.label}</span>
            <button type="button" aria-label={t('取消引用')} onClick={() => setDesk({ chatQuote: null })}><Icon name="close" size={11} /></button>
          </div>
        ) : null}
        <textarea
          ref={input}
          rows={1}
          aria-label={t('给助手发消息')}
          value={text}
          disabled={disabled}
          placeholder={placeholder}
          onChange={e => setText(e.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              send()
            }
          }}
        />
        <button type="submit" className="md-send" aria-label={t('发送')} disabled={!text.trim() || thinking || disabled}><Icon name="send" size={15} /></button>
      </form>
    </div>
  )
}

/** 选到了模型但调用失败：把服务返回的原因摆出来，不说成「没连上」。 */
function ModelAlert({ model, error }) {
  return (
    <div className="md-model-alert" role="status">
      <strong>{t('模型 {model} 调用失败', { model })}</strong>
      <p>{error.length > 280 ? `${error.slice(0, 280)}…` : error}</p>
    </div>
  )
}

export function ChatDock() {
  const useDeskTaskLabel = useDesk(s => {
    const task = (s.workflow || s.state?.workflow)?.tasks.find(row => row.id === s.activeTaskId)
    return task && (s.view === task.module || s.view === 'content' || s.view === 'schedule') ? `当前事项 · ${task.title}` : ''
  })
  const view = useDesk(s => s.view)
  const context = useDesk(s => s.pageContext)
  const model = useDesk(s => s.model)
  const modelOk = useDesk(s => s.modelOk)
  const modelError = useDesk(s => s.modelError)
  const hasChat = useDesk(s => s.state.chat.some(m => !m.itemId))
  const activeTaskId = useDesk(s => s.activeTaskId)
  const suggestions = useDesk(s => s.chatSuggestions)
  const workflow = useWorkflow()
  const chat = useDesk(s => s.state.chat)
  const lastBot = [...chat].reverse().find(m => m.role === 'assistant' && !m.itemId)
  const addSuggestions = async (rows) => {
    try {
      const task = workflow.tasks.find(row => row.id === activeTaskId)
      if (!task) throw new Error('当前事项不存在，请刷新')
      const result = await workflowRequest('add-many', { projectId: task.projectId, tasks: rows })
      setDesk({ chatSuggestions: null })
      toast(`已补充 ${result.result?.added?.length || rows.length} 项事项，可在排期或待安排中安排时间`)
    } catch (error) { report(error) }
  }
  const saveRevision = async (message) => {
    try {
      await workflowRequest('revise', { id: activeTaskId, text: message.text, model: message.engine })
      toast('已保存为修改稿；事项状态和已有交付未被覆盖')
    } catch (error) { report(error) }
  }
  const messageActions = (message) => {
    if (message.role !== 'assistant') return null
    const rows = suggestions?.messageId === message.id ? suggestions.items : []
    const canRevise = activeTaskId && message.workflowTaskId === activeTaskId && message.id === lastBot?.id && message.text
    if (!rows.length && !canRevise) return null
    return <>
      {rows.length ? <div className="md-msg-proposals">
        <small>{t('建议补充 {n} 项事项；确认后进入待安排，不会自动执行', { n: rows.length })}</small>
        {rows.map((row, index) => <p key={index}>{row.title}<span>{MODULE_LABELS[row.module] || row.module} · {row.executor === 'ai' ? 'AI' : '我'} · {row.estimateMin} 分钟</span></p>)}
        <div className="md-msg-actions"><button className="md-btn" type="button" onClick={() => addSuggestions(rows)}>{t('加入项目')}</button><button className="md-btn" type="button" onClick={() => setDesk({ chatSuggestions: null })}>{t('忽略')}</button></div>
      </div> : null}
      {canRevise ? <div className="md-msg-actions"><button className="md-btn" type="button" onClick={() => saveRevision(message)}>{t('保存为修改稿')}</button></div> : null}
    </>
  }
  return (
    <aside className="md-dock" aria-label={t('对话助手')}>
      <ChatPanel
        head={(
          <>
            <h2>{t('助手')}</h2>
            <span className={`md-engine ${!model ? '' : modelOk === false ? 'is-down' : 'is-live'}`} title={!model ? t('当前没有可用模型，只能处理常见说法') : modelOk === false ? `${t('模型 {model} 调用失败，现在只能处理常见说法。', { model })}${modelError ? `\n${modelError}` : ''}` : t('使用 DeepSeek Harness 当前模型 {model}', { model })}>
              <i />{!model ? t('本地规则') : modelOk === false ? t('模型调用失败') : model}
            </span>
            <span style={{ flex: 1 }} />
            {hasChat ? <IconButton icon="refresh" label={t('清空对话')} onClick={clearChat} /> : null}
            <IconButton icon="close" label={t('收起对话')} onClick={() => setDesk({ dockOpen: false })} />
          </>
        )}
        top={<><p className="md-assistant-scope">{useDeskTaskLabel || (view === 'drama' ? `影策 · ${context?.title || '当前页面'}` : view === 'autoclip' ? '剪辑助手 · AutoClip（请在页面中操作剪辑）' : t('自媒体工作台 · 当前页面'))}</p>{model && modelOk === false && modelError ? <ModelAlert model={model} error={modelError} /> : null}</>}
        suggestions={useDeskTaskLabel ? ['查看交付结果', '执行当前AI事项'] : view === 'drama' ? ['查看当前画布', '打开画布列表'] : SUGGESTIONS.map(row => t(row))}
        placeholder={t('想改什么，直接说')}
        messageActions={messageActions}
      />
    </aside>
  )
}
