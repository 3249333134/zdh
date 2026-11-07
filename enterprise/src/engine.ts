import {randomUUID} from 'node:crypto';
import {DomainError,type Definition,type Version,type Instance,type NodeRun,type FlowNode,type Actor} from './types.ts';
import {createHash} from 'node:crypto';
const fail=(message:string):never=>{throw new DomainError(400,message);};
/** Positions are display metadata; larger canvases do not change execution order. */
export function validateNodePositions(nodes:Definition['nodes']){
  for(const n of nodes)if(n.position&&(!Number.isFinite(n.position.x)||!Number.isFinite(n.position.y)||n.position.x<0||n.position.x>30000||n.position.y<0||n.position.y>16000))fail('节点位置超出画布范围');
}
export function validateDefinition(d:Definition){
  if(!d.name?.trim()||!Array.isArray(d.nodes)||!Array.isArray(d.edges)||d.nodes.length>100||d.edges.length>300)fail('流程名称、节点或连线无效');
  const ids=new Set(d.nodes.map(n=>n.id));
  if(ids.size!==d.nodes.length||d.nodes.filter(n=>n.kind==='start').length!==1||!d.nodes.some(n=>n.kind==='end'))fail('流程必须有唯一起点、至少一个终点，节点编号不能重复');
  const kinds=['start','ai','human','approval','condition','parallel','join','subflow','end'];
  validateNodePositions(d.nodes);
  for(const n of d.nodes){
    if(!kinds.includes(n.kind)||!n.name?.trim())fail('节点类型或名称无效');
    if(n.role&&!['admin','manager','executor','reviewer'].includes(n.role))fail('节点责任岗位无效');
    if(n.fields){if(!Array.isArray(n.fields)||n.fields.length>50||new Set(n.fields.map(f=>f.id)).size!==n.fields.length)fail('节点表单字段重复或过多');for(const f of n.fields)if(!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(f.id)||['constructor','prototype','__proto__'].includes(f.id)||!f.label?.trim()||!['text','textarea','number','date'].includes(f.type))fail('节点表单字段编号、名称或类型无效');}
    if(['human','approval'].includes(n.kind)&&!n.role&&!n.assigneeId)fail(`${n.name}必须指定岗位或人员`);
    if(n.kind==='ai'&&!n.agentId)fail(`${n.name}必须选择数字员工`);
    if(n.kind==='approval'&&(!n.rejectTo||!ids.has(n.rejectTo)||n.rejectTo===n.id))fail(`${n.name}必须选择有效退回节点`);
    if(n.kind==='subflow'&&(!n.subflowId||n.subflowId===d.id))fail('子流程引用无效');
    if(n.kind==='condition'&&(!n.condition?.field||!['equals','notEquals','greater'].includes(n.condition.operator)))fail('条件节点必须配置比较规则');
    if(n.slaHours!==undefined&&(!Number.isFinite(n.slaHours)||n.slaHours<=0||n.slaHours>8760))fail('节点办理时限须为 0 至 8760 小时');
    if(n.commitPlan&&(n.kind!=='approval'||!['admin','manager'].includes(n.role||'')))fail('确认计划必须配置为经理或管理员审批');
    if(n.acceptsDelivery&&n.kind!=='approval')fail('交付验收必须配置为人工审批');
    if(n.commitPlan&&!n.planSourceId)fail('确认计划必须指定上游计划来源');
    if(n.acceptsIntake&&n.kind!=='human')fail('需求复用只能配置在人工受理节点');
    for(const key of ['taskGroup','requiresWiki'] as const)if(n[key]!==undefined&&typeof n[key]!=='boolean')fail('任务组和知识发布配置必须为布尔值');
    if(n.taskGroup&&(n.kind!=='human'||n.taskIndex!==undefined))fail('任务组只能用于人工阶段，不能同时绑定旧任务序号');
    if(n.workAction&&(!['weekly','wiki'].includes(n.workAction)||n.kind!=='ai'))fail('业务产出操作只允许用于 AI 节点');
    if(n.requiresWiki&&n.kind!=='approval')fail('Wiki 发布确认必须是人工审批');
    if(n.taskIndex!==undefined&&(n.kind!=='human'||!Number.isInteger(n.taskIndex)||n.taskIndex<0||n.taskIndex>99))fail('任务序号须为0至99的整数，且只能用于人工任务');
    for(const source of [n.planSourceId,n.condition?.sourceNodeId].filter(Boolean)){if(!ids.has(source!))fail('成果来源节点不存在');const seen=new Set<string>();const back=(id:string)=>{for(const e of d.edges.filter(e=>e.to===id))if(!seen.has(e.from)){seen.add(e.from);back(e.from);}};back(n.id);if(!seen.has(source!))fail('成果来源必须是当前节点的上游');}
    const outgoing=d.edges.filter(e=>e.from===n.id);
    if(n.kind==='end'&&outgoing.length)fail('终点不能有后续节点');
    if(n.kind!=='end'&&!outgoing.length)fail(`${n.name}没有后续节点`);
    if(n.kind==='condition'&&(outgoing.length!==2||!outgoing.some(e=>e.outcome==='true')||!outgoing.some(e=>e.outcome==='false')))fail('条件节点必须分别连接满足和不满足分支');
    if(n.kind!=='parallel'&&n.kind!=='condition'&&outgoing.length>1)fail('多个后续任务请使用并行节点');
    const incoming=d.edges.filter(e=>e.to===n.id);
    if(n.kind==='start'&&incoming.length)fail('开始节点不能有前置节点');
    if(n.kind==='join'&&incoming.length<2)fail('汇合节点至少需要两个前置节点');
    if(n.rejectTo){const seen=new Set<string>();const visit=(id:string)=>{if(seen.has(id))return;seen.add(id);for(const e of d.edges.filter(e=>e.from===id))visit(e.to);};visit(n.rejectTo);if(!seen.has(n.id))fail('退回目标必须位于当前审批之前');}
  }
  if(new Set(d.edges.map(e=>e.id)).size!==d.edges.length||d.edges.some(e=>!ids.has(e.from)||!ids.has(e.to)||e.from===e.to))fail('连线引用无效');
  const visited=new Set<string>(),active=new Set<string>();
  function visit(id:string){if(active.has(id))fail('流程连线不能成环，返工使用审批退回');if(visited.has(id))return;active.add(id);for(const e of d.edges.filter(e=>e.from===id))visit(e.to);active.delete(id);visited.add(id);}
  visit(d.nodes.find(n=>n.kind==='start')!.id);
  if(visited.size!==d.nodes.length)fail('存在无法从起点到达的节点');
  const reachesEnd=(id:string):boolean=>{const n=d.nodes.find(n=>n.id===id)!;return n.kind==='end'||d.edges.filter(e=>e.from===id).some(e=>reachesEnd(e.to));};
  if(d.nodes.some(n=>!reachesEnd(n.id)))fail('存在无法到达终点的节点');
  const taskIndices=d.nodes.flatMap(n=>n.taskIndex===undefined?[]:[n.taskIndex]).sort((a,b)=>a-b);if(taskIndices.some((value,index)=>value!==index))fail('计划任务应从第一项连续对应，每项只关联一个执行节点');
  if(d.nodes.filter(n=>n.acceptsIntake).length>1)fail('同一流程只能配置一个合并需求受理节点');
}
export function createInstance(version:Version,title:string,creatorId:string,input:Record<string,unknown>):Instance{
  validateDefinition(version.definition);
  const instance:Instance={id:randomUUID(),version:structuredClone(version),title,creatorId,status:'running',generation:1,input,runs:[],createdAt:new Date().toISOString()};
  resetRuns(instance);advance(instance);return instance;
}
function resetRuns(i:Instance){i.runs.push(...i.version.definition.nodes.map(n=>({id:randomUUID(),nodeId:n.id,generation:i.generation,status:'blocked' as const,attempt:0,output:{},assignedTo:n.assigneeId})));}
export const currentRuns=(i:Instance)=>i.runs.filter(r=>r.generation===i.generation);
export function upstreamIds(i:Instance,nodeId:string){const seen=new Set<string>();const visit=(id:string)=>{for(const e of i.version.definition.edges.filter(e=>e.to===id))if(!seen.has(e.from)){seen.add(e.from);visit(e.from);}};visit(nodeId);return seen;}
export const outputHash=(output:unknown)=>createHash('sha256').update(JSON.stringify(output)).digest('hex');
export function mergedInput(i:Instance,nodeId?:string){
  const allowed=nodeId?upstreamIds(i,nodeId):undefined,runs=currentRuns(i).filter(r=>r.status==='complete'&&(!allowed||allowed.has(r.nodeId))),counts=new Map<string,number>();
  for(const r of runs)for(const key of Object.keys(r.output))counts.set(key,(counts.get(key)||0)+1);
  const result:Record<string,unknown>=Object.create(null);for(const r of runs)for(const [key,value]of Object.entries(r.output))if(counts.get(key)===1&&!['input','nodes','constructor','prototype','__proto__'].includes(key)&&!Object.hasOwn(i.input,key))result[key]=value;
  Object.assign(result,i.input);result.input=i.input;result.nodes=Object.fromEntries(runs.map(r=>[r.nodeId,{runId:r.id,generation:r.generation,output:r.output,sessionId:r.sessionId}]));return result;
}
function branch(n:FlowNode,i:Instance){const c=n.condition!;let value:unknown;
  if(c.sourceNodeId){const source=currentRuns(i).find(r=>r.nodeId===c.sourceNodeId&&r.status==='complete');if(!source||!Object.hasOwn(source.output,c.field))fail('指定的条件来源尚未交付该字段');value=source!.output[c.field];}
  else{let frontier=[n.id];const seen=new Set<string>();while(frontier.length){const parents=[...new Set(frontier.flatMap(id=>i.version.definition.edges.filter(e=>e.to===id).map(e=>e.from)))].filter(id=>!seen.has(id));parents.forEach(id=>seen.add(id));const matches=currentRuns(i).filter(r=>parents.includes(r.nodeId)&&r.status==='complete'&&Object.hasOwn(r.output,c.field));if(matches.length>1)fail('条件字段来源不唯一，请在流程设计中指定来源节点');if(matches.length===1){value=matches[0].output[c.field];break;}frontier=parents;}if(value===undefined)value=i.input[c.field];}
  return c.operator==='greater'?Number(value)>Number(c.value):c.operator==='equals'?String(value??'')===c.value:String(value??'')!==c.value;
}
/** Deterministic graph advancement. Skipped conditional branches count as resolved at joins. */
export function advance(i:Instance){
  if(i.status!=='running')return;
  let changed=true;
  while(changed){changed=false;const runs=currentRuns(i),d=i.version.definition;
    for(const run of runs){if(run.status!=='blocked'||i.workPlanHoldNodes?.includes(run.nodeId))continue;const n=d.nodes.find(n=>n.id===run.nodeId)!;const incoming=d.edges.filter(e=>e.to===n.id);
      const resolved=incoming.map(e=>{const parent=runs.find(r=>r.nodeId===e.from)!;if(!['complete','skipped'].includes(parent.status))return 'pending';if(parent.status==='skipped')return 'inactive';const pn=d.nodes.find(x=>x.id===e.from)!;return pn.kind==='condition'&&e.outcome!==(parent.output.conditionMatched?'true':'false')?'inactive':'active';});
      if(resolved.includes('pending'))continue;
      if(incoming.length&&resolved.every(s=>s==='inactive')){run.status='skipped';changed=true;continue;}
      if(['start','parallel','join','condition','end'].includes(n.kind)){try{if(n.kind==='condition')run.output={conditionMatched:branch(n,i)};run.status='complete';run.completedAt=new Date().toISOString();}catch(e){run.status='failed';run.error=e instanceof Error?e.message:'条件判断失败';}}else{run.status=n.kind==='human'||n.kind==='approval'?'waiting':'ready';run.readyAt=new Date().toISOString();if(n.slaHours)run.dueAt=new Date(Date.now()+n.slaHours*3600000).toISOString();}
      changed=true;
    }
  }
  if(currentRuns(i).every(r=>['complete','skipped'].includes(r.status)))i.status='completed';
}
export function mayHandle(actor:Actor,node:FlowNode,run:NodeRun,departmentId?:string){return actor.roles.includes('admin')||((run.assignedTo?run.assignedTo===actor.id:!node.role||actor.roles.includes(node.role))&&(!(node.departmentId||departmentId)||(node.departmentId||departmentId)===actor.departmentId));}
export function humanComplete(i:Instance,runId:string,actor:Actor,output:Record<string,unknown>,decision:'complete'|'approve'|'reject'){
  if(!output||Array.isArray(output)||typeof output!=='object'||JSON.stringify(output).length>100000||Object.keys(output).some(k=>['__proto__','constructor','prototype'].includes(k)))fail('办理成果格式或大小无效');
  const run=currentRuns(i).find(r=>r.id===runId),node=i.version.definition.nodes.find(n=>n.id===run?.nodeId);
  if(i.status!=='running'||!run||run.status!=='waiting'||!node)throw new DomainError(409,'任务已处理或不在等待办理状态');
  if(!mayHandle(actor,node,run,i.departmentId))throw new DomainError(403,'没有办理此节点的权限');
  if(!['human','approval'].includes(node.kind))throw new DomainError(403,'此节点不能通过人工提交接口完成');
  if(node.kind==='approval'&&!['approve','reject'].includes(decision))fail('审批节点必须通过或退回');
  if(node.kind==='human'&&decision!=='complete')fail('人工任务只能提交完成');
  if(decision==='reject'){if(!String(output.summary||output.reason||'').trim())fail('请填写退回原因');}
  else for(const f of node.fields??[]){if(f.required&&(output[f.id]===undefined||String(output[f.id]).trim()===''))fail(`请填写${f.label}`);if(output[f.id]!==undefined&&f.type==='number'&&(typeof output[f.id]!=='number'||!Number.isFinite(output[f.id])))fail(`${f.label}必须是数字`);}
  if(node.kind==='approval'&&decision==='approve'){const ancestors=upstreamIds(i,node.id);run.approvedEvidence=Object.fromEntries(currentRuns(i).filter(r=>ancestors.has(r.nodeId)&&r.status==='complete').map(r=>[r.nodeId,outputHash(r.output)]));}
  run.output={...output,...node.kind==='approval'?{reviewDecision:decision}:{}};run.completedAt=new Date().toISOString();run.status='complete';
  if(decision==='reject'){
    const previous=currentRuns(i);const affected=new Set<string>();const visit=(id:string)=>{if(affected.has(id))return;affected.add(id);for(const e of i.version.definition.edges.filter(e=>e.from===id))visit(e.to);};visit(node.rejectTo!);
    if(previous.some(r=>affected.has(r.nodeId)&&(r.status==='running'||r.status==='waiting'&&r.childInstanceId)))throw new DomainError(409,'退回范围内有执行中的 AI 或子流程，请先取消或等待完成');
    i.generation++;resetRuns(i);
    for(const next of currentRuns(i)){const old=previous.find(r=>r.nodeId===next.nodeId)!;if(!affected.has(next.nodeId)){next.status=old.status;next.output=old.output;next.assignedTo=old.assignedTo;next.approvedEvidence=old.approvedEvidence;next.taskId=old.taskId;next.taskIds=old.taskIds;}}
  }
  advance(i);
}
