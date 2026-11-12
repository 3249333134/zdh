import test from 'node:test'
import assert from 'node:assert/strict'
import host, { serviceStatus } from '../src/host.js'
test('health failures remain explicit', async () => {
  assert.equal((await serviceStatus(async () => { throw Error('offline') })).ready, false)
  assert.equal((await serviceStatus(async () => ({ ok: false }))).ready, false)
  assert.equal((await serviceStatus(async () => ({ ok: true }))).ready, true)
})
test('DSH status route rejects unauthenticated requests before probing backend', async () => {
  let route
  const ctx = { effect: fn => fn(), webServer: { register: value => { route = value } }, get: () => ({ requestRejection: () => 403 }) }
  host.apply(ctx)
  const res = { setHeader() {}, end(value) { this.body = value } }
  await route.handler({ method: 'GET', url: '/erp-workbench/status', headers: {} }, res)
  assert.equal(res.statusCode, 403)
  assert.match(res.body, /未授权/)
})
test('missing authentication service fails closed', async () => {
  let route
  host.apply({ effect: fn => fn(), webServer: { register: value => { route = value } }, get: () => undefined })
  const res = { setHeader() {}, end() {} }
  await route.handler({ method: 'GET', url: '/erp-workbench/status', headers: {} }, res)
  assert.equal(res.statusCode, 403)
})
