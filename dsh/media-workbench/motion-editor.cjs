const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { atomic } = require('./unified-ai.cjs');
const http = require('node:http');
const { createReadStream } = require('node:fs');
const previewAssets = new Map(), capabilities = new Map();
let serving;
async function previewProject(p) {
  if(!serving) serving=new Promise(resolve=>{
    const server=http.createServer(async(req,res)=>{
      try{
        const asset=previewAssets.get(req.url);if(!asset){res.writeHead(404).end();return}
        const stat=await fs.stat(asset.path),range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
        const start=range?Number(range[1]):0,end=range&&range[2]?Math.min(Number(range[2]),stat.size-1):stat.size-1;
        if(start>end){res.writeHead(416).end();return}
        const types={image:'image/'+({'.jpg':'jpeg','.jpeg':'jpeg'}[path.extname(asset.path)]||path.extname(asset.path).slice(1)),video:'.mov'===path.extname(asset.path)?'video/quicktime':'.webm'===path.extname(asset.path)?'video/webm':'video/mp4',audio:'.wav'===path.extname(asset.path)?'audio/wav':'.mp3'===path.extname(asset.path)?'audio/mpeg':'audio/mp4'};
        res.writeHead(range?206:200,{'Content-Type':types[asset.kind],'Access-Control-Allow-Origin':'*','Accept-Ranges':'bytes','Content-Length':end-start+1,...(range?{'Content-Range':`bytes ${start}-${end}/${stat.size}`}:{})});
        createReadStream(asset.path,{start,end}).pipe(res)
      }catch{res.writeHead(500).end()}
    });server.listen(0,'127.0.0.1',()=>resolve(server.address().port));server.unref();
  });
  const port=await serving,urls={};
  for(const asset of p.assets){
    for(const [key,media] of [[asset.id,asset],...(asset.filmstripPath?[[asset.id+'-thumb',{path:asset.filmstripPath,kind:'image'}]]:[])]){
      let token=capabilities.get(media.path);if(!token){token='/'+randomUUID();capabilities.set(media.path,token);previewAssets.set(token,media)}urls[key]='http://127.0.0.1:'+port+token;
    }
  }
  return {...p,assets:p.assets.map(({path,filmstripPath,...asset})=>asset),previewUrls:urls};
}
const active = new Set(), locks = new Map();
const safe = value => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value);
const run = (exe,args,options,extra={}) => new Promise((resolve,reject) => {
  const child = execFile(exe,args,{windowsHide:true,maxBuffer:2000000,timeout:120000,...extra},(error,out,err)=>error?reject(Error((err||error.message).slice(-1800))):resolve(out));
  options.registerChild?.(child);
});
async function speech(action, options, inputPath='', outputPath='') {
  const script=await fs.readFile(path.join(__dirname,'motion-editor-speech.ps1'),'utf8');
  const body=script.replace(/^param\([^\n]*\)\r?\n/, '$Action = $env:MOTION_SPEECH_ACTION\n$InputPath = $env:MOTION_SPEECH_INPUT\n$OutputPath = $env:MOTION_SPEECH_OUTPUT\n');
  return run('powershell.exe',['-NoProfile','-NonInteractive','-Command',body],options,{env:{...process.env,MOTION_SPEECH_ACTION:action,MOTION_SPEECH_INPUT:inputPath,MOTION_SPEECH_OUTPUT:outputPath}});
}
async function waveform(asset,options){
  if(!asset.hasAudio||asset.peaks)return asset;
  const duration=Math.min(600,asset.duration);
  const buffer=await run(path.join(options.ffmpegBin,process.platform==='win32'?'ffmpeg.exe':'ffmpeg'),['-v','error','-i',asset.path,'-t',String(duration),'-map','0:a:0','-ac','1','-ar','8000','-f','f32le','pipe:1'],options,{encoding:'buffer',maxBuffer:24000000});
  const count=Math.floor(buffer.length/4),size=Math.max(1,Math.ceil(count/512)),peaks=[];
  for(let start=0;start<count;start+=size){let peak=0;for(let i=start;i<Math.min(count,start+size);i++)peak=Math.max(peak,Math.abs(buffer.readFloatLE(i*4)));peaks.push(peak)}
  const maximum=Math.max(.0001,...peaks);return {...asset,peaks:peaks.map(n=>Math.round(Math.sqrt(n/maximum)*1000)/1000),peaksDuration:duration};
}

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const writeText = async (file, text) => { await fs.mkdir(path.dirname(file),{recursive:true}); await fs.writeFile(file+'.tmp',text,{mode:0o600}); await fs.rename(file+'.tmp',file); };
const writeJson = async (file, value) => writeText(file, JSON.stringify(value,null,2));
const buildComposition = (p, assets) => {
  const groups = new Map();
  for (const clip of p.clips) {
    if (!['video','image','audio'].includes(clip.type)) continue;
    const track = clip.trackId || (clip.type === 'audio' ? 'audio-music' : 'video-main');
    if (!groups.has(track)) groups.set(track, []);
    groups.get(track).push(clip);
  }
  const sections = [];
  for (const clips of groups.values()) {
    const rows = clips.sort((a,b)=>a.start-b.start).map(clip => {
      const asset = assets.find(row => row.id === clip.assetId);
      if (!asset) return '';
      const tag = clip.type === 'audio' ? 'audio' : clip.type === 'image' ? 'img' : 'video';
      const input = Number(clip.inPoint || 0), output = Number(input + clip.duration * (clip.speed || 1));
      const style = 'left:' + Math.round(clip.x || 0) + 'px;top:' + Math.round(clip.y || 0) + 'px;width:' + Math.round(clip.width || p.width) + 'px;height:' + Math.round(clip.height || p.height) + 'px';
      const fade = (clip.fadeIn || clip.fadeOut) ? ' overrides=\'[{"fade":[' + Number(clip.fadeIn || 0) + ',' + Number(clip.fadeOut || 0) + ']}]\'' : '';
      const speed = clip.speed && clip.speed !== 1 ? ' speed="' + clip.speed + '"' : '';
      const volume = tag === 'audio' || clip.volume !== undefined ? ' volume="' + (clip.volume ?? 1) + '"' : '';
      return '      <' + tag + ' src="' + escapeHtml(asset.file + '#t=' + input + ',' + output) + '" at="' + Number(clip.start || 0) + '" style="' + style + '"' + speed + volume + fade + '></' + tag + '>';
    }).filter(Boolean);
    if (rows.length) sections.push('  <section>\n' + rows.join('\n') + '\n  </section>');
  }
  return '<!doctype html>\n<html>\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=' + p.width + ', height=' + p.height + '">\n<meta name="film-fps" content="' + p.fps + '">\n</head>\n<body style="margin:0;background:' + (p.background || '#080d15') + '">\n' + sections.join('\n') + '\n</body>\n</html>\n';
};
const MEP_EXAMPLE = {
  version:'1.0',
  operations:[
    {op:'applyStyle',target:'all-visual',style:'cinematic'},
    {op:'setTransition',target:'all-visual',type:'dissolve',duration:0.6},
    {op:'addText',text:'用代码剪出来的片子',start:1,duration:3,x:640,y:300,fontSize:72,align:'center'},
  ],
};
const SKILL_TEXT = (p) => '# Motion 工程 · 自动剪辑 Skill\n\n' +
  '这是一份开放的 Motion 工程文件夹，外部 AI（Claude Code、Codex、Cursor 等）可以直接读取和修改。\n\n' +
  '## 目录\n\n' +
  '- `motion.json`：完整工程（片段、轨道、素材、转场、关键帧、调色）。**主要编辑对象**。\n' +
  '- `composition.html`：按 Motion 页面协议生成的只读预览，便于理解时间与画面。\n' +
  '- `assets/`：素材文件，只读，不要改名。\n' +
  '- `orders/`：MEP 工单示例与执行记录。\n' +
  '- `tools/motion-mep.mjs`：本机 MEP 执行器，无需安装依赖。\n\n' +
  '## 两种工作方式\n\n' +
  '1. **直接改 motion.json**：用脚本读取 JSON，修改 `clips` 后写回；不要改动 `assets[].file` 与素材文件。\n' +
  '2. **写 MEP 工单**（推荐，省 Token）：只提交差异操作，由执行器应用并校验。\n\n' +
  '```bash\n' +
  'node tools/motion-mep.mjs show .\n' +
  'node tools/motion-mep.mjs apply . orders/my-order.json\n' +
  'node tools/motion-mep.mjs validate .\n' +
  '```\n\n' +
  '## MEP 工单格式\n\n' +
  '```json\n' +
  '{ "version": "1.0", "operations": [\n' +
  '  { "op": "applyStyle", "target": "all-visual", "style": "cinematic" },\n' +
  '  { "op": "setTransition", "target": "all-visual", "type": "dissolve", "duration": 0.6 },\n' +
  '  { "op": "addText", "text": "标题", "start": 1, "duration": 3, "x": 640, "y": 300, "fontSize": 72, "align": "center" },\n' +
  '  { "op": "trim", "target": "片段标题", "start": 2, "duration": 4 },\n' +
  '  { "op": "setSpeed", "target": "片段标题", "speed": 1.5 },\n' +
  '  { "op": "render" }\n' +
  '] }\n' +
  '```\n\n' +
  '支持：`setProject`、`addText`、`addClip`、`removeClip`、`trim`、`move`、`setText`、`setTransition`、`applyStyle`、`setKeyframes`、`setSpeed`、`setVolume`、`addMarker`、`render`。\n' +
  '`target` 可填片段 id、完整标题、标题片段或 `all` / `all-visual`。\n\n' +
  '## 约束\n\n' +
  '- 片段 `start + duration` 不能超过工程 `duration`；超出时执行器会报错并拒绝写入。\n' +
  '- 视频/音频的 `inPoint + duration * speed` 不能超过素材时长。\n' +
  '- 改动后请运行 `validate`，再回到工作台点击「同步文件夹」或在应用内导出 MP4。\n';
const README_TEXT = (p) => '# ' + (p.title || 'Motion 工程') + '\n\n开放工程文件夹。双击 `composition.html` 可查看页面结构；用 `tools/motion-mep.mjs` 执行 MEP 工单。\n\n- `motion.json`：可编辑工程\n- `assets/`：素材\n- `orders/`：工单与执行记录\n';
async function exportWorkspace(p, options) {
  const folder = path.join(options.data, 'motion-workspaces', p.id);
  const assetsDir = path.join(folder, 'assets');
  await fs.mkdir(assetsDir, { recursive: true });
  const assets = [];
  for (const asset of p.assets) {
    const ext = path.extname(asset.path || asset.name || '');
    const base = String(asset.name || 'asset' + ext).replace(/[\/\\:*?"<>|]/g, '_');
    let file = base;
    if (assets.some(row => row.file === 'assets/' + file)) file = asset.id + '-' + base;
    await fs.copyFile(asset.path, path.join(assetsDir, file));
    assets.push({ id: asset.id, name: asset.name || base, kind: asset.kind, duration: asset.duration, hasAudio: !!asset.hasAudio, file: 'assets/' + file });
  }
  const workspace = { format: 'adudir-motion-project', specVersion: '2.0.0', project: { id: p.id, name: p.title }, ...p, assets };
  delete workspace.previewUrls; delete workspace.renders;
  await writeJson(path.join(folder, 'motion.json'), workspace);
  await writeText(path.join(folder, 'composition.html'), buildComposition(p, assets));
  await writeText(path.join(folder, 'SKILL.md'), SKILL_TEXT(p));
  await writeText(path.join(folder, 'README.md'), README_TEXT(p));
  await writeJson(path.join(folder, 'orders', 'example.json'), MEP_EXAMPLE);
  const tools = path.join(folder, 'tools');
  await fs.rm(tools, { recursive: true, force: true });
  await fs.mkdir(tools, { recursive: true });
  await fs.copyFile(path.join(__dirname, '../media_desk/src/motion-mep.js'), path.join(tools, 'mep-core.mjs'));
  await fs.copyFile(path.join(__dirname, 'motion-mep.mjs'), path.join(tools, 'motion-mep.mjs'));
  return { folder, assets: assets.length, clips: p.clips.length };
}
async function importWorkspace(request, options, helpers) {
  let folder = request.folder;
  if (!folder) {
    const result = await options.dialog.showOpenDialog(options.win, { title: '选择 .motion 工程文件夹', properties: ['openDirectory'] });
    if (result.canceled || !result.filePaths?.[0]) throw Error('已取消导入');
    folder = result.filePaths[0];
  }
  folder = path.resolve(String(folder));
  const manifest = JSON.parse(await fs.readFile(path.join(folder, 'motion.json'), 'utf8'));
  const id = randomUUID(), dir = path.join(options.data, 'motion-editor', id);
  await fs.mkdir(dir, { recursive: true });
  const map = new Map(), assets = [];
  for (const asset of manifest.assets || []) {
    if (!asset.file) continue;
    const source = path.resolve(folder, asset.file);
    if (!source.startsWith(folder + path.sep)) throw Error('素材路径越界');
    const newId = randomUUID(), destination = path.join(dir, newId + path.extname(asset.file));
    await fs.copyFile(source, destination);
    const next = { id: newId, name: asset.name || path.basename(asset.file), kind: asset.kind || 'image', duration: Number(asset.duration) || 5, hasAudio: !!asset.hasAudio, path: destination };
    try { if (next.kind === 'audio' && next.hasAudio) Object.assign(next, await waveform(next, options)); } catch {}
    map.set(asset.id, newId);
    assets.push(next);
  }
  const clips = (manifest.clips || []).filter(clip => !clip.assetId || map.has(clip.assetId)).map(clip => ({ ...clip, id: randomUUID(), ...(clip.assetId ? { assetId: map.get(clip.assetId) } : {}) }));
  if (!clips.length) throw Error('工程里没有可用片段');
  const project = { ...manifest, id, revision: 0, title: manifest.project?.name || manifest.title || '导入工程', assets, clips };
  delete project.format; delete project.specVersion; delete project.project;
  helpers.validateEditor(project);
  atomic(path.join(dir, 'project.json'), project);
  return publicProject(project);
}
const publicProject = previewProject;
module.exports = async (request, options) => {
  const root = path.join(options.data,'motion-editor');
  const helpers = await import(pathToFileURL(path.join(__dirname,'../media_desk/src/motion-editor.js')).href);
  if(request.action==='motion-editor-voices')return JSON.parse(await speech('voices',options));
  if(request.action==='motion-editor-list') {
    await fs.mkdir(root,{recursive:true});const rows=[];
    for(const entry of await fs.readdir(root)){if(!safe(entry))continue;try{const p=JSON.parse(await fs.readFile(path.join(root,entry,'project.json'),'utf8'));rows.push({id:p.id,title:p.title,revision:p.revision})}catch{}}
    return {rows:rows.reverse()};
  }
  if(request.action === 'motion-editor-import-workspace') return importWorkspace(request, options, helpers);
  if(request.action === 'motion-editor-create') {
    const id=randomUUID(), dir=path.join(root,id);
    await fs.mkdir(dir,{recursive:true});
    const p={id,revision:0,title:'未命名制作',width:1280,height:720,fps:30,duration:30,background:'#080d15',assets:[],clips:[]};
    atomic(path.join(dir,'project.json'),p);return publicProject(p);
  }
  if(!safe(request.id))throw Error('工程不存在');
  const dir=path.join(root,request.id),file=path.join(dir,'project.json');
  // Serialize project mutations, including dialogs, to preserve optimistic revisions.
  const previous=locks.get(request.id)||Promise.resolve();let release;
  const next=new Promise(resolve=>{release=resolve});locks.set(request.id,next);await previous;
  try {
    const p=JSON.parse(await fs.readFile(file,'utf8'));
    if(request.action==='motion-editor-export-workspace')return exportWorkspace(p,options);
    if(request.action==='motion-editor-open-workspace'){
      const folder=path.resolve(String(request.folder||path.join(options.data,'motion-workspaces',p.id)));
      try{const {shell}=require('electron');const error=await shell.openPath(folder);return {opened:!error,folder,error}}catch(error){return {opened:false,folder,error:error.message}}
    }
    if(['motion-editor-template-start','motion-editor-template-attach'].includes(request.action)){const value=await require('./motion-editor-template.cjs')(request,p,dir,options,run,helpers);return request.action==='motion-editor-template-attach'?publicProject(value):value}
    if(['motion-editor-music','motion-editor-subtitles'].includes(request.action)){
      const audioTools=require('./motion-audio.cjs');
      const updated=await (request.action==='motion-editor-music'?audioTools.addMusic(p,dir,options,request,run,waveform):audioTools.transcribe(p,dir,options,request,run));
      helpers.validateEditor(updated);updated.revision=p.revision+1;
      atomic(path.join(dir,'revision-'+p.revision+'.json'),p);atomic(file,updated);return publicProject(updated);
    }
    if(request.action==='motion-editor-thumbnails'){const assets=[];for(const asset of p.assets)assets.push(await require('./motion-filmstrip.cjs')(asset,dir,options,run));const updated={...p,revision:p.revision+1,assets};atomic(file,updated);return publicProject(updated)}
    if(request.action==='motion-editor-waveforms'){
      const assets=[];for(const asset of p.assets)assets.push(await waveform(asset,options));
      const updated={...p,revision:p.revision+1,assets};atomic(file,updated);return publicProject(updated);
    }
    if(request.action==='motion-editor-analyze-video')return require('./motion-video-analysis.cjs')(p,dir,options,{allowFrames:request.allowFrames===true});
    if (request.action === 'motion-editor-copy-project') {
      const id = randomUUID(), target = path.join(root, id);
      await fs.mkdir(target);
      try {
        const assets = [];
        for (const {filmstripPath, ...asset} of p.assets) {
          const destination = path.join(target, asset.id + path.extname(asset.path));
          await fs.copyFile(asset.path, destination);
          assets.push({...asset,path:destination});
        }
        const copy = {...p,id,revision:0,title:p.title+' · 副本',assets};
        helpers.validateEditor(copy);
        atomic(path.join(target,'project.json'),copy);
        return publicProject(copy);
      } catch (error) {
        await fs.rm(target,{force:true,recursive:true});
        throw error;
      }
    }
    if(request.action==='motion-editor-fork-video') {
      const id=randomUUID(),newDir=path.join(root,id);await fs.mkdir(newDir);
      const assets=[];for(const asset of p.assets.filter(a=>a.kind==='video'||a.kind==='audio')){const destination=path.join(newDir,asset.id+path.extname(asset.path));await fs.copyFile(asset.path,destination);assets.push({...asset,path:destination})}
      const fork={...p,id,revision:0,title:'Vlog · 导入视频剪辑',script:'',notes:'',sourceItemId:null,editTarget:'video',allowVideoFrames:request.allowFrames===true,assets,clips:p.clips.filter(c=>assets.some(a=>a.id===c.assetId))};
      atomic(path.join(newDir,'project.json'),fork);return publicProject(fork);
    }
    if(request.action==='motion-editor-source') {
      const state=JSON.parse(await fs.readFile(path.join(options.data,'dsh/media-desk/state.json'),'utf8'));
      const script=String(request.script||p.script||'').trim();
      const item=request.itemId?state.items.find(i=>i.id===request.itemId):state.items.find(i=>script&&i.production?.article?.trim()===script);
      if(!item)return publicProject(p);
      const production=item.production||{},candidates=[{...production.cover,label:'封面'},...(production.images||[]).map(x=>({...x,label:x.caption||'正文配图'})),...(production.shots||[]).map(x=>({...x,label:x.visual||'分镜素材'}))];
      const added=[];
      for(const candidate of candidates){
        const match=/^media-desk\/files\/([\w-]+\.(?:png|jpg|jpeg|webp))$/i.exec(candidate.src||'');
        if(!match||p.assets.some(a=>a.sourceFile===match[1]))continue;
        const original=path.join(options.data,'dsh/media-desk/files',match[1]);
        try {await fs.access(original)}catch{continue}
        const id=randomUUID(),destination=path.join(dir,id+path.extname(match[1]));await fs.copyFile(original,destination);
        added.push({id,name:candidate.label.slice(0,80),kind:'image',duration:p.duration,hasAudio:false,path:destination,sourceFile:match[1]});
      }
      if(!added.length&&p.sourceItemId===item.id)return publicProject(p);
      const updated={...p,sourceItemId:item.id,revision:p.revision+1,assets:[...p.assets,...added]};atomic(file,updated);return publicProject(updated);
    }
    if(request.action==='motion-editor-speech') {
      const text=String(request.text||'').replace(/[#*_`]/g,'').trim();
      if(!text||text.length>10000)throw Error('请提供不超过 10000 字的配音文案');
      const assetId=randomUUID(),inputPath=path.join(dir,assetId+'.json'),outputPath=path.join(dir,assetId+'.wav');
      atomic(inputPath,{voice:String(request.voice||''),text});
      await speech('speak',options,inputPath,outputPath);
      const probe=JSON.parse(await run(path.join(options.ffmpegBin,process.platform==='win32'?'ffprobe.exe':'ffprobe'),['-v','error','-show_format','-of','json',outputPath],options));
      const duration=Number(probe.format.duration);if(!Number.isFinite(duration)||duration>600)throw Error('配音超出十分钟，请缩短文案');
      const asset={id:assetId,path:outputPath,name:'本期文案配音.wav',kind:'audio',duration,hasAudio:true};
      const edited={...p,revision:p.revision+1,duration:Math.max(p.duration,duration),assets:[...p.assets,asset],clips:[...p.clips,{id:randomUUID(),type:'audio',title:'本期文案配音',assetId,start:0,duration,inPoint:0,volume:1,layer:0}]};
      helpers.validateEditor(edited);atomic(file,edited);return publicProject(edited);
    }
    if(request.action==='motion-editor-read') {
      const renders=[];
      for(const name of await fs.readdir(dir)){if(!safe(name))continue;try{const metadata=path.join(dir,name,'status.json'),s=JSON.parse(await fs.readFile(metadata,'utf8'));if(s.state==='rendering'&&!active.has(name)){s.state='failed';s.error='上次导出被中断，可重新导出'}renders.push({...s,updatedAt:(await fs.stat(metadata)).mtimeMs})}catch{}}
      return {...await publicProject(p),renders:renders.sort((a,b)=>b.updatedAt-a.updatedAt)};
    }
    if(request.action==='motion-editor-asset') {
      const asset=p.assets.find(a=>a.id===request.assetId);if(!asset)throw Error('素材不存在');return {path:asset.path};
    }
    if(request.action==='motion-editor-save') {
      if(request.project?.revision!==p.revision)throw Error('工程已在另一处更新，请重新打开后再编辑');
      const {previewUrls,renders,...incoming}=request.project;
      const edited={...incoming,id:p.id,assets:p.assets,revision:p.revision+1};
      helpers.validateEditor(edited);
      atomic(path.join(dir,'revision-'+p.revision+'.json'),p);atomic(file,edited);return publicProject(edited);
    }
    if(request.action==='motion-editor-import') {
      const result=options.upload ? {filePaths:[options.upload]} : await options.dialog.showOpenDialog(options.win,{title:'添加视频、图片、音频或 SRT 字幕',properties:['openFile','multiSelections'],filters:[{name:'剪辑素材',extensions:['mp4','mov','webm','mkv','png','jpg','jpeg','webp','gif','mp3','wav','m4a','aac','srt']}]});
      if(result.canceled)return publicProject(p);
      const replace = request.replace && p.clips.find(clip=>clip.id===request.replace);
      if (request.replace && (!replace || !options.upload || !['image','video'].includes(replace.type))) throw Error('找不到可替换的画面片段');
      const replacing = replace ? p.clips.filter(clip=>clip.id===replace.id || (replace.linkId && clip.linkId===replace.linkId && clip.assetId===replace.assetId)) : [];
      if (replacing.some(clip=>p.tracks?.some(track=>track.id===(clip.trackId||'video-main') && track.locked))) throw Error('请先解锁轨道再替换素材');
      const assets=[],clips=[];let duration=p.clips.length?p.duration:1;
      let videoCursor=Math.max(0,...p.clips.filter(c=>c.type==='video'&&(!c.trackId||c.trackId==='video-main')).map(c=>c.start+c.duration));
      for(const source of result.filePaths){
        const ext=path.extname(source).toLowerCase();
        if(replace && ext==='.srt')throw Error('请选择与当前片段同类型的素材');
        if(ext==='.srt'){
          const content=await fs.readFile(source,'utf8');
          const seconds=stamp=>stamp.split(':').reduce((n,s)=>n*60+Number(s.replace(',','.')),0);
          for(const block of content.replace(/\r/g,'').split(/\n\s*\n/)){
            const lines=block.split('\n'),index=lines.findIndex(line=>line.includes('-->'));
            if(index<0)continue;const match=lines[index].match(/(\d\d:\d\d:\d\d[,.]\d{3})\s*-->\s*(\d\d:\d\d:\d\d[,.]\d{3})/);
            if(!match)throw Error('字幕时间码无效');const start=seconds(match[1]),end=seconds(match[2]);
            if(end<=start||end>600)throw Error('字幕时长超出范围');
            duration=Math.max(duration,end);clips.push({id:randomUUID(),type:'text',title:'字幕',text:lines.slice(index+1).join('\n').replace(/<[^>]*>/g,''),start,duration:end-start,x:60,y:p.height-110,width:p.width-120,fontSize:36,layer:20});
          }continue;
        }
        const kind=['.png','.jpg','.jpeg','.webp','.gif'].includes(ext)?'image':['.mp3','.wav','.m4a','.aac'].includes(ext)?'audio':'video';
        let length=5,hasAudio=kind==='audio';
        if(kind!=='image'){
          const probe=JSON.parse(await run(path.join(options.ffmpegBin,process.platform==='win32'?'ffprobe.exe':'ffprobe'),['-v','error','-show_format','-show_streams','-of','json',source],options));
          length=Number(probe.format?.duration);hasAudio=probe.streams.some(s=>s.codec_type==='audio');
          if(!Number.isFinite(length)||length<=0)throw Error('无法读取素材时长');
        }
        if (replace && kind==='image') length=Math.max(length,(replace.inPoint||0)+replace.duration*(replace.speed||1));
        if (replace && (kind!==replace.type || replacing.some(clip=>(clip.inPoint||0)+clip.duration*(clip.speed||1)>length+.05 || (clip.type==='audio' && !hasAudio)))) throw Error('替换素材的类型、时长或音轨与当前片段不匹配');
        const id=randomUUID(),destination=path.join(dir,id+ext);await fs.copyFile(source,destination);
        let asset={id,name:path.basename(source),kind,duration:length,hasAudio,path:destination};
        try{asset=await waveform(asset,options)}catch{}
        if(kind==='video' && !options.upload)try{asset=await require('./motion-filmstrip.cjs')(asset,dir,options,run)}catch{}
        assets.push(asset);
        if (replace) continue;
        const start=kind==='video'?videoCursor:0,clipDuration=Math.min(600-start,length);
        if(clipDuration>0){clips.push({id:randomUUID(),assetId:id,type:kind,title:path.basename(source),start,duration:clipDuration,inPoint:0,volume:1,x:0,y:0,width:p.width,height:p.height,layer:kind==='audio'?0:5,trackId:kind==='audio'?'audio-music':'video-main'});duration=Math.max(duration,start+clipDuration)}
        if(kind==='video')videoCursor+=Math.max(0,clipDuration);
      }
      const edited=helpers.normalizeTimeline({...p,revision:p.revision+1,duration,assets:[...p.assets,...assets],clips:replace?p.clips.map(clip=>replacing.includes(clip)?{...clip,assetId:assets[0].id}:clip):[...p.clips,...clips],...(!replace && assets.some(a=>a.kind==='video')?{editTarget:'video',allowVideoFrames:false}:{})});helpers.validateEditor(edited);atomic(file,edited);return publicProject(edited);
    }
    if(request.action==='motion-editor-status') {
      if(!safe(request.renderId))throw Error('导出任务不存在');
      const metadata=path.join(dir,request.renderId,'status.json');const status=JSON.parse(await fs.readFile(metadata,'utf8'));
      if(status.state==='rendering'&&!active.has(request.renderId))return {...status,state:'failed',error:'上次导出被中断，可重新导出'};
      return status;
    }
    if(request.action==='motion-editor-render') {
      helpers.validateEditor(p);if(!p.clips.length)throw Error('请先添加动画或素材');
      const id=randomUUID(),outputDir=path.join(dir,id);await fs.mkdir(outputDir);
      atomic(path.join(outputDir,'snapshot.json'),p);atomic(path.join(outputDir,'status.json'),{id,state:'rendering',progress:0,revision:p.revision});active.add(id);
      const env={...process.env,ELECTRON_RUN_AS_NODE:'1'};for(const key of Object.keys(env))if(/KEY|TOKEN|SECRET|PASSWORD/i.test(key))delete env[key];
      run(process.execPath,[path.join(__dirname,'motion-editor-render.mjs'),outputDir,options.data,options.ffmpegBin],options,{env,timeout:3600000})
        .catch(async error=>{let status;try{status=JSON.parse(await fs.readFile(path.join(outputDir,'status.json'),'utf8'))}catch{};if(status?.state!=='failed')atomic(path.join(outputDir,'status.json'),{id,state:'failed',error:error.message,revision:p.revision})})
        .finally(()=>active.delete(id));
      return {id,state:'rendering',progress:0,revision:p.revision};
    }
    throw Error('不支持的剪辑操作');
  } finally {release();if(locks.get(request.id)===next)locks.delete(request.id)}
};
