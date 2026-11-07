import {randomUUID} from 'node:crypto';
import {EnterpriseService,required,requireRole} from './service.ts';
import {visibleTo} from './business.ts';
import {DomainError,type Actor} from './types.ts';
import {inputHash} from './knowledge-inputs.ts';

// Offsets refer to the extracted original, so a search hit remains reproducible.
export function knowledgeChunks(text:string){const chunks=[];for(let start=0;start<text.length;start+=700){const end=Math.min(start+900,text.length);chunks.push({index:chunks.length,start,end,text:text.slice(start,end)});if(end===text.length)break;}return chunks;}
export async function knowledgeEntries(service:EnterpriseService,a:Actor){
  const materials=await service.records(a,'materials'),all=await service.store.list('materials');
  const result=[];for(const e of await service.records(a,'knowledgeEntries')){const m=materials.find(m=>m.id===e.materialId);if(!m)continue;const latest=Math.max(...all.filter(x=>(x.familyId||x.id)===(m.familyId||m.id)).map(x=>x.version||1));let inputStale=false;if(m.inputId){const s=await service.store.get('knowledgeInputs',m.inputId),d=s?.documentId?await service.store.get('knowledgeDocuments',s.documentId):s;inputStale=!s||s.status!=='indexed'||inputHash(d?.text||'')!==m.sourceHash;}result.push({...e,chunks:undefined,chunkCount:e.chunks?.length||0,material:{id:m.id,name:m.name,version:m.version||1,sha256:m.sha256},stale:inputStale||latest>(m.version||1)||e.sha256!==m.sha256});}return result;
}
export async function indexKnowledge(service:EnterpriseService,a:Actor,input:any){
  requireRole(a,'admin','manager');return service.store.tx(async db=>{await service.store.lock(db);const m=await service.store.get('materials',required(input.materialId,'来源资料',200),db);
    if(!m||!visibleTo(a,m)||!a.roles.includes('admin')&&m.departmentId!==a.departmentId)throw new DomainError(403,'没有维护此来源资料的权限');
    const name=required(input.name||m.name,'知识标题',300),category=required(input.category||'通用知识','知识分类',100),text=String(m.text||'');if(!text.trim())throw new DomainError(400,'正文为空，扫描件需先完成 OCR 后重新导入');if(text.length>2000000)throw new DomainError(400,'资料正文超过200万字，请拆分后导入');
    const old=(await service.store.list('knowledgeEntries',db)).find(e=>e.materialId===m.id);if(old)return old;
    const entry={id:randomUUID(),name,category,materialId:m.id,sha256:m.sha256,version:m.version||1,departmentId:m.departmentId,visibility:m.visibility,creatorId:a.id,status:'draft',chunks:knowledgeChunks(text),createdAt:new Date().toISOString()};
    await service.store.put('knowledgeEntries',entry,db);await service.store.audit(a.id,'knowledge.index',entry.id,{materialId:m.id,chunks:entry.chunks.length},db);return {...entry,chunks:undefined};});
}
export async function reviewKnowledge(service:EnterpriseService,a:Actor,id:string,status:string){
  requireRole(a,'admin','manager');if(!['published','withdrawn'].includes(status))throw new DomainError(400,'知识状态无效');
  return service.store.tx(async db=>{await service.store.lock(db);const e=await service.store.get('knowledgeEntries',id,db),m=e&&await service.store.get('materials',e.materialId,db);if(!e||!m||!visibleTo(a,m)||!a.roles.includes('admin')&&m.departmentId!==a.departmentId)throw new DomainError(403,'没有发布此知识的权限');
    const all=await service.store.list('materials',db);if(status==='published'&&(e.sha256!==m.sha256||all.some(x=>(x.familyId||x.id)===(m.familyId||m.id)&&(x.version||1)>(m.version||1))))throw new DomainError(409,'来源已有新版本，请将新资料入库并审核');
    e.status=status;e.reviewerId=a.id;e.reviewedAt=new Date().toISOString();await service.store.put('knowledgeEntries',e,db);await service.store.audit(a.id,'knowledge.'+status,e.id,{materialId:m.id,version:e.version},db);return {...e,chunks:undefined};});
}
export async function searchKnowledge(service:EnterpriseService,a:Actor,query:string,scope?:{materialIds?:string[]},category=''){
  const q=required(query,'检索问题',200).toLowerCase(),terms=[...new Set(q.match(/[a-z0-9_]+|[\u3400-\u9fff]{2}/g)||[q])];
  const entries=await knowledgeEntries(service,a),hits:any[]=[];
  for(const info of entries){if(info.status!=='published'||info.stale||category&&info.category!==category||scope&&!scope.materialIds?.includes(info.materialId))continue;
    const entry=await service.store.get('knowledgeEntries',info.id);for(const c of entry.chunks||[]){const text=c.text.toLowerCase(),score=(text.includes(q)?20:0)+terms.reduce((sum,t)=>sum+(text.includes(t)?1:0),0);if(score)hits.push({id:info.id+':'+c.index,entryId:info.id,name:info.name,category:info.category,materialId:info.materialId,version:info.version,sha256:info.sha256,chunk:c.index+1,start:c.start,end:c.end,text:c.text,score});}
  }
  hits.sort((x,y)=>y.score-x.score||x.id.localeCompare(y.id));return {method:'keyword',query,records:hits.slice(0,12),count:hits.length,truncated:hits.length>12};
}
