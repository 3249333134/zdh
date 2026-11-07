import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {Store} from '../src/db.ts';
import {EnterpriseService} from '../src/service.ts';
import {knowledgeChunks,indexKnowledge,reviewKnowledge,searchKnowledge} from '../src/knowledge.ts';
import {businessQuery} from '../src/actions.ts';
test('knowledge keeps provenance, publication, source versions and two permission boundaries',async()=>{
 const db=new PGlite(),store=new Store({query:(s,p)=>db.query(s,p)});try{await store.initialize();const service=new EnterpriseService(store,'1'.repeat(64));const admin:any={id:'admin',name:'管理员',roles:['admin'],departmentId:'a'},user:any={id:'reader',name:'读者',roles:['executor'],departmentId:'a'},outsider={...user,id:'other',departmentId:'b'};
 const m={id:'source',name:'设备保养规程',text:'设备保养必须先停止运行，再检查润滑。'.repeat(100),version:1,sha256:'hash-v1',departmentId:'a',visibility:'department'};await store.put('materials',m);
 const e=await indexKnowledge(service,admin,{materialId:m.id,category:'设备制度'});assert.equal((await indexKnowledge(service,admin,{materialId:m.id})).id,e.id,'重复入库幂等');assert.equal((await searchKnowledge(service,user,'设备保养')).count,0);
 await reviewKnowledge(service,admin,e.id,'published');const hits=await searchKnowledge(service,user,'设备保养');assert.ok(hits.count>0);const hit=hits.records[0];assert.equal(hit.text,m.text.slice(hit.start,hit.end));assert.equal(hit.sha256,'hash-v1');assert.equal((await searchKnowledge(service,outsider,'设备保养')).count,0);
 assert.equal((await businessQuery(service,user,{kind:'knowledge',search:'设备保养'},{materialIds:[]})).count,0);assert.ok((await businessQuery(service,user,{kind:'knowledge',search:'设备保养'},{materialIds:['source']})).count>0);
 await assert.rejects(()=>reviewKnowledge(service,user,e.id,'published'),/权限/);await reviewKnowledge(service,admin,e.id,'withdrawn');assert.equal((await searchKnowledge(service,user,'设备保养')).count,0);
 await reviewKnowledge(service,admin,e.id,'published');await store.put('materials',{...m,id:'source-v2',familyId:'source',version:2,text:'新版本',sha256:'hash-v2'});assert.equal((await searchKnowledge(service,user,'设备保养')).count,0);await assert.rejects(()=>reviewKnowledge(service,admin,e.id,'published'),/新版本/);
 }finally{await db.close();}
});
test('knowledge chunking has bounded overlap and covers original text',()=>{const text='中文内容abc'.repeat(1000),chunks=knowledgeChunks(text);assert.equal(chunks[0].start,0);assert.equal(chunks.at(-1)!.end,text.length);for(let i=0;i<chunks.length;i++){assert.ok(chunks[i].text.length<=900);assert.equal(chunks[i].text,text.slice(chunks[i].start,chunks[i].end));if(i)assert.equal(chunks[i-1].end-chunks[i].start,200);}});
