const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');
const { execFile } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { atomic } = require('./unified-ai.cjs');

const active = new Set();
const sceneLengths = { B1: 8, B2: 10, B3: 10, B4: 8 };
const safeId = id => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id);

function captions(text) {
  if (!text.trim()) return [];
  const stamp = (h, m, s, ms) => Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
  const cues = text.replace(/^\uFEFF/, '').replace(/\r/g, '').trim().split(/\n\s*\n/).map(block => {
    const lines = block.split('\n');
    const index = lines.findIndex(line => line.includes('-->'));
    const match = /^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/.exec(lines[index]?.trim() || '');
    if (!match) throw new Error('SRT 中有一段时间码无法识别');
    const cue = { start: stamp(...match.slice(1, 5)), end: stamp(...match.slice(5)), text: lines.slice(index + 1).join(' ').replace(/<[^>]*>/g, '').trim() };
    if (!cue.text || cue.end <= cue.start) throw new Error('SRT 中有空字幕或无效时间范围');
    return cue;
  });
  if (cues.length > 250 || cues.some((cue, i) => i && cues[i - 1].end > cue.start)) throw new Error('请选择字幕数量不超过 250 且时间段不重叠的 SRT');
  return cues;
}

async function run(exe, args, options, { env, cwd, timeout = 180000 } = {}) {
  return new Promise((resolve, reject) => {
    const process = execFile(exe, args, { env, cwd, timeout, windowsHide: true, maxBuffer: 3000000 }, (error, stdout, stderr) => {
      if (error) reject(new Error((stderr || error.message).trim().split(/\r?\n/).slice(-5).join('\n').slice(0, 1200)));
      else resolve(stdout);
    });
    options.registerChild?.(process);
  });
}

function runner(data, language, options) {
  const base = path.join(data, 'motion-runtime');
  const cwd = path.join(base, language);
  const python = path.join(base, 'python', 'Scripts', 'python.exe');
  const adapter = path.join(cwd, 'adapter.py');
  if (![python, adapter, path.join(cwd, 'node_modules', 'playwright-core', 'package.json')].every(existsSync)) throw new Error('本机 Motion 渲染环境未安装完整');
  const browser = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
  const env = { ...process.env, PATH: options.ffmpegBin + path.delimiter + process.env.PATH, PYTHONUTF8: '1', ...(browser ? { CHROME: browser } : {}) };
  delete env.ELECTRON_RUN_AS_NODE;
  for (const key of Object.keys(env)) if (/KEY|TOKEN|SECRET|PASSWORD/i.test(key)) delete env[key];
  return (args, timeout) => run(python, [adapter, ...args], options, { env, cwd, timeout });
}

module.exports = async (request, options) => {
  const { data, win, dialog, ffmpegBin } = options;
  const root = path.join(data, 'motion-production');
  if (request.action === 'motion-production-create') {
    if (!['zh', 'en'].includes(request.language)) throw new Error('请选择已部署的酷炫科技风语言版本');
    runner(data, request.language, options);
    const id = randomUUID(), dir = path.join(root, id);
    await fs.mkdir(dir, { recursive: true });
    const job = { id, language: request.language, state: 'draft' };
    atomic(path.join(dir, 'job.json'), job);
    return job;
  }
  if (!safeId(request.id)) throw new Error('制作任务不存在');
  const dir = path.join(root, request.id), metadata = path.join(dir, 'job.json');
  const job = JSON.parse(await fs.readFile(metadata, 'utf8'));
  const save = patch => atomic(metadata, Object.assign(job, patch));
  const state = () => {
    const { voice, subtitle, presenter, ...publicJob } = job;
    return { ...publicJob, presenterName: presenter && path.basename(presenter), voiceName: voice && path.basename(voice), subtitleName: subtitle && path.basename(subtitle),
      ...(job.state === 'done' ? { output: path.join(dir, 'video-with-audio.mp4') } : {}) };
  };
  if (request.action === 'motion-production-status') {
    if (['preparing', 'rendering'].includes(job.state) && !active.has(job.id)) save({ state: 'failed', error: '工作台已重启，制作中断。请新建制作重试。' });
    return state();
  }
  if (request.action === 'motion-production-transcript') {
    const content = job.subtitle ? await fs.readFile(job.subtitle, 'utf8') : '';
    return { language: job.language, text: captions(content).map(cue => cue.text).join('\n').slice(0, 8000) };
  }
  if (request.action === 'motion-production-revise') {
    if (active.has(job.id)) throw new Error('请等待当前制作结束后再修改')
    const nextId = randomUUID(), nextDir = path.join(root, nextId)
    await fs.mkdir(nextDir, { recursive: true })
    const next = { id: nextId, language: job.language, state: 'draft', ...(job.voice ? { voice: job.voice } : {}), ...(job.subtitle ? { subtitle: job.subtitle } : {}), ...(job.presenter ? { presenter: job.presenter } : {}) }
    atomic(path.join(nextDir, 'job.json'), next)
    return { id: nextId, language: next.language, state: next.state, presenterName: next.presenter && path.basename(next.presenter), voiceName: next.voice && path.basename(next.voice), subtitleName: next.subtitle && path.basename(next.subtitle) }
  }
  if (request.action === 'motion-production-pick') {
    if (job.state !== 'draft') throw new Error('请新建制作后再选择素材');
    const subtitle = request.kind === 'subtitle';
    const presenter = request.kind === 'presenter';
    const selected = await dialog.showOpenDialog(win, { properties: ['openFile'],
      filters: [subtitle ? { name: 'SRT 字幕', extensions: ['srt'] } : presenter ? { name: '人物视频', extensions: ['mp4','mov','webm'] } : { name: '口播原声或视频', extensions: ['mp3','wav','m4a','mp4','mov','webm','flac'] }] });
    if (selected.canceled) return state();
    const file = selected.filePaths[0], info = await fs.lstat(file);
    if (!info.isFile() || !info.size) throw new Error('素材不是可读文件');
    if (subtitle) {
      if (path.extname(file).toLowerCase() !== '.srt' || info.size > 256000) throw new Error('请选择小于 256 KB 的 UTF-8 SRT 字幕');
      captions(await fs.readFile(file, 'utf8'));
    }
    const latest = JSON.parse(await fs.readFile(metadata, 'utf8'));
    if (latest.state !== 'draft') throw new Error('制作已开始，素材未变更');
    Object.assign(job, latest);
    if (presenter) {
      const probe = JSON.parse(await run(path.join(ffmpegBin, 'ffprobe.exe'), ['-v','error','-show_streams','-of','json',file], options));
      if (!probe.streams.some(stream => stream.codec_type === 'video')) throw new Error('请选择包含视频画面的素材');
      save({ presenter: file, ...(probe.streams.some(stream => stream.codec_type === 'audio') && !job.voice ? { voice: file } : {}) });
    } else save(subtitle ? { subtitle: file } : { voice: file });
    return state();
  }
  const adapter = runner(data, job.language, options);
  const instance = path.join(dir, 'instance');
  if (request.action === 'motion-production-prepare') {
    if (job.state !== 'draft' || active.has(job.id)) throw new Error('此制作正在处理或已经提交');
    const plan = request.plan;
    const { validateMotionPlan } = await import('../media_desk/src/motion-plan.js');
    const errors = validateMotionPlan(plan, job.language);
    if (errors.length) throw new Error('镜头内容需要补充：' + errors.join('；'));
    if (!plan?.title || !Array.isArray(plan.scenes) || !plan.scenes.length || plan.scenes.length > 4 ||
      plan.scenes.some(scene => !Object.hasOwn(sceneLengths, scene.id) || typeof scene.title !== 'string') ||
      new Set(plan.scenes.map(scene => scene.id)).size !== plan.scenes.length) throw new Error('AI 返回的镜头不符合模板格式，请重试');
    active.add(job.id);
    save({ state: 'preparing' });
    try {
      const cues = job.subtitle ? captions(await fs.readFile(job.subtitle, 'utf8')) : [];
      let seconds = Math.max(0, ...cues.map(cue => cue.end));
      const voicePath = path.join(dir, 'voice.wav');
      if (job.voice) {
        const probe = JSON.parse(await run(path.join(ffmpegBin, 'ffprobe.exe'), ['-v','error','-show_streams','-show_format','-of','json',job.voice], options));
        const audio = probe.streams.find(stream => stream.codec_type === 'audio');
        const duration = Number(audio?.duration || probe.format?.duration);
        if (!audio || !Number.isFinite(duration) || duration <= 0 || duration > 84) throw new Error('请选择有可读音轨且不超过 84 秒的口播素材');
        seconds = Math.max(seconds, duration);
      }
      const natural = plan.scenes.reduce((sum, scene) => sum + sceneLengths[scene.id], 0);
      const duration = Math.max(natural, Math.ceil(seconds * 60) / 60);
      if (duration - natural > 12 * plan.scenes.length) throw new Error('当前镜头数无法覆盖口播或字幕长度，请拆短素材或在文案中要求更多镜头');
      const scenes = plan.scenes.map(scene => ({ id: scene.id, title: scene.title, duration: sceneLengths[scene.id] + (duration - natural) / plan.scenes.length }));
      if (job.voice) await run(path.join(ffmpegBin, 'ffmpeg.exe'), ['-v','error','-n','-i',job.voice,'-map','0:a:0','-af','apad','-ar','48000','-ac','2','-t',String(duration),voicePath], options);
      const input = path.join(dir, 'input.json');
      let presenter = { mode: 'none' };
      if (job.presenter) {
        const requested = request.face || { cx: .5, cy: .35, h: .22 };
        if (!['cx', 'cy', 'h'].every(key => typeof requested[key] === 'number' && Number.isFinite(requested[key]) && requested[key] > 0 && requested[key] <= 1)) throw new Error('人物位置参数无效');
        presenter = { mode:'video', file:job.presenter, face:requested };
      }
      await fs.writeFile(input, JSON.stringify({ mode:'user-media', language:job.language, layout:'landscape', title:plan.title, presenterLabel:'', duration, scenes,
        basic:plan.basic, content:{}, media:{ presenter, music:{mode:'none'}, voice:job.voice ? {mode:'file',file:voicePath} : {mode:'none'} }, captions:cues, soundEffects:'native' }));
      await adapter(['prepare','--input',input,'--out',instance]);
      await adapter(['preview','--instance',instance,'--out',path.join(dir,'preview.png'),'--time','2']);
      save({ state:'preview', scenes, duration, title:plan.title, plan });
    } catch (error) {
      const message = /needs-binding: basic\.(\w+)/.exec(error.message);
      save({ state:'failed', error: message ? '镜头缺少必填内容 ' + message[1] + '，请点击修改并重试。' : error.message });
    }
    finally { active.delete(job.id); }
    return state();
  }
  if (request.action === 'motion-production-render') {
    if (job.state !== 'preview' || active.has(job.id)) throw new Error('请先生成预览');
    active.add(job.id);
    save({ state:'rendering' });
    void (async () => {
      try {
        await adapter(['render','--instance',instance,'--out',path.join(dir,'video.mp4')], 1200000);
        const output = path.join(dir,'video-with-audio.mp4');
        const probe = JSON.parse(await run(path.join(ffmpegBin,'ffprobe.exe'), ['-v','error','-show_entries','stream=codec_type:format=duration','-of','json',output], options));
        if (!['video','audio'].every(type => probe.streams.some(stream => stream.codec_type === type)) || !(Number(probe.format.duration) > 0)) throw new Error('导出文件未通过声画检查');
        save({ state:'done' });
      } catch (error) { save({ state:'failed', error:error.message }); }
      finally { active.delete(job.id); }
    })();
    return state();
  }
  throw new Error('不支持的 Motion 制作操作');
};
