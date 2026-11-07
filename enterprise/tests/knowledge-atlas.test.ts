import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {Store} from '../src/db.ts';
import {EnterpriseService} from '../src/service.ts';
import {KnowledgeCollector} from '../src/knowledge-inputs.ts';
import {knowledgeAtlas,atlasRead,atlasOriginal,saveKnowledgeTaxonomy} from '../src/knowledge-atlas.ts';
test('atlas uses actual roots, resolves explicit links without guessing, pages notes and isolates reads',async()=>{
 const db=new PGlite(),store=new Store({query:(s,p)=>db.query(s,p)});let collector:KnowledgeCollector|undefined;
 try{await store.initialize();const service=new EnterpriseService(store,'1'.repeat(64)),admin:any={id:'admin',name:'管理',roles:['admin']},other:any={id:'other',roles:['executor']};collector=new KnowledgeCollector(service,'.enterprise-test/atlas-no-config');await collector.ready;
  for(let i=0;i<47;i++){const path=i===0?'制度/流程.md':i===1?'制度/验收.md':'制度/资料'+i+'.txt',text=i===0?'# 业务流程\n[[验收]]\n[[不存在]]\n[验收](验收.md)':'# 正文 '+i;await store.put('knowledgeDocuments',{id:'doc'+i,text,characters:text.length});await store.put('knowledgeInputs',{id:'file'+i,kind:'file',ownerId:'admin',name:path.split('/').at(-1),relativePath:path,status:'indexed',documentId:'doc'+i,version:1});}
  await store.put('knowledgeInputs',{id:'excluded',kind:'file',ownerId:'admin',name:'密钥.txt',relativePath:'私有/密钥.txt',status:'excluded'});
  const overview=await knowledgeAtlas(service,collector,admin,{});assert.equal(overview.groups.find(g=>g.name==='制度').count,47);assert.equal(overview.groups.length,2);assert.equal(overview.totalSources,48);
  const branch=await knowledgeAtlas(service,collector,admin,{root:'制度'});assert.equal(branch.notes.length,40);assert.equal(branch.hasMore,true);const rest=await knowledgeAtlas(service,collector,admin,{root:'制度',page:1});assert.equal(rest.notes.length,7);assert.equal(rest.hasMore,false);
  const result=await knowledgeAtlas(service,collector,admin,{root:'制度',query:'业务流程'});assert.equal(result.total,1);assert.equal(result.notes[0].title,'业务流程');assert.equal(result.notes[0].links.length,1);assert.equal(result.notes[0].links[0].id,'file1');assert.equal(result.notes[0].unresolvedLinks,1);assert.equal(result.links.edges.length,1);
  await atlasRead(service,collector,admin,'file0');await atlasRead(service,collector,admin,'file0');const read=await knowledgeAtlas(service,collector,admin,{});assert.equal(read.reads.length,1);assert.equal(read.reads[0].dates.length,1);assert.equal((await store.db.query('SELECT * FROM audit')).rows.length,0,'reading must not recursively become operation knowledge');
  const hidden=await knowledgeAtlas(service,collector,other,{});assert.equal(hidden.totalSources,0);assert.equal(hidden.reads.length,0);await assert.rejects(()=>atlasRead(service,collector!,other,'file0'),/权限/);await assert.rejects(()=>atlasRead(service,collector!,admin,'excluded'),/不可阅读/);await assert.rejects(()=>knowledgeAtlas(service,collector!,admin,{root:'../制度'}),/无效/);
 }finally{await collector?.close();await db.close();}
});
test('original downloads recheck actual filesystem boundaries and status',async()=>{
 await mkdir(resolve('.enterprise-test'),{recursive:true});const dir=await mkdtemp(resolve('.enterprise-test/atlas-original-'));const folder=resolve(dir,'files');await mkdir(folder);await writeFile(resolve(folder,'资料.md'),'# 原始中文资料');await writeFile(resolve(dir,'outside.txt'),'outside authorized folder');
 const actor:any={id:'admin',roles:['admin']};const source:any={kind:'file',status:'indexed',root:folder,relativePath:'资料.md',name:'资料.md'};const collector:any={preview:async()=>source};
 try{const file=await atlasOriginal(collector,actor,'source');assert.equal(file.bytes.toString(),'# 原始中文资料');source.relativePath='../outside.txt';await assert.rejects(()=>atlasOriginal(collector,actor,'source'),/位置已变化/);source.status='excluded';await assert.rejects(()=>atlasOriginal(collector,actor,'source'),/没有可用/);}finally{assert.ok(dir.startsWith(resolve('.enterprise-test')+sep));await rm(dir,{recursive:true,force:true});}
});

test('enterprise taxonomy keeps projects separate, persists department rules and never expands source access',async()=>{
 const db=new PGlite(),store=new Store({query:(s,p)=>db.query(s,p)});let collector:KnowledgeCollector|undefined;
 try{await store.initialize();const service=new EnterpriseService(store,'1'.repeat(64)),admin:any={id:'admin',roles:['admin']},other:any={id:'other',roles:['executor'],departmentId:'delivery'};collector=new KnowledgeCollector(service,'.enterprise-test/taxonomy-no-config');await collector.ready;
 await store.put('departments',{id:'delivery',name:'项目交付部'});
 for(const [id,path,text] of [['a','研发项目/方案.md','方案正文'],['b','规章/手册.md','安全规程'],['c','研发项目/清单.txt','交付清单']]){await store.put('knowledgeDocuments',{id:'doc-'+id,text,characters:text.length});await store.put('knowledgeInputs',{id,kind:'file',ownerId:'admin',name:path.split('/').at(-1),relativePath:path,status:'indexed',documentId:'doc-'+id});}
 const before=await knowledgeAtlas(service,collector,admin,{view:'enterprise',kind:'all'});assert.equal(before.groups.length,6);assert.equal(before.groups.find(g=>g.category==='project').count,3);assert.equal(before.groups.find(g=>g.category==='department').count,0);
 await assert.rejects(()=>saveKnowledgeTaxonomy(service,other,{rules:[]}),/权限/);await assert.rejects(()=>saveKnowledgeTaxonomy(service,admin,{rules:[{root:'研发项目',category:'department',departmentId:'missing'}]}),/部门/);
 await assert.rejects(()=>saveKnowledgeTaxonomy(service,admin,{rules:[{root:'../私有',category:'policy'}]}),/目录/);
 await saveKnowledgeTaxonomy(service,admin,{rules:[{root:'研发项目',category:'department',departmentId:'delivery'},{root:'规章',category:'policy'}]});
 const after=await knowledgeAtlas(service,collector,admin,{view:'enterprise',category:'department',departmentId:'delivery',kind:'all'});assert.equal(after.total,2);assert.equal(after.groups.find(g=>g.category==='policy').count,1);assert.equal(after.groups.find(g=>g.category==='project').count,0);assert.equal(after.notes[0].departmentId,'delivery');
 const search=await knowledgeAtlas(service,collector,admin,{view:'enterprise',kind:'all',query:'安全规程'});assert.equal(search.total,1);assert.equal(search.notes[0].id,'b');
 await store.put('knowledgeInputs',{id:'op-test',kind:'operation',ownerId:'admin',name:'实际操作',text:'测试操作正文',status:'indexed',origin:{}});const projectView=await knowledgeAtlas(service,collector,admin,{view:'projects'});assert.ok(projectView.groups.every(g=>g.kind==='file'));
 const roots=await knowledgeAtlas(service,collector,admin,{root:'研发项目'});assert.equal(roots.total,2,'project directory browsing survives classification');
 const denied=await knowledgeAtlas(service,collector,other,{view:'enterprise',kind:'all',category:'department'});assert.equal(denied.total,0);assert.deepEqual(denied.taxonomyRules,[]);assert.equal(denied.canClassify,false);assert.equal((await store.get('preferences','knowledge-taxonomy')).rules.length,2);
 }finally{await collector?.close();await db.close();}
});
