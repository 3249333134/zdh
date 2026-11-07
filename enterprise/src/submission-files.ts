import {randomUUID,createHash} from 'node:crypto';
import {mkdir,writeFile,unlink} from 'node:fs/promises';
import {join,extname,basename} from 'node:path';
import {DomainError,type Actor,type Instance} from './types.ts';
import {currentRuns,mayHandle} from './engine.ts';
import {instanceVisible} from './business.ts';
import type {Store,Connection} from './db.ts';
const allowed=new Set(['.txt','.md','.pdf','.doc','.docx','.xls','.xlsx','.csv','.ppt','.pptx','.png','.jpg','.jpeg','.gif','.webp','.svg','.zip','.rar','.7z','.mp4','.mov','.avi','.webm']);
export async function submissionScope(store:Store,db:Connection,a:Actor,i:Instance,runId:string,taskId?:string){
 const run=currentRuns(i).find(r=>r.id===runId),node=i.version.definition.nodes.find(n=>n.id===run?.nodeId);if(!instanceVisible(a,i)||i.status!=='running'||!run||run.status!=='waiting'||!node||!['human','approval'].includes(node.kind)||!mayHandle(a,node,run,i.departmentId))throw new DomainError(403,'当前节点不可上传或提交附件');
 let task:any;if(taskId){task=await store.get('tasks',taskId,db);if(!task||task.sourceInstanceId!==i.id&&task.workPlanId!==i.id||task.executionNodeId!==node.id||task.status==='done'||task.status==='cancelled'||task.assigneeId&&task.assigneeId!==a.id&&!a.roles.includes('admin'))throw new DomainError(403,'没有此任务的附件提交权限');}else if(node.taskGroup||i.workPlanRevision&&node.taskIndex!==undefined)throw new DomainError(400,'请先选择具体任务');
 return {run,node,round:task?.round||0};
}
export const fileRef=(m:any)=>({id:m.id,name:m.name,size:m.size,sha256:m.sha256,version:m.version||1});
export async function uploadSubmission(store:Store,root:string,a:Actor,instanceId:string,runId:string,taskId:string|undefined,generation:number,round:number,name:string,raw:Buffer){
 if(!raw.length||raw.length>10*1024*1024)throw new DomainError(413,'附件须为 1 字节至 10MB');if(name!==basename(name)||/[\\/\x00-\x1f]/.test(name)||name.length>240||!allowed.has(extname(name).toLowerCase()))throw new DomainError(400,'不支持的附件名称或格式');
 const id=randomUUID();await mkdir(join(root,'attachments'),{recursive:true});await writeFile(join(root,'attachments',id),raw,{flag:'wx'});try{return await store.tx(async db=>{await store.lock(db);const i=(await db.query('SELECT body FROM instances WHERE id=$1',[instanceId])).rows[0]?.body;if(!i)throw new DomainError(404,'业务不存在');const scope=await submissionScope(store,db,a,i,runId,taskId);if(i.generation!==generation||scope.round!==round)throw new DomainError(409,'办理轮次变化，请重新选择附件');const m={id,name,size:raw.length,sha256:createHash('sha256').update(raw).digest('hex'),text:'',version:1,private:true,creatorId:a.id,departmentId:i.departmentId,createdAt:new Date().toISOString(),submission:{instanceId,runId,taskId:taskId||'',generation,round,state:'staged'}};await store.put('materials',m,db);return fileRef(m);});}catch(e){await unlink(join(root,'attachments',id)).catch(()=>{});throw e;}
}
export async function submissionVisible(store:Store,a:Actor,m:any,db:Connection=store.db){if(!m?.submission)return false;const i=(await db.query('SELECT body FROM instances WHERE id=$1',[m.submission.instanceId])).rows[0]?.body;return !!i&&instanceVisible(a,i)&&(m.submission.state==='committed'||m.creatorId===a.id);}
export async function commitSubmission(store:Store,db:Connection,a:Actor,i:Instance,request:any){
 const ids=request.attachmentIds||request.output?.attachmentIds||[];if(!Array.isArray(ids)||ids.length>20||ids.some((id:any)=>typeof id!=='string')||new Set(ids).size!==ids.length)throw new DomainError(400,'一次最多提交 20 个附件，且不能重复');if(!ids.length)return [];
 const scope=await submissionScope(store,db,a,i,request.runId,request.taskId),refs=[];for(const id of ids){const m=await store.get('materials',id,db),s=m?.submission;if(!s||m.creatorId!==a.id||s.instanceId!==i.id||s.runId!==request.runId||s.taskId!==(request.taskId||'')||s.generation!==i.generation||s.round!==scope.round||s.state!=='staged')throw new DomainError(409,'附件与当前人员、任务或办理轮次不匹配，请重新上传');s.state='committed';s.committedAt=new Date().toISOString();await store.put('materials',m,db);refs.push(fileRef(m));}return refs;
}
