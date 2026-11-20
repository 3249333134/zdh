#!/usr/bin/env node
// 演示：把 Motion 工程导出为「开放工程文件夹」（motion.json + composition.html + assets + SKILL.md + MEP CLI）
// 用法：
//   node demo-export-workspace.mjs                 # 自动挑选本机片段最多的工程
//   node demo-export-workspace.mjs <工程目录>       # 导出指定工程目录（含 project.json）
//   node demo-export-workspace.mjs --sample        # 不依赖本机工程，生成示例工程
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const projectsRoot = path.join(root, 'data/macos-web/motion-editor')
const outputRoot = path.join(root, 'data/motion-workspaces-demo')
const pluginAssets = path.join(root, '../media_desk/assets')
const arg = process.argv[2]

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
const writeText = async (file, text) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, text) }
const writeJson = async (file, value) => writeText(file, JSON.stringify(value, null, 2))

function buildComposition(project, assets) {
  const groups = new Map()
  for (const clip of project.clips) {
    if (!['video', 'image', 'audio'].includes(clip.type)) continue
    const track = clip.trackId || (clip.type === 'audio' ? 'audio-music' : 'video-main')
    if (!groups.has(track)) groups.set(track, [])
    groups.get(track).push(clip)
  }
  const sections = []
  for (const clips of groups.values()) {
    const rows = clips.sort((a, b) => a.start - b.start).map(clip => {
      const asset = assets.find(row => row.id === clip.assetId)
      if (!asset) return ''
      const tag = clip.type === 'audio' ? 'audio' : clip.type === 'image' ? 'img' : 'video'
      const input = Number(clip.inPoint || 0), output = Number(input + clip.duration * (clip.speed || 1))
      const style = `left:${Math.round(clip.x || 0)}px;top:${Math.round(clip.y || 0)}px;width:${Math.round(clip.width || project.width)}px;height:${Math.round(clip.height || project.height)}px`
      const fade = (clip.fadeIn || clip.fadeOut) ? ` overrides='[{"fade":[${Number(clip.fadeIn || 0)},${Number(clip.fadeOut || 0)}]}]'` : ''
      const speed = clip.speed && clip.speed !== 1 ? ` speed="${clip.speed}"` : ''
      const volume = tag === 'audio' || clip.volume !== undefined ? ` volume="${clip.volume ?? 1}"` : ''
      return `      <${tag} src="${escapeHtml(asset.file + '#t=' + input + ',' + output)}" at="${Number(clip.start || 0)}" style="${style}"${speed}${volume}${fade}></${tag}>`
    }).filter(Boolean)
    if (rows.length) sections.push(`  <section>\n${rows.join('\n')}\n  </section>`)
  }
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=${project.width}, height=${project.height}">
<meta name="film-fps" content="${project.fps}">
</head>
<body style="margin:0;background:${project.background || '#080d15'}">
${sections.join('\n')}
</body>
</html>
`
}

const skillText = project => `# Motion 工程 · 自动剪辑 Skill

这是一份开放的 Motion 工程文件夹，Claude Code、Codex、Cursor 等外部 AI 可直接读取和修改。

## 目录

- \`motion.json\`：完整工程（片段、轨道、素材、转场、关键帧、调色），**主要编辑对象**
- \`composition.html\`：只读预览，按 Motion 页面协议描述时间与画面
- \`assets/\`：素材，只读，不要改名
- \`orders/\`：MEP 工单示例与执行记录
- \`tools/motion-mep.mjs\`：本地 MEP 执行器

## 两种工作方式

1. 直接改 \`motion.json\` 的 \`clips\`
2. 写 MEP 工单（推荐，省 Token），由执行器应用并校验

\`\`\`bash
node tools/motion-mep.mjs show .
node tools/motion-mep.mjs apply . orders/my-order.json
node tools/motion-mep.mjs validate .
\`\`\`

## 工单格式

\`\`\`json
{ "version": "1.0", "operations": [
  { "op": "applyStyle", "target": "all-visual", "style": "cinematic" },
  { "op": "setTransition", "target": "all-visual", "type": "dissolve", "duration": 0.6 },
  { "op": "addText", "text": "标题", "start": 1, "duration": 3, "x": 640, "y": 300, "fontSize": 72, "align": "center" }
] }
\`\`\`

支持：setProject / addText / addClip / removeClip / trim / move / setText / setTransition / applyStyle / setKeyframes / setSpeed / setVolume / addMarker / render。

## 约束

- 片段 start + duration 不能超过工程 duration
- 视频/音频 inPoint + duration × speed 不能超过素材时长
- 改完先 validate，再回工作台导出 MP4
`

const exampleOrder = {
  version: '1.0',
  operations: [
    { op: 'applyStyle', target: 'all-visual', style: 'cinematic' },
    { op: 'setTransition', target: 'all-visual', type: 'dissolve', duration: 0.6 },
    { op: 'addText', text: '用 MEP 工单剪出来的片子', start: 1, duration: 3, x: 640, y: 300, fontSize: 72, align: 'center' },
  ],
}

async function sampleProject() {
  const project = {
    id: 'demo-' + Date.now().toString(36), title: '导出演示 · 示例工程', width: 1280, height: 720, fps: 30, duration: 12,
    background: '#f3eee3', clips: [], assets: [], markers: [],
  }
  const assets = [
    { id: 'demo-image-a', name: 'aurora.jpg', kind: 'image', duration: 5, hasAudio: false, path: path.join(pluginAssets, 'aurora.jpg') },
    { id: 'demo-image-b', name: 'poster.jpg', kind: 'image', duration: 5, hasAudio: false, path: path.join(pluginAssets, 'poster.jpg') },
    { id: 'demo-video', name: 'v-aurora.mp4', kind: 'video', duration: 5, hasAudio: true, path: path.join(pluginAssets, 'v-aurora.mp4') },
  ]
  project.assets = assets
  project.clips = [
    { id: 'clip-a', type: 'image', assetId: 'demo-image-a', title: 'aurora.jpg', start: 0, duration: 4, inPoint: 0, volume: 0, x: 0, y: 0, width: 1280, height: 720, fit: 'cover', trackId: 'video-main', transitionIn: 'fade', transitionOut: 'dissolve', transitionDuration: .7 },
    { id: 'clip-b', type: 'image', assetId: 'demo-image-b', title: 'poster.jpg', start: 4, duration: 4, inPoint: 0, volume: 0, x: 0, y: 0, width: 1280, height: 720, fit: 'cover', trackId: 'video-main', transitionIn: 'zoom-in', transitionOut: 'wipe-left', transitionDuration: .7 },
    { id: 'clip-c', type: 'video', assetId: 'demo-video', title: 'v-aurora.mp4', start: 8, duration: 4, inPoint: 0, volume: 0, speed: 1, x: 0, y: 0, width: 1280, height: 720, fit: 'cover', trackId: 'video-main', transitionIn: 'slide-left', transitionOut: 'fade', transitionDuration: .7 },
    { id: 'clip-title', type: 'text', title: '开场标题', text: '导出工程文件夹演示', start: .5, duration: 3, x: 640, y: 280, width: 1000, fontSize: 76, fontWeight: 800, color: '#1c1c1c', align: 'center', lineHeight: 1.2, trackId: 'captions', layer: 20, textAnim: 'rise', textAnimDuration: .8 },
  ]
  return project
}

async function newestProject() {
  const rows = []
  for (const id of await fs.readdir(projectsRoot).catch(() => [])) {
    try {
      const file = path.join(projectsRoot, id, 'project.json')
      const stat = await fs.stat(file)
      const project = JSON.parse(await fs.readFile(file, 'utf8'))
      if ((project.clips || []).length) rows.push({ project, mtime: stat.mtimeMs })
    } catch {}
  }
  rows.sort((a, b) => b.mtime - a.mtime)
  return rows[0]?.project || null
}

async function loadProject() {
  if (arg === '--sample') return sampleProject()
  if (arg) {
    const directory = path.resolve(arg)
    return JSON.parse(await fs.readFile(path.join(directory, 'project.json'), 'utf8'))
  }
  return (await newestProject()) || sampleProject()
}

async function exportWorkspace(project) {
  const folder = path.join(outputRoot, String(project.title || project.id).replace(/[\/\\:*?"<>|]/g, '_') + '-' + String(project.id).slice(0, 8))
  const assetsDir = path.join(folder, 'assets')
  await fs.mkdir(assetsDir, { recursive: true })
  const assets = []
  for (const asset of project.assets || []) {
    if (!asset.path) continue
    const ext = path.extname(asset.path)
    const base = String(asset.name || 'asset' + ext).replace(/[\/\\:*?"<>|]/g, '_')
    let file = base
    if (assets.some(row => row.file === 'assets/' + file)) file = asset.id + '-' + base
    await fs.copyFile(asset.path, path.join(assetsDir, file))
    assets.push({ id: asset.id, name: asset.name || base, kind: asset.kind, duration: asset.duration, hasAudio: !!asset.hasAudio, file: 'assets/' + file })
  }
  const workspace = { format: 'adudir-motion-project', specVersion: '2.0.0', project: { id: project.id, name: project.title }, ...project, assets }
  delete workspace.previewUrls
  delete workspace.renders
  await writeJson(path.join(folder, 'motion.json'), workspace)
  await writeText(path.join(folder, 'composition.html'), buildComposition(project, assets))
  await writeText(path.join(folder, 'SKILL.md'), skillText(project))
  await writeText(path.join(folder, 'README.md'), `# ${project.title}\n\n开放工程文件夹。用 \`tools/motion-mep.mjs\` 执行 MEP 工单；\`motion.json\` 可直接编辑。\n`)
  await writeJson(path.join(folder, 'orders', 'example.json'), exampleOrder)
  await fs.rm(path.join(folder, 'tools'), { recursive: true, force: true })
  await fs.mkdir(path.join(folder, 'tools'), { recursive: true })
  await fs.copyFile(path.join(root, '../media_desk/src/motion-mep.js'), path.join(folder, 'tools', 'mep-core.mjs'))
  await fs.copyFile(path.join(root, 'motion-mep.mjs'), path.join(folder, 'tools', 'motion-mep.mjs'))
  return { folder, assets: assets.length, clips: (project.clips || []).length }
}

const project = await loadProject()
const result = await exportWorkspace(project)
console.log('已导出开放工程：')
console.log('  文件夹：' + result.folder)
console.log('  片段：' + result.clips + ' · 素材：' + result.assets)
console.log('\n下一步：')
console.log('  cd "' + result.folder + '"')
console.log('  node tools/motion-mep.mjs show .')
console.log('  node tools/motion-mep.mjs apply . orders/example.json')
