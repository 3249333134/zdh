const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { createReadStream } = require('node:fs');

const validSlug = value => typeof value === 'string' && /^[a-z0-9-]{1,80}$/.test(value);
async function entries(folder) {
  try { return await fs.readdir(folder, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

async function list(root) {
  const rows = [];
  for (const template of await entries(root)) {
    if (!template.isDirectory() || !validSlug(template.name)) continue;
    const folder = path.join(root, template.name);
    for (const version of await entries(folder)) {
      if (!version.isDirectory() || !/^[a-f0-9]{64}$/.test(version.name)) continue;
      const versionDir = path.join(folder, version.name);
      for (const file of await entries(versionDir)) {
        if (!file.isFile() || path.extname(file.name).toLowerCase() !== '.motion') continue;
        const location = path.join(versionDir, file.name);
        const stat = await fs.stat(location);
        rows.push({ template: template.name, name: file.name, path: location, bytes: stat.size, savedAt: stat.mtimeMs });
      }
    }
  }
  return rows.sort((a, b) => b.savedAt - a.savedAt);
}

module.exports = async (input, { data, win, dialog }) => {
  const root = path.join(data, 'motion-templates');
  if (input.action === 'motion-library-list') return { rows: await list(root) };
  if (input.action !== 'motion-library-import' || !validSlug(input.template)) throw new Error('模板标识无效');
  const picked = await dialog.showOpenDialog(win, {
    title: '选择从 MotionGit 下载的原始模板',
    properties: ['openFile'],
    filters: [{ name: 'Motion 模板', extensions: ['motion'] }],
  });
  if (picked.canceled || !picked.filePaths.length) return { cancelled: true, rows: await list(root) };
  const source = picked.filePaths[0], name = path.basename(source);
  if (path.extname(name).toLowerCase() !== '.motion' || !(await fs.lstat(source)).isFile()) throw new Error('请选择原始 .motion 文件');
  const folder = path.join(root, input.template);
  await fs.mkdir(folder, { recursive: true });
  const temporary = path.join(folder, randomUUID());
  await fs.mkdir(temporary);
  try {
    const copy = path.join(temporary, name);
    await fs.copyFile(source, copy);
    const handle = await fs.open(copy, 'r');
    try {
      const signature = Buffer.alloc(4);
      if ((await handle.read(signature, 0, 4, 0)).bytesRead !== 4 || signature.readUInt32LE() !== 0x04034b50) {
        throw new Error('文件无法识别为 .motion 压缩包，请重新下载');
      }
    } finally { await handle.close(); }
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(copy)) hash.update(chunk);
    const destination = path.join(folder, hash.digest('hex'));
    try { await fs.rename(temporary, destination); }
    catch (error) {
      if (!(await entries(destination)).some(file => file.isFile() && path.extname(file.name).toLowerCase() === '.motion')) throw error;
    }
  } finally {
    await fs.unlink(path.join(temporary, name)).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await fs.rmdir(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
  return { rows: await list(root) };
};
