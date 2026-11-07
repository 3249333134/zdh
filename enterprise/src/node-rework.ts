import {randomUUID} from 'node:crypto';
import {DomainError,type Actor,type Instance} from './types.ts';
import {advance,currentRuns} from './engine.ts';
import type {Store,Connection} from './db.ts';

// Reopen the selected operation and its descendants, preserving every old run.
export async function reopenNode(store:Store,db:Connection,a:Actor,i:Instance,request:any){
 if(!a.roles.some(r=>r==='admin'||r==='manager')||!a.roles.includes('admin')&&i.departmentId&&a.departmentId!==i.departmentId)throw new DomainError(403,'只有本部门负责人或管理员可以确认重新办理');
 const old=currentRuns(i),target=old.find(r=>r.id===request.runId),node=i.version.definition.nodes.find(n=>n.id===target?.nodeId);
 if(!target||!node||!['human','ai','approval'].includes(node.kind)||!['complete','failed','unknown'].includes(target.status)||i.status==='cancelled'||i.parent)throw new DomainError(409,'本节点暂不能重新办理；自动节点请修改流程规则');
 if(request.generation!==i.generation)throw new DomainError(409,'流程轮次已变化，请重新查看影响范围');
 if(typeof request.reason!=='string'||!request.reason.trim()||request.reason.length>3000)throw new DomainError(400,'请填写重新办理原因（最多3000字）');
 const plan=await store.get('workPlans',i.id,db);if(plan?.pending)throw new DomainError(409,'请先处理待审计划变更，不能叠加重新办理');
 const affected=new Set<string>();const visit=(id:string)=>{if(affected.has(id))return;affected.add(id);for(const e of i.version.definition.edges.filter(e=>e.from===id))visit(e.to);};visit(node.id);
 if(old.some(r=>affected.has(r.nodeId)&&(r.status==='running'||r.status==='waiting'&&r.childInstanceId)))throw new DomainError(409,'影响范围内有运行中的 AI 或子流程，请先停止或等待完成');
 i.generation++;for(const r of old)i.runs.push(affected.has(r.nodeId)?{id:randomUUID(),nodeId:r.nodeId,generation:i.generation,status:'blocked',attempt:0,output:{},assignedTo:r.assignedTo,taskId:r.taskId,taskIds:r.taskIds,reworkReason:r.nodeId===node.id?request.reason.trim():undefined}:{...structuredClone(r),id:randomUUID(),generation:i.generation,carriedFromRunIds:[r.id,...r.carriedFromRunIds||[]]});
 const stages=i.version.definition.nodes.filter(n=>affected.has(n.id));
 for(const t of await store.list('tasks',db)){const leaf=t.workPlanId===i.id,stage=leaf?t.executionNodeId:stages.find(n=>n.taskIndex!==undefined&&i.business?.taskIds[n.taskIndex]===t.id||old.find(r=>r.nodeId===n.id)?.taskIds?.includes(t.id))?.id;if(!stage||!affected.has(stage)||t.status==='cancelled')continue;t.history=[...(t.history||[]),{action:'node.reopen',actorId:a.id,at:new Date().toISOString(),before:t.progress||'',round:t.round,generation:i.generation,reason:request.reason}];t.status='doing';t.acceptanceStatus='pending';t.progress='';t.sourceRunId=currentRuns(i).find(r=>r.nodeId===stage)?.id;if(leaf)t.round=(t.round||0)+1;await store.put('tasks',t,db);}
 if(i.business)delete i.business.acceptedTasks;i.status='running';advance(i);
 await store.put('nodeReworks',{id:randomUUID(),instanceId:i.id,nodeId:node.id,sourceRunId:target.id,generation:i.generation,reason:request.reason,affectedNodeIds:[...affected],actorId:a.id,at:new Date().toISOString()},db);
}
