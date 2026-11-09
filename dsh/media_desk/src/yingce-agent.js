import { callModel, extractJson } from './ai.js'
import { newId } from './ops.js'

export const YINGCE_ACTIONS = ['list_projects', 'open_project', 'create_project', 'update_project', 'read_unit', 'create_unit', 'update_unit', 'list_canvases', 'open_canvas', 'create_canvas', 'rename_canvas', 'add_node', 'update_node', 'connect_nodes', 'undo_canvas']
export function validateYingceAction(value) {
  if (!value || !YINGCE_ACTIONS.includes(value.op)) throw new Error('不支持的影策操作')
  const result = { op: value.op }
  for (const key of ['id', 'nodeId', 'fromId', 'toId', 'unitId', 'name', 'title', 'text', 'description']) {
    if (value[key] !== undefined) {
      if (typeof value[key] !== 'string' || value[key].length > (['text', 'description'].includes(key) ? 12000 : 200)) throw new Error('影策操作参数无效')
      result[key] = value[key]
    }
  }
  return result
}

export async function yingceChat(ctx, store, body) {
  const state = await store.read()
  const context = body.pageContext
  if (!context || context.module !== 'yingce' || typeof context.path !== 'string' || JSON.stringify(context).length > 40000) throw new Error('影策上下文无效')
  let reply, actions = [], error = null
  try {
    const result = await callModel(ctx, {
      system: `你是自媒体工作台的同一个全局助手。当前正在影策。只返回JSON {"reply":"回答","actions":[{"op":"操作",...}]}。每次最多一个操作。允许操作：${YINGCE_ACTIONS.join(', ')}。参数只有id,nodeId,fromId,toId,unitId,name,title,text,description。项目用name/description，分集文字用unitId/title/text；文字节点用title/text。当前对象ID和选中节点见上下文。没有确定对象先列出或询问，不猜ID。不得生成图片视频、付费、删除、修改账号或设置。操作执行前不要声称已保存。纯分析返回actions:[]。`,
      user: JSON.stringify({ context, history: state.chat.filter(row => !row.itemId).slice(-12).map(row => ({ role: row.role, text: row.text })), message: String(body.message).slice(0, 12000) }),
      maxTokens: 4000, light: true, signal: AbortSignal.timeout(90000),
    })
    const plan = extractJson(result.text)
    reply = String(plan.reply || '正在处理影策请求。').slice(0, 8000)
    if (plan.actions?.length > 1) throw new Error('请一次处理一个影策操作')
    actions = (plan.actions || []).map(validateYingceAction)
  } catch (failure) {
    reply = '影策请求未执行。请检查模型连接后重试。'
    error = String(failure.message).slice(0, 300)
  }
  const requestId = newId('yc')
  const result = await store.mutate('影策对话', draft => {
    draft.chat.push({ id: newId('c'), role: 'user', text: body.message, at: new Date().toISOString() })
    draft.chat.push({ id: requestId, role: 'assistant', text: actions.length ? '正在执行影策操作，等待保存结果…' : reply, pending: Boolean(actions.length), errors: error ? [error] : [], at: new Date().toISOString() })
    draft.chat = draft.chat.slice(-300)
    return { state: draft, actions: actions.map(action => ({ type: 'yingce', requestId, context, action })) }
  }, { undoable: false })
  return result
}
