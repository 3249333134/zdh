const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const executeFile = promisify(execFile);
const assets = require('./local-assets.cjs');
const { atomic } = require('./unified-ai.cjs');
const inflight = new Map();
async function api(base, route, { method = 'GET', body, cookie, token } = {}) {
  const response = await fetch(base + route, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie: 'open_ai_canvas_session=' + cookie } : {}), ...(token ? { 'x-workbench-token': token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(180000) });
  if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(`功能交接失败（${response.status}）：${String(data.msg || data.detail || '').slice(0, 200)}`); }
  return response.json();
}
async function handle(input, options) {
  const { data, win, dialog, clipPort, canvasCookie, nativeKey, ffmpegBin } = options;
  const execute = (...args) => { const promise = executeFile(...args); if (promise.child) options.registerChild?.(promise.child); return promise; };
  const { task, project } = input;
  if (!task || !/^[a-zA-Z0-9_-]{1,100}$/.test(task.id)) throw new Error('无效事项');
  const ledgerFile = path.join(data, 'workflow-native.json');
  const ledger = fs.existsSync(ledgerFile) ? JSON.parse(fs.readFileSync(ledgerFile, 'utf8')) : {};
  const identity = `${task.id}:${input.action}`;
  if (ledger[identity] && !ledger[identity].partial && input.action !== 'clip-export' && input.action !== 'import-files') return ledger[identity];
  const result = await (async () => {
    if (input.action === 'import-files') {
      const picked = await dialog.showOpenDialog(win, { title: '绑定此事项的实际本地素材', properties: ['openFile', 'multiSelections'] });
      if (picked.canceled || !picked.filePaths.length) throw new Error('已取消素材绑定');
      const index = path.join(data, 'local-assets.json'); assets.importPaths(index, picked.filePaths);
      const paths = new Set(picked.filePaths.map(file => path.resolve(file).toLowerCase()));
      const files = assets.publicIndex(index).filter(file => paths.has(path.resolve(file.path).toLowerCase()) && file.status === 'available');
      if (!files.length) throw new Error('所选文件不支持或不可读');
      return { artifact: { files, text: '已核验本地素材，原文件保留原位。' } };
    }
    if (input.action === 'yingce-canvas') {
      const canvasId = input.canvasId, id = task.links.yingceProjectId, unitId = task.links.yingceUnitId;
      if (!canvasId || !/^[a-zA-Z0-9_-]{1,100}$/.test(canvasId) || !id || !unitId) throw new Error('请先保存影策项目、分集与画布');
      await api('http://127.0.0.1:18081/api', `/projects/${id}/canvas-links`, { method: 'POST', cookie: canvasCookie, body: { canvasId, unitId, role: 'storyboard' } });
      return { links: { yingceCanvasId: canvasId }, artifact: { text: '分镜画布已通过原版保存流程保存并关联分集。', native: { yingceProjectId: id, yingceCanvasId: canvasId } } };
    }
    if (input.action === 'yingce') {
      const base = 'http://127.0.0.1:18081/api';
      let id = task.links.yingceProjectId || ledger[identity]?.links?.yingceProjectId || (input.inputs || []).find(row => row.native?.yingceProjectId)?.native.yingceProjectId;
      if (!id) {
        const response = await api(base, '/projects', { method: 'POST', cookie: canvasCookie, body: { name: task.video || task.title, type: 'short_drama', aspectRatio: '9:16', sourceType: 'original', description: `${project.goal}\n事项：${task.description}`.slice(0, 6000) } });
        id = response.data.project.id;
        // Save the project identity immediately, so a unit-save failure can resume safely.
        ledger[identity] = { partial: true, links: { yingceProjectId: id } }; atomic(ledgerFile, ledger);
      }
      const source = ([...(input.inputs || []), ...task.artifacts].map(row => row.text || '').filter(Boolean).join('\n\n') || task.description || task.deliverable || task.title).slice(0, 12000);
      let unitId = task.links.yingceUnitId;
      if (!unitId && source) {
        const response = await api(base, `/projects/${id}/units`, { method: 'POST', cookie: canvasCookie, body: { kind: 'episode', title: task.title, sourceText: source } });
        unitId = response.data.unit.id;
      }
      await api(base, `/projects/${id}`, { cookie: canvasCookie });
      return { links: { yingceProjectId: id, ...(unitId ? { yingceUnitId: unitId } : {}) }, artifact: { text: '已建立并核对影策项目；在影策中继续分镜和画布编辑。', native: { yingceProjectId: id, unitId } } };
    }
    if (input.action === 'clip-import') {
      const indexed = assets.publicIndex(path.join(data, 'local-assets.json'));
      const refs = [...(input.inputs || []), ...task.artifacts].flatMap(row => row.files || []);
      const selected = [...new Set(refs.filter(row => row.kind === 'video').map(row => row.id))].map(id => indexed.find(file => file.id === id && file.status === 'available'));
      if (!selected.length || selected.some(file => !file)) throw new Error('请先绑定或完成前置拍摄事项的视频素材，缺失文件需重新绑定');
      const folder = path.join(data, 'workflow-derived', task.id); fs.mkdirSync(folder, { recursive: true });
      const segments = [], parts = []; let cursor = 0, dimensions = '1280:720';
      for (let index = 0; index < selected.length; index++) {
        const file = selected[index], output = path.join(folder, `part-${index}.mp4`);
        const probe = await execute(path.join(ffmpegBin, 'ffprobe.exe'), ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file.path], { windowsHide: true, timeout: 30000 });
        const info = JSON.parse(probe.stdout), duration = Number(info.format.duration);
        if (!index) { const stream = info.streams.find(row => row.codec_type === 'video'); if (stream?.height > stream?.width) dimensions = '720:1280'; }
        if (!Number.isFinite(duration) || duration <= 0) throw new Error('视频时长不可读取：' + file.name);
        const hasAudio = info.streams.some(stream => stream.codec_type === 'audio');
        const args = ['-v', 'error', '-y', '-i', file.path, ...(!hasAudio ? ['-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000'] : []), '-map', '0:v:0', '-map', hasAudio ? '0:a:0' : '1:a:0', '-vf', `scale=${dimensions}:force_original_aspect_ratio=decrease,pad=${dimensions}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-t', String(duration), output];
        await execute(path.join(ffmpegBin, 'ffmpeg.exe'), args, { windowsHide: true, timeout: Math.max(180000, duration * 10000), maxBuffer: 1000000 });
        parts.push(output); segments.push({ label: file.name, start: cursor, end: cursor + duration, fileId: file.id, originalPath: file.path }); cursor += duration;
      }
      const list = path.join(folder, 'concat.txt'); fs.writeFileSync(list, parts.map(file => `file '${file.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'));
      const source = path.join(folder, 'input.mp4');
      await execute(path.join(ffmpegBin, 'ffmpeg.exe'), ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', source], { windowsHide: true, timeout: 180000 });
      atomic(path.join(folder, 'source-map.json'), { taskId: task.id, segments });
      const imported = await api(`http://127.0.0.1:${clipPort}/api/v1`, '/workbench/import', { method: 'POST', token: nativeKey, body: { task_id: task.id, title: task.video || task.title, source, segments: segments.map(row => ({ label: row.label, start: row.start, end: row.end })) } });
      return { links: { clipProjectId: imported.project_id, clipDraftId: imported.draft_id }, artifact: { text: '已按素材绑定顺序创建可编辑剪辑草稿；未自动转写、生成或导出。', native: { sourceMap: path.join(folder, 'source-map.json'), clipProjectId: imported.project_id } } };
    }
    if (input.action === 'clip-export') {
      const id = task.links.clipProjectId; if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('请先创建关联剪辑项目');
      const workspace = await api(`http://127.0.0.1:${clipPort}/api/v1`, `/studio/${id}`);
      const completed = workspace.jobs.filter(job => job.status === 'completed' && (!task.links.clipDraftId || job.draft_id === task.links.clipDraftId)).reverse();
      for (const job of completed) {
        if (!/^[a-zA-Z0-9_-]+$/.test(job.job_id)) continue;
        const output = path.join(data, 'autoclip/projects', id, 'output/studio', job.job_id + '.mp4');
        if (!fs.existsSync(output) || !fs.statSync(output).size) continue;
        await execute(path.join(ffmpegBin, 'ffprobe.exe'), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', output], { windowsHide: true, timeout: 30000 });
        return { artifact: { text: '已核对原版导出任务完成，文件存在且可读取。', files: [{ id: job.job_id, name: path.basename(output), path: output, kind: 'video' }], native: { exportVerified: true, clipProjectId: id, jobId: job.job_id } } };
      }
      throw new Error('尚无可验证的成片，请到剪辑助手完成导出后再核对');
    }
    throw new Error('不支持的本机事项操作');
  })();
  ledger[identity] = result; atomic(ledgerFile, ledger); return result;
}
module.exports = (input, options) => {
  const key = input.task?.id + ':' + input.action;
  if (inflight.has(key)) return inflight.get(key);
  const operation = handle(input, options).finally(() => inflight.delete(key)); inflight.set(key, operation); return operation;
};
