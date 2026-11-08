const { test } = require('node:test');
const assert = require('node:assert/strict');
const ai = require('./unified-ai.cjs');
test('public shared config omits the key entirely', () => {
  const safe = ai.publicConfig({ name: 'Example', textModel: 'text', apiKey: 'private-test-value' });
  assert.equal(safe.configured, true);
  assert.equal(safe.hasKey, true);
  assert.equal('apiKey' in safe, false);
  assert.equal(JSON.stringify(safe).includes('private-test-value'), false);
});
test('saving a blank masked key preserves the saved key; unsafe addresses are rejected', () => {
  const previous = { name: 'Example', baseUrl: 'https://example.com/v1', apiKey: 'private-test-value', textModel: 'text' };
  assert.equal(ai.validate({ apiKey: '', textModel: 'next' }, previous).apiKey, previous.apiKey);
  for (const baseUrl of ['http://example.com', 'https://user:password@example.com', 'https://example.com/?key=private']) assert.throws(() => ai.validate({ baseUrl }, previous));
});
