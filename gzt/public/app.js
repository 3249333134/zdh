let meta = null, dashboard = null, routines = [], outputs = [], knowledge = [];
let route = location.hash.replace('#','') || 'w1';

const $ = id => document.getElementById(id);
function esc(s){return String(s ?? '').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
async function api(path, options={}) {
  const res = await fetch(path,{headers:{'content-type':'application/json'},...options,body:options.body?JSON.stringify(options.body):undefined});
  return res.json();
}
function badge(status,label){return `<span class="badge b-${esc(status)}">${esc(label||status)}</span>`}
function statusLabel(s){return meta?.statusLabels?.[s]||s}

async function loadAll(){
  [meta,dashboard,routines,outputs,knowledge] = await Promise.all([
    api('/api/meta'),api('/api/dashboard'),api('/api/routines'),api('/api/routine-outputs'),api('/api/knowledge')
  ]);
  render();
}
function renderNav(){
  $('nav').innerHTML = meta.workbenches.map(w=>`<button class="tab ${w.id===route?'on':''}" data-id="${w.id}">${esc(w.name)}</button>`).join('');
  document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{route=b.dataset.id;location.hash=route;render()});
}
function progressBar(d){return `<div class="bar"><i style="width:${d.percent}%"></i></div><span>${d.progress.done}/${d.progress.total}</span>`}
function dispatchActions(d){
  if (d.status==='pending_acceptance') return `<button class="btn ok" onclick="decision('${d.id}','accept')">验收通过</button><button class="btn danger" onclick="decision('${d.id}','reject')">退回</button>`;
  if (d.status==='completed') return `<span class="hint">已归档</span>`;
  return `<button class="btn primary" onclick="submitDispatch('${d.id}')">提交当前阶段</button>`;
}
function renderCockpit(){
  const c = dashboard.counts;
  const rows = dashboard.dispatches.map(d=>`<tr>
    <td>${esc(d.id)}</td><td>${esc(d.workbenchName)}</td><td>${esc(d.title)}</td><td>${esc(d.currentNode)}</td>
    <td>${esc(d.assigneeName)}</td><td>${esc(d.dueAt)}</td><td>${badge(d.status,d.statusLabel)}</td>
    <td>${progressBar(d)}</td><td>${dispatchActions(d)}</td></tr>`).join('');
  const routineRows = routines.map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(meta.workbenches.find(w=>w.id===r.workbenchId)?.name||r.workbenchId)}</td><td>${esc(r.schedule.at||'')}</td><td>${badge(r.lastStatus,r.lastStatus)}</td><td>${esc(r.lastAt||'未运行')}</td><td><button class="btn" onclick="runRoutine('${r.id}')">手动运行</button></td></tr>`).join('');
  $('view').innerHTML = `
    <div class="kpis">
      <div class="kpi"><b>${c.total}</b><span>派单总数</span></div>
      <div class="kpi"><b>${c.byStatus.in_progress||0}</b><span>进行中</span></div>
      <div class="kpi"><b>${c.pendingAcceptance}</b><span>待验收</span></div>
      <div class="kpi"><b>${c.blocked}</b><span>阻塞</span></div>
      <div class="kpi"><b>${c.routinePending}</b><span>定时草稿待查看</span></div>
    </div>
    <div class="card"><h3>派单进度总控 <span class="hint">按工作台、状态、负责人与节点聚合；操作需人工确认</span></h3>
      <table><thead><tr><th>单号</th><th>工作台</th><th>任务</th><th>当前节点</th><th>负责人</th><th>期限</th><th>状态</th><th>进度</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table>
    </div>
    <div class="card"><h3>定时任务总览 <span class="hint">运行结果进入待查看队列，不自动生效</span></h3>
      <table><thead><tr><th>任务</th><th>归属台</th><th>时间</th><th>状态</th><th>上次运行</th><th>操作</th></tr></thead><tbody>${routineRows}</tbody></table>
    </div>`;
}
function outputActions(o){
  if(o.status==='pending') return `<button class="btn ok" onclick="outputDecision('${o.id}','adopted')">采用</button><button class="btn" onclick="outputDecision('${o.id}','ignored')">忽略</button>`;
  return badge(o.status,o.status);
}
function renderBench(){
  const w = meta.workbenches.find(x=>x.id===route);
  const todos = dashboard.dispatches.filter(d=>d.targetWorkbenchId===route);
  const items = outputs.filter(o=>o.workbenchId===route);
  $('view').innerHTML = `
    <div class="card"><h3>${esc(w.name)} <span class="hint">${esc(w.layer)} · ${esc(w.role)} · ${esc(w.flowId)}</span></h3><div>${esc(w.desc)}</div></div>
    <div class="grid2">
      <div>
        <div class="card"><h3>派单待办 <span class="hint">来自管理台；提交后进度同步驾驶舱</span></h3><div class="list">
          ${todos.length?todos.map(d=>`<div class="row"><div class="row-top"><div><div class="row-title">${esc(d.title)}</div><div class="row-meta">${esc(d.id)} · ${esc(d.currentNode)} · 期限 ${esc(d.dueAt)}</div></div>${badge(d.status,d.statusLabel)}</div><div class="row-meta">交付要求：${(d.acceptance||[]).join('；')}</div><div class="row-actions" style="margin-top:8px">${dispatchActions(d)}</div></div>`).join(''):'<div class="hint">当前无派单待办</div>'}
        </div></div>
        <div class="card"><h3>今日 AI 定时汇总 <span class="hint">草稿待人工查看，不自动提交</span></h3><div class="list">
          ${items.length?items.map(o=>`<div class="row"><div class="row-top"><div><div class="row-title">${esc(o.title)}</div><div class="row-meta">${esc(o.generatedAt)} · 来源 ${o.sources.length} 条</div><div class="row-meta">${esc(o.summary)}</div></div>${outputActions(o)}</div></div>`).join(''):'<div class="hint">暂无待查看汇总</div>'}
        </div></div>
      </div>
      <div>
        <div class="card"><h3>问答</h3><div class="ask"><input id="askInput" placeholder="输入任务问题或知识问题"><button class="btn primary" onclick="ask()">提问</button></div><div id="answer" class="answer hint">问答为只读草稿；正式回答需经 DSH 上下文与来源校验。</div></div>
        <div class="card"><h3>其他功能 · 插件</h3><div class="plugins">${w.plugins.map(p=>`<div class="plugin">${esc(p)}</div>`).join('')}</div></div>
        <div class="card"><h3>全员公开知识 <span class="hint">候选内容仍需审核发布</span></h3>${knowledge.map(k=>`<div class="kb-item"><div class="kb-title">${esc(k.title)}</div><div class="kb-sum">${esc(k.summary)}</div></div>`).join('')}</div>
      </div>
    </div>`;
}
function render(){renderNav(); if(route==='w1')renderCockpit();else renderBench();}
async function submitDispatch(id){await api(`/api/dispatch/${id}/submit`,{method:'POST',body:{note:'提交当前阶段成果'}});await loadAll();}
async function decision(id,action){const reason=action==='reject'?prompt('退回原因：')||'需要补充材料':'';await api(`/api/dispatch/${id}/decision`,{method:'POST',body:{action,reason,actorName:'主管'}});await loadAll();}
async function runRoutine(id){await api(`/api/routines/${id}/run`,{method:'POST'});await loadAll();}
async function outputDecision(id,action){await api(`/api/routine-outputs/${id}/decision`,{method:'POST',body:{action,actorName:'本人'}});await loadAll();}
async function ask(){const q=$('askInput').value.trim();if(!q)return;const a=await api('/api/assistant',{method:'POST',body:{workbenchId:route,question:q}});$('answer').innerHTML=`<b>草稿回答：</b>${esc(a.answer)}<div class="hint">来源：${a.sources.map(s=>s.title).join('、')||'无命中'}；需人工确认后使用。</div>`;}
window.addEventListener('hashchange',()=>{route=location.hash.replace('#','')||'w1';render()});
loadAll();
