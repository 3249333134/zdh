// 影策原生工作台：项目、分集、镜头、实体卡、素材索引和本地导出，全部由 DSH 插件直接渲染。
import React from 'react'
import { dispatchOps, downloadText, setDesk, useDesk } from './desk.js'
import { t, useLang } from './i18n.js'
import { Empty, Icon, IconButton } from './ui.jsx'
import {
  buildEditingPackage,
  defaultProductionSettings,
  editingPackageToSrt,
  YC_ASSET_ROLES,
} from '../src/yingce-production.js'

const PROJECT_STATUS = [
  { value: 'outline', label: '大纲' },
  { value: 'draft', label: '草稿' },
  { value: 'ready', label: '待拍' },
  { value: 'done', label: '完成' },
]
const ENTITY_KINDS = [
  { value: 'character', label: '角色' },
  { value: 'prop', label: '道具' },
  { value: 'scene', label: '场景' },
]
const ASSET_KINDS = [
  { value: 'reference', label: '参考' },
  { value: 'image', label: '图片' },
  { value: 'video', label: '视频' },
  { value: 'note', label: '笔记' },
]
const SHOT_STATUSES = [
  { value: 'idea', label: '想法' },
  { value: 'storyboard', label: '草分镜' },
  { value: 'shot', label: '制作版' },
  { value: 'approved', label: '已确认' },
]
const PACINGS = [
  { value: 'rapid', label: '极快' },
  { value: 'fast', label: '快节奏' },
  { value: 'standard', label: '标准' },
  { value: 'relaxed', label: '舒缓' },
  { value: 'slow', label: '慢节奏' },
]
const DIALOGUE_MODES = [
  { value: 'dense', label: '对白密集' },
  { value: 'standard', label: '标准对白' },
  { value: 'sparse', label: '对白克制' },
  { value: 'custom', label: '自定义' },
]
const SEGMENT_MODES = [
  { value: 'auto', label: '自动节拍' },
  { value: 'fixed', label: '固定段长' },
  { value: 'range', label: '范围段长' },
]
const TRANSITIONS = [
  { value: 'auto', label: '自动选择' },
  { value: 'cut', label: '硬切' },
  { value: 'fadeblack', label: '黑场' },
  { value: 'fadewhite', label: '闪白' },
]
const SEGMENT_STATUSES = [
  { value: 'draft', label: '草稿' },
  { value: 'ready', label: '可制作' },
  { value: 'approved', label: '已确认' },
  { value: 'failed', label: '需重做' },
]
const VIDEO_STATUSES = [
  { value: 'draft', label: '草稿' },
  { value: 'queued', label: '待生成' },
  { value: 'running', label: '生成中' },
  { value: 'ready', label: '完成' },
  { value: 'failed', label: '失败' },
  { value: 'skipped', label: '跳过' },
]
const ASSET_ROLES = [
  { value: 'clip', label: '成片镜头' },
  { value: 'reference', label: '参考图' },
  { value: 'audio', label: '音频' },
  { value: 'caption', label: '字幕' },
  { value: 'note', label: '备注' },
]
const COMPOSER_MODES = [
  { value: 'video', label: '视频分镜' },
  { value: 'image', label: '画面参考' },
  { value: 'text', label: '剧本对白' },
  { value: 'structure', label: '结构梳理' },
]

function option(label, value) {
  return { value, label: t(label) }
}

function listValue(text) {
  return String(text ?? '').split(/[、,，\n]/).map(v => v.trim()).filter(Boolean).slice(0, 24)
}

function numValue(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function segmentStatusLabel(value) {
  return t(SEGMENT_STATUSES.find(row => row.value === value)?.label ?? value ?? '草稿')
}

function statusLabel(value) {
  return t(PROJECT_STATUS.find(row => row.value === value)?.label ?? value ?? '大纲')
}

function openProject(project) {
  setDesk({
    dialog: {
      title: project ? t('编辑短剧项目') : t('新建短剧项目'),
      initial: project ? { ...project, traits: undefined } : { status: 'outline', kind: 'short_drama' },
      fields: [
        { name: 'title', label: t('项目标题'), required: true },
        { name: 'kind', label: t('类型'), hint: t('如：竖屏短剧、剧情短片、广告短片') },
        { name: 'status', label: t('状态'), type: 'select', options: PROJECT_STATUS.map(row => option(row.label, row.value)) },
        { name: 'targetPlatform', label: t('目标平台') },
        { name: 'logline', label: t('一句话故事'), type: 'textarea', rows: 2 },
        { name: 'premise', label: t('前提设定'), type: 'textarea', rows: 3 },
        { name: 'synopsis', label: t('剧情梗概'), type: 'textarea', rows: 4 },
      ],
      onSubmit: values => dispatchOps([{
        op: project ? 'update_yingce_project' : 'add_yingce_project',
        id: project?.id,
        title: values.title, kind: values.kind, status: values.status, targetPlatform: values.targetPlatform,
        logline: values.logline, premise: values.premise, synopsis: values.synopsis,
      }], { label: project ? t('更新短剧项目') : t('新建短剧项目') }),
      onDelete: project ? () => dispatchOps([{ op: 'delete_yingce_project', id: project.id }], { label: t('删除短剧项目') }) : undefined,
    },
  })
}

function openProduction(project) {
  setDesk({
    dialog: {
      title: t('剪辑节奏与剧情段参数'),
      initial: { ...defaultProductionSettings(), ...(project.productionSettings ?? {}) },
      fields: [
        { name: 'segmentMode', label: t('剧情段模式'), type: 'select', options: SEGMENT_MODES.map(row => option(row.label, row.value)) },
        { name: 'segmentSeconds', label: t('固定段长（秒）'), type: 'number', hint: t('fixed 模式使用，建议 4–60 秒') },
        { name: 'segmentMinSeconds', label: t('段长下限（秒）'), type: 'number' },
        { name: 'segmentMaxSeconds', label: t('段长上限（秒）'), type: 'number' },
        { name: 'pacing', label: t('镜头节奏'), type: 'select', options: PACINGS.map(row => option(row.label, row.value)) },
        { name: 'dialogue', label: t('对白密度'), type: 'select', options: DIALOGUE_MODES.map(row => option(row.label, row.value)) },
        { name: 'speechRate', label: t('语速（字 / 秒）'), type: 'number', hint: t('仅自定义对白密度时生效') },
        { name: 'lineSeconds', label: t('台词间隔（秒）'), type: 'number' },
        { name: 'lineMaxRunes', label: t('单句字数上限'), type: 'number' },
        { name: 'linePauseMs', label: t('句末气口（毫秒）'), type: 'number' },
        { name: 'transition', label: t('转场'), type: 'select', options: TRANSITIONS.map(row => option(row.label, row.value)) },
        { name: 'transitionMs', label: t('转场时长（毫秒）'), type: 'number' },
        { name: 'performance', label: t('表演强度 1–10'), type: 'number' },
        { name: 'cameraMotion', label: t('运镜动感 1–10'), type: 'number' },
        { name: 'aspectRatio', label: t('画幅'), hint: t('如 9:16 / 16:9') },
        { name: 'fps', label: t('帧率'), type: 'number' },
      ],
      onSubmit: values => dispatchOps([{
        op: 'update_yingce_production',
        projectId: project.id,
        segmentMode: values.segmentMode,
        segmentSeconds: numValue(values.segmentSeconds, 10),
        segmentMinSeconds: numValue(values.segmentMinSeconds, 8),
        segmentMaxSeconds: numValue(values.segmentMaxSeconds, 15),
        pacing: values.pacing,
        dialogue: values.dialogue,
        speechRate: numValue(values.speechRate, 4.5),
        lineSeconds: numValue(values.lineSeconds, 4.5),
        lineMaxRunes: numValue(values.lineMaxRunes, 16),
        linePauseMs: numValue(values.linePauseMs, 500),
        transition: values.transition,
        transitionMs: numValue(values.transitionMs, 150),
        performance: numValue(values.performance, 5),
        cameraMotion: numValue(values.cameraMotion, 5),
        aspectRatio: values.aspectRatio,
        fps: numValue(values.fps, 30),
      }], { label: t('保存剪辑节奏参数') }),
    },
  })
}

function openEpisode(project, episode) {
  setDesk({
    dialog: {
      title: episode ? t('编辑分集') : t('新建分集'),
      initial: episode ?? { status: 'outline', number: (project.episodes?.length ?? 0) + 1 },
      fields: [
        { name: 'number', label: t('集数'), type: 'number' },
        { name: 'title', label: t('分集标题'), required: true },
        { name: 'status', label: t('状态'), type: 'select', options: PROJECT_STATUS.map(row => option(row.label, row.value)) },
        { name: 'logline', label: t('本集梗概'), type: 'textarea', rows: 2 },
        { name: 'conflict', label: t('核心冲突'), type: 'textarea', rows: 2 },
        { name: 'cliffhanger', label: t('结尾钩子'), type: 'textarea', rows: 2 },
      ],
      onSubmit: values => dispatchOps([{
        op: episode ? 'update_yingce_episode' : 'add_yingce_episode',
        id: episode?.id, projectId: project.id,
        number: Number(values.number) || undefined, title: values.title, status: values.status,
        logline: values.logline, conflict: values.conflict, cliffhanger: values.cliffhanger,
      }], { label: episode ? t('更新分集') : t('新建分集') }),
      onDelete: episode ? () => dispatchOps([{ op: 'delete_yingce_episode', id: episode.id, projectId: project.id }], { label: t('删除分集') }) : undefined,
    },
  })
}

function openSegment(project, episode, segment) {
  setDesk({
    dialog: {
      title: t('编辑剧情段'),
      initial: segment ?? { status: 'draft', videoStatus: 'draft' },
      fields: [
        { name: 'title', label: t('剧情段标题') },
        { name: 'status', label: t('剧情段状态'), type: 'select', options: SEGMENT_STATUSES.map(row => option(row.label, row.value)) },
        { name: 'videoStatus', label: t('视频草稿状态'), type: 'select', options: VIDEO_STATUSES.map(row => option(row.label, row.value)) },
        { name: 'videoPrompt', label: t('段视频提示词草稿'), type: 'textarea', rows: 5 },
        { name: 'videoPromptOverride', label: t('手工覆盖提示词'), type: 'textarea', rows: 3 },
        { name: 'note', label: t('剪辑备注'), type: 'textarea', rows: 2 },
      ],
      onSubmit: values => dispatchOps([{
        op: 'update_yingce_segment',
        projectId: project.id,
        episodeId: episode.id,
        id: segment?.id,
        title: values.title,
        status: values.status,
        videoStatus: values.videoStatus,
        videoPrompt: values.videoPrompt,
        videoPromptOverride: values.videoPromptOverride,
        note: values.note,
      }], { label: t('更新剧情段') }),
    },
  })
}

function openShot(project, episode, shot) {
  setDesk({
    dialog: {
      title: shot ? t('编辑镜头') : t('新建镜头'),
      initial: shot ?? { status: 'idea', number: (episode.shots?.length ?? 0) + 1, size: '中景', movement: '固定', durationSec: 3 },
      fields: [
        { name: 'number', label: t('镜号'), type: 'number' },
        { name: 'size', label: t('景别'), hint: t('远景 / 全景 / 中景 / 近景 / 特写') },
        { name: 'movement', label: t('运镜'), hint: t('固定 / 推 / 拉 / 摇 / 跟') },
        { name: 'status', label: t('镜头状态'), type: 'select', options: SHOT_STATUSES.map(row => option(row.label, row.value)) },
        { name: 'scene', label: t('场景') },
        { name: 'speaker', label: t('说话人') },
        { name: 'visual', label: t('画面内容'), type: 'textarea', rows: 3 },
        { name: 'action', label: t('动作 / 表演'), type: 'textarea', rows: 2 },
        { name: 'dialogue', label: t('对白 / 旁白'), type: 'textarea', rows: 2 },
        { name: 'audio', label: t('声音 / 音乐提示'), type: 'textarea', rows: 2 },
        { name: 'transition', label: t('进入转场'), type: 'select', options: TRANSITIONS.map(row => option(row.label, row.value)) },
        { name: 'durationSec', label: t('时长（秒）'), type: 'number' },
        { name: 'prompt', label: t('画面提示词'), type: 'textarea', rows: 3 },
        { name: 'videoPrompt', label: t('视频提示词'), type: 'textarea', rows: 3 },
        { name: 'sourceQuote', label: t('原文引用') },
      ],
      onSubmit: values => dispatchOps([{
        op: shot ? 'update_yingce_shot' : 'add_yingce_shot',
        id: shot?.id, projectId: project.id, episodeId: episode.id,
        number: Number(values.number) || undefined, size: values.size, movement: values.movement, status: values.status,
        scene: values.scene, speaker: values.speaker, visual: values.visual, action: values.action,
        dialogue: values.dialogue, audio: values.audio, transition: values.transition,
        durationSec: Number(values.durationSec) || undefined, prompt: values.prompt,
        videoPrompt: values.videoPrompt, sourceQuote: values.sourceQuote,
      }], { label: shot ? t('更新镜头') : t('新建镜头') }),
      onDelete: shot ? () => dispatchOps([{ op: 'delete_yingce_shot', id: shot.id, projectId: project.id, episodeId: episode.id }], { label: t('删除镜头') }) : undefined,
    },
  })
}

function openEntity(entity) {
  setDesk({
    dialog: {
      title: entity ? t('编辑实体卡') : t('新建实体卡'),
      initial: entity ? { ...entity, traits: (entity.traits ?? []).join('、') } : { kind: 'character' },
      fields: [
        { name: 'kind', label: t('类型'), type: 'select', options: ENTITY_KINDS.map(row => option(row.label, row.value)) },
        { name: 'name', label: t('名称'), required: true },
        { name: 'role', label: t('作用 / 关系') },
        { name: 'appearance', label: t('外观签名'), type: 'textarea', rows: 2 },
        { name: 'traits', label: t('特征'), hint: t('用顿号分隔') },
        { name: 'relationship', label: t('人物关系'), type: 'textarea', rows: 2 },
        { name: 'note', label: t('备注'), type: 'textarea', rows: 2 },
      ],
      onSubmit: values => dispatchOps([{
        op: entity ? 'update_yingce_entity' : 'add_yingce_entity', id: entity?.id,
        kind: values.kind, name: values.name, role: values.role, appearance: values.appearance,
        traits: listValue(values.traits), relationship: values.relationship, note: values.note,
      }], { label: entity ? t('更新实体卡') : t('新建实体卡') }),
      onDelete: entity ? () => dispatchOps([{ op: 'delete_yingce_entity', id: entity.id }], { label: t('删除实体卡') }) : undefined,
    },
  })
}

function openAsset(asset) {
  setDesk({
    dialog: {
      title: asset ? t('编辑素材索引') : t('登记素材'),
      initial: asset ? { ...asset, tags: (asset.tags ?? []).join('、') } : { kind: 'reference' },
      fields: [
        { name: 'kind', label: t('素材类型'), type: 'select', options: ASSET_KINDS.map(row => option(row.label, row.value)) },
        { name: 'role', label: t('剪辑用途'), type: 'select', options: ASSET_ROLES.map(row => option(row.label, row.value)) },
        { name: 'name', label: t('素材名称'), required: true },
        { name: 'sourcePath', label: t('来源路径 / 链接') },
        { name: 'durationSec', label: t('素材时长（秒）'), type: 'number' },
        { name: 'startSec', label: t('入点（秒）'), type: 'number' },
        { name: 'endSec', label: t('出点（秒）'), type: 'number' },
        { name: 'width', label: t('宽度'), type: 'number' },
        { name: 'height', label: t('高度'), type: 'number' },
        { name: 'tags', label: t('标签'), hint: t('用顿号分隔') },
        { name: 'note', label: t('备注'), type: 'textarea', rows: 2 },
      ],
      onSubmit: values => dispatchOps([{
        op: asset ? 'update_yingce_asset' : 'add_yingce_asset', id: asset?.id,
        kind: values.kind, role: values.role, name: values.name, sourcePath: values.sourcePath,
        durationSec: Number(values.durationSec) || undefined, startSec: Number(values.startSec) || undefined,
        endSec: Number(values.endSec) || undefined, width: Number(values.width) || undefined,
        height: Number(values.height) || undefined, tags: listValue(values.tags), note: values.note,
      }], { label: asset ? t('更新素材') : t('登记素材') }),
      onDelete: asset ? () => dispatchOps([{ op: 'delete_yingce_asset', id: asset.id }], { label: t('删除素材') }) : undefined,
    },
  })
}

function buildMarkdown(data) {
  const lines = ['# 影策短剧项目草稿', '', `> ${t('本地插件数据；保存项目、分集、镜头、实体卡和素材索引。')}`, '']
  for (const project of data.projects ?? []) {
    lines.push(`## ${project.title || t('未命名项目')}`, `- ${t('状态')}：${statusLabel(project.status)}`, `- ${t('一句话故事')}：${project.logline || '—'}`)
    if (project.premise) lines.push(`- ${t('前提设定')}：${project.premise}`)
    if (project.synopsis) lines.push(`- ${t('剧情梗概')}：${project.synopsis}`)
    if (project.productionSettings) {
      const prod = project.productionSettings
      lines.push(`- ${t('剪辑节奏')}：${prod.pacing} / ${prod.dialogue} / ${prod.segmentMode} / ${prod.aspectRatio} / 表演${prod.performance} / 运镜${prod.cameraMotion}`)
    }
    lines.push('')
    for (const episode of project.episodes ?? []) {
      lines.push(`### ${t('第 {n} 集', { n: episode.number })} ${episode.title || ''}`.trim())
      if (episode.logline) lines.push(`- ${t('梗概')}：${episode.logline}`)
      if (episode.conflict) lines.push(`- ${t('冲突')}：${episode.conflict}`)
      if (episode.cliffhanger) lines.push(`- ${t('钩子')}：${episode.cliffhanger}`)
      for (const segment of episode.segments ?? []) {
        lines.push(`- ${t('剧情段')} ${segment.index}：${segment.title || '—'}（${segment.durationSec}s / ${segment.shotNumbers?.length ?? 0} 镜 / ${segmentStatusLabel(segment.status)}）`)
        if (segment.note) lines.push(`  - ${t('备注')}：${segment.note}`)
      }
      for (const shot of episode.shots ?? []) {
        lines.push(`- ${t('镜 {n}', { n: shot.number })}（${shot.scene || shot.size || '—'} / ${shot.movement || '—'} / ${shot.durationSec || 0}s / ${shot.transition || 'cut'}）：${shot.visual || '—'}`)
        if (shot.speaker) lines.push(`  - ${t('说话人')}：${shot.speaker}`)
        if (shot.action) lines.push(`  - ${t('动作 / 表演')}：${shot.action}`)
        if (shot.dialogue) lines.push(`  - ${t('对白')}：${shot.dialogue}`)
        if (shot.audio) lines.push(`  - ${t('声音')}：${shot.audio}`)
        if (shot.videoPrompt) lines.push(`  - ${t('视频提示词')}：${shot.videoPrompt}`)
      }
      lines.push('')
    }
  }
  if ((data.entities ?? []).length) {
    lines.push('## ' + t('实体卡'))
    for (const entity of data.entities) lines.push(`- ${entity.name}（${entity.kind}）：${entity.role || ''} ${entity.appearance || ''}`)
    lines.push('')
  }
  return lines.join('\n')
}

function NativeMetric({ label, value, hint }) {
  return (
    <div className="md-metric">
      <dt>{label}</dt>
      <dd>{value}{hint ? <small>{hint}</small> : null}</dd>
    </div>
  )
}

export function DramaView() {
  useLang()
  const yc = useDesk(s => s.state.yingce ?? { projects: [], entities: [], assets: [] })
  const projects = yc.projects ?? []
  const [projectId, setProjectId] = React.useState(null)
  const [episodeId, setEpisodeId] = React.useState(null)
  const [prompt, setPrompt] = React.useState('')
  const [composerMode, setComposerMode] = React.useState('video')
  const project = projects.find(row => row.id === projectId) ?? projects[0]
  const episodes = project?.episodes ?? []
  const episode = episodes.find(row => row.id === episodeId) ?? episodes[0]

  React.useEffect(() => { if (project && projectId !== project.id) setProjectId(project.id) }, [project, projectId])
  React.useEffect(() => { if (episode && episodeId !== episode.id) setEpisodeId(episode.id) }, [episode, episodeId])

  const episodeCount = projects.reduce((sum, row) => sum + (row.episodes?.length ?? 0), 0)
  const shotCount = projects.reduce((sum, row) => sum + (row.episodes ?? []).reduce((inner, ep) => inner + (ep.shots?.length ?? 0), 0), 0)
  const exportMarkdown = () => downloadText(`yingce-projects-${new Date().toISOString().slice(0, 10)}.md`, buildMarkdown(yc))
  const exportJson = () => downloadText(`yingce-data-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(yc, null, 2), 'application/json')
  const safeName = value => String(value || 'yingce').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40) || 'yingce'
  const currentPackage = () => project && episode ? buildEditingPackage(project, episode, yc.assets ?? []) : null
  const exportEditManifest = () => {
    const pkg = currentPackage()
    if (!pkg) return
    downloadText(`${safeName(pkg.title)}-edit-manifest.json`, JSON.stringify(pkg, null, 2), 'application/json')
  }
  const exportSrt = () => {
    const pkg = currentPackage()
    if (!pkg) return
    downloadText(`${safeName(pkg.title)}-subtitles.srt`, editingPackageToSrt(pkg), 'application/x-subrip')
  }
  const planSegments = () => {
    if (!project || !episode) return
    dispatchOps([{ op: 'plan_yingce_segments', projectId: project.id, episodeId: episode.id }], { label: t('生成剧情段') })
  }
  const composerLabel = COMPOSER_MODES.find(row => row.value === composerMode)?.label ?? ''
  const saveNewDraft = () => {
    const text = prompt.trim()
    if (!text) return
    const title = text.split(/\n/)[0].replace(/[。！!？?]+$/, '').slice(0, 24) || t('未命名短剧草稿')
    dispatchOps([{
      op: 'add_yingce_project',
      title,
      status: 'draft',
      kind: 'short_drama',
      logline: text.slice(0, 120),
      premise: `【${composerLabel}】\n${text}`,
    }], { label: t('保存创作草稿') })
    setPrompt('')
  }
  const appendToProject = () => {
    const text = prompt.trim()
    if (!project || !text) return
    const nextPremise = [project.premise, `【${composerLabel}】${text}`].filter(Boolean).join('\n\n')
    dispatchOps([{ op: 'update_yingce_project', id: project.id, premise: nextPremise }], { label: t('补充创作想法') })
    setPrompt('')
  }

  return (
    <div className="md-board-page md-drama-page md-yc-native">
      <section className="md-tile md-i-hero md-yc-hero-native">
        <div className="md-hero-copy">
          <h1 className="md-i-line">{t('短剧项目直接在影策标签里完成，')}<br />{t('项目、分集、分镜、实体和素材逐层落库。')}</h1>
          <div className="md-hero-actions">
            <button type="button" className="md-pill is-primary" onClick={() => openProject(null)}><Icon name="plus" size={14} />{t('新建项目 / 画布草稿')}</button>
            <button type="button" className="md-pill" onClick={exportMarkdown}><Icon name="save" size={14} />{t('导出 Markdown')}</button>
            <button type="button" className="md-pill" onClick={exportJson}><Icon name="download" size={14} />{t('导出 JSON')}</button>
          </div>
        </div>
        <dl className="md-metrics md-yc-metrics">
          <NativeMetric label={t('项目')} value={projects.length} hint={t('个')} />
          <NativeMetric label={t('分集')} value={episodeCount} hint={t('集')} />
          <NativeMetric label={t('镜头')} value={shotCount} hint={t('镜')} />
          <NativeMetric label={t('实体 / 素材')} value={(yc.entities?.length ?? 0) + (yc.assets?.length ?? 0)} hint={t('项')} />
        </dl>
      </section>

      <section className="md-tile md-yc-composer">
        <header className="md-tile-head">
          <h2>{t('创作提示')}</h2>
          <span className="md-grow" />
          <span className="md-muted">{t('先存为本地草稿；模型密钥接入后再走生成链路')}</span>
        </header>
        <div className="md-yc-composer-body">
          <div className="md-seg md-yc-composer-modes" role="radiogroup" aria-label={t('创作类型')}>
            {COMPOSER_MODES.map(row => (
              <button key={row.value} type="button" role="radio" aria-checked={composerMode === row.value} className={composerMode === row.value ? 'is-on' : ''} onClick={() => setComposerMode(row.value)}>
                {t(row.label)}
              </button>
            ))}
          </div>
          <textarea
            className="md-yc-composer-input"
            rows={3}
            value={prompt}
            onChange={event => setPrompt(event.target.value)}
            placeholder={t('输入主角、冲突、场景、镜头目标或对白方向；这里会先保存成结构化草稿。')}
          />
          <div className="md-yc-composer-actions">
            <button type="button" className="md-pill is-primary" disabled={!prompt.trim()} onClick={saveNewDraft}>{t('存为新项目')}</button>
            <button type="button" className="md-pill" disabled={!project || !prompt.trim()} onClick={appendToProject}>{t('写入当前项目')}</button>
          </div>
        </div>
      </section>

      <section className="md-drama-layout md-yc-workspace">
        <aside className="md-drama-projects md-tile">
          <header className="md-tile-head"><h2>{t('项目 / 画布')}</h2><span className="md-tile-meta">{projects.length}</span></header>
          {projects.length ? projects.map(row => (
            <article key={row.id} className={`md-drama-project ${project?.id === row.id ? 'is-active' : ''}`} onClick={() => setProjectId(row.id)}>
              <header><strong>{row.title || t('未命名项目')}</strong><small>{statusLabel(row.status)}</small></header>
              <p>{row.logline || row.premise || t('还没有一句话故事。')}</p>
              <footer>
                <span>{t('{n} 集', { n: row.episodes?.length ?? 0 })} · {t('{n} 镜', { n: (row.episodes ?? []).reduce((sum, ep) => sum + (ep.shots?.length ?? 0), 0) })}</span>
                <IconButton icon="edit" label={t('编辑项目')} onClick={() => openProject(row)} />
              </footer>
            </article>
          )) : <Empty title={t('还没有项目')} hint={t('先新建项目，再补分集和镜头。')} action={<button type="button" className="md-pill is-primary" onClick={() => openProject(null)}>{t('新建项目')}</button>} />}
        </aside>

        <section className="md-drama-detail md-tile">
          {project ? (
            <>
              <header className="md-drama-detail-head">
                <div>
                  <h2>{project.title}</h2>
                  <p>{project.logline || project.premise || t('补充一句话故事，方便判断方向。')}</p>
                </div>
                <div className="md-drama-actions">
                  <button type="button" className="md-pill" onClick={() => openProduction(project)}>{t('剪辑节奏')}</button>
                  <button type="button" className="md-pill" onClick={() => openEpisode(project, null)}><Icon name="plus" size={13} />{t('新建分集')}</button>
                </div>
              </header>
              {project.premise ? <p className="md-drama-note"><b>{t('前提')}</b>：{project.premise}</p> : null}
              {project.synopsis ? <p className="md-drama-note"><b>{t('梗概')}</b>：{project.synopsis}</p> : null}
              {project.productionSettings ? (
                <p className="md-drama-note">
                  <b>{t('剪辑节奏')}</b>：{project.productionSettings.pacing} · {project.productionSettings.dialogue} · {project.productionSettings.segmentMode} · {project.productionSettings.aspectRatio} · 表演 {project.productionSettings.performance}/10 · 运镜 {project.productionSettings.cameraMotion}/10
                </p>
              ) : null}

              <div className="md-drama-episodes" role="tablist" aria-label={t('分集')}>
                {episodes.map(row => (
                  <button type="button" key={row.id} role="tab" aria-selected={episode?.id === row.id} className={episode?.id === row.id ? 'is-on' : ''} onClick={() => setEpisodeId(row.id)}>
                    {t('第 {n} 集', { n: row.number })} {row.title || ''}
                  </button>
                ))}
              </div>

              {episode ? (
                <div className="md-drama-episode">
                  <header className="md-drama-detail-head">
                    <div><h3>{episode.title || t('未命名分集')}</h3><p>{episode.conflict || episode.logline || t('补核心冲突和结尾钩子。')}</p></div>
                    <div className="md-drama-actions">
                      <IconButton icon="edit" label={t('编辑分集')} onClick={() => openEpisode(project, episode)} />
                      <button type="button" className="md-pill" onClick={planSegments}>{t('生成剧情段')}</button>
                      <button type="button" className="md-pill" onClick={exportEditManifest}>{t('导出剪辑清单')}</button>
                      <button type="button" className="md-pill" onClick={exportSrt}>{t('导出字幕 SRT')}</button>
                      <button type="button" className="md-pill" onClick={() => openShot(project, episode, null)}><Icon name="plus" size={13} />{t('加镜头')}</button>
                    </div>
                  </header>
                  {episode.cliffhanger ? <p className="md-drama-note"><b>{t('钩子')}</b>：{episode.cliffhanger}</p> : null}
                  <section className="md-segment-panel" aria-label={t('剧情段')}>
                    <header className="md-segment-head">
                      <h3>{t('剧情段')}</h3>
                      <span className="md-tile-meta">{(episode.segments ?? []).length}</span>
                    </header>
                    {(episode.segments ?? []).length ? (
                      <div className="md-segment-list">
                        {(episode.segments ?? []).map(segment => (
                          <article className="md-segment-card" key={segment.id}>
                            <header>
                              <strong>{t('段 {n}', { n: segment.index })} · {segment.title || '—'}</strong>
                              <span className={`md-yc-status-pill ${segment.status === 'approved' ? 'is-on' : ''}`}>{segmentStatusLabel(segment.status)}</span>
                            </header>
                            <p>{segment.durationSec}s · {segment.shotNumbers?.length ?? 0} {t('镜')} · {segment.videoStatus || 'draft'}</p>
                            {segment.videoPrompt || segment.videoPromptOverride ? <p className="md-segment-prompt">{segment.videoPromptOverride || segment.videoPrompt}</p> : null}
                            {segment.note ? <p className="md-segment-note">{segment.note}</p> : null}
                            <footer><IconButton icon="edit" label={t('编辑剧情段')} onClick={() => openSegment(project, episode, segment)} /></footer>
                          </article>
                        ))}
                      </div>
                    ) : <p className="md-muted">{t('先补镜头，再按本地节奏规则生成剧情段；这里不执行异步视频任务。')}</p>}
                  </section>
                  <div className="md-shot-table" role="table" aria-label={t('分镜表')}>
                    <div className="md-shot-row md-shot-head" role="row">
                      <span>{t('镜号')}</span><span>{t('景别')}</span><span>{t('画面')}</span><span>{t('对白')}</span><span>{t('时长')}</span><span />
                    </div>
                    {(episode.shots ?? []).map(shot => (
                      <div className="md-shot-row" role="row" key={shot.id}>
                        <span>{shot.number}</span>
                        <span>{shot.size}</span>
                        <span>{[shot.scene, shot.visual].filter(Boolean).join(' / ') || '—'}</span>
                        <span>{shot.speaker ? `${shot.speaker}：` : ''}{shot.dialogue || '—'}</span>
                        <span>{shot.durationSec || 0}s{shot.transition ? ` · ${shot.transition}` : ''}</span>
                        <span className="md-shot-actions"><IconButton icon="edit" label={t('编辑镜头')} onClick={() => openShot(project, episode, shot)} /></span>
                      </div>
                    ))}
                    {!(episode.shots ?? []).length ? <p className="md-muted">{t('还没有镜头；先写草分镜，再升级为制作版。')}</p> : null}
                  </div>
                </div>
              ) : <Empty title={t('还没有分集')} hint={t('为项目建立分集后，这里会出现分镜表。')} />}
            </>
          ) : <Empty title={t('选择或新建一个项目')} hint={t('原生面板只保存结构化草稿，后续可对接服务端项目和模型生成。')} />}
        </section>
      </section>

      <section className="md-drama-side-sections">
        <div className="md-tile">
          <header className="md-tile-head"><h2>{t('实体卡')}</h2><span className="md-grow" /><button type="button" className="md-pill is-small" onClick={() => openEntity(null)}>{t('新建')}</button></header>
          <div className="md-yc-entity-grid">
            {(yc.entities ?? []).map(entity => (
              <article className="md-yc-entity" key={entity.id}>
                <header><strong>{entity.name}</strong><small>{t(entity.kind === 'character' ? '角色' : entity.kind === 'prop' ? '道具' : '场景')}</small></header>
                <p>{entity.appearance || entity.role || '—'}</p>
                <footer><IconButton icon="edit" label={t('编辑实体卡')} onClick={() => openEntity(entity)} /></footer>
              </article>
            ))}
          </div>
        </div>
        <div className="md-tile">
          <header className="md-tile-head"><h2>{t('素材索引')}</h2><span className="md-grow" /><button type="button" className="md-pill is-small" onClick={() => openAsset(null)}>{t('登记')}</button></header>
          <ul className="md-yc-asset-list">
            {(yc.assets ?? []).map(asset => (
              <li key={asset.id}>
                <div><strong>{asset.name}</strong><small>{asset.role ? `${asset.role} · ` : ''}{asset.sourcePath || asset.note || '—'}{asset.durationSec ? ` · ${asset.durationSec}s` : ''}</small></div>
                <IconButton icon="edit" label={t('编辑素材')} onClick={() => openAsset(asset)} />
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}
