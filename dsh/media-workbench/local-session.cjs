const fs = require('node:fs');
const crypto = require('node:crypto');

// The single-user desktop owns this identity; passwords never enter the renderer.
async function establishSession({ baseURL, identityFile, fetchImpl = fetch }) {
  const settingsResponse = await fetchImpl(baseURL + '/api/auth/settings');
  if (!settingsResponse.ok) throw new Error('无法读取影策身份设置');
  const settings = (await settingsResponse.json()).data;
  let identity;
  if (fs.existsSync(identityFile)) identity = JSON.parse(fs.readFileSync(identityFile, 'utf8'));
  else {
    if (!settings?.firstUser) throw new Error('影策已有独立账号，需要先迁移该账号，不能自动接管已有数据。');
    identity = { username: 'workbench-owner', password: crypto.randomBytes(32).toString('base64url') };
    fs.writeFileSync(identityFile, JSON.stringify(identity), { mode: 0o600, flag: 'wx' });
  }
  const registering = Boolean(settings?.firstUser);
  const response = await fetchImpl(baseURL + '/api/auth/' + (registering ? 'register' : 'login'), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...identity, ...(registering ? { displayName: '工作台用户', acceptedTerms: true } : {}) }),
  });
  if (!response.ok) throw new Error(`工作台身份认证失败（${response.status}），请重启工作台或检查本机身份文件。`);
  const result = await response.json();
  const cookie = response.headers.getSetCookie().find(value => value.startsWith('open_ai_canvas_session='));
  const value = cookie?.split(';')[0].slice('open_ai_canvas_session='.length);
  if (!value || !result.data?.user?.id) throw new Error('工作台身份认证未返回有效会话');
  return { value, userId: result.data.user.id };
}
module.exports = { establishSession };
