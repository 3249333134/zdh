#!/usr/bin/env node
// MEP 工单本地执行器：node motion-mep.mjs apply <工程文件夹> <工单.json|-> [--dry-run]
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = path.dirname(fileURLToPath(import.meta.url))
const core = await import(pathToFileURL(path.join(here, 'mep-core.mjs')).href).catch(() => import('../media_desk/src/motion-mep.js'))
const { applyOrder, validateOrder } = core

const [command, folder, orderFile, ...rest] = process.argv.slice(2)
const dryRun = rest.includes('--dry-run')

const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'))
const projectFile = dir => path.join(dir, 'motion.json')

function inspect(project) {
  const errors = []
  if (!project || typeof project !== 'object') return ['motion.json 不是对象']
  if (!Number.isFinite(project.duration) || project.duration <= 0) errors.push('duration 无效')
  if (!Array.isArray(project.clips)) errors.push('clips 必须是数组')
  if (!Array.isArray(project.assets)) errors.push('assets 必须是数组')
  for (const clip of project.clips || []) {
    if (!clip.id || typeof clip.id !== 'string') errors.push('片段缺少 id')
    if (!['video','image','text','audio','animation'].includes(clip.type)) errors.push(`片段 ${clip.id} 类型无效`)
    if (!Number.isFinite(clip.start) || clip.start < 0) errors.push(`片段 ${clip.id} 起点无效`)
    if (!Number.isFinite(clip.duration) || clip.duration <= 0) errors.push(`片段 ${clip.id} 时长无效`)
    if (clip.start + clip.duration > project.duration + .05) errors.push(`片段 ${clip.id} 超出工程时长`)
    if (['video','audio'].includes(clip.type) && !project.assets.some(asset => asset.id === clip.assetId)) errors.push(`片段 ${clip.id} 素材不存在`)
    if (clip.keyframes) for (const rows of Object.values(clip.keyframes)) for (const row of rows || []) if (row.t < 0 || row.t > clip.duration + .05) errors.push(`片段 ${clip.id} 关键帧超出时长`)
  }
  return errors
}

async function main() {
  if (!command || !['apply','validate','show'].includes(command)) {
    console.error('用法：node motion-mep.mjs apply <工程文件夹> <工单.json|-> [--dry-run] | validate <工程文件夹> | show <工程文件夹>')
    process.exit(2)
  }
  if (!folder) { console.error('缺少工程文件夹'); process.exit(2) }
  const dir = path.resolve(folder)
  const project = await readJson(projectFile(dir))
  if (command === 'show') {
    console.log(JSON.stringify({ title: project.title, width: project.width, height: project.height, fps: project.fps, duration: project.duration, clips: project.clips?.length, assets: project.assets?.length }, null, 2))
    return
  }
  if (command === 'validate') {
    const errors = inspect(project)
    if (errors.length) { console.error(errors.join('\n')); process.exit(1) }
    console.log('工程有效：' + project.clips.length + ' 个片段')
    return
  }
  const raw = orderFile === '-' ? await new Promise((resolve, reject) => { let text = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', chunk => text += chunk); process.stdin.on('end', () => resolve(text)); process.stdin.on('error', reject) }) : await fs.readFile(path.resolve(orderFile), 'utf8')
  const order = JSON.parse(raw)
  const orderErrors = validateOrder(order)
  if (orderErrors.length) { console.error(orderErrors.join('\n')); process.exit(1) }
  const result = applyOrder(project, order)
  const errors = inspect(result.project)
  if (errors.length) { console.error('工单执行后工程无效：\n' + errors.join('\n')); process.exit(1) }
  if (!dryRun) {
    const temp = projectFile(dir) + '.tmp'
    await fs.writeFile(temp, JSON.stringify(result.project, null, 2))
    await fs.rename(temp, projectFile(dir))
    const orders = path.join(dir, 'orders')
    await fs.mkdir(orders, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    await fs.writeFile(path.join(orders, 'applied-' + stamp + '.json'), JSON.stringify({ order, changes: result.changes, warnings: result.warnings, at: new Date().toISOString() }, null, 2))
  }
  console.log(JSON.stringify({ ok: true, dryRun, changes: result.changes, warnings: result.warnings, clips: result.project.clips.length, duration: result.project.duration }, null, 2))
}

main().catch(error => { console.error(error.message); process.exit(1) })
