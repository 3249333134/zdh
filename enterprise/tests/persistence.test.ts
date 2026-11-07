import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {Store} from '../src/db.ts';
import {EnterpriseService} from '../src/service.ts';
import {installSample} from '../src/sample.ts';
import {currentRuns} from '../src/engine.ts';
test('database reopen preserves Chinese records, immutable version and human waiting task',async()=>{
  await mkdir(resolve('.enterprise-test'),{recursive:true});const path=await mkdtemp(resolve('.enterprise-test/中文持久化-'));let database=new PGlite(path);
  const open=async()=>{const store=new Store({query:(sql,params)=>database.query(sql,params)});await store.initialize();return new EnterpriseService(store,'5'.repeat(64));};
  try{let service=await open();await service.bootstrap({name:'中文管理员',login:'admin',password:'test-password-123'});const {actor}=await service.login('admin','test-password-123');await installSample(service,actor);await service.saveRecord(actor,'projects',{id:'persistent-project',title:'重启后保留的项目',departmentId:'delivery'});const version=await service.publish(actor,'project-delivery');const instance=await service.start(actor,version.id,'重启恢复待办',{});await database.close();
    database=new PGlite(path);service=await open();const restored=(await service.instances(actor)).find(i=>i.id===instance.id)!;assert.equal(restored.version.id,version.id);assert.equal(currentRuns(restored).find(r=>r.nodeId==='intake')!.status,'waiting');assert.equal((await service.records(actor,'projects'))[0].title,'重启后保留的项目');assert.ok((await service.login('admin','test-password-123')).token);
  }finally{await database.close();assert.ok(path.startsWith(resolve('.enterprise-test')+sep));await rm(path,{recursive:true,force:true});}
});
