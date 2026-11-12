import { test } from 'node:test'
import assert from 'node:assert/strict'
import { KnowledgeService, knowledgeSources } from '../src/knowledge.js'
const fixture = () => {
  const data = { items: [{ id: 'a', title: '拍摄', body: '柔光教程' }] }
  return { data, store: { read: async () => data, mutate: async (_, fn) => fn(data) } }
}
test('历史来源稳定，新增内容可见，凭据不采集', () => {
  const { data } = fixture(), first = knowledgeSources(data)
  data.items[0].body = '修改后的柔光教程'; data.apiKey = 'secret'
  const next = knowledgeSources(data)
  assert.equal(first[0].id, next[0].id); assert.notEqual(first[0].hash, next[0].hash)
  assert.ok(!JSON.stringify(next).includes('secret'))
})
test('整理草稿幂等且不改原文，来源变更禁止发布', async () => {
  const { data, store } = fixture(); let calls = 0
  const service = new KnowledgeService(store, async () => { calls++; return { text: '柔光方法 [item:a]', model: 'test' } })
  const page = await service.action('compile', { ids: ['item:a'] })
  await service.action('compile', { ids: ['item:a'] })
  assert.equal(calls, 1); assert.equal(page.status, 'draft'); assert.equal(data.items[0].body, '柔光教程')
  data.items[0].body = '来源发生变化'
  assert.equal((await service.read()).pages[0].stale, true)
  await assert.rejects(service.action('publish', { id: page.id, revision: 1 }), /来源已变化/)
})
test('审核发布和版本冲突检查', async () => {
  const { store } = fixture(), service = new KnowledgeService(store, async () => ({ text: '知识正文' }))
  const page = await service.action('compile', { ids: ['item:a'] })
  assert.equal((await service.action('publish', { id: page.id, revision: 1 })).status, 'published')
  await assert.rejects(service.action('edit', { id: page.id, revision: 1, text: '覆盖' }), /已变化/)
})

test('正式页修改保留旧版本，发布后引用版本变化可检查', async()=>{
 const {store}=fixture(),service=new KnowledgeService(store,async()=>({text:'知识正文'}))
 const draft=await service.action('compile',{ids:['item:a'],topic:'方法'}),formal=await service.action('publish',{id:draft.id,revision:1})
 const edited=await service.action('edit',{id:formal.id,revision:formal.revision,text:'新知识正文'})
 assert.notEqual(edited.id,formal.id)
 assert.equal((await service.read()).pages.find(p=>p.id===formal.id).body,'知识正文')
 const next=await service.action('publish',{id:edited.id,revision:edited.revision})
 assert.equal(next.id,formal.id);assert.equal(next.body,'新知识正文');assert.equal(next.history.length,1)
 assert.equal(next.history[0].body,'知识正文')
})
