import {test} from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {itemProposal,collectItemPlans} from '../src/item-plan.js'
import {normalizeTasks,validateGraph,WorkflowService} from '../src/workflow.js'
import { Store } from '../src/store.js'
const item=()=>({id:'demo',title:'旧选题',productionSpec:{durationSec:60,shotCount:2,imageCount:0,shotSources:['shoot','screen']},production:{status:'done',title:'成稿标题',article:'已完成的脚本',shots:[{title:'开场',description:'人物中景',seconds:30},{title:'演示',description:'屏幕演示',seconds:30}]}})
test('成稿生成逐镜制作草案，复用原文，不自动生成素材',()=>{const source=item(),before=JSON.stringify(source),plan=itemProposal(source);assert.equal(plan.sourceItemId,source.id);assert.equal(plan.status,'draft');assert.equal(plan.tasks.length,7);assert.ok(plan.tasks.find(t=>t.id==='shot1').description.includes('实拍'));assert.ok(plan.tasks.find(t=>t.id==='shot2').description.includes('录屏'));validateGraph(normalizeTasks(plan.tasks,'p'));assert.equal(JSON.stringify(source),before)})
test('历史成稿回填幂等，原稿修改生成新草案且不覆盖已确认项目',()=>{const state={items:[item()]};assert.equal(collectItemPlans(state),1);state.workflow.proposals[0].status='confirmed';state.workflow.proposals[0].projectId='existing';assert.equal(collectItemPlans(state),0);state.items[0].production.article='修改后的原稿';assert.equal(collectItemPlans(state),1);assert.equal(state.workflow.proposals[0].projectId,'existing');assert.equal(state.workflow.proposals.length,2)})
test('未成稿与任务生成的内容不循环拆解',()=>{assert.equal(itemProposal({...item(),workflowProjectId:'p'}),null);assert.equal(itemProposal({...item(),production:{status:'running'}}),null)})

test('实际成稿字段带入机位、画面、旁白；AI参考图后仍安排真实视频交付',()=>{
 const source=item();source.productionSpec.shotSources=['ai','screen'];source.production.shots[0]={shot:'特写',visual:'手机上的折线图',voice:'先看这四个数字',seconds:30,prompt:'近距离拍摄手机'}
 const plan=itemProposal(source),first=plan.tasks.find(t=>t.id==='shot1'),video=plan.tasks.find(t=>t.id==='shot1-video')
 assert.ok(first.description.includes('手机上的折线图'));assert.ok(first.description.includes('先看这四个数字'));assert.ok(first.title.includes('特写'))
 assert.equal(video.kind,'video');assert.deepEqual(video.dependencies,['shot1']);assert.ok(plan.tasks.find(t=>t.id==='edit').dependencies.includes(video.id));validateGraph(normalizeTasks(plan.tasks,'p'))
})

test('打包成稿可预览原发布时间，确认后任务与原稿相连，再打开复用计划', async t => {
 const root = await mkdtemp(join(tmpdir(), 'media-item-plan-'))
 t.after(() => rm(root, { recursive: true, force: true }))
 const store = new Store(root)
 const service = new WorkflowService(store, () => { throw new Error('打包不应调用模型') })
 const source = { ...item(), scheduledAt: new Date(Date.now() + 7 * 86400000).toISOString() }
 await store.mutate('', state => { state.items = [{ ...source, scheduledAt: '2020-01-01T00:00:00.000Z' }] })
 const draft = await service.action('item-plan', { itemId: source.id })
 const payload = { proposalId: draft.result.id, revision: draft.workflow.revision }
 assert.ok((await service.action('item-plan-preview', payload)).result.conflict)
 await assert.rejects(service.action('confirm', payload), /原发布时间/)
 assert.equal((await service.action('item-plan-preview', { ...payload, keepPublication: false })).result.conflict, null)
 await store.mutate('', state => { state.items[0].scheduledAt = source.scheduledAt })
 const preview = (await service.action('item-plan-preview', payload)).result
 assert.equal(preview.conflict, null)
 assert.equal(preview.tasks.find(task => task.id === 'publish').startAt, source.scheduledAt)
 assert.equal((await service.read()).tasks.length, 0)
 const { result, workflow } = await service.action('confirm', payload)
 assert.equal(workflow.tasks.length, 7)
 assert.ok(workflow.tasks.every(task => task.startAt && task.links.itemId === source.id))
 assert.equal(workflow.tasks.find(task => task.kind === 'publish').startAt, source.scheduledAt)
 await store.mutate('', state => { state.items[0].production.article = '之后修订的原稿' })
 const reopened = await service.action('item-plan', { itemId: source.id })
 assert.equal(reopened.result.projectId, result.projectId)
 assert.equal(reopened.workflow.proposals.length, 1)
 assert.equal(reopened.workflow.tasks.length, 7)
})
