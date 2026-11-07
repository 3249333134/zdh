import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {unzipSync} from 'fflate';
import {Store} from '../src/db.ts';
import {EnterpriseService} from '../src/service.ts';
import {createApi} from '../src/http.ts';
test('HTTP manufacturing archive includes actual original and signature; source corruption is rejected',{timeout:30000},async()=>{
 const db=new PGlite(),store=new Store({query:(s,p)=>db.query(s,p)});await store.initialize();const service=new EnterpriseService(store,'b'.repeat(64));await service.bootstrap({name:'管理员',login:'admin',password:'test-password-123'});const {token,actor}=await service.login('admin','test-password-123');await mkdir('.enterprise-test',{recursive:true});const root=await mkdtemp(resolve('.enterprise-test/制造原件-'));const api=createApi(service,root,'test-init');await new Promise<void>(ok=>api.listen(0,'127.0.0.1',ok));const base='http://127.0.0.1:'+(api.address() as any).port;
 const request=async(path:string,body?:any)=>fetch(base+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+token,'content-type':'application/json','idempotency-key':crypto.randomUUID()},body:body?JSON.stringify(body):undefined});
 try{
  const original=Buffer.from('真实原始检验报告字节，仅用于明确标记的测试');const uploaded=await fetch(base+'/api/materials',{method:'POST',headers:{authorization:'Bearer '+token,'x-file-name':encodeURIComponent('客户检验报告.txt'),'content-type':'application/octet-stream'},body:original});assert.equal(uploaded.status,201);const m=await uploaded.json();
  const imported=await request('/api/factory/records',{scene:'trace',rows:[{externalId:'SO-TRACE',shipmentId:'SO-TRACE',batchId:'PB-01',materialBatchId:'RM-01',processRecord:'机加→检验',inspectionMaterialId:m.id,equipmentId:'EQ-01',shift:'A班',customer:'测试客户'}]});assert.equal(imported.status,201);const caseId=(await imported.json()).caseIds[0];
  const signed=await request('/api/factory/cases/'+caseId+'/commands',{action:'review',decision:'approve',disposition:'确认追溯归档',note:'品质已核对资料完整，同意本地归档',revision:1});assert.equal(signed.status,200);const receiptId=(await signed.json()).receiptId;
  const packaged=await request('/api/factory/receipts/'+receiptId+'/package');assert.equal(packaged.status,200);const entries=unzipSync(new Uint8Array(await packaged.arrayBuffer()));assert.ok(entries['签字回执与追溯依据.docx']);const attachment=Object.keys(entries).find(k=>k.startsWith('来源资料/'))!;assert.deepEqual(Buffer.from(entries[attachment]),original);
  const backup=await (await request('/api/backup')).json();assert.ok(backup.records.some((r:any)=>r.kind==='factoryCases'));assert.ok(backup.records.some((r:any)=>r.kind==='factoryReceipts'));
  await writeFile(join(root,'attachments',m.id),'被篡改的原始文件');assert.equal((await request('/api/factory/receipts/'+receiptId+'/package')).status,409);
 }finally{api.closeAllConnections();await new Promise<void>(ok=>api.close(()=>ok()));await db.close();await rm(root,{recursive:true,force:true});}
});
