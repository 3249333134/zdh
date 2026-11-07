import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {mkdtemp,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {Store} from '../src/db.ts';
import {EnterpriseService} from '../src/service.ts';
import {createApi} from '../src/http.ts';
test('HTTP permissions, original attachments, credential exclusion, backup validation and legacy mapping',async()=>{
  const db=new PGlite(),store=new Store({query:(sql,params)=>db.query(sql,params)});await store.initialize();const service=new EnterpriseService(store,'3'.repeat(64));
  const root=await mkdtemp(resolve('.enterprise-test/http-'));const api=createApi(service,root,'setup-test-token');await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+(api.address() as any).port;
  async function request(path:string,method='GET',body?:any,token='',headers:any={}){const response=await fetch(base+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,body:await response.json()};}
  try{
    assert.equal((await request('/api/state')).status,401);
    assert.equal((await request('/api/bootstrap','POST',{name:'管理员',login:'admin',password:'test-password-123'})).status,403);
    assert.equal((await request('/api/bootstrap','POST',{name:'管理员',login:'admin',password:'test-password-123'},'',{'x-setup-token':'setup-test-token'})).status,201);
    const login=await request('/api/login','POST',{login:'admin',password:'test-password-123'}),token=login.body.token,actor=login.body.actor;
    await service.saveRecord(actor,'departments',{id:'a',name:'甲部门'});await service.saveRecord(actor,'departments',{id:'b',name:'乙部门'});
    await service.saveUser(actor,{name:'乙部门员工',login:'user',password:'test-password-123',roles:['executor'],departmentId:'b'});
    const user=(await request('/api/login','POST',{login:'user',password:'test-password-123'})).body.token;
    assert.equal((await request('/api/users','POST',{name:'越权'},user)).status,403);
    const raw=new TextEncoder().encode('企业原始资料，仅甲部门可见');
    const upload=await fetch(base+'/api/materials',{method:'POST',headers:{authorization:'Bearer '+token,'x-file-name':encodeURIComponent('原始资料.txt'),'x-department-id':'a'},body:raw});assert.equal(upload.status,201);const material=await upload.json();
    const original=await fetch(base+'/api/materials/'+material.id+'/file',{headers:{authorization:'Bearer '+token}});assert.deepEqual(new Uint8Array(await original.arrayBuffer()),raw);
    const newVersion=await fetch(base+'/api/materials',{method:'POST',headers:{authorization:'Bearer '+token,'x-file-name':encodeURIComponent('原始资料.txt'),'x-department-id':'a','x-previous-material':material.id},body:raw});assert.equal(newVersion.status,201);const second=await newVersion.json();assert.equal(second.version,2);assert.equal(second.familyId,material.id);
    assert.equal((await fetch(base+'/api/materials/'+material.id+'/file',{headers:{authorization:'Bearer '+user}})).status,404);
    await service.saveModel(actor,{name:'加密测试',model:'test',baseUrl:'https://example.com/v1',apiKey:'secret-must-not-leak'});
    const state=(await request('/api/state','GET',undefined,token)).body;assert.ok(!JSON.stringify(state).includes('secret-must-not-leak'));assert.ok(!JSON.stringify(state).includes('password'));
    const backup=(await request('/api/backup','GET',undefined,token)).body;assert.equal(backup.files.length,2);assert.ok(!JSON.stringify(backup).includes('secret-must-not-leak'));
    const broken=structuredClone(backup);broken.files[0].id='../bad';assert.equal((await request('/api/restore','POST',{backup:broken},token)).status,400);assert.equal((await service.store.list('materials')).length,2);
    const incomplete=structuredClone(backup);incomplete.files.pop();assert.equal((await request('/api/restore','POST',{backup:incomplete},token)).status,400);
    assert.equal((await request('/api/restore','POST',{backup},token)).status,200);
    const legacy={format:'enterprise-workbench',version:1,data:{projects:[{id:'old-p',title:'旧项目',goal:'目标',owner:'张工',due:''}],tasks:[{id:'old-t',project_id:'old-p',title:'旧任务',owner:'张工',status:'todo',due:''}],materials:[],drafts:[],reviews:[]}};
    assert.equal((await request('/api/migrate','POST',{backup:legacy,mapping:{},departmentId:'a'},token)).status,400);
    assert.equal((await request('/api/migrate','POST',{backup:legacy,mapping:{张工:actor.id},departmentId:'a'},token)).status,200);
    assert.equal((await request('/api/migrate','POST',{backup:legacy,mapping:{张工:actor.id},departmentId:'a'},token)).status,409);
  }finally{api.closeAllConnections();await new Promise<void>(r=>api.close(()=>r()));await db.close();assert.ok(root.startsWith(resolve('.enterprise-test')+requireSeparator()));await rm(root,{recursive:true,force:true});}
});
function requireSeparator(){return process.platform==='win32'?'\\':'/';}
