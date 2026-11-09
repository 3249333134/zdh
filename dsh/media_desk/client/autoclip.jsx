import React from 'react'
import { syncCanvasPreferences } from './workbench-settings.jsx'
import { useDesk } from './desk.js'

// Keep the original local application mounted while switching workbench tabs.
export function AutoClipView() {
  const frame = React.useRef(null)
  const projectPath = useDesk(s => s.clipProjectPath)
  React.useEffect(() => {
    const observer = new MutationObserver(() => syncCanvasPreferences(frame.current))
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
    return () => observer.disconnect()
  }, [])
  return <iframe ref={frame} onLoad={() => syncCanvasPreferences(frame.current)} className="md-yc-frame" src={'http://127.0.0.1:13002/#' + (projectPath || '/')} title="剪辑助手 AutoClip" allow="clipboard-read; clipboard-write; fullscreen" allowFullScreen />
}
