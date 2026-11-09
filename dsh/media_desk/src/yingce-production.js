// 短视频制作与剪辑的本地确定性规则层。
// 适配自 open-ai-canvas 的 production / jianying 设计：这里只保留可在浏览器和 Node 共用的规划、切段、剪辑清单与 SRT 规则；
// 不做异步模型生成、视频转码、渲染成片，也不直接写入剪映私有草稿目录。

export const YC_SEGMENT_MODES = ['auto', 'fixed', 'range']
export const YC_PACING = ['rapid', 'fast', 'standard', 'relaxed', 'slow']
export const YC_DIALOGUE_MODES = ['dense', 'standard', 'sparse', 'custom']
export const YC_TRANSITIONS = ['auto', 'cut', 'fadeblack', 'fadewhite']
export const YC_SEGMENT_STATUSES = ['draft', 'ready', 'approved', 'failed']
export const YC_VIDEO_STATUSES = ['draft', 'queued', 'running', 'ready', 'failed', 'skipped']
export const YC_ASSET_ROLES = ['clip', 'reference', 'audio', 'caption', 'note']

const PACING_AVERAGE_SECONDS = { rapid: 2, fast: 2.5, standard: 3.5, relaxed: 4.5, slow: 5.5 }
const DIALOGUE_PRESETS = {
  dense: { speechRate: 4.5, lineSeconds: 3, lineMaxRunes: 12, pauseMs: 300 },
  standard: { speechRate: 4.5, lineSeconds: 4.5, lineMaxRunes: 16, pauseMs: 500 },
  sparse: { speechRate: 4.5, lineSeconds: 7, lineMaxRunes: 20, pauseMs: 500 },
}

function clamp(value, low, high, fallback = low) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(low, Math.min(high, n))
}

function pickEnum(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback
}

/** 默认制作参数：竖屏短剧单机草稿口径，不等于上游完整生产配置。 */
export function defaultProductionSettings() {
  return {
    segmentMode: 'auto',
    segmentSeconds: 10,
    segmentMinSeconds: 8,
    segmentMaxSeconds: 15,
    pacing: 'fast',
    dialogue: 'standard',
    speechRate: 4.5,
    lineSeconds: 4.5,
    lineMaxRunes: 16,
    linePauseMs: 500,
    transition: 'auto',
    transitionMs: 150,
    performance: 5,
    cameraMotion: 5,
    aspectRatio: '9:16',
    fps: 30,
  }
}

/** 归一化用户填写的节奏参数；非法值回落默认值，避免状态里出现越界配置。 */
export function normalizeProductionSettings(input = {}) {
  const base = defaultProductionSettings()
  const mode = pickEnum(input.segmentMode, YC_SEGMENT_MODES, base.segmentMode)
  const dialogue = pickEnum(input.dialogue, YC_DIALOGUE_MODES, base.dialogue)
  const preset = DIALOGUE_PRESETS[dialogue] ?? DIALOGUE_PRESETS.standard
  const custom = dialogue === 'custom'
  return {
    ...base,
    segmentMode: mode,
    segmentSeconds: clamp(input.segmentSeconds, 4, 60, base.segmentSeconds),
    segmentMinSeconds: clamp(input.segmentMinSeconds, 4, 60, base.segmentMinSeconds),
    segmentMaxSeconds: clamp(input.segmentMaxSeconds, 4, 60, base.segmentMaxSeconds),
    pacing: pickEnum(input.pacing, YC_PACING, base.pacing),
    dialogue,
    speechRate: custom ? clamp(input.speechRate, 2, 8, preset.speechRate) : preset.speechRate,
    lineSeconds: custom ? clamp(input.lineSeconds, 1.5, 20, preset.lineSeconds) : preset.lineSeconds,
    lineMaxRunes: Math.round(custom ? clamp(input.lineMaxRunes, 4, 40, preset.lineMaxRunes) : preset.lineMaxRunes),
    linePauseMs: Math.round(custom ? clamp(input.linePauseMs, 100, 2000, preset.pauseMs) : preset.pauseMs),
    transition: pickEnum(input.transition, YC_TRANSITIONS, base.transition),
    transitionMs: Math.round(clamp(input.transitionMs, 150, 1500, base.transitionMs)),
    performance: Math.round(clamp(input.performance, 1, 10, base.performance)),
    cameraMotion: Math.round(clamp(input.cameraMotion, 1, 10, base.cameraMotion)),
    aspectRatio: String(input.aspectRatio || base.aspectRatio).trim().slice(0, 12),
    fps: Math.round(clamp(input.fps, 12, 60, base.fps)),
  }
}

export function spokenSeconds(dialogue, settings) {
  const text = String(dialogue ?? '').trim()
  if (!text) return 0
  const s = normalizeProductionSettings(settings)
  return Math.round((Array.from(text).length / s.speechRate + s.linePauseMs / 1000) * 10) / 10
}

/** 估算单镜秒数：用户已填时长优先；无台词时取节奏均值，有台词时保证说完。 */
export function estimatedShotSeconds(shot = {}, settings = {}) {
  const s = normalizeProductionSettings(settings)
  const explicit = Number(shot.durationSec)
  if (Number.isFinite(explicit) && explicit > 0) return clamp(explicit, 1, 60)
  const spoken = spokenSeconds(shot.dialogue, s)
  const average = PACING_AVERAGE_SECONDS[s.pacing] ?? PACING_AVERAGE_SECONDS.fast
  if (spoken <= 0) return average
  return Math.max(average, spoken)
}

export function segmentLimits(settings = {}) {
  const s = normalizeProductionSettings(settings)
  if (s.segmentMode === 'fixed') {
    return { mode: 'fixed', minSec: s.segmentSeconds, maxSec: s.segmentSeconds }
  }
  if (s.segmentMode === 'range') {
    const min = Math.min(s.segmentMinSeconds, s.segmentMaxSeconds)
    return { mode: 'range', minSec: min, maxSec: Math.max(min, s.segmentMaxSeconds) }
  }
  return { mode: 'auto', minSec: 8, maxSec: 15 }
}

function normalizedName(value) {
  return String(value ?? '').toLowerCase().replace(/[\s\p{Punctuation}]/gu, '').trim()
}

function segmentTitle(scenes = []) {
  const seen = new Set()
  for (const scene of scenes) {
    const name = String(scene ?? '').trim()
    const key = normalizedName(name)
    if (!name || seen.has(key)) continue
    seen.add(key)
    if (seen.size <= 3) return name
  }
  return '剧情段'
}

/**
 * 把镜头顺序切成可交付给剪辑或视频模型的剧情段。
 * 本地版不读取模型时长档位；auto 使用 8–15 秒作为单机草稿默认约束。
 */
export function planEpisodeSegments(project = {}, episode = {}) {
  const settings = normalizeProductionSettings(project.productionSettings)
  const limits = segmentLimits(settings)
  const shots = [...(episode.shots ?? [])].sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
  if (!shots.length) return []

  const durations = shots.map(shot => estimatedShotSeconds(shot, settings))
  let raw = []
  let start = 0
  let total = 0
  for (let index = 0; index < shots.length; index += 1) {
    if (index > start) {
      const over = total + durations[index] > limits.maxSec
      const full = index - start >= 9
      const sceneBreak = settings.segmentMode !== 'fixed' &&
        normalizedName(shots[index].scene) !== normalizedName(shots[index - 1].scene) &&
        total >= limits.minSec
      if (over || full || sceneBreak) {
        raw.push([start, index])
        start = index
        total = 0
      }
    }
    total += durations[index]
  }
  raw.push([start, shots.length])

  const merged = []
  for (const [startIndex, endIndex] of raw) {
    const last = merged[merged.length - 1]
    const tooShort = endIndex - startIndex < 3 ||
      (last && endIndex - last[0] < 3) ||
      sliceSeconds(durations, startIndex, endIndex) < limits.minSec
    const fits = !last || (sliceSeconds(durations, last[0], endIndex) <= limits.maxSec && endIndex - last[0] <= 9)
    if (last && tooShort && fits) last[1] = endIndex
    else merged.push([startIndex, endIndex])
  }

  const existing = new Map((episode.segments ?? []).map(segment => [segment.id, segment]))
  return merged.map(([startIndex, endIndex], index) => {
    const shotSlice = shots.slice(startIndex, endIndex)
    const id = `seg_${index + 1}`
    const prior = existing.get(id)
    return {
      id,
      index: index + 1,
      title: prior?.title || segmentTitle(shotSlice.map(shot => shot.scene)),
      shotIds: shotSlice.map(shot => shot.id),
      shotNumbers: shotSlice.map(shot => shot.number),
      durationSec: Math.round(sliceSeconds(durations, startIndex, endIndex) * 10) / 10,
      status: prior?.status || 'draft',
      videoPrompt: prior?.videoPrompt || '',
      videoPromptOverride: prior?.videoPromptOverride || '',
      videoStatus: prior?.videoStatus || 'draft',
      note: prior?.note || '',
    }
  })
}

function sliceSeconds(durations, start, end) {
  return durations.slice(start, end).reduce((sum, value) => sum + value, 0)
}

/** 生成离线剪辑清单：镜头顺序、累计时间、对白字幕段、剧情段与素材引用；不复制二进制媒体。 */
export function buildEditingPackage(project = {}, episode = {}, assets = []) {
  const settings = normalizeProductionSettings(project.productionSettings)
  const shots = [...(episode.shots ?? [])].sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
  let cursorMs = 0
  const clips = shots.map(shot => {
    const durationSec = estimatedShotSeconds(shot, settings)
    const clip = {
      shotId: shot.id,
      number: shot.number,
      startMs: cursorMs,
      durationMs: Math.round(durationSec * 1000),
      scene: shot.scene || '',
      speaker: shot.speaker || '',
      visual: shot.visual || '',
      action: shot.action || '',
      dialogue: shot.dialogue || '',
      transition: shot.transition || 'cut',
      prompt: shot.videoPrompt || shot.prompt || '',
      assetId: shot.assetId || null,
    }
    cursorMs += clip.durationMs
    return clip
  })
  const captions = clips
    .filter(clip => String(clip.dialogue ?? '').trim())
    .map(clip => ({
      startMs: clip.startMs,
      durationMs: Math.max(clip.durationMs, 1200),
      speaker: clip.speaker || '',
      text: clip.speaker ? `${clip.speaker}：${clip.dialogue}` : clip.dialogue,
    }))
  return {
    kind: 'local-editing-package',
    version: 1,
    projectId: project.id || null,
    episodeId: episode.id || null,
    title: `${project.title || ''} ${episode.title || ''}`.trim(),
    settings,
    segments: episode.segments ?? [],
    clips,
    captions,
    references: assets.filter(asset => ['clip', 'reference', 'audio'].includes(asset.role)).map(asset => ({
      assetId: asset.id,
      role: asset.role,
      name: asset.name,
      sourcePath: asset.sourcePath || '',
      durationSec: asset.durationSec ?? null,
      startSec: asset.startSec ?? null,
      endSec: asset.endSec ?? null,
    })),
  }
}

export function srtTime(ms) {
  const total = Math.max(0, Math.round(ms))
  const hours = Math.floor(total / 3_600_000)
  const minutes = Math.floor((total % 3_600_000) / 60_000)
  const seconds = Math.floor((total % 60_000) / 1000)
  const millis = total % 1000
  return [hours, minutes, seconds].map(n => String(n).padStart(2, '0')).join(':') + `,${String(millis).padStart(3, '0')}`
}

export function editingPackageToSrt(pkg = {}) {
  return (pkg.captions ?? []).map((caption, index) => {
    const end = caption.startMs + caption.durationMs
    return `${index + 1}\n${srtTime(caption.startMs)} --> ${srtTime(end)}\n${caption.text}\n`
  }).join('\n')
}
