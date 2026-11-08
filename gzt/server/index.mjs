import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname,join,normalize} from 'node:path';
import {JsonStore,timestamp} from './store.mjs';
import {DshAdapter} from './dsh-adapter.mjs';
import {RoutineScheduler} from './scheduler.mjs';

const PORT = Number(process.env.PORT || 3123);
const PUBLIC_DIR = join(process.cwd(), 'public');
const DB_FILE = join(process.cwd(), 'data', 'db.json');

const store = new JsonStore(DB_FILE);
await store.init();
const adapter = new DshAdapter({sourceRoot:process.env.DSH_SOURCE_ROOT});
const scheduler = new RoutineScheduler(store, adapter);
if (process.env.RUN_SCHEDULER !== 'false') scheduler.start();

const MIME = {'.html':'text/html;charset=utf-8','.css':'text/css;charset=utf-8','.js':'text/javascript;charset=utf-8','.json':'application/json;charset=utf-8','.svg':'image/svg+xml'};
const STATUS = {draft:'草稿待确认',dispatched:'已派单',in_progress:'进行中',pending_acceptance:'待验收',completed:'已完成',returned:'已退回',blocked:'阻塞',cancelled:'已取消'};

function send(res,status,data,headers={}) {
  res.writeHead(status,{'content-type':'application/json;charset=utf-8',...headers});
  res.end(JSON.stringify(data,null,2));
}
async function readBody(req) {
  let raw='';
  for await (const chunk of req) raw += chunk;
  if (!raw.trim()) return {};
  try { return JSON.parse(raw); } catch { throw new Error('请求体不是合法 JSON'); }
}
function workbench(id) { return store.find('workbenches', id); }

function dispatchSummary(d) {
  const w = workbench(d.targetWorkbenchId) || {};
  return {...d,workbenchName:w.name,workbenchLayer:w.layer,statusLabel:STATUS[d.status]||d.status,percent:Math.round((d.progress?.done||0)/(d.progress?.total||1)*100)};
}

async function handleApi(req,res,url) {
  const p = url.pathname;
  if (p === '/api/meta' && req.method === 'GET') return send(res,200,{workbenches:store.list('workbenches'),statusLabels:STATUS,aiBoundary:'AI 只输出待确认草稿；不审批、不改账、不发布、不外发。'});
  if (p === '/api/dashboard' && req.method === 'GET') {
    const list = store.list('dispatches').map(dispatchSummary);
    const byStatus = Object.fromEntries(Object.keys(STATUS).map(k=>[k,list.filter(d=>d.status===k).length]));
    return send(res,200,{
      counts:{total:list.length,byStatus,blocked:list.filter(d=>d.status==='blocked').length,pendingAcceptance:list.filter(d=>d.status==='pending_acceptance').length,routinePending:store.list('routineOutputs').filter(o=>o.status==='pending').length},
      workbenches:store.list('workbenches').map(w=>({...w,active:list.filter(d=>d.targetWorkbenchId===w.id).length})),
      dispatches:list
    });
  }
  if (p === '/api/dispatch' && req.method === 'GET') {
    const wb = url.searchParams.get('workbenchId'); const status = url.searchParams.get('status');
    let list = store.list('dispatches').map(dispatchSummary);
    if (wb) list = list.filter(d=>d.targetWorkbenchId===wb);
    if (status) list = list.filter(d=>d.status===status);
    return send(res,200,list);
  }
  if (p === '/api/dispatch' && req.method === 'POST') {
    const body = await readBody(req);
    if (!body.title || !body.targetWorkbenchId) return send(res,400,{error:'缺少 title 或 targetWorkbenchId'});
    if (!workbench(body.targetWorkbenchId)) return send(res,400,{error:'目标工作台不存在'});
    const id = `D-${String(store.list('dispatches').length + 1001)}`;
    const item = {id,title:body.title,goal:body.goal||'',targetWorkbenchId:body.targetWorkbenchId,flowId:body.flowId||workbench(body.targetWorkbenchId).flowId,assigneeName:body.assigneeName||'待分配',priority:body.priority||'medium',dueAt:body.dueAt||'',status:'dispatched',progress:{done:1,total:body.totalSteps||4},currentNode:'待接收',acceptance:body.acceptance||[],materials:body.materials||[],history:[{at:timestamp(),actor:body.actorName||'主管',action:'created',note:'通过管理台创建派单'}]};
    store.put('dispatches',item); store.audit('manager','dispatch.create',id,item);
    return send(res,201,dispatchSummary(item));
  }
  const detailMatch = p.match(/^\/api\/dispatch\/([^/]+)$/);
  if (detailMatch && req.method === 'GET') { const d=store.find('dispatches',detailMatch[1]); if(!d) return send(res,404,{error:'派单不存在'}); return send(res,200,dispatchSummary(d)); }
  const submitMatch = p.match(/^\/api\/dispatch\/([^/]+)\/submit$/);
  if (submitMatch && req.method === 'POST') {
    const body=await readBody(req);
    const d=store.find('dispatches',submitMatch[1]); if(!d) return send(res,404,{error:'派单不存在'});
    if (!['dispatched','in_progress','returned'].includes(d.status)) return send(res,409,{error:`当前状态 ${STATUS[d.status]} 不能提交`});
    d.progress.done = Math.min(d.progress.total, d.progress.done + 1);
    if (d.progress.done >= d.progress.total) { d.status='pending_acceptance'; d.currentNode='待验收'; }
    else { d.status='in_progress'; d.currentNode = body.nextNode || `${d.progress.done}/${d.progress.total} 节点完成`; }
    d.history.push({at:timestamp(),actor:'执行人',action:'submitted',note:body.note||'提交当前阶段成果'});
    store.put('dispatches',d); store.audit('executor','dispatch.submit',d.id,{progress:d.progress});
    return send(res,200,dispatchSummary(d));
  }
  const decisionMatch = p.match(/^\/api\/dispatch\/([^/]+)\/decision$/);
  if (decisionMatch && req.method === 'POST') {
    const body = await readBody(req); const d=store.find('dispatches',decisionMatch[1]); if(!d) return send(res,404,{error:'派单不存在'});
    if (body.action==='accept') { d.status='completed'; d.currentNode='已归档'; }
    else if (body.action==='reject') { d.status='returned'; d.currentNode='退回修改'; }
    else return send(res,400,{error:'action 仅支持 accept / reject'});
    d.history.push({at:timestamp(),actor:body.actorName||'主管',action:body.action,note:body.reason||''});
    store.put('dispatches',d); store.audit('manager','dispatch.decision',d.id,body);
    return send(res,200,dispatchSummary(d));
  }
  if (p === '/api/routines' && req.method === 'GET') return send(res,200,store.list('routines'));
  if (p === '/api/routines' && req.method === 'POST') {
    const body=await readBody(req); if(!body.name||!workbench(body.workbenchId)) return send(res,400,{error:'名称或工作台无效'});
    const job={id:`R-custom-${Date.now()}`,name:body.name,workbenchId:body.workbenchId,enabled:body.enabled!==false,schedule:body.schedule||{type:'daily',at:'09:00'},jobType:body.jobType||'draft',dataScope:body.dataScope||'board',outputKind:body.outputKind||'summaryDraft',lastStatus:'new',nextAt:new Date().toISOString(),lastAt:'',lastError:'',lastResult:''};
    store.put('routines',job); return send(res,201,job);
  }
  const runMatch = p.match(/^\/api\/routines\/([^/]+)\/run$/);
  if (runMatch && req.method === 'POST') { try { const out=await scheduler.runJob(runMatch[1],{manual:true}); return send(res,201,out);} catch(e){ return send(res,404,{error:e.message}); } }
  if (p === '/api/routine-outputs' && req.method === 'GET') {
    const wb=url.searchParams.get('workbenchId'); let list=store.list('routineOutputs'); if(wb)list=list.filter(o=>o.workbenchId===wb); return send(res,200,list);
  }
  const outputDecisionMatch = p.match(/^\/api\/routine-outputs\/([^/]+)\/decision$/);
  if (outputDecisionMatch && req.method === 'POST') {
    const body=await readBody(req); const o=store.find('routineOutputs',outputDecisionMatch[1]); if(!o) return send(res,404,{error:'汇总不存在'});
    if (!['adopted','ignored','dispatched_candidate'].includes(body.action)) return send(res,400,{error:'action 不支持'});
    o.status=body.action; o.decision={by:body.actorName||'本人',at:timestamp(),action:body.action,note:body.reason||''};
    store.put('routineOutputs',o); store.audit('executor','routineOutput.decision',o.id,body);
    return send(res,200,o);
  }
  if (p === '/api/knowledge' && req.method === 'GET') return send(res,200,store.list('knowledge'));
  if (p === '/api/assistant' && req.method === 'POST') {
    const body=await readBody(req);
    const sources=store.list('knowledge').filter(k=>(k.title+k.summary).includes((body.question||'').slice(0,8)));
    const answer=await adapter.ask({workbenchId:body.workbenchId,question:body.question,sources});
    return send(res,200,answer);
  }
  return send(res,404,{error:'接口不存在',path:p});
}

async function serveStatic(res,url) {
  let rel = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = normalize(join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) return send(res,403,{error:'禁止访问'});
  try { const data=await readFile(file); res.writeHead(200,{'content-type':MIME[extname(file)]||'application/octet-stream'}); res.end(data); }
  catch { res.writeHead(404,{'content-type':'text/plain;charset=utf-8'}); res.end('页面不存在'); }
}

const server = http.createServer(async (req,res) => {
  const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
  try { if (url.pathname.startsWith('/api/')) await handleApi(req,res,url); else await serveStatic(res,url); }
  catch(e) { console.error(e); send(res,500,{error:e instanceof Error?e.message:'服务内部错误'}); }
});
server.listen(PORT,'127.0.0.1',()=>console.log(`gzt 独立服务已启动：http://127.0.0.1:${PORT}`));
for (const sig of ['SIGINT','SIGTERM']) process.on(sig, async()=>{ scheduler.stop(); server.close(); process.exit(0); });
