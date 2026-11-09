import { getDesk, setDesk } from './desk.js'

export function callYingce(kind, payload = {}, requestId = crypto.randomUUID()) {
  const frame = document.querySelector('iframe[title="影策完整工作台"]')
  if (!frame?.contentWindow || getDesk().view !== 'drama') return Promise.reject(new Error('请先打开影策页面'))
  const origin = new URL(frame.src).origin
  return new Promise((resolve, reject) => {
    const finish = () => { clearTimeout(timer); window.removeEventListener('message', receive) }
    const receive = event => {
      if (event.source !== frame.contentWindow || event.origin !== origin || event.data?.type !== 'media-workbench:agent-result' || event.data.requestId !== requestId) return
      finish()
      if (event.data.ok) resolve(event.data.result)
      else reject(new Error(event.data.error || '影策操作失败'))
    }
    const timer = setTimeout(() => { finish(); reject(new Error('影策响应超时，请检查页面中的保存状态。')) }, 45000)
    window.addEventListener('message', receive)
    frame.contentWindow.postMessage({ type: 'media-workbench:agent', requestId, kind, ...payload }, origin)
  })
}

export function observeYingce() {
  let stopped = false
  const refresh = async () => {
    if (stopped || getDesk().view !== 'drama') return
    try { const context = await callYingce('context'); if (!stopped && getDesk().view === 'drama') setDesk({ pageContext: context }) } catch {}
  }
  refresh()
  const timer = setInterval(refresh, 2000)
  return () => { stopped = true; clearInterval(timer) }
}
