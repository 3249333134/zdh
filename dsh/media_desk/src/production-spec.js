export const DEFAULT_SPEC = { durationSec: 60, shotCount: 6, imageCount: 2, coverEnabled: true, shotImages: true }

/**
 * 每个镜头可以用四种来源完成；准备清单和完成标准跟着来源走，
 * 不把「AI 生成一张参考图」当成实拍完成，也不把实拍当成分镜图。
 */
export const SHOT_SOURCES = {
  shoot: {
    label: '实拍',
    prep: ['确认机位、光线与道具', '按分镜顺序排好当天拍摄清单', '准备收音设备与台词提示'],
    accept: '按分镜顺序拍到可用画面，每个镜头至少一条能用的素材，并已绑定本地视频文件',
  },
  screen: {
    label: '录屏',
    prep: ['清理桌面、通知与个人信息', '按脚本先演练一遍操作', '录屏分辨率与成片画幅一致'],
    accept: '录屏文件可读取、画面无遮挡，操作步骤与脚本一致并已绑定',
  },
  local: {
    label: '本地素材',
    prep: ['按镜头内容筛选已有素材', '核对素材授权与清晰度', '统一分辨率、画幅与帧率'],
    accept: '素材已导入本地素材索引并绑定到该镜头，文件可读取且未失效',
  },
  ai: {
    label: 'AI 生成',
    prep: ['确认该镜头允许 AI 生成', '准备画面提示词与角色一致性参考', '核对本次要消耗的图片数量'],
    accept: '分镜参考图实际生成并保存成功；只有文字描述不算交付',
  },
}

export const DEFAULT_SHOT_SOURCE = 'shoot'

export function normalizeShotSources(count, value, fallback = DEFAULT_SHOT_SOURCE) {
  const rows = Array.isArray(value) ? value : []
  return Array.from({ length: Math.max(0, count) }, (_, index) => (rows[index] in SHOT_SOURCES ? rows[index] : fallback))
}

export function shotChecklist(sources = []) {
  return sources.map((source, index) => {
    const row = SHOT_SOURCES[source] || SHOT_SOURCES[DEFAULT_SHOT_SOURCE]
    return { index: index + 1, source: source in SHOT_SOURCES ? source : DEFAULT_SHOT_SOURCE, label: row.label, prep: row.prep, accept: row.accept }
  })
}

export function shotSourceSummary(sources = []) {
  return Object.entries(SHOT_SOURCES)
    .map(([id, row]) => ({ id, label: row.label, count: sources.filter(value => value === id).length }))
    .filter(row => row.count > 0)
}

export function productionSpec(value = {}, defaults = DEFAULT_SPEC) {
  const spec = { ...DEFAULT_SPEC, ...defaults, ...value }
  for (const [key, low, high] of [['durationSec', 10, 1800], ['shotCount', 1, 120], ['imageCount', 0, 20]]) {
    if (!Number.isInteger(Number(spec[key])) || spec[key] < low || spec[key] > high) throw new Error(`${key} 超出范围（${low}–${high}）`)
    spec[key] = Number(spec[key])
  }
  if (spec.shotCount > spec.durationSec) throw new Error('每个镜头至少安排 1 秒，请减少镜头或增加时长')
  spec.coverEnabled = spec.coverEnabled !== false
  spec.shotImages = spec.shotImages !== false
  // 镜头来源随镜头数对齐：改了镜头数不会留下多余或对不上的来源
  spec.shotSources = normalizeShotSources(spec.shotCount, spec.shotSources, spec.shotImages ? 'ai' : 'shoot')
  return spec
}

export function imageTotal(spec) { return (spec.coverEnabled ? 1 : 0) + spec.imageCount + (spec.shotImages ? spec.shotCount : 0) }

export function allocateShotTimes(shots, total) {
  if (!shots.length) return shots
  const remaining = total - shots.length
  const weights = shots.map(shot => Math.max(1, Number(shot.seconds) || 5))
  const weight = weights.reduce((a, b) => a + b, 0)
  const seconds = weights.map(value => 1 + Math.floor(value / weight * remaining))
  for (let i = 0, left = total - seconds.reduce((a, b) => a + b, 0); left > 0; left--, i++) seconds[i % seconds.length]++
  return shots.map((shot, index) => ({ ...shot, seconds: seconds[index], source: shot.source || '实拍' }))
}
