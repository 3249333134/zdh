// 参考 ADu Director 1.3.18 的素材组织：文本模板、贴纸与本地音效。
const uid = () => crypto.randomUUID()
const clampStart = (project, start, duration) => Math.max(0, Math.min(start, Math.max(0, project.duration - duration)))

export const TEXT_PRESETS = [
  { id: 'title', name: '开场标题', hint: '大字标题，适合开场', build: p => ({ text: '在这里输入标题', x: p.width * .08, y: p.height * .34, width: p.width * .84, fontSize: Math.round(p.height * .075), fontWeight: 800, lineHeight: 1.25, color: '#ffffff', align: 'left', shadow: true, duration: 3 }) },
  { id: 'caption', name: '说明字幕', hint: '画面下方解说条', build: p => ({ text: '这里是一句说明字幕', x: p.width * .08, y: p.height * .78, width: p.width * .84, fontSize: Math.round(p.height * .042), fontWeight: 500, lineHeight: 1.35, color: '#ffffff', align: 'left', boxColor: 'rgba(8,13,21,.78)', boxPadding: Math.round(p.height * .018), duration: 4 }) },
  { id: 'nameplate', name: '人名条', hint: '姓名与身份', build: p => ({ text: '姓名 · 身份', x: p.width * .08, y: p.height * .7, width: p.width * .5, fontSize: Math.round(p.height * .038), fontWeight: 600, lineHeight: 1.3, color: '#ffffff', align: 'left', boxColor: '#0f766e', boxPadding: Math.round(p.height * .016), duration: 4 }) },
  { id: 'bigword', name: '大字报', hint: '强调一个关键词', build: p => ({ text: '重点', x: p.width * .08, y: p.height * .4, width: p.width * .84, fontSize: Math.round(p.height * .16), fontWeight: 900, lineHeight: 1.1, color: '#f6f3ea', align: 'left', shadow: true, duration: 2.5 }) },
  { id: 'endcard', name: '结尾卡', hint: '收尾与行动号召', build: p => ({ text: '关注我\n下期见', x: p.width * .5, y: p.height * .4, width: p.width * .8, fontSize: Math.round(p.height * .07), fontWeight: 700, lineHeight: 1.35, color: '#ffffff', align: 'center', shadow: true, duration: 3 }) },
]

export function makeTextClip(preset, project, start) {
  const spec = preset.build(project)
  const duration = Math.min(project.duration, Math.min(8, Math.max(1, spec.duration || 3)))
  return { id: uid(), type: 'text', title: preset.name, start: clampStart(project, start, duration), layer: 20, trackId: 'captions', ...spec, duration }
}

export const STICKERS = ['✨', '🔥', '💡', '📌', '✅', '🎯', '⚡', '🎬', '📣', '💬', '👉', '❤️', '😮', '😂', '👏', '🚀']

export function makeStickerClip(emoji, project, start) {
  const duration = Math.min(project.duration, 3)
  return {
    id: uid(), type: 'text', title: '贴纸 ' + emoji, text: emoji, start: clampStart(project, start, duration), duration,
    x: project.width * .62, y: project.height * .14, width: project.width * .3,
    fontSize: Math.round(project.height * .22), fontWeight: 400, lineHeight: 1.1, align: 'center',
    color: '#ffffff', shadow: true, layer: 40, trackId: 'overlay',
  }
}

export const SOUND_EFFECTS = [
  { id: 'whoosh', name: '转场呼啸', hint: '镜头切换' },
  { id: 'pop', name: '气泡弹出', hint: '文字入场' },
  { id: 'chime', name: '清脆铃音', hint: '提示与强调' },
  { id: 'click', name: '轻点', hint: '按钮与点击' },
  { id: 'glitch', name: '故障电流', hint: '科技感转场' },
  { id: 'boom', name: '低频轰鸣', hint: '重音与片头' },
  { id: 'sparkle', name: '闪亮星星', hint: '惊喜与高光' },
  { id: 'tapestop', name: '磁带停转', hint: '突然收尾' },
]

const RATE = 44100
function noise(context, seconds) {
  const buffer = context.createBuffer(1, Math.ceil(RATE * seconds), RATE)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return buffer
}
const envelope = (context, gain, at, peak, attack, decay) => {
  gain.gain.setValueAtTime(.0001, at)
  gain.gain.exponentialRampToValueAtTime(peak, at + attack)
  gain.gain.exponentialRampToValueAtTime(.0001, at + attack + decay)
  return gain
}
function tone(context, type, from, to, at, seconds, peak) {
  const osc = context.createOscillator(), gain = context.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(from, at)
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + seconds)
  envelope(context, gain, at, peak, Math.min(.02, seconds / 4), seconds)
  osc.connect(gain).connect(context.destination)
  osc.start(at)
  osc.stop(at + seconds + .05)
}
function filteredNoise(context, type, from, to, at, seconds, peak, q = 1) {
  const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain()
  source.buffer = noise(context, seconds + .1)
  filter.type = type
  filter.Q.value = q
  filter.frequency.setValueAtTime(from, at)
  if (to !== from) filter.frequency.exponentialRampToValueAtTime(Math.max(40, to), at + seconds)
  envelope(context, gain, at, peak, Math.min(.03, seconds / 3), seconds)
  source.connect(filter).connect(gain).connect(context.destination)
  source.start(at)
  source.stop(at + seconds + .05)
}

export async function synthesizeSound(id) {
  const context = new OfflineAudioContext(1, RATE * 2, RATE)
  const at = .01
  if (id === 'whoosh') filteredNoise(context, 'bandpass', 320, 5200, at, .75, .55, 1.4)
  else if (id === 'pop') tone(context, 'sine', 900, 180, at, .14, .8)
  else if (id === 'chime') {
    tone(context, 'sine', 880, 880, at, .5, .35)
    tone(context, 'sine', 1320, 1320, at + .02, .45, .22)
    tone(context, 'sine', 1760, 1760, at + .04, .4, .14)
  } else if (id === 'click') filteredNoise(context, 'highpass', 2200, 2200, at, .05, .5)
  else if (id === 'glitch') {
    for (let i = 0; i < 10; i++) tone(context, 'square', 220 + (i % 3) * 410, 160, at + i * .035, .03, .22)
  } else if (id === 'boom') {
    tone(context, 'sine', 110, 38, at, .8, .85)
    filteredNoise(context, 'lowpass', 420, 120, at, .5, .3)
  } else if (id === 'sparkle') {
    for (let i = 0; i < 6; i++) tone(context, 'sine', 1300 + i * 330, 1300 + i * 330, at + i * .07, .26, .16)
  } else if (id === 'tapestop') tone(context, 'sawtooth', 520, 30, at, .85, .45)
  else filteredNoise(context, 'bandpass', 800, 2400, at, .4, .4, 1)

  const buffer = await context.startRendering()
  return encodeWav(buffer)
}

function encodeWav(buffer) {
  const samples = buffer.getChannelData(0), size = samples.length
  const data = new DataView(new ArrayBuffer(44 + size * 2))
  const text = (offset, value) => { for (let i = 0; i < value.length; i++) data.setUint8(offset + i, value.charCodeAt(i)) }
  text(0, 'RIFF'); data.setUint32(4, 36 + size * 2, true); text(8, 'WAVE')
  text(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true)
  data.setUint32(24, buffer.sampleRate, true); data.setUint32(28, buffer.sampleRate * 2, true)
  data.setUint16(32, 2, true); data.setUint16(34, 16, true)
  text(36, 'data'); data.setUint32(40, size * 2, true)
  for (let i = 0; i < size; i++) {
    const value = Math.max(-1, Math.min(1, samples[i]))
    data.setInt16(44 + i * 2, value < 0 ? value * 0x8000 : value * 0x7fff, true)
  }
  return new Blob([data], { type: 'audio/wav' })
}

export const TRANSITIONS = [
  { id: '', name: '无' },
  { id: 'fade', name: '淡入' },
  { id: 'dissolve', name: '叠化' },
  { id: 'slide-left', name: '向左滑动' },
  { id: 'slide-right', name: '向右滑动' },
  { id: 'slide-up', name: '向上滑动' },
  { id: 'slide-down', name: '向下滑动' },
  { id: 'zoom-in', name: '推近' },
  { id: 'zoom-out', name: '拉远' },
  { id: 'wipe-left', name: '向左擦除' },
  { id: 'wipe-right', name: '向右擦除' },
  { id: 'wipe-up', name: '向上擦除' },
  { id: 'wipe-down', name: '向下擦除' },
  { id: 'flash', name: '闪白' },
  { id: 'shake', name: '抖动' },
  { id: 'glitch', name: '故障' },
]

export const TEXT_ANIMS = [
  { id: '', name: '无' },
  { id: 'fade', name: '淡入' },
  { id: 'rise', name: '上移' },
  { id: 'drop', name: '下移' },
  { id: 'left', name: '左移' },
  { id: 'right', name: '右移' },
  { id: 'pop', name: '弹出' },
  { id: 'zoom', name: '缩放' },
  { id: 'typewriter', name: '打字机' },
  { id: 'blur', name: '模糊显现' },
]

export const COLOR_STYLES = [
  { id: 'original', name: '原片', values: { brightness: 100, contrast: 100, saturation: 100, grayscale: 0, sepia: 0, hue: 0, vignette: 0 } },
  { id: 'cinematic', name: '电影感', values: { brightness: 96, contrast: 112, saturation: 102, sepia: 8, hue: -4, vignette: 34 } },
  { id: 'warm', name: '暖阳', values: { brightness: 106, contrast: 104, saturation: 110, sepia: 22, hue: 6, vignette: 16 } },
  { id: 'japanese', name: '日系清新', values: { brightness: 108, contrast: 92, saturation: 94, sepia: 6, hue: 0, vignette: 0 } },
  { id: 'cyber', name: '赛博科技', values: { brightness: 100, contrast: 116, saturation: 132, sepia: 0, hue: 14, vignette: 42 } },
  { id: 'mono', name: '黑白纪实', values: { brightness: 100, contrast: 112, saturation: 0, grayscale: 100, sepia: 0, hue: 0, vignette: 0 } },
  { id: 'noir', name: '高反差黑白', values: { brightness: 92, contrast: 146, saturation: 0, grayscale: 100, sepia: 0, hue: 0, vignette: 50 } },
  { id: 'vintage', name: '复古胶片', values: { brightness: 102, contrast: 104, saturation: 84, sepia: 38, hue: 0, vignette: 30 } },
  { id: 'faded', name: '褪色', values: { brightness: 108, contrast: 88, saturation: 70, sepia: 10, hue: 0, vignette: 8 } },
  { id: 'vivid', name: '鲜艳', values: { brightness: 104, contrast: 108, saturation: 132, sepia: 0, hue: 0, vignette: 0 } },
]

export const BLEND_MODES = [
  { id: 'normal', name: '正常' },
  { id: 'multiply', name: '正片叠底' },
  { id: 'screen', name: '滤色' },
  { id: 'overlay', name: '叠加' },
  { id: 'lighten', name: '变亮' },
  { id: 'darken', name: '变暗' },
  { id: 'difference', name: '差值' },
  { id: 'soft-light', name: '柔光' },
]

export const TRANSITION_IDS = new Set(TRANSITIONS.map(row => row.id).filter(Boolean))
export const TEXT_ANIM_IDS = new Set(TEXT_ANIMS.map(row => row.id).filter(Boolean))
export const BLEND_IDS = new Set(BLEND_MODES.map(row => row.id))

export async function synthesizeMusic(seconds = 24) {
  const context = new OfflineAudioContext(1, RATE * seconds, RATE)
  const chords = [
    [261.63, 329.63, 392.0],
    [220.0, 261.63, 329.63],
    [174.61, 220.0, 261.63],
    [196.0, 246.94, 293.66],
  ]
  const bar = seconds / chords.length
  chords.forEach((notes, index) => {
    notes.forEach(freq => {
      const osc = context.createOscillator(), gain = context.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const at = index * bar
      gain.gain.setValueAtTime(0, at)
      gain.gain.linearRampToValueAtTime(.06, at + bar * .3)
      gain.gain.linearRampToValueAtTime(.04, at + bar * .7)
      gain.gain.linearRampToValueAtTime(0, at + bar)
      osc.connect(gain).connect(context.destination)
      osc.start(at)
      osc.stop(at + bar + .02)
    })
    const pulse = context.createOscillator(), pulseGain = context.createGain()
    pulse.type = 'triangle'
    pulse.frequency.value = 130.81
    const at = index * bar
    pulseGain.gain.setValueAtTime(.0001, at)
    pulseGain.gain.exponentialRampToValueAtTime(.09, at + .04)
    pulseGain.gain.exponentialRampToValueAtTime(.0001, at + .35)
    pulse.connect(pulseGain).connect(context.destination)
    pulse.start(at)
    pulse.stop(at + .4)
  })
  return encodeWav(await context.startRendering())
}
