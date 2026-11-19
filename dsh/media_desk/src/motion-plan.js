export function validateMotionPlan(plan, language = 'zh') {
  const requirements = { B1: ['keyword', 'explanation'], B2: ['heading', 'points'], B3: ['heading', 'left', 'right', 'conclusion'], B4: ['summary', 'action'] }
  const limits = { keyword: 8, explanation: 42, heading: 10, left: 8, right: 8, conclusion: 48, summary: 10, action: 42, label: 32 }
  const errors = []
  if (typeof plan?.title !== 'string' || !plan.title.trim() || plan.title.length > 45) errors.push('标题需要 1–45 个字符')
  if (!Array.isArray(plan?.scenes) || !plan.scenes.length || plan.scenes.length > 4) return [...errors, '请选择 1–4 个镜头']
  const basic = plan.basic || {}
  const seen = new Set()
  for (const scene of plan.scenes) {
    if (!requirements[scene.id] || seen.has(scene.id)) { errors.push('镜头类型无效或重复'); continue }
    seen.add(scene.id)
    if (typeof scene.title !== 'string' || !scene.title.trim() || scene.title.length > 45) errors.push('镜头标题需要 1–45 个字符')
    for (const key of requirements[scene.id]) {
      if (key === 'points') {
        if (!Array.isArray(basic.points) || basic.points.length < 1 || basic.points.length > 5 ||
          basic.points.some(value => typeof value !== 'string' || !value.trim() || value.split('\n').length > 2 || value.split('\n').some(line => line.length > (language === 'zh' ? 18 : 44)))) errors.push('要点需要 1–5 条，每行最多 ' + (language === 'zh' ? 18 : 44) + ' 个字符')
      } else if (typeof basic[key] !== 'string' || !basic[key].trim()) errors.push('镜头 ' + scene.id + ' 缺少 ' + key)
    }
  }
  for (const [key, value] of Object.entries(basic)) {
    if (key === 'points') continue
    if (!(key in limits)) { errors.push('未知内容字段 ' + key); continue }
    const limit = language === 'en' ? limits[key] * 3 + 12 : limits[key]
    if (typeof value !== 'string' || value.length > limit || value.split('\n').length > 2) errors.push(key + ' 最多 ' + limit + ' 个字符、两行')
  }
  return errors
}
