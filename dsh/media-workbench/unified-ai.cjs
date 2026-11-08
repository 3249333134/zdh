const fs = require('node:fs');
const path = require('node:path');

function atomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(file + '.tmp', file);
}
function read(data) {
  const file = path.join(data, 'unified-ai.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}
function publicConfig(config) {
  if (!config) return { configured: false };
  const { apiKey, ...safe } = config;
  return { ...safe, configured: Boolean(apiKey && config.textModel), hasKey: Boolean(apiKey) };
}
function validate(input, previous) {
  const config = Object.fromEntries(['name', 'baseUrl', 'textModel', 'imageModel', 'videoModel'].map(key => [key, String(input[key] ?? previous?.[key] ?? '').trim()]));
  const url = new URL(config.baseUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('请填写有效的 HTTPS 服务地址');
  config.baseUrl = url.href.replace(/\/+$/, '');
  config.apiKey = String(input.apiKey || previous?.apiKey || '').trim();
  if (!config.name || !config.textModel || !config.apiKey || config.apiKey.length > 2000 || /[\r\n]/.test(config.apiKey)) throw new Error('请填写服务名称、密钥和文字模型');
  return config;
}
function prepareDsh(root, data, config) {
  if (!config?.apiKey) return;
  const yaml = require(path.join(root, 'runtime/host/resources/app.asar/dsh/node_modules/yaml'));
  const file = path.join(data, 'dsh/profiles/web/cordis.patch.yml');
  const entries = yaml.parse(fs.readFileSync(file, 'utf8')) || [];
  const upsert = (id, fields) => {
    const entry = entries.find(row => row.id === id);
    if (entry) Object.assign(entry, fields); else entries.push({ id, ...fields });
  };
  const existing = entries.find(row => row.id === 'llm-pi-ai')?.config || {};
  upsert('llm-pi-ai', { config: { ...existing, providers: { ...existing.providers, 'workbench-ai': {
    displayName: config.name, apiKeyEnv: 'WORKBENCH_AI_KEY', api: 'openai-completions', baseURL: config.baseUrl,
    models: [{ id: config.textModel, name: config.textModel, contextWindow: 262144, maxTokens: 16384, reasoningEfforts: false }],
    compat: { supportsDeveloperRole: false, maxTokensField: 'max_tokens' }, retryPolicy: { mode: 'normal', maxRetries: 1 },
  } } } });
  upsert('agent-default-model', { config: { provider: 'workbench-ai', model: config.textModel } });
  fs.writeFileSync(file + '.tmp', yaml.stringify(entries)); fs.renameSync(file + '.tmp', file);
  const deskFile = path.join(data, 'dsh/media-desk/settings.json');
  const desk = fs.existsSync(deskFile) ? JSON.parse(fs.readFileSync(deskFile, 'utf8')) : {};
  atomic(deskFile, { ...desk, assistant: { provider: 'workbench-ai', model: config.textModel }, image: { ...desk.image, source: 'http', baseUrl: config.baseUrl, apiKey: config.apiKey, model: config.imageModel } });
}
async function json(url, { method = 'GET', body, cookie } = {}) {
  const response = await fetch(url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie: `open_ai_canvas_session=${cookie}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    const reason = String(result.message || result.error?.message || result.error || result.detail || JSON.stringify(result)).replace(/sk-[A-Za-z0-9_-]+/g, '***').slice(0, 250);
    throw new Error(`统一配置同步失败（${new URL(url).pathname}，${response.status}）：${reason}`);
  }
  return response.json();
}
async function synchronize(config, { canvasCookie, clipPort }) {
  if (!config?.apiKey) return;
  const base = 'http://127.0.0.1:18081/api';
  const channels = (await json(base + '/admin/channels?limit=100', { cookie: canvasCookie })).data?.channels || [];
  const existing = channels.find(row => row.name === '工作台统一 AI');
  const payload = { name: '工作台统一 AI', baseUrl: config.baseUrl, apiKey: config.apiKey, enabled: true, models: [config.textModel, config.imageModel, config.videoModel].filter(Boolean) };
  const channel = (await json(base + '/admin/channels' + (existing ? '/' + existing.id : ''), { method: existing ? 'PATCH' : 'POST', body: payload, cookie: canvasCookie })).data.channel;
  const list = (await json(base + `/admin/channels/${channel.id}/models`, { cookie: canvasCookie })).data;
  const models = Array.isArray(list) ? list : list?.models || [];
  for (const [modelKey, capability, protocol] of [[config.textModel, 'text', 'chat-completion'], [config.imageModel, 'image', 'openai-image'], [config.videoModel, 'video', 'agnes-video']]) {
    if (!modelKey) continue;
    const model = models.find(row => row.modelKey === modelKey || row.model === modelKey);
    const capabilityConfig = { version: 1, ...(capability === 'text' ? { text: { streaming: true, contextWindowTokens: 262144, maxOutputTokens: 16384, references: { promptMaxChars: 32000, maxImages: 8, maxImageBytes: 10485760 } } } : capability === 'image' ? { image: { references: { promptMaxChars: 32000, maxImages: 0, maxImageBytes: 0, maskSupported: false }, size: { parameter: 'size', values: ['1024x1024'], default: '1024x1024', allowCustom: false }, quality: { supported: false }, transparentBackground: { supported: false }, responseFormat: { supported: true, default: 'url' }, outputFormat: { supported: false }, maxOutputs: 1 } } : { video: { references: { promptMaxChars: 32000, minImages: 0, maxImages: 1, maxImageBytes: 10485760 }, duration: { selection: 'enum', values: [5, 10], default: 5 }, ratios: ['16:9', '9:16', '1:1'], defaultRatio: '16:9', resolutions: ['720p', '1080p'], defaultResolution: '720p', generateAudio: { supported: false, default: false }, watermark: { supported: false, default: false }, operations: ['text_to_video', 'image_to_video'], defaultOperation: 'text_to_video' } }) };
    await json(base + `/admin/channels/${channel.id}/models` + (model ? '/' + model.id : ''), { method: model ? 'PATCH' : 'POST', cookie: canvasCookie, body: { modelKey, displayName: modelKey, capability, protocol, capabilityConfig, enabled: true, billingMode: 'fixed_request', priceConfigured: true, unitPriceMicrocredits: 0 } });
  }
  const clipBase = `http://127.0.0.1:${clipPort}/api/v1/settings/ai-models`;
  const previous = await json(clipBase);
  const connection = { id: 'workbench-ai', name: config.name, provider: 'compatible', base_url: config.baseUrl, api_key: config.apiKey, base_url_source: 'user', validation_status: 'unchecked', custom_models: [
    { id: config.textModel, types: ['language'], vision: true, scenarios: ['analysis', 'vision'] },
    ...(config.imageModel ? [{ id: config.imageModel, types: ['image'], scenarios: ['cover'] }] : []),
  ] };
  await json(clipBase, { method: 'PUT', body: { ...previous, connections: [...(previous.connections || []).filter(row => row.id !== 'workbench-ai'), connection], analysis: { connection_id: 'workbench-ai', model: config.textModel, capability: 'multimodal', model_source: 'user' }, vision: null,
    cover: config.imageModel ? { connection_id: 'workbench-ai', model: config.imageModel, model_source: 'user' } : null, cover_enabled: false, cover_follows_analysis: true, cover_choice_version: 1 } });
  return { canvas: true, autoclip: true, canvasChannelId: channel.id };
}
module.exports = { read, atomic, validate, publicConfig, prepareDsh, synchronize };
