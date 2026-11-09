const fs = require('node:fs');
const path = require('node:path');
module.exports = async ({data, canvasCookie, clipPort}) => {
  const rows = [], warnings = [];
  const get = async (base, route, cookie) => { const r = await fetch(base + route, {headers: cookie ? {cookie: 'open_ai_canvas_session=' + cookie} : {}, signal: AbortSignal.timeout(15000)}); if (!r.ok) throw new Error(String(r.status)); const value = await r.json(); return value.data || value; };
  const texts = obj => { if (!obj || typeof obj !== 'object') return []; return Object.entries(obj).flatMap(([k,v]) => /password|token|secret|api.?key|base64/i.test(k) ? [] : typeof v === 'string' ? /text|prompt|title|name|description|content|script|summary|caption|transcript/i.test(k) ? [v.slice(0,10000)] : [] : typeof v === 'object' ? texts(v) : []); };
  const add = (id, title, category, value, view) => rows.push({id, title, category, text: texts(value).join('\n').slice(0,60000), target: {view}});
  const base = 'http://127.0.0.1:18081/api';
  for (const [route, key, category] of [['/projects','projects','影策项目'],['/canvas-projects','projects','影策画布']]) {
    try { const response = await get(base,route,canvasCookie); const list = Array.isArray(response) ? response : response[key] || response.items || []; for (const row of list) { const id = row.id || row.ID; if (!id) continue; const detail = await get(base,route + '/' + encodeURIComponent(id),canvasCookie); add(route + ':' + id, row.name || row.title || '影策资料',category,detail,'drama'); } } catch { warnings.push(category + '暂时未能同步，稍后重试'); }
  }
  try { let page = 1; while (true) { const response = await get('http://127.0.0.1:' + clipPort,'/api/v1/projects/?page=' + page + '&size=100'); const list = response.projects || response.items || []; for (const row of list) add('clip:' + row.id,row.name || '剪辑项目','剪辑成果', await get('http://127.0.0.1:' + clipPort,'/api/v1/projects/' + encodeURIComponent(row.id)),'autoclip'); if (list.length < 100) break; page++; } } catch { warnings.push('剪辑资料暂时未能同步，稍后重试'); }
  const file = path.join(data,'local-assets.json'); if(fs.existsSync(file)) { const index=JSON.parse(fs.readFileSync(file,'utf8')); for(const row of (Array.isArray(index)?index:index.items || index.files || [])) add('local:' + row.id,row.title || row.name,'本地素材索引',{name:row.title || row.name,description:row.path},'drama'); }
  return {sources:rows,warnings};
};
