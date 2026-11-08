const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { establishSession } = require('./local-session.cjs');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-auth-'));
  const identityFile = path.join(dir, 'identity.json');
  t.after(() => { if (fs.existsSync(identityFile)) fs.unlinkSync(identityFile); fs.rmdirSync(dir); });
  return identityFile;
}
const settings = firstUser => Response.json({ data: { firstUser } });
const session = () => Response.json({ data: { user: { id: 'owner-id' } } }, { headers: { 'set-cookie': 'open_ai_canvas_session=private-session; HttpOnly; Path=/' } });

test('desktop provisions once and reuses the same identity on restart', async t => {
  const identityFile = fixture(t);
  const calls = [];
  let firstUser = true;
  const fetchImpl = async (url, options) => {
    if (url.endsWith('/settings')) return settings(firstUser);
    calls.push({ url, identity: JSON.parse(options.body) });
    firstUser = false;
    return session();
  };
  const options = { baseURL: 'http://localhost', identityFile, fetchImpl };
  const initial = await establishSession(options);
  const restarted = await establishSession(options);
  assert.equal(initial.userId, restarted.userId);
  assert.ok(calls[0].url.endsWith('/register'));
  assert.ok(calls[1].url.endsWith('/login'));
  assert.equal(calls[0].identity.password, calls[1].identity.password);
  assert.ok(calls[0].identity.password.length >= 40);
  assert.equal(initial.value, 'private-session');
});

test('desktop never takes over an existing database without its identity', async t => {
  const identityFile = fixture(t);
  await assert.rejects(establishSession({ baseURL: 'http://localhost', identityFile, fetchImpl: async () => settings(false) }), /不能自动接管/);
  assert.equal(fs.existsSync(identityFile), false);
});

test('failed login and missing session cookie fail closed', async t => {
  const identityFile = fixture(t);
  fs.writeFileSync(identityFile, JSON.stringify({ username: 'owner', password: 'secret' }));
  for (const response of [new Response('', { status: 401 }), Response.json({ data: { user: { id: 'owner-id' } } })]) {
    await assert.rejects(establishSession({ baseURL: 'http://localhost', identityFile, fetchImpl: async url => url.endsWith('/settings') ? settings(false) : response }));
  }
});
