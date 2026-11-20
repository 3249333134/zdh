const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { establishSession } = require('./local-session.cjs');
const unifiedAI = require('./unified-ai.cjs');
const workflowNative = require('./workflow-native.cjs');

const data = process.env.DSH_HOME;
const canvasBackend = 'http://127.0.0.1:18081';
let session;
let expiresAt = 0;

function canvasSession() {
  if (!session || Date.now() >= expiresAt) {
    expiresAt = Date.now() + 60 * 60 * 1000;
    session = establishSession({
      baseURL: canvasBackend,
      identityFile: path.join(data, 'canvas-identity.json'),
      fetchImpl: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(10000) }),
    }).catch(error => { session = undefined; throw error; });
  }
  return session;
}

function mediaOptions() {
  const ffmpegBin = process.env.MOTION_FFMPEG_BIN || '/Applications/ADu Director.app/Contents/Resources/resources/motion-toolchain/darwin-' + process.arch + '/ffmpeg/bin';
  return { data, ffmpegBin };
}

async function workflow(body) {
  if (['motion-library-list', 'motion-editor-list', 'motion-editor-create', 'motion-editor-read', 'motion-editor-save', 'motion-editor-status', 'motion-editor-render', 'motion-editor-waveforms', 'motion-editor-thumbnails', 'motion-editor-analyze-video', 'motion-editor-fork-video', 'motion-editor-copy-project', 'motion-editor-export-workspace', 'motion-editor-import-workspace', 'motion-editor-open-workspace'].includes(body.action)) {
    return { result: await workflowNative(body, mediaOptions()) };
  }
  if (typeof body.action === 'string' && body.action.startsWith('motion-')) {
    throw new Error('此 Motion 操作需要桌面版的素材选择或渲染组件');
  }
  if (!['knowledge-read', 'yingce', 'yingce-canvas'].includes(body.action)) {
    throw new Error('此操作需要已启动的桌面剪辑服务');
  }
  const { value: canvasCookie } = await canvasSession();
  return { result: await workflowNative(body, { data, canvasCookie }) };
}

function save(config) {
  unifiedAI.atomic(path.join(data, 'unified-ai.json'), config);
}

async function syncCanvas(config) {
  const { value: canvasCookie } = await canvasSession();
  const { canvasChannelId } = await unifiedAI.synchronize(config, { canvasCookie });
  save({ ...config, canvasChannelId });
}

async function ai(body) {
  if (body) {
    const config = unifiedAI.validate(body, unifiedAI.read(data));
    await syncCanvas(config);
  }
  return { config: unifiedAI.publicConfig(unifiedAI.read(data)), restartRequired: Boolean(body) };
}

async function respond(reply, action) {
  try {
    reply(200, { ok: true, ...await action() });
  } catch (error) {
    reply(400, { error: String(error.message).replace(/sk-[A-Za-z0-9_-]+/g, '***') });
  }
}

function prepare(patch) {
  const entries = [{ insert: [{ id: 'media-workbench-macos', name: path.join(__dirname, 'macos-web-host.mjs') }] }];
  const config = unifiedAI.read(data);
  const settingsFile = path.join(data, 'media-desk/settings.json');
  const settings = fs.existsSync(settingsFile) ? JSON.parse(fs.readFileSync(settingsFile, 'utf8')) : {};
  settings.yingce = { ...settings.yingce, enabled: true, backendUrl: canvasBackend, webUrl: 'http://127.0.0.1:13001' };
  if (config?.apiKey) {
    unifiedAI.configureDsh(entries, config);
    settings.assistant = { provider: 'workbench-ai', model: config.textModel };
  }
  unifiedAI.atomic(patch, entries);
  unifiedAI.atomic(settingsFile, settings);
  const nativeFile = path.join(data, 'native-key');
  if (!fs.existsSync(nativeFile)) fs.writeFileSync(nativeFile, randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' });
}

async function upload(req, id, name, replace) {
  const { pipeline } = require('node:stream/promises');
  const { Transform } = require('node:stream');
  const template = id === 'template' && /\.motion$/i.test(name);
  if ((!template && (!/^[a-f0-9-]{36}$/.test(id) || !/\.(mp4|mov|webm|mkv|png|jpe?g|webp|gif|mp3|wav|m4a|aac|srt)$/i.test(name))) || /[\/\\\x00-\x1f]/.test(name) || Buffer.byteLength(name) > 240) {
    throw new Error('素材文件名或格式无效');
  }
  const folder = await fs.promises.mkdtemp(path.join(data, 'motion-upload-'));
  const file = path.join(folder, name);
  let bytes = 0;
  const limit = new Transform({ transform(chunk, _, callback) {
    bytes += chunk.length;
    callback(bytes > (/\.srt$/i.test(name) ? 2 : 500) * 1024 * 1024 ? new Error('素材超过大小限制') : null, chunk);
  } });
  try {
    await pipeline(req, limit, fs.createWriteStream(file, { flags: 'wx', mode: 0o600 }));
    if (!bytes) throw new Error('素材文件为空');
    if (template) return { result: await require('./motion-library.cjs').importPackage(file, data) };
    return { result: await workflowNative({ action: 'motion-editor-import', id, replace }, { ...mediaOptions(), upload: file }) };
  } finally {
    await fs.promises.rm(folder, { recursive: true, force: true });
  }
}

module.exports = { upload, ai, canvasSession, respond, workflow };

if (require.main === module) {
  const [, , action, patch] = process.argv;
  async function run() {
    if (!data) throw new Error('自媒体工作台数据目录未设置');
    if (action === 'prepare') prepare(patch);
    else if (action === 'key') process.stdout.write(unifiedAI.read(data)?.apiKey || '');
    else if (action === 'sync') await syncCanvas(unifiedAI.read(data));
    else if (action === 'set-agnes') {
      const apiKey = fs.readFileSync(0, 'utf8').trim();
      if (!apiKey) throw new Error('需要 Agnes API 密钥');
      save(unifiedAI.validate({ name: 'Agnes', baseUrl: 'https://apihub.agnes-ai.com/v1', textModel: 'agnes-2.5-flash', apiKey }, null));
    } else throw new Error('未知的 macOS 工作台配置操作');
  }
  run().catch(error => { console.error(String(error.message).replace(/sk-[A-Za-z0-9_-]+/g, '***')); process.exitCode = 1; });
}
