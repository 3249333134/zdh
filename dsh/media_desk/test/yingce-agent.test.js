import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateYingceAction } from '../src/yingce-agent.js'
test('影策助手只允许受控草稿操作，不接受生成、删除或任意字段', () => {
  assert.throws(() => validateYingceAction({ op: 'generate_video' }))
  assert.throws(() => validateYingceAction({ op: 'delete_project' }))
  assert.throws(() => validateYingceAction({ op: 'update_node', text: 'x'.repeat(12001) }))
  assert.deepEqual(validateYingceAction({ op: 'update_node', nodeId: 'n', text: '草稿', url: 'http://example.com', apiKey: 'secret' }), { op: 'update_node', nodeId: 'n', text: '草稿' })
})
