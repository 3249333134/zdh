// This function is serialized into the isolated composition frame. Keep it self-contained.
export function motionToolkit(ctx, width, height, time, duration, assets, style = 'cinematic') {
  const portrait = height > width, W = portrait ? 720 : 1280, H = portrait ? 1280 : 720
  const palettes = {
    cinematic: { bg: '#101415', ink: '#f4efe7', muted: '#b8b6ad', accent: '#deb884', panel: '#1c2525' },
    paper: { bg: '#f1ecdf', ink: '#26362e', muted: '#657269', accent: '#ae4a2f', panel: '#e4ddcb' },
    studio: { bg: '#eaeef1', ink: '#182c41', muted: '#627587', accent: '#2367b4', panel: '#dce4e9' },
  }
  const C = palettes[style] || palettes.cinematic
  const ease = value => 1 - Math.pow(1 - Math.max(0, Math.min(1, value)), 4)
  const enter = delay => ease((time - delay) / .85)
  const font = '"Microsoft YaHei", "PingFang SC", sans-serif'
  function roundRect(x, y, w, h, radius) { ctx.beginPath(); ctx.roundRect(x, y, w, h, radius) }
  function wrap(text, size, maxWidth, weight = 600) {
    ctx.font = `${weight} ${size}px ${font}`
    const lines = []; let line = ''
    for (const character of String(text || '')) {
      if (character === '\n') { lines.push(line); line = ''; continue }
      if (ctx.measureText(line + character).width > maxWidth && line) { lines.push(line); line = character } else line += character
    }
    if (line) lines.push(line)
    return lines
  }
  function words(text, x, y, { size = 76, maxWidth = W - 144, color = C.ink, weight = 650, maxLines = 3, delay = 0, lineHeight = 1.24 } = {}) {
    let lines = wrap(text, size, maxWidth, weight)
    while (lines.length > maxLines && size > 30) { size -= 2; lines = wrap(text, size, maxWidth, weight) }
    ctx.save(); ctx.fillStyle = color; ctx.textBaseline = 'top'; ctx.font = `${weight} ${size}px ${font}`
    lines.slice(0, maxLines).forEach((line, i) => {
      const p = enter(delay + i * .1)
      ctx.save(); ctx.globalAlpha *= .22 + .78 * p
      ctx.beginPath(); ctx.rect(x - 3, y + i * size * lineHeight - 2, maxWidth + 6, size * 1.45); ctx.clip()
      ctx.fillText(line, x, y + i * size * lineHeight + (1 - p) * 32); ctx.restore()
    }); ctx.restore()
    return Math.min(lines.length, maxLines) * size * lineHeight
  }
  function photo(id, x, y, w, h, alpha = 1) {
    const image = assets[id]; if (!image) return false
    const iw = image.naturalWidth || image.videoWidth, ih = image.naturalHeight || image.videoHeight
    if (!iw || !ih) return false
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.globalAlpha *= alpha
    const zoom = 1.04 + Math.min(time / Math.max(duration, 1), 1) * .055
    const scale = Math.max(w / iw, h / ih) * zoom
    ctx.drawImage(image, x + (w - iw * scale) / 2 - Math.sin(time * .12) * 8, y + (h - ih * scale) / 2, iw * scale, ih * scale)
    ctx.restore(); return true
  }
  function backdrop(id) {
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H)
    if (id && photo(id, 0, 0, W, H)) {
      const shade = ctx.createLinearGradient(0, 0, W, portrait ? H : 0)
      shade.addColorStop(0, 'rgba(5,12,14,.95)'); shade.addColorStop(.54, 'rgba(5,12,14,.70)'); shade.addColorStop(1, 'rgba(5,12,14,.10)')
      ctx.fillStyle = shade; ctx.fillRect(0, 0, W, H)
      const bottom = ctx.createLinearGradient(0, H * .5, 0, H)
      bottom.addColorStop(0, 'rgba(5,12,14,0)'); bottom.addColorStop(1, 'rgba(5,12,14,.65)')
      ctx.fillStyle = bottom; ctx.fillRect(0, H * .5, W, H * .5)
    }
  }
  function rule(x, y, length, color = C.accent) { ctx.fillStyle = color; ctx.fillRect(x, y, length * enter(.25), 3) }
  function scene(spec = {}) {
    ctx.save(); ctx.scale(width / W, height / H)
    const layout = spec.layout || 'poster', imageId = spec.imageId, hasImage = !!assets[imageId]
    const ink = hasImage ? '#f4efe7' : C.ink, muted = hasImage ? '#d0cec7' : C.muted
    backdrop(layout === 'poster' || layout === 'statement' ? imageId : null)
    const margin = portrait ? 50 : 76
    if (layout === 'compare') {
      words(spec.title, margin, portrait ? 110 : 65, { size: portrait ? 62 : 64, maxWidth: W - margin * 2, maxLines: 2 })
      const top = portrait ? 365 : 232, bw = portrait ? W - margin * 2 : (W - margin * 2 - 44) / 2, bh = portrait ? 278 : 284
      ;[spec.left || '', spec.right || ''].forEach((label, i) => {
        const x = portrait ? margin : margin + i * (bw + 44), y = top + (portrait ? i * (bh + 30) : 0)
        ctx.fillStyle = i ? C.accent : C.panel; roundRect(x, y, bw, bh, 6); ctx.fill()
        if (i === 0 && imageId) { photo(imageId, x, y, bw, bh, .35) }
        words(label, x + 34, y + bh * .27, { size: portrait ? 66 : 74, maxWidth: bw - 68, maxLines: 2, color: i ? '#15221f' : C.ink, delay: .15 + i * .2 })
      })
      words(spec.subtitle, margin, portrait ? H - 184 : 572, { size: portrait ? 29 : 30, maxWidth: W - margin * 2, color: C.muted, maxLines: 2, weight: 400, delay: .5 })
    } else if (layout === 'steps') {
      words(spec.title, margin, 80, { size: portrait ? 62 : 66, maxWidth: W - margin * 2, maxLines: 2 })
      const rows = (spec.points || []).slice(0, 3)
      rows.forEach((point, i) => {
        const x = portrait ? margin : margin + i * (W - margin * 2) / 3, y = portrait ? 340 + i * 225 : 316
        rule(x, y, portrait ? W - margin * 2 : 280)
        words(point, x, y + 34, { size: portrait ? 58 : 48, maxWidth: portrait ? W - margin * 2 : 280, maxLines: 3, delay: i * .18 })
      })
      words(spec.subtitle, margin, H - 100, { size: 27, maxWidth: W - margin * 2, color: C.muted, weight: 400, maxLines: 2 })
    } else if (layout === 'metric') {
      const y = portrait ? 170 : 150
      words(spec.value || spec.highlight || '', margin, y, { size: portrait ? 190 : 240, maxWidth: W - margin * 2, maxLines: 1, color: C.accent, weight: 700 })
      const titleY = portrait ? 485 : 448
      words(spec.title, margin, titleY, { size: portrait ? 62 : 60, maxWidth: W - margin * 2, maxLines: 2 })
      words(spec.subtitle, margin, H - 132, { size: 28, maxWidth: W - margin * 2, color: C.muted, maxLines: 2, weight: 400, delay: .2 })
    } else {
      const centered = layout === 'statement'
      const textWidth = portrait ? W - margin * 2 : centered ? W * .82 : hasImage ? W * .56 : W * .72
      const titleSize = portrait ? 78 : centered ? 92 : 96
      const titleY = portrait ? H * .38 : H * .29
      const titleHeight = words(spec.title, margin, titleY, { size: titleSize, maxWidth: textWidth, maxLines: 3, color: ink })
      rule(margin, titleY - 31, 70)
      if (spec.highlight) words(spec.highlight, margin, titleY + titleHeight + 22, { size: portrait ? 48 : 44, maxWidth: textWidth, color: C.accent, maxLines: 2, delay: .2 })
      words(spec.subtitle, margin, H - (portrait ? 183 : 119), { size: portrait ? 30 : 29, maxWidth: portrait ? textWidth : W * .72, color: muted, maxLines: 2, weight: 400, delay: .3 })
      if (!hasImage && !centered && spec.highlight) {
        ctx.save(); ctx.globalAlpha = .06; words(spec.highlight, W * .57, H * .08, { size: 250, maxWidth: W * .55, color: C.accent, maxLines: 2 }); ctx.restore()
      }
    }
    ctx.restore()
  }
  return { scene, ease, enter, photo, words, palette: C }
}

export function designedSceneCode(design = {}, { title = '创作', assets = [], style = 'cinematic', index = 0 } = {}) {
  const layouts = ['poster', 'statement', 'compare', 'steps', 'metric']
  const image = assets.filter(a => a.kind === 'image')[index % Math.max(1, assets.filter(a => a.kind === 'image').length)]
  const layout = layouts.includes(design.layout) ? design.layout : 'poster'
  const spec = {
    layout, title: String(design.title || design.headline || title).slice(0, 64),
    subtitle: String(design.subtitle || '').slice(0, 120), highlight: String(design.highlight || '').slice(0, 24),
    left: String(design.left || '').slice(0, 24), right: String(design.right || '').slice(0, 24),
    value: String(design.value || '').slice(0, 12), points: Array.isArray(design.points) ? design.points.slice(0, 3).map(p => String(p).slice(0, 32)) : [],
    imageId: assets.some(a => a.id === design.imageId && a.kind === 'image') ? design.imageId : image?.id,
  }
  if (layout === 'compare' && (!spec.left || !spec.right)) spec.layout = 'poster'
  if (layout === 'steps' && !spec.points.length) spec.layout = 'poster'
  if (layout === 'metric' && !spec.value && !spec.highlight) spec.layout = 'poster'
  return `// 导演排版 · ${style}\nmotion.scene(${JSON.stringify(spec)});`
}
