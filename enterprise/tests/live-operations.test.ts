import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {Store} from '../src/db.ts';
import {EnterpriseService} from '../src/service.ts';
import {installSample} from '../src/sample.ts';
import {Scheduler,DshExecutor} from '../src/worker.ts';
import {currentRuns} from '../src/engine.ts';
test('production model guard waits without attempts, resumes after configuration, preserves human approval',async()=>{
 const db=new PGlite();const store=new Store({query:(sql,params)=>db.query(sql,params)});await store.initialize();const service=new EnterpriseService(store,'1'.repeat(64));
 try{
  await service.bootstrap({name:'测试管理员',login:'admin',password:'test-password-123'});const {actor}=await service.login('admin','test-password-123');await installSample(service,actor);
  const version=await service.publish(actor,'project-delivery'),instance=await service.start(actor,version.id,'明确标记的自动化测试',{});
  const load=async()=>(await service.instances(actor)).find(i=>i.id===instance.id)!;const run=async(id:string)=>currentRuns(await load()).find(r=>r.nodeId===id)!;
  const guard=new DshExecutor(store,'1'.repeat(64),'.enterprise-test','upstream/deepseek-harness-master');let executions=0;
  const scheduler=new Scheduler(store,{configurationError:guard.configurationError.bind(guard),execute:async()=>{executions++;return {output:{summary:'明确标记的测试模型输出',accepted:true},sessionId:'TEST-ONLY'};}});
  await scheduler.tick();assert.equal((await run('intake')).status,'waiting');assert.equal(executions,0);
  const request={action:'handle',runId:(await run('intake')).id,decision:'complete',output:{requirements:'测试交付要求'}};
  await service.command(actor,instance.id,'human-intake-once',request);await service.command(actor,instance.id,'human-intake-once',request);
  await scheduler.tick();await scheduler.tick();assert.equal(executions,0);assert.equal((await run('plan')).status,'ready');assert.equal((await run('plan')).attempt,0);assert.match((await run('plan')).error!,/^待配置模型：/);assert.equal((await run('plan-review')).status,'blocked');
  const waits=(await store.db.query("SELECT * FROM audit WHERE action='ai.configuration.wait'")).rows;assert.equal(waits.length,1,'unchanged waiting state must not flood audit');
  const model=await service.saveModel(actor,{name:'仅供自动化测试',baseUrl:'http://127.0.0.1:9/v1',model:'TEST-ONLY',apiKey:'TEST-ONLY'});const employee=await store.get('employees','planner');employee.modelId=model.id;await service.saveRecord(actor,'employees',employee);
  await scheduler.tick();assert.equal(executions,1);assert.equal((await run('plan')).attempt,1);assert.equal((await run('plan')).error,undefined);assert.equal((await run('plan-review')).status,'waiting');assert.equal((await run('execute-a')).status,'blocked');await scheduler.tick();assert.equal(executions,1,'AI must not replace human approval');
 }finally{await db.close();}
});
