// P3 轻量短剧数据层：只保存本地 JSON 可承载的项目、分集、镜头、实体卡和素材索引。
// 不模拟无限画布、异步任务队列、数据库、权限或第三方模型渠道。

export const YINGCE_PROJECT_STATUSES = ['outline', 'draft', 'ready', 'done']
export const YINGCE_ENTITY_KINDS = ['character', 'prop', 'scene']
export const YINGCE_ASSET_KINDS = ['reference', 'image', 'video', 'note']
export const YINGCE_SHOT_STATUSES = ['idea', 'storyboard', 'shot', 'approved']

export function emptyYingceData() {
  return { projects: [], entities: [], assets: [] }
}

/** 把旧版本缺少的命名空间补齐，避免直接访问 undefined。 */
export function ensureYingceData(state) {
  if (!state.yingce || typeof state.yingce !== 'object') state.yingce = emptyYingceData()
  state.yingce.projects = Array.isArray(state.yingce.projects) ? state.yingce.projects : []
  state.yingce.entities = Array.isArray(state.yingce.entities) ? state.yingce.entities : []
  state.yingce.assets = Array.isArray(state.yingce.assets) ? state.yingce.assets : []
  for (const project of state.yingce.projects) {
    if (!Array.isArray(project.episodes)) project.episodes = []
    for (const episode of project.episodes) {
      if (!Array.isArray(episode.shots)) episode.shots = []
      if (!Array.isArray(episode.segments)) episode.segments = []
    }
  }
  return state.yingce
}
