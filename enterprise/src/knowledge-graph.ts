import type {EnterpriseService} from './service.ts';
import {DomainError,type Actor} from './types.ts';
import {inputVisible,KnowledgeCollector} from './knowledge-inputs.ts';
export async function knowledgeGraph(service:EnterpriseService,collector:KnowledgeCollector,a:Actor,input:{path?:string;kind?:string;query?:string}){
 const path=String(input.path||'').replaceAll('\\','/').replace(/\/+$/,''),kind=input.kind||'',query=String(input.query||'').slice(0,200);if(path.split('/').some(x=>x==='..'||x==='.')||path.startsWith('/')||path.includes(':'))throw new DomainError(400,'目录位置无效');if(!['','file','operation','output'].includes(kind))throw new DomainError(400,'来源类型无效');
 const nodes:any[]=[{id:'root',label:query?'检索结果':path||'企业知识库',type:'root',count:0}],edges:any[]=[];const add=(node:any,parent:string)=>{nodes.push(node);edges.push({id:parent+'>'+node.id,from:parent,to:node.id,relation:'包含'});};
 if(query){const list=await collector.list(a,kind,query,'',0);for(const r of list.records)add({id:r.id,inputId:r.id,label:r.name,type:r.kind,status:r.status,path:r.relativePath,origin:r.origin},'root');nodes[0].count=list.records.length;return {nodes,edges,path,query,truncated:list.hasMore,description:'仅展示本人可见的真实来源，检索结果最多30项'};}
 const metadata=(await service.store.db.query("SELECT id,body->>'kind' AS kind,body->>'relativePath' AS path,body->>'name' AS name,body->>'status' AS status,body->'origin' AS origin FROM records WHERE kind='knowledgeInputs' AND ($1::boolean OR body->>'ownerId'=$2) ORDER BY updated_at DESC",[a.roles.includes('admin'),a.id])).rows;
 const groups=['file','operation','output'].filter(k=>!kind||k===kind),labels:any={file:'目录文件',operation:'工作台操作',output:'业务产出'};
 for(const k of groups){const all=metadata.filter(r=>r.kind===k&&(k!=='file'||!path||String(r.path||'').replaceAll('\\','/').startsWith(path+'/')));if(path&&k!=='file')continue;add({id:'kind:'+k,label:labels[k],type:'kind',kind:k,count:all.length},'root');nodes[0].count+=all.length;
  if(k==='file'){const folders=new Map<string,number>(),files:any[]=[];for(const r of all){const relative=String(r.path||'').replaceAll('\\','/').slice(path?path.length+1:0);if(relative.includes('/')){const name=relative.split('/')[0];folders.set(name,(folders.get(name)||0)+1);}else files.push(r);}for(const [name,count]of [...folders].sort((a,b)=>b[1]-a[1]).slice(0,60))add({id:'folder:'+(path?path+'/':'')+name,label:name,path:(path?path+'/':'')+name,type:'folder',count},'kind:'+k);for(const r of files.slice(0,30))add({id:r.id,inputId:r.id,label:r.name,type:'file',path:r.path,status:r.status},'kind:'+k);if(folders.size>60||files.length>30)nodes[0].limited=true;
  }else for(const r of all.slice(0,12)){const full=await service.store.get('knowledgeInputs',r.id);if(await inputVisible(service,a,full))add({id:r.id,inputId:r.id,label:r.name,type:k,status:r.status,origin:r.origin},'kind:'+k);}
 }
 // Only persisted business identifiers establish cross-links; similarity is never invented.
 const leaves=nodes.filter(n=>n.inputId&&n.origin);for(const x of leaves)for(const y of leaves)if(x.type==='operation'&&y.type==='output'&&x.origin.entityId===y.origin.id)edges.push({id:x.id+'>'+y.id,from:x.id,to:y.id,relation:'业务关联'});
 return {nodes,edges,path,truncated:!!nodes[0].limited,description:'关系来自真实目录包含和业务记录关联；节点数量为分组统计，展开目录查看下一层'};
}
