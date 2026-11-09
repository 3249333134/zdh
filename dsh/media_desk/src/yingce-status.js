// 可选影策独立服务的只读状态探测。默认关闭；插件不保存第三方 API Key，也不自动启动外部进程。
import { tr } from './i18n.js'

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1'])

/**
 * 只接受本机 HTTP(S) 入口，避免把配置接口变成访问内网服务的代理。
 * @param {unknown} value
 * @returns {string} 归一化后的 origin；空字符串表示未配置。
 */
export function normalizeLocalOrigin(value) {
  const raw = String(value ?? '').trim().replace(/\/+$/, '')
  if (!raw) return ''
  let url
  try {
    url = new URL(raw)
  } catch {
    throw Object.assign(new Error(tr('影策服务地址格式无效')), { status: 400 })
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw Object.assign(new Error(tr('影策服务地址只允许 http:// 或 https://')), { status: 400 })
  if (!LOCAL_HOSTNAMES.has(url.hostname)) throw Object.assign(new Error(tr('影策独立服务地址只允许本机 localhost、127.0.0.1 或 [::1]')), { status: 400 })
  return url.origin
}

function normalizeError(err) {
  const reason = String(err?.cause?.message ?? err?.message ?? err)
  if (/abort/i.test(reason)) return tr('响应超时')
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ECONNRESET/i.test(reason)) return tr('本机服务未响应，请先在本机启动独立影策服务')
  return tr('本机服务未响应')
}

/**
 * 探测一个本机入口是否有 HTTP 响应。只返回可达性和状态码，不读取正文、不发送凭证。
 * @param {string} url
 * @param {typeof fetch} [fetchImpl]
 */
export async function probeLocalOrigin(url, fetchImpl = globalThis.fetch) {
  if (!url) return { state: 'not-configured', reachable: false }
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1200)
    try {
      const response = await fetchImpl(url, { signal: controller.signal, redirect: 'follow', credentials: 'omit' })
      await response.body?.cancel?.()
      return { state: 'reachable', reachable: true, status: response.status, url }
    } finally {
      clearTimeout(timer)
    }
  } catch (err) {
    return { state: 'unreachable', reachable: false, status: null, url, error: normalizeError(err) }
  }
}

/**
 * 汇总前端服务状态。关闭时不发起网络请求。
 * @param {object} settings
 * @param {typeof probeLocalOrigin} [probe]
 */
export async function describeYingceStatus(settings, probe = probeLocalOrigin) {
  const yingce = settings?.yingce ?? {}
  if (!yingce.enabled) {
    return {
      enabled: false,
      configured: false,
      openExternal: true,
      backend: null,
      web: null,
      note: tr('独立影策全栈默认关闭；当前插件只提供方法摘要、轻量项目和分镜草稿，不自动启动 Go/Bun 服务。'),
    }
  }
  const [backend, web] = await Promise.all([probe(yingce.backendUrl), probe(yingce.webUrl)])
  return {
    enabled: true,
    configured: Boolean(yingce.backendUrl || yingce.webUrl),
    openExternal: yingce.openExternal !== false,
    backend,
    web,
    note: tr('这是本机独立服务的只读入口；模型密钥和数据库由影策独立服务自行管理，不写入插件状态。'),
  }
}
