import { getDesk, setDesk } from './desk.js'

const text = value => typeof value === 'string' ? value.trim() : ''
const join = (...parts) => parts.map(text).filter(Boolean).join('\n\n')
const labeled = (label, value) => text(value) ? `${label}：${value.trim()}` : ''

export function sendToMotion({ item, task, workflow = getDesk().workflow || getDesk().state?.workflow }) {
  const project = task && workflow?.projects.find(row => row.id === task.projectId)
  const upstream = []
  if (task) {
    const byId = new Map((workflow?.tasks || []).map(row => [row.id, row]))
    const seen = new Set([task.id])
    const pending = [...task.dependencies]
    for (const id of pending) {
      if (seen.has(id)) continue
      seen.add(id)
      const row = byId.get(id)
      if (!row || row.projectId !== task.projectId) continue
      upstream.push(row)
      pending.push(...row.dependencies)
    }
  }
  const itemId = item?.id || task?.links?.itemId ||
    workflow?.proposals?.find(row => row.projectId === project?.id && project)?.sourceItemId ||
    upstream.find(row => row.links?.itemId)?.links.itemId
  item ||= getDesk().state?.items.find(row => row.id === itemId)
  const production = item?.production
  const shots = production?.shots || []
  const spec = task?.spec || production?.spec || item?.productionSpec
  const title = text(production?.title) || text(item?.title) || text(task?.title)
  const candidates = upstream.filter(row => row.kind === 'script' && !row.supersededBy && (!task?.video || !row.video || task.video === row.video))
  const scriptFromTasks = candidates.flatMap(row => {
    const latest = row.artifacts?.findLast(artifact => text(artifact.text))
    return latest ? [latest.text] : []
  }).join('\n\n')
  const script = text(production?.article) || text(item?.drafts?.script) ||
    text(item?.drafts?.article) || scriptFromTasks ||
    join(title, item?.body || task?.description) || text(project?.goal)
  const shotNotes = shots.map((shot, index) => {
    const details = [text(shot.shot), shot.seconds > 0 ? `${shot.seconds} 秒` : '', text(shot.visual), labeled('口播', shot.voice)].filter(Boolean)
    return details.length ? `${index + 1}. ${details.join(' · ')}` : ''
  }).filter(Boolean)
  const notes = join(
    labeled('选题', title),
    labeled('原文', item?.url),
    labeled('发布平台', item?.platform),
    labeled('所属项目', project?.title),
    labeled('剪辑要求', task?.description),
    labeled('交付物', task?.deliverable),
    labeled('完成标准', task?.acceptance),
    labeled('画幅', spec?.aspectRatio || spec?.ratio),
    spec?.durationSec > 0 ? `目标时长：${spec.durationSec} 秒` : '',
    shotNotes.length ? `分镜要求\n${shotNotes.join('\n')}` : '',
  )
  const source = task ? '内容事项' : getDesk().view === 'content' ? '内容' : '灵感'
  setDesk({
    view: 'autoclip', focusId: null, sheetOrigin: null, studioDock: false, chatQuote: null, activeTaskId: task?.id || null,
    workflowDialog: null, taskStripOpen: false,
    motionHandoff: { key: crypto.randomUUID(), itemId, source, title, script: script.slice(0, 8000), notes: notes.slice(0, 8000) },
  })
}
