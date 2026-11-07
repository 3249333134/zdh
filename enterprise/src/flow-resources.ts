import type {Store,Connection} from './db.ts';
import type {Actor,Definition,Employee,Component} from './types.ts';
import {DomainError} from './types.ts';
import {visibleTo} from './business.ts';
import {wikiForExecution} from './wiki.ts';
const fail=(m:string):never=>{throw new DomainError(400,m);};
const strings=(v:any,max=100)=>{if(!Array.isArray(v)||v.length>max||v.some(x=>typeof x!=='string'||x.length>2000))fail('流程专用配置列表无效');return [...new Set<string>(v)];};
export async function resolveFlowResources(store:Store,db:Connection,a:Actor,original:Definition,strict=true){
 const d=structuredClone(original),employees:Employee[]=[],components:Component[]=[];
 for(const n of d.nodes){delete n.wikiSnapshots;if(n.wikiRefs?.length)n.wikiSnapshots=await wikiForExecution({store} as any,a,n.wikiRefs,db);let base:any=n.agentId?await store.get('employees',n.agentId,db):undefined;let component:any=n.componentId?await store.get('components',n.componentId,db):undefined;
 if(base&&!visibleTo(a,base)||component&&!visibleTo(a,component))throw new DomainError(403,'没有使用此共享资源的权限');
 if(n.localComponent){const c=n.localComponent;if(strict&&(typeof c.name!=='string'||!c.name.trim()||typeof c.responsibility!=='string'||typeof c.acceptance!=='string'||!['admin','manager','executor','reviewer'].includes(c.ownerRole)))fail('流程专用组件职责、名称或岗位无效');component={...component,id:'local-component:'+d.id+':'+n.id,sourceComponentId:n.componentId||undefined,name:c.name,responsibility:c.responsibility,acceptance:c.acceptance,ownerRole:c.ownerRole,outputs:strings(c.outputs||[]),inputFields:n.fields||[],departmentId:n.departmentId||d.departmentId||a.departmentId,enabled:true};components.push(component);n.componentId=component.id;}
 if(n.localEmployee){if(base?.enabled===false)throw new DomainError(409,'所引用共享数字员工已停用');const e=n.localEmployee;const skills=strings(e.skills||[],50),tools=strings(e.allowedTools||[],10),materialIds=strings(e.materialIds||[]);if(tools.some(t=>!['read_context','submit_result'].includes(t)))fail('流程数字员工不能使用通用文件或命令工具');if(strict&&(typeof e.name!=='string'||!e.name.trim()||typeof e.purpose!=='string'||!e.purpose.trim()||String(e.purpose).length>10000))fail('请填写流程数字员工名称与职责');if(e.modelId&&!(await db.query('SELECT id FROM models WHERE id=$1',[e.modelId])).rows.length)fail('流程数字员工引用的模型不存在');for(const id of materialIds){const m=await store.get('materials',id,db);if(!m||!visibleTo(a,m))throw new DomainError(403,'流程数字员工资料不可访问');}
 const employee:any={id:'local-agent:'+d.id+':'+n.id,sourceEmployeeId:n.agentId||undefined,starterRole:n.starterRole,name:e.name,purpose:e.purpose,modelId:String(e.modelId||''),skills,materialIds,allowedTools:tools,outputRequirements:String(e.outputRequirements||''),handoffRule:String(e.handoffRule||''),enabled:true};employees.push(employee);n.agentId=employee.id;}
 if(n.materialIds){n.materialIds=strings(n.materialIds);for(const id of n.materialIds){const m=await store.get('materials',id,db);if(!m||!visibleTo(a,m))throw new DomainError(403,'节点资料不可访问');}}
 }
 return {definition:d,employees,components};
}
