import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { CrmStore } from '../src/crm-store.js'
import { LocalStore } from '../src/local-store.js'
async function fixture(t) {
  const base = fileURLToPath(new URL('../data/test/', import.meta.url)); await mkdir(base, { recursive: true })
  const root = await mkdtemp(join(base, 'crm-')); t.after(() => rm(root, { recursive: true, force: true }))
  return { store: new CrmStore(root), root }
}
test('CRM CRUD and relationships persist independently of project data', async t => {
  const { store, root } = await fixture(t), projectStore = new LocalStore(root), project = await projectStore.read()
  let data = await store.read(); assert.equal(data.companies.length, 3); assert.equal(data.opportunities.length, 5)
  const command = async (entity, action, value) => { data = await store.change({ entity, action, value, revision: data.revision }); return data[entity].at(-1) }
  const company = await command('companies', 'save', { ...data.companies[0], id: undefined, name: '验收客户' })
  const person = await command('contacts', 'save', { ...data.contacts[0], id: undefined, companyId: company.id })
  const deal = await command('opportunities', 'save', { ...data.opportunities[0], id: undefined, companyId: company.id, amount: '123.45' })
  await command('opportunities', 'save', { ...deal, stage: '赢单' })
  const activity = await command('activities', 'save', { ...data.activities[0], id: undefined, companyId: company.id, content: '确认验收要求' })
  await assert.rejects(command('companies', 'delete', { id: company.id }), { status: 400 })
  const reopened = new CrmStore(root); assert.deepEqual(await reopened.read(), data)
  for (const [entity, id] of [['contacts', person.id], ['opportunities', deal.id], ['activities', activity.id], ['companies', company.id]]) await command(entity, 'delete', { id })
  assert.equal(data.companies.length, 3); assert.deepEqual(await projectStore.read(), project)
})
test('CRM rejects invalid references, unsafe URLs, malformed dates, amounts and stale writes', async t => {
  const { store } = await fixture(t); const data = await store.read()
  for (const [entity, value] of [
    ['contacts', { ...data.contacts[0], companyId: 'missing' }],
    ['contacts', { ...data.contacts[0], email: 'bad' }],
    ['companies', { ...data.companies[0], website: 'javascript:alert(1)' }],
    ['opportunities', { ...data.opportunities[0], amount: '' }],
    ['opportunities', { ...data.opportunities[0], amount: -1 }],
    ['opportunities', { ...data.opportunities[0], amount: 1.001 }],
    ['opportunities', { ...data.opportunities[0], stage: 'wrong' }],
    ['activities', { ...data.activities[0], date: '2026-02-30' }],
  ]) await assert.rejects(store.change({ entity, action: 'save', value, revision: data.revision }), { status: 400 })
  assert.deepEqual(await store.read(), data)
  const value = { ...data.companies[0], name: '已更新' }
  await store.change({ entity: 'companies', action: 'save', value, revision: data.revision })
  await assert.rejects(store.change({ entity: 'companies', action: 'save', value, revision: data.revision }), { status: 409 })
  assert.equal(JSON.parse(await readFile(store.file, 'utf8')).companies[0].name, '已更新')
})
test('customer tasks and notes persist and protect linked companies', async t => {
  const { store, root } = await fixture(t); let data = await store.read()
  for (const entity of ['tasks', 'notes']) {
    const value = { companyId: data.companies[0].id, name: '本地关联验收', description: '客户要求与下一步', owner: '王晓明', status: '待办', dueDate: '2026-11-20' }
    data = await store.change({ action: 'save', entity, value, revision: data.revision })
    const record = data[entity].at(-1)
    assert.equal(record.companyId, data.companies[0].id)
    assert.deepEqual(await new CrmStore(root).read(), data)
    data = await store.change({ action: 'delete', entity, value: { id: record.id }, revision: data.revision })
    assert.equal(data[entity].length, 0)
  }
  await assert.rejects(store.change({ action: 'save', entity: 'tasks', revision: data.revision, value: { companyId: data.companies[0].id, name: 'bad', status: 'unknown' } }), { status: 400 })
})
