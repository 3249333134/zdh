// MEP（Motion Editing Protocol）1.0 工单执行核心。应用内和本地 CLI 共用，无浏览器/Node 依赖。
const STYLES = {
  original: { brightness: 100, contrast: 100, saturation: 100, grayscale: 0, sepia: 0, hue: 0, vignette: 0 },
  cinematic: { brightness: 96, contrast: 112, saturation: 102, sepia: 8, hue: -4, vignette: 34 },
  warm: { brightness: 106, contrast: 104, saturation: 110, sepia: 22, hue: 6, vignette: 16 },
  japanese: { brightness: 108, contrast: 92, saturation: 94, sepia: 6, hue: 0, vignette: 0 },
  cyber: { brightness: 100, contrast: 116, saturation: 132, sepia: 0, hue: 14, vignette: 42 },
  mono: { brightness: 100, contrast: 112, saturation: 0, grayscale: 100, sepia: 0, hue: 0, vignette: 0 },
  noir: { brightness: 92, contrast: 146, saturation: 0, grayscale: 100, sepia: 0, hue: 0, vignette: 50 },
  vintage: { brightness: 102, contrast: 104, saturation: 84, sepia: 38, hue: 0, vignette: 30 },
  faded: { brightness: 108, contrast: 88, saturation: 70, sepia: 10, hue: 0, vignette: 8 },
  vivid: { brightness: 104, contrast: 108, saturation: 132, sepia: 0, hue: 0, vignette: 0 },
}
const TRANSITIONS = new Set(['fade','dissolve','slide-left','slide-right','slide-up','slide-down','zoom-in','zoom-out','wipe-left','wipe-right','wipe-up','wipe-down','flash','shake','glitch'])
const TEXT_FIELDS = ['text','start','duration','x','y','width','fontSize','fontWeight','lineHeight','color','align','boxColor','boxPadding','strokeWidth','strokeColor','shadow','textAnim','textAnimDuration','title']
const CLIP_FIELDS = ['start','duration','inPoint','x','y','width','height','opacity','rotation','volume','speed','fadeIn','fadeOut','transitionIn','transitionOut','transitionDuration','blend','corners','mask','brightness','contrast','saturation','grayscale','sepia','hue','vignette','blur','fit','trackId','hidden','title']
const uid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : 'mep-' + Math.random().toString(16).slice(2) + Date.now().toString(16))
const round = value => Math.round(Number(value) * 1000) / 1000

export function validateOrder(order) {
  const errors = []
  if (!order || typeof order !== 'object') return ['工单必须是 JSON 对象']
  if (!Array.isArray(order.operations) || !order.operations.length) errors.push('operations 必须是非空数组')
  if (order.operations && order.operations.length > 200) errors.push('单份工单最多 200 个操作')
  for (const [index, operation] of (order.operations || []).entries()) {
    if (!operation || typeof operation !== 'object') { errors.push(`第 ${index + 1} 个操作不是对象`); continue }
    if (!['setProject','addText','addClip','removeClip','trim','move','setText','setTransition','applyStyle','setKeyframes','setSpeed','setVolume','addMarker','render'].includes(operation.op)) errors.push(`第 ${index + 1} 个操作 op 不支持：${operation.op}`)
  }
  return errors
}

const pick = (source, fields) => {
  const out = {}
  for (const key of fields) if (source[key] !== undefined) out[key] = source[key]
  return out
}

function resolve(project, target, visualOnly = false) {
  let rows = project.clips
  if (!target || target === 'all' || target === 'all-visual') rows = rows.filter(clip => !visualOnly || ['video', 'image'].includes(clip.type))
  else if (Array.isArray(target)) rows = rows.filter(clip => target.includes(clip.id) || target.includes(clip.title))
  else rows = rows.filter(clip => clip.id === target || clip.title === target || String(clip.title || '').includes(target))
  return rows
}

export function applyOrder(input, order, options = {}) {
  const errors = validateOrder(order)
  if (errors.length) throw Error(errors.join('；'))
  const project = structuredClone(input)
  const changes = []
  const warnings = []
  const now = () => round(project.duration)
  for (const [index, operation] of order.operations.entries()) {
    const label = `#${index + 1} ${operation.op}`
    switch (operation.op) {
      case 'setProject': {
        for (const key of ['width', 'height', 'fps', 'duration', 'background', 'title']) if (operation[key] !== undefined) project[key] = operation[key]
        changes.push(`${label}：${Object.keys(pick(operation, ['width','height','fps','duration','background','title'])).join('、')}`)
        break
      }
      case 'addText': {
        if (!operation.text) { warnings.push(`${label}：缺少 text，已跳过`); break }
        const duration = Math.min(Number(operation.duration) || 3, Math.max(1, now()))
        const clip = { id: uid(), type: 'text', title: operation.title || String(operation.text).slice(0, 12), trackId: 'captions', layer: 20, x: 100, y: 300, width: project.width - 200, fontSize: 56, fontWeight: 700, lineHeight: 1.3, color: '#1c1c1c', align: 'left', start: 0, ...pick(operation, TEXT_FIELDS), duration }
        clip.start = Math.max(0, Math.min(Number(operation.start) || 0, Math.max(0, project.duration - duration)))
        project.clips.push(clip)
        changes.push(`${label}：${clip.title}`)
        break
      }
      case 'addClip': {
        const asset = project.assets.find(row => row.id === operation.asset || row.name === operation.asset || String(row.name).includes(operation.asset))
        if (!asset) { warnings.push(`${label}：找不到素材 ${operation.asset}`); break }
        const type = asset.kind === 'audio' ? 'audio' : asset.kind === 'image' ? 'image' : 'video'
        const speed = Number(operation.speed) || 1
        const duration = Math.min(Number(operation.duration) || (type === 'image' ? 3 : asset.duration), (asset.duration - (Number(operation.inPoint) || 0)) / speed)
        const clip = { id: uid(), type, title: asset.name, assetId: asset.id, start: Math.max(0, Number(operation.start) || 0), duration, inPoint: Math.max(0, Number(operation.inPoint) || 0), speed, volume: operation.volume ?? 1, x: 0, y: 0, width: project.width, height: project.height, fit: 'cover', trackId: type === 'audio' ? 'audio-music' : 'video-main', ...pick(operation, CLIP_FIELDS) }
        clip.duration = Math.max(.1, duration)
        project.clips.push(clip)
        changes.push(`${label}：${asset.name}`)
        break
      }
      case 'removeClip': {
        const rows = resolve(project, operation.target)
        if (!rows.length) { warnings.push(`${label}：没有匹配片段`); break }
        const ids = new Set(rows.map(clip => clip.id))
        project.clips = project.clips.filter(clip => !ids.has(clip.id))
        changes.push(`${label}：删除 ${rows.length} 个片段`)
        break
      }
      case 'trim': {
        const rows = resolve(project, operation.target)
        if (!rows.length) { warnings.push(`${label}：没有匹配片段`); break }
        for (const clip of rows) {
          if (operation.start !== undefined) clip.start = Math.max(0, Number(operation.start))
          if (operation.duration !== undefined) clip.duration = Math.max(1 / project.fps, Number(operation.duration))
          if (clip.keyframes) for (const channel of Object.keys(clip.keyframes)) clip.keyframes[channel] = clip.keyframes[channel].filter(row => row.t <= clip.duration + .001)
        }
        changes.push(`${label}：${rows.length} 个片段`)
        break
      }
      case 'move': {
        const rows = resolve(project, operation.target)
        for (const clip of rows) {
          if (operation.start !== undefined) clip.start = Math.max(0, Number(operation.start))
          if (operation.trackId) clip.trackId = operation.trackId
        }
        if (rows.length) changes.push(`${label}：${rows.length} 个片段`)
        else warnings.push(`${label}：没有匹配片段`)
        break
      }
      case 'setText': {
        const rows = resolve(project, operation.target)
        for (const clip of rows) {
          if (clip.type !== 'text') continue
          Object.assign(clip, pick(operation, TEXT_FIELDS))
          if (operation.text) clip.text = operation.text
        }
        if (rows.length) changes.push(`${label}：${rows.length} 个文字片段`)
        else warnings.push(`${label}：没有匹配文字片段`)
        break
      }
      case 'setTransition': {
        const rows = resolve(project, operation.target, operation.target === 'all-visual')
        const type = operation.type || 'dissolve'
        if (!TRANSITIONS.has(type)) { warnings.push(`${label}：转场 ${type} 不支持`); break }
        for (const clip of rows) {
          if (operation.side !== 'out') clip.transitionIn = type
          if (operation.side === 'out' || operation.side === 'both') clip.transitionOut = type
          clip.transitionDuration = Math.max(.1, Number(operation.duration) || .6)
        }
        changes.push(`${label}：${rows.length} 个片段 → ${type}`)
        break
      }
      case 'applyStyle': {
        const style = operation.style && STYLES[operation.style]
        const values = style || operation.values
        if (!values) { warnings.push(`${label}：未知风格 ${operation.style}`); break }
        const rows = resolve(project, operation.target || 'all-visual', true)
        for (const clip of rows) Object.assign(clip, values)
        changes.push(`${label}：${rows.length} 个画面`)
        break
      }
      case 'setKeyframes': {
        const rows = resolve(project, operation.target)
        if (!['x','y','scale','rotation','opacity'].includes(operation.channel)) { warnings.push(`${label}：通道无效`); break }
        for (const clip of rows) clip.keyframes = { ...(clip.keyframes || {}), [operation.channel]: (operation.points || []).map(row => ({ t: Number(row.t), v: Number(row.v) })) }
        changes.push(`${label}：${rows.length} 个片段`)
        break
      }
      case 'setSpeed': {
        const rows = resolve(project, operation.target)
        for (const clip of rows) if (['video', 'audio'].includes(clip.type)) clip.speed = Math.max(.25, Math.min(4, Number(operation.speed) || 1))
        changes.push(`${label}：${rows.length} 个片段`)
        break
      }
      case 'setVolume': {
        const rows = resolve(project, operation.target)
        for (const clip of rows) clip.volume = Math.max(0, Math.min(1, Number(operation.volume) || 0))
        changes.push(`${label}：${rows.length} 个片段`)
        break
      }
      case 'addMarker': {
        const time = Math.max(0, Math.min(project.duration, Number(operation.time) || 0))
        project.markers = [...(project.markers || []), { id: uid(), time, title: operation.title || 'MEP 标记' }]
        changes.push(`${label}：${time}s`)
        break
      }
      case 'render': {
        changes.push(`${label}：已请求导出（${operation.format || 'mp4'}）`)
        break
      }
    }
  }
  project.duration = Math.max(1, Math.ceil(Math.max(project.duration, ...project.clips.map(clip => clip.start + clip.duration)) + 1))
  return { project, changes, warnings, render: order.operations.some(operation => operation.op === 'render') && options.render !== false }
}

export const MEP_STYLES = Object.keys(STYLES)
export const MEP_EXAMPLE = {
  version: '1.0',
  operations: [
    { op: 'applyStyle', target: 'all-visual', style: 'cinematic' },
    { op: 'setTransition', target: 'all-visual', type: 'dissolve', duration: .6 },
    { op: 'addText', text: '用代码剪出来的片子', start: 1, duration: 3, x: 640, y: 300, fontSize: 72, align: 'center' },
  ],
}
