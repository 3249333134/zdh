const fs = require('node:fs');
const path = require('node:path');
module.exports = async (win, logs) => {
  const run = code => win.webContents.executeJavaScript(code);
  const fetchLocal = async (route, body) => {
    const response = await win.webContents.session.fetch('http://127.0.0.1:33280/media-desk/' + route, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
    const result = await response.json();
    if (!response.ok) throw new Error(`Shared AI ${route}: ${response.status}`);
    return result;
  };
  const config = await fetchLocal('unified-ai');
  if (!config.config.configured || JSON.stringify(config).includes('sk-') || 'apiKey' in config.config) throw new Error('共享配置或密钥隔离检查失败');
  const models = await fetchLocal('models');
  if (models.default?.provider !== 'workbench-ai' || models.current?.model !== config.config.textModel) throw new Error('全局助手未使用共享模型');
  const chat = await fetchLocal('chat', { message: '只验证连接，请回复“模型正常”。不要创建或修改任何内容。' });
  if (chat.answer?.engine !== config.config.textModel || chat.answer?.notice) throw new Error('全局助手模型连接失败');
  await run(`[...document.querySelectorAll('.md-nav button')].find(el => el.textContent === '剪辑助手').click()`);
  let frame, body = '';
  for (let attempt = 0; attempt < 80; attempt++) {
    frame = win.webContents.mainFrame.frames.find(candidate => candidate.url.startsWith('http://127.0.0.1:13002/'));
    if (frame) { body = await frame.executeJavaScript('document.body.innerText'); if (body.includes('文件导入')) break; }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  if (!body.includes('文件导入') || body.includes('先连接 AI 服务') || body.includes('88API') || await frame.executeJavaScript('Boolean(document.querySelector("header.ant-layout-header"))')) throw new Error('剪辑助手仍有独立服务引导或顶栏');
  await run(`document.querySelector('button[aria-label="自媒体工作台设置"]').click()`);
  await new Promise(resolve => setTimeout(resolve, 700));
  if (!await run(`document.querySelector('.md-workbench-settings').textContent.includes('通用 AI')`)) throw new Error('未显示统一设置入口');
  fs.writeFileSync(path.join(logs, 'shared-ai-settings.png'), (await win.webContents.capturePage()).toPNG());
  await run(`document.querySelector('.md-dialog-head button[aria-label="关闭"]').click()`);
  await new Promise(resolve => setTimeout(resolve, 500));
  fs.writeFileSync(path.join(logs, 'shared-ai-autoclip.png'), (await win.webContents.capturePage()).toPNG());
  const readiness = await (await win.webContents.session.fetch('http://127.0.0.1:13002/api/v1/studio/readiness')).json();
  if (!readiness.checks.analysis.ok) throw new Error('剪辑助手模型未接通');
  await run(`[...document.querySelectorAll('.md-nav button')].find(el => el.textContent === '影策').click()`);
  let canvasModels;
  for (let attempt = 0; attempt < 70; attempt++) {
    const canvas = win.webContents.mainFrame.frames.find(candidate => candidate.url.startsWith('http://127.0.0.1:13001/'));
    if (canvas) canvasModels = await canvas.executeJavaScript(`(() => { const key = 'open_ai_canvas:ai_config_store:user:' + localStorage.getItem('yingce:active-user-scope'); const cfg = JSON.parse(localStorage.getItem(key) || '{}').state?.config; return cfg ? {text:cfg.textModel,image:cfg.imageModel,video:cfg.videoModel} : null; })()`);
    if (canvasModels?.text?.endsWith('::' + config.config.textModel)) break;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  if (!canvasModels?.text?.endsWith('::' + config.config.textModel)) throw new Error('影策未选择统一 AI');
  await run(`[...document.querySelectorAll('.md-nav button')].find(el => el.textContent === '剪辑助手').click()`);
  fs.writeFileSync(path.join(logs, 'shared-ai-smoke.json'), JSON.stringify({ ok: true, secretMasked: true, default: models.default, chatEngine: chat.answer.engine, canvasModels, clipAnalysis: readiness.checks.analysis, clipTranscription: readiness.checks.transcription }, null, 2));
};
