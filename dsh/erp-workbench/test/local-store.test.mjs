import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LocalStore } from '../src/local-store.js'
async function fixture(t) {
  const base = new URL('../data/test/', import.meta.url)
  await mkdir(base, { recursive: true })
  const root = await mkdtemp(join(fileURLToPath(base), 'erp-local-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return new LocalStore(root)
}
test('sample data initializes once and edits survive restart', async t => {
  const store = await fixture(t)
  const initial = await store.read()
  assert.equal(initial.projects.length, 2)
  assert.equal(initial.tasks.length, 10)
  const added = await store.change({ action: 'save-task', revision: initial.revision, value: { ...initial.tasks[0], id: undefined, title: '本地验收任务', status: '待办' } })
  const task = added.tasks.at(-1)
  const updated = await store.change({ action: 'save-task', revision: added.revision, value: { ...task, status: '已完成', assigneeId: '', description: '真实本地修改' } })
  const reopened = new LocalStore(join(store.file, '..'))
  assert.deepEqual(await reopened.read(), updated)
  assert.equal(updated.tasks.at(-1).status, '已完成')
  const deleted = await reopened.change({ action: 'delete-task', revision: updated.revision, value: { id: task.id } })
  assert.equal(deleted.tasks.length, initial.tasks.length)
})
test('invalid dates and unknown project/member fail without changing disk', async t => {
  const store = await fixture(t), data = await store.read()
  for (const patch of [{ dueDate: '2026-02-30' }, { title: ' ' }, { status: 'bad' }, { projectId: 'missing' }, { assigneeId: 'missing' }]) {
    await assert.rejects(store.change({ action: 'save-task', revision: data.revision, value: { ...data.tasks[0], ...patch } }), { status: 400 })
  }
  assert.deepEqual(await store.read(), data)
})
test('concurrent stale writes are rejected instead of overwriting', async t => {
  const store = await fixture(t), data = await store.read()
  const results = await Promise.allSettled(['first', 'second'].map(name => store.change({ action: 'save-project', revision: data.revision, value: { name, description: '' } })))
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
  assert.equal(results.find(r => r.status === 'rejected').reason.status, 409)
  assert.equal((await store.read()).projects.length, 3)
})
test('corrupt existing data is never replaced with sample data', async t => {
  const store = await fixture(t)
  await writeFile(store.file, '{broken')
  await assert.rejects(store.read())
  assert.equal(await readFile(store.file, 'utf8'), '{broken')
})
test('planning details and local members persist with legacy edits', async t => {
  const store = await fixture(t); let data = await store.read()
  const original = data.tasks[0]
  data = await store.change({ action: 'save-task', revision: data.revision, value: { ...original, startDate: '2026-10-01', dueDate: '2026-11-10', labels: '采购，交付', subtasks: [{ title: '确认清单', done: true }], comments: ['已核对资料'] } })
  data = await store.change({ action: 'save-task', revision: data.revision, value: { ...original, title: '兼容旧数据编辑', dueDate: '2026-11-10' } })
  assert.equal(data.tasks[0].subtasks[0].done, true)
  assert.deepEqual(data.tasks[0].comments, ['已核对资料'])
  await assert.rejects(store.change({ action: 'save-task', revision: data.revision, value: { ...data.tasks[0], startDate: '2026-12-01' } }), { status: 400 })
  data = await store.change({ action: 'save-member', revision: data.revision, value: { name: '实施专员' } })
  assert.equal(data.members.at(-1).name, '实施专员')
  assert.deepEqual(await store.read(), data)
})
