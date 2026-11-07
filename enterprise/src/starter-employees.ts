import {randomUUID} from 'node:crypto';
import type {Actor,Definition,FlowNode,Employee,Instance} from './types.ts';
import {DomainError} from './types.ts';
import type {Store,Connection} from './db.ts';
import {requireRole,type EnterpriseService} from './service.ts';
import {validateConfigDraft} from './flow-config.ts';
import {digest} from './security.ts';
import {createInstance} from './engine.ts';
export const starterVersion=1;
const rows=[
 ['intake','需求分析员','整理需求摘要、目标、约束、关键问题与待确认事项'],
 ['planner','项目计划员','拆分可执行任务、依赖、交付物、验收标准与分工建议'],
 ['approval','审批助理','检查计划完整性、风险和审批依据，仅提供参考，禁止批准'],
 ['writer','交付撰写员','根据本项任务、需求与授权资料撰写实际交付文稿'],
 ['evidence','资料专员','整理资料目录、来源引用、缺项与证据核对清单'],
 ['progress','进度协调员','核对实际进度、阻塞、延期依据与跟进建议'],
 ['quality','质量检查员','逐项对照验收标准检查成果，列出问题、证据与修改建议'],
 ['exception','问题处理员','归纳问题，准备返工建议，列出需人工决定的事项'],
 ['acceptance','验收助理','对照成果与验收标准，列出未满足项，仅提供验收参考'],
 ['weekly','周报专员','只基于实际授权业务记录撰写周报，缺失记录明确标注'],
 ['wiki','Wiki 整理员','整理带原文引用的知识草稿、更新建议与发布核对清单，不发布'],
 ['retro','复盘专员','整理成果摘要、问题、经验和后续改进行动']
];
export const starterCatalog=rows.map(([id,name,purpose])=>({id,name,purpose,version:starterVersion}));
export function starterEmployee(role:string,modelId=''){const t=starterCatalog.find(x=>x.id===role);if(!t)throw new DomainError(400,'基础岗位不存在');return {name:t.name,purpose:t.purpose,modelId,skills:[t.purpose],materialIds:[],allowedTools:['read_context','submit_result'],outputRequirements:'提供可审阅的完整中文正文、交付内容、来源依据、缺项与待确认事项，不只给操作建议。未知人员、期限和制度不得编造。程序开发需求只交付实施方案与任务，不声称已编写、运行或部署程序。',handoffRule:'缺少关键资料、规则冲突、对外承诺或需要专业判断时标明需人工确认；不得代替人工提交、审批、验收和发布。'};}
export function starterRole(n:FlowNode){if(!['ai','human','approval'].includes(n.kind))return '';if(n.workAction==='wiki'||n.requiresWiki||/Wiki|知识|发布/i.test(n.name))return 'wiki';if(n.workAction==='weekly'||/周报/.test(n.name))return 'weekly';if(n.commitPlan)return 'approval';if(n.acceptsDelivery||n.kind==='approval'&&/验收/.test(n.name))return 'acceptance';if(n.kind==='approval')return 'approval';if(n.acceptsIntake||/需求|受理/.test(n.name))return 'intake';if(/复盘|归档/.test(n.name))return 'retro';if(/异常|返工|问题处理/.test(n.name))return 'exception';if(/质检|质量/.test(n.name))return 'quality';if(/计划|拆分/.test(n.name))return 'planner';if(/进度/.test(n.name))return 'progress';if(/资料|证据|核对/.test(n.name))return 'evidence';return 'writer';}
export function configureStarters(original:Definition,modelId=''){const candidate=structuredClone(original),matches:any[]=[];for(const n of candidate.nodes){const role=starterRole(n);if(!role){matches.push({nodeId:n.id,nodeName:n.name,status:'流程规则执行',employee:''});continue;}const preserve=!!(n.localEmployee||n.agentId);if(!preserve){n.starterRole=role;n.localEmployee=starterEmployee(role,modelId);}else if(!n.localEmployee&&!n.starterRole&&['planner','progress','quality','weekly','retro'].includes(n.agentId||''))n.starterRole=role;
 if(!preserve&&!n.componentId){n.responsibility=n.responsibility||starterEmployee(role).purpose;n.outputs=n.outputs?.length?n.outputs:['summary'];n.acceptance=n.acceptance||'内容回应本次需求，引用可追溯，缺失信息明确标注，由指定人员核对。';if(n.kind==='human'&&!n.taskGroup&&!n.fields?.length)n.fields=[{id:'summary',label:'办理成果正文',type:'textarea',required:true}];}
 if(n.autoAssist===undefined&&['human','approval'].includes(n.kind))n.autoAssist=true;
 matches.push({nodeId:n.id,nodeName:n.name,status:preserve?'保留已有岗位配置':'补齐基础岗位',employee:n.localEmployee?.name||n.agentId,role});}return {candidate,matches,version:starterVersion};}
export async function starterPreview(s:EnterpriseService,a:Actor,input:any,db:Connection=s.store.db){await validateConfigDraft(s,a,input.draft,db,false);if(input.modelId&&!(await db.query('SELECT id FROM models WHERE id=$1',[input.modelId])).rows.length)throw new DomainError(400,'模型不存在');const result=configureStarters(input.draft,input.modelId||'');for(const match of result.matches){const node=result.candidate.nodes.find(n=>n.id===match.nodeId);if(node?.agentId&&!node.localEmployee){const employee=await s.store.get('employees',node.agentId,db);if(employee)match.employee=employee.name;}}return {...result,baseHash:digest(JSON.stringify(input.draft))};}
export async function applyStarters(s:EnterpriseService,a:Actor,input:any){requireRole(a,'admin','manager');return s.store.tx(async db=>{await s.store.lock(db);const u=(await db.query('SELECT id,name,roles,department_id,enabled FROM users WHERE id=$1',[a.id])).rows[0];if(!u?.enabled||!u.roles.some((r:string)=>['admin','manager'].includes(r)))throw new DomainError(403,'当前账号无配置权限');a={id:u.id,name:u.name,roles:u.roles,departmentId:u.department_id};const saved=await s.store.get('definitions',input.draft.id,db);if(saved&&(saved.revision||0)!==(input.draft.revision||0))throw new DomainError(409,'保存版本已变化，请重新核对');if(digest(JSON.stringify(input.draft))!==input.baseHash)throw new DomainError(409,'草稿已变化，请重新预览');const result=await starterPreview(s,a,input,db);await validateConfigDraft(s,a,result.candidate,db,false);await s.store.audit(a.id,'starter.apply',input.draft.id,{baseHash:input.baseHash,version:starterVersion},db);return result;});}
export async function starterModel(store:Store,e:Employee,n:FlowNode,db:Connection=store.db){if(e.modelId)return e.modelId;if(n.starterRole||e.starterRole)return (await store.get('preferences','starter-employees',db))?.modelId||'';return '';}
export async function saveStarterModel(s:EnterpriseService,a:Actor,modelId:string){requireRole(a,'admin');if(!modelId||!(await s.store.db.query('SELECT id FROM models WHERE id=$1',[modelId])).rows.length)throw new DomainError(400,'请选择已配置模型');return s.saveRecord(a,'preferences',{id:'starter-employees',name:'基础数字员工默认模型',modelId});}
export async function testStarterModel(s:EnterpriseService,a:Actor,modelId:string){requireRole(a,'admin');if(!(await s.store.db.query('SELECT id FROM models WHERE id=$1',[modelId])).rows.length)throw new DomainError(400,'模型不存在');const id=randomUUID(),e={...starterEmployee('intake',modelId),id:'local-agent:model-test:'+id,enabled:true};const d:any={id:'starter-test-'+id,name:'模型连接测试',description:'仅验证 DSH 模型连接',nodes:[{id:'s',name:'开始',kind:'start'},{id:'test',name:'只回复连接成功，不处理业务',kind:'ai',agentId:e.id},{id:'e',name:'完成',kind:'end'}],edges:[{id:'a',from:'s',to:'test'},{id:'b',from:'test',to:'e'}]};const v={internal:true,id:randomUUID(),definitionId:d.id,number:1,definition:d,employees:[e],components:[]};const i=createInstance(v,'基础员工模型连接测试',a.id,{request:'仅返回 summary=连接成功，accepted=true，不操作业务'});await s.store.tx(async db=>{await s.store.lock(db);await db.query('INSERT INTO flow_versions VALUES($1,$2,1,$3)',[v.id,d.id,JSON.stringify(v)]);await db.query('INSERT INTO instances(id,body) VALUES($1,$2)',[i.id,JSON.stringify(i)]);});return i;}
