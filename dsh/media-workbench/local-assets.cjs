const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const kinds = { image: ['.png','.jpg','.jpeg','.gif','.webp','.svg','.avif'], video: ['.mp4','.mov','.webm','.mkv'], audio: ['.mp3','.wav','.ogg','.m4a','.flac'], model: ['.glb','.gltf','.obj','.fbx'], text: ['.txt','.md','.srt','.json','.csv','.pdf','.docx'] };
function kindOf(file) { return Object.keys(kinds).find(kind => kinds[kind].includes(path.extname(file).toLowerCase())); }
function readIndex(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return []; throw error; } }
function publicIndex(file) { return readIndex(file).map(row => { let status = 'missing', bytes = row.bytes; try { const stat = fs.statSync(row.path); if (stat.isFile()) { status = 'available'; bytes = stat.size; } } catch {} return { ...row, bytes, status, url: `/api/workbench/local-assets/${row.id}/file` }; }); }
function importPaths(file, inputs) {
  const rows = readIndex(file), byPath = new Map(rows.map(row => [row.path.toLowerCase(), row]));
  const walk = input => {
    const stat = fs.lstatSync(input);
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) { for (const entry of fs.readdirSync(input)) if (!entry.startsWith('.')) walk(path.join(input, entry)); return; }
    const kind = kindOf(input); if (!kind || !stat.isFile()) return;
    const absolute = path.resolve(input), key = absolute.toLowerCase();
    byPath.set(key, { id: byPath.get(key)?.id || crypto.randomUUID(), path: absolute, title: path.basename(absolute), kind, bytes: stat.size, importedAt: byPath.get(key)?.importedAt || new Date().toISOString() });
  };
  inputs.forEach(walk);
  fs.writeFileSync(file + '.tmp', JSON.stringify([...byPath.values()], null, 2)); fs.renameSync(file + '.tmp', file);
  return publicIndex(file);
}
module.exports = { readIndex, publicIndex, importPaths };
