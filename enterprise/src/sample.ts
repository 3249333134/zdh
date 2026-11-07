import {randomUUID} from 'node:crypto';
import type {Actor,Definition,Employee,Component} from './types.ts';
import {EnterpriseService,requireRole} from './service.ts';
export async function installSample(service:EnterpriseService,actor:Actor){
  requireRole(actor,'admin');
  const department=await service.saveRecord(actor,'departments',{id:'delivery',name:'项目交付部',parentId:'',enabled:true});
  const employees:Employee[]=[];
  for(const [id,name,purpose] of [['planner','计划助手','将需求分解为可验收的工作计划'],['progress','进度助手','核对进度与异常'],['quality','质检助手','依据验收标准检查交付物'],['weekly','周报助手','根据实际记录总结周报'],['retro','复盘助手','整理问题及改进行动']])employees.push(await service.saveRecord(actor,'employees',{id,name,purpose,modelId:'',skills:[purpose],materialIds:[],allowedTools:['read_context','submit_result'],outputRequirements:'返回有依据的中文结论，标明资料来源和待补充信息',handoffRule:'资料不足、规则冲突或涉及承诺时转人工',enabled:true}));
  const components:Component[]=[];
  for(const [id,name,role] of [['intake','需求受理','manager'],['execution','岗位执行','executor'],['acceptance','交付验收','reviewer']] as const)components.push(await service.saveRecord(actor,'components',{id,name,departmentId:department.id,responsibility:name,agentId:id==='intake'?'planner':id==='execution'?'progress':'quality',inputFields:[{id:'summary',label:'办理说明',type:'textarea',required:true}],outputs:['summary'],ownerRole:role,acceptance:'资料齐备，交付内容符合项目要求',enabled:true}));
  const definition:Definition={id:'project-delivery',name:'项目交付流程',description:'需求、AI 计划、审批、并行执行、AI 质检、验收与归档',nodes:[
    {id:'start',name:'开始',kind:'start'},
    {id:'intake',name:'需求受理',kind:'human',acceptsIntake:true,role:'manager',componentId:'intake',fields:[{id:'requirements',label:'业务需求与验收标准',type:'textarea',required:true}]},
    {id:'plan',name:'AI 拆计划',kind:'ai',agentId:'planner'},
    {id:'plan-review',name:'项目经理审批',kind:'approval',commitPlan:true,planSourceId:'plan',role:'manager',rejectTo:'intake'},
    {id:'parallel',name:'分配并行工作',kind:'parallel'},
    {id:'execute-a',name:'交付内容编制',kind:'human',taskIndex:0,slaHours:48,role:'executor',componentId:'execution',fields:[{id:'delivery',label:'交付内容',type:'textarea',required:true}]},
    {id:'execute-b',name:'资料与证据整理',kind:'human',taskIndex:1,slaHours:48,role:'executor',componentId:'execution',fields:[{id:'evidence',label:'证据与资料说明',type:'textarea',required:true}]},
    {id:'join',name:'汇总交付',kind:'join'},
    {id:'quality',name:'AI 质检',kind:'ai',agentId:'quality'},
    {id:'condition',name:'质检是否通过',kind:'condition',condition:{field:'accepted',sourceNodeId:'quality',operator:'equals',value:'true'}},
    {id:'exception',name:'质检异常处理',kind:'human',role:'manager',fields:[{id:'resolution',label:'问题处理与补充说明',type:'textarea',required:true}]},
    {id:'quality-join',name:'准备人工验收',kind:'join'},
    {id:'acceptance',name:'人工验收',kind:'approval',acceptsDelivery:true,role:'reviewer',componentId:'acceptance',rejectTo:'parallel'},
    {id:'retro',name:'归档复盘',kind:'ai',agentId:'retro'},
    {id:'end',name:'归档结束',kind:'end'}],edges:[]};
  const links:[string,string,('true'|'false')?][]=[['start','intake'],['intake','plan'],['plan','plan-review'],['plan-review','parallel'],['parallel','execute-a'],['parallel','execute-b'],['execute-a','join'],['execute-b','join'],['join','quality'],['quality','condition'],['condition','exception','false'],['condition','quality-join','true'],['exception','quality-join'],['quality-join','acceptance'],['acceptance','retro'],['retro','end']];
  definition.edges=links.map(([from,to,outcome])=>({id:randomUUID(),from,to,...outcome?{outcome}:{}}));await service.saveRecord(actor,'definitions',{...definition,revision:(await service.store.get('definitions',definition.id))?.revision});return {definition,components,employees};
}
