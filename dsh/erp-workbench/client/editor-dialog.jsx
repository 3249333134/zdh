import React from 'react'

export function EditorDialog({ title, busy, error, close, children }) {
  const dialog = React.useRef(null)
  const [dirty, setDirty] = React.useState(false)
  const [discard, setDiscard] = React.useState(false)

  React.useEffect(() => {
    const element = dialog.current
    const trigger = document.activeElement
    element.showModal()
    return () => {
      element.close()
      if (trigger?.isConnected) trigger.focus()
    }
  }, [])

  function requestClose() {
    if (busy) return
    if (dirty) setDiscard(true)
    else close()
  }

  return <dialog ref={dialog} className="erp-dialog" aria-label={title}
    onChangeCapture={() => setDirty(true)}
    onCancel={event => { event.preventDefault(); requestClose() }}>
    {error ? <p className="erp-dialog-error" role="alert">{error}</p> : null}
    {children(requestClose)}
    {discard ? <div className="erp-discard" role="alert">
      <span>有未保存的修改，关闭后将丢弃。</span>
      <button onClick={() => setDiscard(false)}>继续编辑</button>
      <button className="erp-danger" onClick={close}>放弃修改</button>
    </div> : null}
  </dialog>
}
