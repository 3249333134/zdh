import {randomUUID} from 'node:crypto';
import type {EnterpriseService} from './service.ts';
import {DomainError,type Actor} from './types.ts';
import {visibleTo} from './business.ts';
import {currentRuns,outputHash} from './engine.ts';

export async function weeklyDraft(service:EnterpriseService,a:Actor,projectId:string,db=service.store.db){
  const project=await service.store.get('projects',projectId,db);if(!project||!visibleTo(a,project))throw new DomainError(404,'项目不存在');
  const tasks=(await service.store.list('tasks',db)).filter(t=>t.projectId===projectId&&visibleTo(a,t)).sort((a,b)=>a.id.localeCompare(b.id));const instances=(await db.query('SELECT body FROM instances')).rows.map(r=>r.body).filter(i=>i.business?.projectId===projectId&&!i.assistance).sort((a,b)=>a.id.localeCompare(b.id));
  const users=(await db.query('SELECT id,name FROM users')).rows;const names=(id:string)=>users.find(u=>u.id===id)?.name||'按岗位待认领';
  const status:Record<string,string>={todo:'待开始',doing:'进行中',done:'已提交',running:'执行中',completed:'已归档',cancelled:'已取消'};
  const exceptions=instances.flatMap(i=>currentRuns(i).filter(r=>['failed','unknown'].includes(r.status)).map(r=>({instanceId:i.id,runId:r.id,name:i.version.definition.nodes.find((n:any)=>n.id===r.nodeId)?.name,error:r.error})));
  const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());
  const body=[`${project.title} · 项目周报草稿（${date}）`,`目标：${project.goal||'未填写'}`,`截止日期：${project.due||'未设定'}`,'','任务进展',...tasks.map(t=>`- ${t.title}｜${names(t.assigneeId)}｜${status[t.status]||t.status}｜截止 ${t.due||'未设定'}\n  ${t.progress||'尚无进展说明'}`),'','关联流程',...instances.map(i=>`- ${i.title}：${status[i.status]||i.status}，第${i.generation}轮`),'','需处理的问题',...(exceptions.length?exceptions.map(e=>`- ${e.name}：${e.error||'待核实'}`):['- 当前记录未发现执行异常；未填报的信息不代表已经完成。']),'','本报告按现有业务记录自动汇总，未经负责人确认，不作为正式周报。'].join('\n');
  return {projectId,title:project.title+'周报',body,status:'draft',stamp:outputHash({project,tasks,instances:instances.map(i=>({id:i.id,title:i.title,status:i.status,generation:i.generation,nodes:currentRuns(i).map(r=>({nodeId:r.nodeId,status:r.status,error:r.error}))}))}),sources:{projectId,taskIds:tasks.map(t=>t.id),instanceIds:instances.map(i=>i.id)},generatedAt:new Date().toISOString()};
}
export async function confirmWeekly(service:EnterpriseService,a:Actor,projectId:string,input:any,key:string){
  if(!a.roles.some(r=>['admin','manager'].includes(r)))throw new DomainError(403,'确认正式周报需要经理权限');if(!key||key.length>200)throw new DomainError(400,'缺少请求编号');
  return service.store.tx(async db=>{await service.store.lock(db);const hash=outputHash({action:'weekly',projectId,input});const cached=(await db.query('SELECT * FROM commands WHERE key=$1',[key])).rows[0];if(cached){if(cached.actor_id!==a.id||cached.request_hash!==hash)throw new DomainError(409,'请求编号冲突');return cached.response;}
    const draft=await weeklyDraft(service,a,projectId,db);if(input.stamp!==draft.stamp)throw new DomainError(409,'业务记录已更新，请重新汇总后确认');if(typeof input.body!=='string'||!input.body.trim()||input.body.length>100000)throw new DomainError(400,'报告内容无效');
    const project=await service.store.get('projects',projectId,db),report={...draft,id:randomUUID(),body:'正式周报\n审核人：'+a.name+'\n\n'+input.body.replace('项目周报草稿','项目周报').replace('本报告按现有业务记录自动汇总，未经负责人确认，不作为正式周报。','本报告基于业务记录汇总，已由负责人确认。'),status:'approved',departmentId:project.departmentId,teamIds:project.teamIds||[],approvedBy:a.id,approvedAt:new Date().toISOString()};await service.store.put('reports',report,db);await service.store.audit(a.id,'weekly.approve',projectId,{reportId:report.id,sources:report.sources},db);await db.query('INSERT INTO commands VALUES($1,$2,$3,$4)',[key,a.id,hash,JSON.stringify(report)]);return report;
  });
}
