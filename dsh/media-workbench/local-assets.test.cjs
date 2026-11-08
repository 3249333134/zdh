const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { importPaths, publicIndex } = require('./local-assets.cjs');
test('本地素材索引去重、统计原文件大小并识别已移动文件，不复制原文件', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-local-assets-'));
  const file = path.join(dir, 'draft.txt'), index = path.join(dir, 'index.json');
  t.after(() => { for (const name of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, name)); fs.rmdirSync(dir); });
  fs.writeFileSync(file, 'hello');
  const first = importPaths(index, [file]);
  assert.equal(first.length, 1); assert.equal(first[0].bytes, 5);
  const second = importPaths(index, [file]);
  assert.equal(second.length, 1); assert.equal(second[0].id, first[0].id);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['draft.txt','index.json']);
  fs.renameSync(file, path.join(dir, 'moved.txt'));
  assert.equal(publicIndex(index)[0].status, 'missing');
});
