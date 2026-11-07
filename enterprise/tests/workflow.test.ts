import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {Store} from '../src/db.ts';
import {EnterpriseService} from '../src/service.ts';
import {installSample} from '../src/sample.ts';
import {Scheduler} from '../src/worker.ts';
import {currentRuns,validateDefinition} from '../src/engine.ts';
import type {Actor,Executor,Instance} from '../src/types.ts';
async function fixture(){const db=new PGlite();const store=new Store({query:async(sql,params)=>db.query(sql,params)});await store.initialize();const service=new EnterpriseService(store,'1'.repeat(64));await service.bootstrap({name:'管理员',login:'admin',password:'test-password-123'});const admin=(await service.login('admin','test-password-123')).actor;await installSample(service,admin);const actors:Record<string,Actor>={admin};for(const role of ['manager','executor','reviewer'] as const){const saved=await service.saveUser(admin,{name:role,login:role,password:'test-password-123',roles:[role],departmentId:'delivery'});actors[role]={id:saved.id,name:role,roles:[role],departmentId:'delivery'};}return {db,store,service,actors};}
const runOf=(i:Instance,nodeId:string)=>currentRuns(i).find(r=>r.nodeId===nodeId)!;
test('PostgreSQL-backed multi-role delivery: AI, parallel join, approval, return, idempotence and immutable versions',async()=>{
  const f=await fixture();try{
    const {service,actors,store}=f;const version=await service.publish(actors.admin,'project-delivery');const instance=await service.start(actors.manager,version.id,'验收项目',{});
    const load=async()=> (await service.instances(actors.admin)).find(i=>i.id===instance.id)!;
    const handle=async(actor:Actor,node:string,decision='complete',key=crypto.randomUUID())=>{const i=await load();return service.command(actor,i.id,key,{action:'handle',runId:runOf(i,node).id,decision,output:{summary:'已核实',requirements:'交付一个可用结果',delivery:'交付内容',evidence:'证据'}});};
    await assert.rejects(()=>handle(actors.executor,'intake'),/权限/);await handle(actors.manager,'intake');
    const fake:Executor={execute:async(_i,n)=>({output:{summary:n.name+'（明确标记的测试模型）',accepted:true},sessionId:'test-session'})};const scheduler=new Scheduler(store,fake);
    await scheduler.tick();assert.equal(runOf(await load(),'plan-review').status,'waiting');assert.equal(runOf(await load(),'execute-a').status,'blocked');
    const key=crypto.randomUUID(),request={action:'handle',runId:runOf(await load(),'plan-review').id,decision:'approve',output:{summary:'审批通过'}};await service.command(actors.manager,instance.id,key,request);await service.command(actors.manager,instance.id,key,request);
    await handle(actors.executor,'execute-a');assert.equal(runOf(await load(),'quality').status,'blocked');await handle(actors.executor,'execute-b');await scheduler.tick();assert.equal(runOf(await load(),'acceptance').status,'waiting');
    await handle(actors.reviewer,'acceptance','reject');assert.equal((await load()).generation,2);assert.equal(runOf(await load(),'execute-a').status,'waiting');assert.equal((await load()).runs.filter(r=>r.nodeId==='acceptance'&&r.generation===1)[0].status,'complete');
    await handle(actors.executor,'execute-a');await handle(actors.executor,'execute-b');await scheduler.tick();await handle(actors.reviewer,'acceptance','approve');await scheduler.tick();assert.equal((await load()).status,'completed');
    const draft=await store.get('definitions','project-delivery');draft.name='修改后的草稿';await service.saveRecord(actors.admin,'definitions',draft);assert.equal((await load()).version.definition.name,'项目交付流程');
    await assert.rejects(()=>service.command(actors.manager,instance.id,key,{...request,decision:'reject'}),/冲突/);
  }finally{await f.db.close();}
});
test('model failure, manual retry, expired lease recovery and cancellation never advance approvals',async()=>{
  const f=await fixture();try{const {service,actors,store}=f;const v=await service.publish(actors.admin,'project-delivery');const i=await service.start(actors.admin,v.id,'异常验收',{});let current=i;
    await service.command(actors.admin,i.id,'intake',{action:'handle',runId:runOf(i,'intake').id,decision:'complete',output:{requirements:'需求'}});
    const scheduler=new Scheduler(store,{execute:async()=>{throw new Error('测试模型认证失败');}});await scheduler.tick();current=(await service.instances(actors.admin))[0];assert.equal(runOf(current,'plan').status,'failed');assert.equal(runOf(current,'plan-review').status,'blocked');
    await service.command(actors.admin,i.id,'retry',{action:'retry',runId:runOf(current,'plan').id});current=(await service.instances(actors.admin))[0];const r=runOf(current,'plan');r.status='running';r.leaseUntil=new Date(0).toISOString();await store.db.query('UPDATE instances SET body=$2 WHERE id=$1',[i.id,JSON.stringify(current)]);await scheduler.tick();current=(await service.instances(actors.admin))[0];assert.equal(runOf(current,'plan').status,'unknown');
    await assert.rejects(()=>service.command(actors.admin,i.id,'uncertain',{action:'retry',runId:r.id}),/确认/);
    await service.command(actors.admin,i.id,'cancel',{action:'cancel'});await scheduler.tick();assert.equal((await service.instances(actors.admin))[0].status,'cancelled');
  }finally{await f.db.close();}
});
test('definition validation rejects unreachable nodes and cycles',()=>{
  assert.throws(()=>validateDefinition({id:'x',name:'坏流程',description:'',nodes:[{id:'s',name:'开始',kind:'start'},{id:'e',name:'结束',kind:'end'},{id:'orphan',name:'孤立',kind:'end'}],edges:[{id:'1',from:'s',to:'e'}]}),/无法从起点/);
});
test('subflow versions remain bound and parent cancellation stops child work',async()=>{
  const f=await fixture();try{const {service,actors,store}=f;
    const child={id:'child',name:'岗位子流程',description:'',nodes:[{id:'s',name:'开始',kind:'start'},{id:'h',name:'人工交付',kind:'human',role:'executor'},{id:'e',name:'结束',kind:'end'}],edges:[{id:'a',from:'s',to:'h'},{id:'b',from:'h',to:'e'}]};
    await service.saveRecord(actors.admin,'definitions',child);const childVersion=await service.publish(actors.admin,'child');
    await service.saveRecord(actors.admin,'definitions',{id:'parent',name:'父流程',description:'',nodes:[{id:'s',name:'开始',kind:'start'},{id:'sub',name:'调用岗位',kind:'subflow',subflowId:'child'},{id:'e',name:'结束',kind:'end'}],edges:[{id:'a',from:'s',to:'sub'},{id:'b',from:'sub',to:'e'}]});
    const parentVersion=await service.publish(actors.admin,'parent');child.name='修改后的子流程';await service.saveRecord(actors.admin,'definitions',child);await service.publish(actors.admin,'child');
    const parent=await service.start(actors.admin,parentVersion.id,'子流程验收',{});const scheduler=new Scheduler(store,{execute:async()=>{throw new Error('不应调用模型');}});await scheduler.tick();const all=await service.instances(actors.admin),p=all.find(i=>i.id===parent.id)!,c=all.find(i=>i.parent?.instanceId===parent.id)!;assert.equal(c.version.id,childVersion.id);assert.equal(runOf(p,'sub').status,'waiting');
    await service.command(actors.admin,parent.id,'cancel-parent',{action:'cancel'});assert.equal((await service.instances(actors.admin)).find(i=>i.id===c.id)!.status,'cancelled');
  }finally{await f.db.close();}
});
test('failed quality enters manual handling; task dependencies and component parents cannot cycle',async()=>{
  const f=await fixture();try{const {service,actors,store}=f;const v=await service.publish(actors.admin,'project-delivery');const i=await service.start(actors.manager,v.id,'质检不合格验收',{});const load=async()=>(await service.instances(actors.admin)).find(x=>x.id===i.id)!;
    const handle=async(role:string,node:string,decision='complete')=>service.command(actors[role],i.id,crypto.randomUUID(),{action:'handle',runId:runOf(await load(),node).id,decision,output:{requirements:'需求',summary:'人工处理确认',delivery:'交付',evidence:'证据',resolution:'已核实并补充资料'}});
    const scheduler=new Scheduler(store,{execute:async()=>({output:{summary:'测试模型：质检不合格',accepted:false},sessionId:'TEST'})});await handle('manager','intake');await scheduler.tick();await handle('manager','plan-review','approve');await handle('executor','execute-a');await handle('executor','execute-b');await scheduler.tick();assert.equal(runOf(await load(),'exception').status,'waiting');assert.equal(runOf(await load(),'acceptance').status,'blocked');await handle('manager','exception');assert.equal(runOf(await load(),'acceptance').status,'waiting');
    await service.saveRecord(actors.admin,'projects',{id:'p',title:'依赖测试',departmentId:'delivery'});await service.saveRecord(actors.admin,'tasks',{id:'a',title:'a',projectId:'p',status:'todo',dependencies:[]});await service.saveRecord(actors.admin,'tasks',{id:'b',title:'b',projectId:'p',status:'todo',dependencies:['a']});await assert.rejects(()=>service.saveRecord(actors.admin,'tasks',{id:'a',title:'a',projectId:'p',status:'todo',dependencies:['b']}),/不能成环/);
    const component={name:'组件',ownerRole:'executor',inputFields:[],outputs:['交付'],responsibility:'职责',acceptance:'标准',enabled:true};await service.saveRecord(actors.admin,'components',{...component,id:'ca'});await service.saveRecord(actors.admin,'components',{...component,id:'cb',parentComponentId:'ca'});await assert.rejects(()=>service.saveRecord(actors.admin,'components',{...component,id:'ca',parentComponentId:'cb'}),/不能成环/);
  }finally{await f.db.close();}
});
