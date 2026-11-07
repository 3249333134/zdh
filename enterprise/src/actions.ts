import {workspaceContext} from './workspace.ts';
import {searchWikiKnowledge,wikiForExecution} from './wiki.ts';
import {searchKnowledge} from './knowledge.ts';
import {randomUUID} from 'node:crypto';
import {EnterpriseService,required,requireRole} from './service.ts';
import {visibleTo,dateValue} from './business.ts';
import {createInstance} from './engine.ts';
import {digest} from './security.ts';
import {DomainError,type Actor,type Instance,type Version} from './types.ts';
import type {Connection} from './db.ts';

const specs=[
  {id:'project.create',name:'建立项目',roles:['admin','manager'],risk:'需要本人确认',fields:['title','goal','due','ownerId']},
  {id:'task.create',name:'建立任务',roles:['admin','manager'],risk:'需要本人确认',fields:['projectId','title','assigneeId','due']},
  {id:'task.progress',name:'更新任务进度',roles:['admin','manager','executor','reviewer'],risk:'需要本人确认；流程任务须在对应节点提交交付',fields:['taskId','status','progress']},
];
export function actionCatalog(a:Actor){return {readKinds:['projects','tasks','components','materials','instances','factoryCases','factoryRecords','factoryKnowledge','knowledge','wiki'],actor:{id:a.id,name:a.name,roles:a.roles,departmentId:a.departmentId},actions:specs.filter(s=>s.roles.some(r=>a.roles.includes(r as any))),rules:['查询只返回当前账号有权查看的记录','AI只能提交建议，确认操作只允许本人从业务界面发起','审批、验收、转账、开票及系统配置不在此动作集内','正式记录变更复用人工界面的同一业务校验']};}
export async function currentActor(service:EnterpriseService,id:string,db:Connection=service.store.db):Promise<Actor>{const row=(await db.query('SELECT id,name,roles,department_id FROM users WHERE id=$1 AND enabled=true',[id])).rows[0];if(!row)throw new DomainError(403,'执行账号已停用');return {id:row.id,name:row.name,roles:row.roles,departmentId:row.department_id};}
export async function businessQuery(service:EnterpriseService,a:Actor,input:any,scope?:{projectId?:string;materialIds?:string[];wikiPageIds?:string[]}){
  if(!['projects','tasks','components','materials','instances','factoryCases','factoryRecords','factoryKnowledge','knowledge','wiki'].includes(input.kind))throw new DomainError(400,'只能查询授权项目、任务、组件、资料、流程或制造业务');
  if(input.kind==='wiki')return {...await searchWikiKnowledge(service,a,input.search,scope?.wikiPageIds||[]),kind:'wiki'};
  if(input.kind==='knowledge')return {...await searchKnowledge(service,a,input.search,scope||{materialIds:[]}),kind:'knowledge'};
  let rows:any[]=input.kind==='instances'?await service.instances(a):await service.records(a,input.kind);
  if(scope?.projectId)rows=rows.filter(r=>input.kind==='projects'?r.id===scope.projectId:input.kind==='instances'?r.business?.projectId===scope.projectId:r.projectId===scope.projectId);
  if(input.kind==='factoryKnowledge')rows=rows.filter(r=>r.status==='approved'&&!rows.some(x=>x.familyId===r.familyId&&x.status==='approved'&&x.version>r.version)&&r.reviewDue>=new Intl.DateTimeFormat('en-CA',{timeZone:process.env.ENTERPRISE_TIMEZONE||'Asia/Shanghai'}).format(new Date())&&scope?.materialIds?.includes(r.material.id));
  if(input.kind==='materials')rows=rows.filter(r=>scope?.materialIds?.includes(r.id));
  if(input.projectId){const project=await service.store.get('projects',input.projectId);if(!project||!visibleTo(a,project))throw new DomainError(403,'没有项目访问权限');rows=rows.filter(r=>input.kind==='projects'?r.id===input.projectId:r.projectId===input.projectId||r.business?.projectId===input.projectId);}
  if(input.search){const q=String(input.search).slice(0,200).toLowerCase();rows=rows.filter(r=>String(r.title||r.name||'').toLowerCase().includes(q));}
  const result=rows.slice(0,60).map(r=>input.kind==='instances'?{id:r.id,title:r.title,status:r.status,nodes:r.runs.filter((n:any)=>n.generation===r.generation).map((n:any)=>({id:n.id,nodeId:n.nodeId,status:n.status,error:n.error}))}:input.kind==='materials'?{id:r.id,name:r.name,version:r.version,sha256:r.sha256,text:String(r.text||'').slice(0,5000)}:r);
  return {kind:input.kind,count:rows.length,truncated:rows.length>60,records:result};
}
async function normalized(service:EnterpriseService,a:Actor,action:string,args:any,db:Connection){
  if(!args||typeof args!=='object'||Array.isArray(args))throw new DomainError(400,'动作参数无效');
  const spec=actionCatalog(a).actions.find(s=>s.id===action);if(!spec)throw new DomainError(403,'没有此业务动作权限，审批不能交给AI执行');
  if(Object.keys(args).some(k=>!spec.fields.includes(k)))throw new DomainError(400,'动作包含未授权字段');
  if(action==='project.create'){
    requireRole(a,'admin','manager');const owner=args.ownerId||a.id;const user=(await db.query('SELECT id,department_id FROM users WHERE id=$1 AND enabled=true',[owner])).rows[0];if(!user||!a.roles.includes('admin')&&user.department_id!==a.departmentId)throw new DomainError(403,'负责人不存在或不属于当前部门');
    return {kind:'projects',before:null,body:{id:randomUUID(),title:required(args.title,'项目名称',500),goal:required(args.goal,'目标'),due:dateValue(args.due),ownerId:owner,departmentId:a.departmentId,teamIds:[...new Set([a.id,owner])]}};
  }
  if(action==='task.create'){
    const project=await service.store.get('projects',args.projectId,db);if(!project||!visibleTo(a,project))throw new DomainError(403,'没有项目权限');
    const assignee=args.assigneeId||a.id,user=(await db.query('SELECT id,department_id FROM users WHERE id=$1 AND enabled=true',[assignee])).rows[0];if(!user||project.departmentId&&user.department_id!==project.departmentId&&!(project.teamIds||[]).includes(assignee))throw new DomainError(403,'任务负责人不在项目授权范围');
    return {kind:'tasks',before:null,body:{id:randomUUID(),projectId:project.id,title:required(args.title,'任务名称',500),assigneeId:assignee,due:dateValue(args.due),status:'todo',progress:'',dependencies:[],attachments:[]}};
  }
  const task=await service.store.get('tasks',args.taskId,db);if(!task||!visibleTo(a,task))throw new DomainError(403,'任务不存在或无权访问');
  if(task.sourceInstanceId)throw new DomainError(409,'此任务由流程管理，请在待办节点提交交付；助手不能绕过流程修改');
  return {kind:'tasks',before:task,body:{...task,status:args.status||task.status,progress:required(args.progress,'进度说明',10000)}};
}
export async function proposeAction(service:EnterpriseService,a:Actor,input:any,origin?:{instanceId:string;runId:string;attempt?:number;projectId?:string}){
  required(input.key,'建议请求编号',200);return service.store.tx(async db=>{await service.store.lock(db);a=await currentActor(service,a.id,db);
    const id=digest(a.id+':'+(origin?.runId||'human')+':'+input.key),hash=digest(JSON.stringify({action:input.action,args:input.args,...input.wikiRef?{wikiRef:input.wikiRef}:{}}));const old=await service.store.get('actionProposals',id,db);if(old){if(old.requestHash!==hash)throw new DomainError(409,'建议请求编号已用于其他内容');return old;}
    if(input.wikiRef)await wikiForExecution(service,a,[input.wikiRef],db);const change=await normalized(service,a,input.action,input.args,db);if(origin?.projectId&&(input.action==='project.create'||change.body.projectId!==origin.projectId))throw new DomainError(403,'本次助手仅能操作选定项目');
    // Preview uses the same validation and write path as a human form, rolled back to a savepoint.
    await db.query('SAVEPOINT action_preview');let validated;try{validated=await service.saveRecord(a,change.kind,change.body,db);}finally{await db.query('ROLLBACK TO SAVEPOINT action_preview');await db.query('RELEASE SAVEPOINT action_preview');}
    const p={id,...input.wikiRef?{wikiRef:{id:input.wikiRef.id,revision:input.wikiRef.revision}}:{},name:specs.find(s=>s.id===input.action)!.name,actorId:a.id,creatorId:a.id,departmentId:a.departmentId,action:input.action,args:input.args,requestHash:hash,kind:change.kind,before:change.before,beforeHash:digest(JSON.stringify(change.before)),after:validated,status:'pending',createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),origin:origin||null};
    await service.store.put('actionProposals',p,db);await service.store.audit(a.id,'action.propose',p.id,{action:p.action,instanceId:origin?.instanceId,runId:origin?.runId},db);return p;
  });
}
export async function decideAction(service:EnterpriseService,a:Actor,id:string,decision:string){return service.store.tx(async db=>{await service.store.lock(db);a=await currentActor(service,a.id,db);const p=await service.store.get('actionProposals',id,db);if(!p||p.actorId!==a.id)throw new DomainError(403,'只能由建议对应的本人确认');
  if(!['confirm','reject'].includes(decision))throw new DomainError(400,'处理决定无效');if(p.status!=='pending'){if(p.status===(decision==='confirm'?'confirmed':'rejected'))return p;throw new DomainError(409,'建议已处理');}
  if(decision==='confirm'){
    if(p.origin){const i=(await db.query('SELECT body FROM instances WHERE id=$1',[p.origin.instanceId])).rows[0]?.body as Instance;const r=i?.runs.find(r=>r.id===p.origin.runId);if(!i||i.status!=='completed'||r?.status!=='complete'||r.attempt!==p.origin.attempt)throw new DomainError(409,'关联AI执行未正常完成或已取消，请等待完成或重新生成建议');}
    if(new Date(p.expiresAt).getTime()<Date.now())throw new DomainError(409,'建议已过期，请重新预览');
    if(p.wikiRef)await wikiForExecution(service,a,[p.wikiRef],db);const fresh=await normalized(service,a,p.action,p.args,db);const current=await service.store.get(p.kind,p.after.id,db);if(digest(JSON.stringify(current||null))!==p.beforeHash||digest(JSON.stringify(fresh.before))!==p.beforeHash)throw new DomainError(409,'业务记录已变化，请重新生成建议');
    // The persisted, human-reviewed payload is applied once in the same transaction as its receipt.
    p.result=await service.saveRecord(a,p.kind,p.after,db);if(p.wikiRef)await service.store.put('workspaceLinks',{id:digest(p.id+':wiki'),from:{kind:p.kind==='tasks'?'task':'project',id:p.result.id},to:{kind:'wiki',id:p.wikiRef.id},revision:p.wikiRef.revision,relation:'uses',creatorId:a.id,at:new Date().toISOString()},db);p.status='confirmed';
  }else p.status='rejected';p.decidedAt=new Date().toISOString();await service.store.put('actionProposals',p,db);await service.store.audit(a.id,'action.'+p.status,p.id,{action:p.action,origin:p.origin,recordId:p.result?.id},db);return p;
});}
export async function startCopilot(service:EnterpriseService,a:Actor,input:any,key:string){required(key,'请求编号',200);return service.store.tx(async db=>{await service.store.lock(db);a=await currentActor(service,a.id,db);const requestHash=digest(JSON.stringify(input));const cached=(await db.query('SELECT * FROM commands WHERE key=$1',[key])).rows[0];if(cached){if(cached.actor_id!==a.id||cached.request_hash!==requestHash)throw new DomainError(409,'请求编号冲突');return cached.response;}
  const employee=await service.store.get('employees',input.employeeId,db);if(!employee?.enabled||!visibleTo(a,employee))throw new DomainError(403,'无权使用此数字员工');if(!employee.allowedTools.includes('read_context'))throw new DomainError(403,'该岗位卡未授权业务读取');
  if(input.projectId){const p=await service.store.get('projects',input.projectId,db);if(!p||!visibleTo(a,p))throw new DomainError(403,'无权关联此项目');}
  const definition:any={id:'copilot-'+randomUUID(),name:'企业业务助手',description:'继承本人权限，查询和提交待确认业务动作',nodes:[{id:'start',name:'开始',kind:'start'},{id:'copilot',name:'理解并处理业务意图',kind:'ai',agentId:employee.id},{id:'end',name:'结束',kind:'end'}],edges:[{id:'a',from:'start',to:'copilot'},{id:'b',from:'copilot',to:'end'}]};
  const version:Version={id:randomUUID(),internal:true,definitionId:definition.id,number:1,definition,components:[],employees:[employee]};await db.query('INSERT INTO flow_versions VALUES($1,$2,$3,$4)',[version.id,definition.id,1,JSON.stringify(version)]);
  const prompt=required(input.prompt,'业务意图',10000),i=createInstance(version,prompt.slice(0,100),a.id,{});i.departmentId=a.departmentId;const workspace=input.workspace?await workspaceContext(service,a,Object.fromEntries(Object.entries(input.workspace).filter(([k])=>['projectId','definitionId','instanceId','runId','nodeId','taskId','wikiId'].includes(k))),db):undefined;let wikiPageIds:string[]=[];if(workspace?.definitionId&&workspace?.nodeId){const d=await service.store.get('definitions',workspace.definitionId,db);wikiPageIds=(d?.nodes.find((n:any)=>n.id===workspace.nodeId)?.wikiRefs||[]).map((r:any)=>r.id);}if(input.workspace?.view==='knowledge'&&workspace?.wikiId)wikiPageIds=[workspace.wikiId];i.copilot={workspace,wikiPageIds,actorId:a.id,employeeId:employee.id,projectId:input.projectId||undefined,prompt};await db.query('INSERT INTO instances VALUES($1,$2,now())',[i.id,JSON.stringify(i)]);await service.store.audit(a.id,'copilot.start',i.id,{employeeId:employee.id,projectId:input.projectId},db);await db.query('INSERT INTO commands VALUES($1,$2,$3,$4)',[key,a.id,requestHash,JSON.stringify(i)]);return i;
});}
