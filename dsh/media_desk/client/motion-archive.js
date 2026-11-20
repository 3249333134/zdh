// 读取 .motion 压缩包：区分模板包与可编辑工程包，并把 composition.html 还原成时间线。
const decoder = new TextDecoder()

async function inflateRaw(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export async function readMotionPackage(file) {
  const buffer = new Uint8Array(await file.arrayBuffer())
  const view = new DataView(buffer.buffer)
  let eocd = -1
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 66000); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw Error('不是有效的 .motion 压缩包')
  const count = view.getUint16(eocd + 10, true), offset = view.getUint32(eocd + 16, true)
  const files = {}
  let pointer = offset
  for (let index = 0; index < count; index++) {
    if (view.getUint32(pointer, true) !== 0x02014b50) throw Error('压缩包目录损坏')
    const method = view.getUint16(pointer + 10, true)
    const compressed = view.getUint32(pointer + 20, true)
    const nameLength = view.getUint16(pointer + 28, true), extraLength = view.getUint16(pointer + 30, true), commentLength = view.getUint16(pointer + 32, true)
    const local = view.getUint32(pointer + 42, true)
    const name = decoder.decode(buffer.subarray(pointer + 46, pointer + 46 + nameLength))
    pointer += 46 + nameLength + extraLength + commentLength
    if (name.endsWith('/')) continue
    const localName = view.getUint16(local + 26, true), localExtra = view.getUint16(local + 28, true)
    const data = buffer.subarray(local + 30 + localName + localExtra, local + 30 + localName + localExtra + compressed)
    if (method === 0) files[name] = data
    else if (method === 8) files[name] = await inflateRaw(data)
    else throw Error('压缩方式不受支持：' + method)
  }
  return files
}

const parseStyle = value => {
  const out = {}
  for (const part of String(value || '').split(';')) {
    const at = part.indexOf(':')
    if (at < 0) continue
    const key = part.slice(0, at).trim(), raw = part.slice(at + 1).trim(), value2 = parseFloat(raw)
    if (!Number.isFinite(value2)) continue
    out[key] = raw.endsWith('%') ? { percent: value2 } : value2
  }
  return out
}

const parseOverrides = value => {
  try {
    const rows = JSON.parse(value || '[]')
    const row = Array.isArray(rows) ? rows.find(item => item && !item.at && item.fade) : null
    return row ? { fade: row.fade } : {}
  } catch { return {} }
}

export function parseComposition(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const viewport = doc.querySelector('meta[name="viewport"]')?.getAttribute('content') || ''
  const size = /(\d+)\D+(\d+)/.exec(viewport)
  const width = size ? Number(size[1]) : 1920, height = size ? Number(size[2]) : 1080
  const background = (/background(?:-color)?\s*:\s*([^;]+)/.exec(doc.body?.getAttribute('style') || '') || [])[1]
  const items = []
  let skipped = 0
  const sections = [...doc.querySelectorAll('body > section')]
  sections.forEach((section, index) => {
    const hidden = section.hasAttribute('hidden'), muted = section.hasAttribute('muted')
    for (const element of section.children) {
      const tag = element.tagName.toLowerCase()
      if (!['video', 'img', 'audio', 'iframe'].includes(tag)) continue
      if (tag === 'iframe') { skipped++; continue }
      const raw = element.getAttribute('src') || ''
      if (!raw) continue
      const [path, fragment] = raw.split('#')
      const time = /t=([\d.]+)(?:,([\d.]+))?/.exec(fragment || '')
      items.push({
        tag, path: decodeURIComponent(path), section: index, hidden, muted,
        start: Number(element.getAttribute('at') || 0),
        inPoint: time ? Number(time[1]) : 0,
        outPoint: time && time[2] ? Number(time[2]) : null,
        speed: Number(element.getAttribute('speed') || 1) || 1,
        volume: element.hasAttribute('volume') ? Number(element.getAttribute('volume')) : 1,
        style: parseStyle(element.getAttribute('style')),
        overrides: parseOverrides(element.getAttribute('overrides')),
      })
    }
  })
  return { width, height, background: background?.trim(), items, skipped }
}

export function mimeOf(name) {
  const ext = name.split('.').pop().toLowerCase()
  return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4' })[ext] || 'application/octet-stream'
}
