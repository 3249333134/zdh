import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {EnterpriseService} from './service.ts';
import {actionCatalog,businessQuery,proposeAction,currentActor} from './actions.ts';
import type {Instance,Employee,NodeRun} from './types.ts';
import {visibleTo} from './business.ts';
export async function actionBridge(service:EnterpriseService,i:Instance,r:NodeRun,employee:Employee,signal:AbortSignal){
  const token=randomBytes(32).toString('hex'),sources=new Map<string,any>();let closed=false;
  const server=createServer(async(req,res)=>{try{
    if(closed||signal.aborted||req.method!=='POST'||req.headers.authorization!=='Bearer '+token){res.writeHead(403);res.end();return;}
    // Bind identity and scope to this server-created execution, never to model arguments.
    const persisted=(await service.store.db.query('SELECT body FROM instances WHERE id=$1',[i.id])).rows[0]?.body;
    const run=persisted?.runs.find((x:any)=>x.id===r.id&&x.attempt===r.attempt&&x.status==='running');if(!run||persisted.status!=='running')throw new Error('本次执行已结束或取消');
    const a=await currentActor(service,i.copilot!.actorId),live=await service.store.get('employees',employee.id);if(!live?.enabled||!visibleTo(a,live)||!live.allowedTools.includes('read_context'))throw new Error('数字员工已停用或业务读取权限已撤销');
    let body='';for await(const chunk of req){body+=chunk;if(body.length>24000)throw new Error('业务工具参数过大');}const args=JSON.parse(body||'{}');let value:any;
    if(req.url==='/catalog')value=actionCatalog(a);
    else if(req.url==='/query')value=await businessQuery(service,a,args,{projectId:i.copilot!.projectId,materialIds:employee.materialIds.filter(id=>live.materialIds.includes(id)),wikiPageIds:i.copilot!.wikiPageIds||[]});
    else if(req.url==='/propose'){
      if(!live.allowedTools.includes('submit_result')||!employee.allowedTools.includes('submit_result'))throw new Error('该岗位未授权提交建议');
      value=await proposeAction(service,a,args,{instanceId:i.id,runId:r.id,attempt:r.attempt,projectId:i.copilot!.projectId});
      value={id:value.id,status:value.status,name:value.name,message:'已提交待本人确认，尚未变更正式业务'};
    }else throw new Error('此入口不提供确认、审批或数据库操作');
    if(req.url==='/query'&&(args.kind==='knowledge'||args.kind==='wiki'))for(const row of value.records)sources.set(row.id,{id:row.materialId||row.id,name:row.name,version:row.version,sha256:row.sha256,chunk:row.chunk,start:row.start,end:row.end,quote:row.text});
    if(req.url==='/query'&&['materials','factoryKnowledge'].includes(args.kind))for(const row of value.records){const m=args.kind==='materials'?row:row.material;sources.set(m.id,{id:m.id,name:m.name,version:m.version,sha256:m.sha256});}
    await service.store.audit(a.id,'copilot.tool',i.id,{runId:r.id,attempt:r.attempt,tool:req.url,kind:args.kind,recordIds:value.records?.map((r:any)=>r.id),materialRefs:Array.from(sources.values())});res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(value));
  }catch(e){res.writeHead(400,{'content-type':'application/json'});res.end(JSON.stringify({error:e instanceof Error?e.message:'业务工具执行失败'}));}});
  await new Promise<void>((ok,bad)=>{server.once('error',bad);server.listen(0,'127.0.0.1',ok);});
  return {url:'http://127.0.0.1:'+(server.address() as any).port,token,sources,close:async()=>{closed=true;server.closeAllConnections();await new Promise<void>(ok=>server.close(()=>ok()));}};
}
