export const NODE_WIDTH=212,NODE_HEIGHT=112,MAX_X=30000,MAX_Y=16000;
/** Arrange forward flow by dependency depth; disconnected draft nodes remain visible. */
export function pipelinePositions(definition:any):Map<string,{x:number;y:number}>{
  const nodes=definition.nodes||[],edges=definition.edges||[],rank=new Map<string,number>(),incoming=new Map<string,number>();
  for(const n of nodes){rank.set(n.id,0);incoming.set(n.id,0);}
  for(const e of edges)if(incoming.has(e.to)&&incoming.has(e.from))incoming.set(e.to,incoming.get(e.to)!+1);
  const queue=nodes.filter((n:any)=>incoming.get(n.id)===0).map((n:any)=>n.id),visited=new Set<string>();
  while(queue.length){const id=queue.shift()!;visited.add(id);for(const e of edges.filter((e:any)=>e.from===id&&incoming.has(e.to))){rank.set(e.to,Math.max(rank.get(e.to)!,rank.get(id)!+1));incoming.set(e.to,incoming.get(e.to)!-1);if(incoming.get(e.to)===0)queue.push(e.to);}}
  const rows=new Map<number,number>(),result=new Map<string,{x:number;y:number}>();
  for(const n of nodes){const col=visited.has(n.id)?rank.get(n.id)!:0,row=rows.get(col)||0;rows.set(col,row+1);result.set(n.id,{x:48+col*292,y:64+row*166});}
  return result;
}
/** Reject invalid direct connections before altering the draft. Server validation remains authoritative. */
export function connectionError(d:any,from:string,to:string,replacing?:string):string{
  const a=d.nodes.find((n:any)=>n.id===from),b=d.nodes.find((n:any)=>n.id===to);
  if(!a||!b||from===to)return '请选择两个不同的节点';
  if(a.kind==='end'||b.kind==='start')return '开始节点不能接收连线，结束节点不能发出连线';
  const edges=d.edges.filter((e:any)=>e.id!==replacing);
  if(edges.some((e:any)=>e.from===from&&e.to===to))return '这两个节点已经连接';
  const seen=new Set<string>(),queue=[to];while(queue.length){const id=queue.pop()!;if(id===from)return '这条连线会形成循环；返工请配置审批退回';if(seen.has(id))continue;seen.add(id);for(const e of edges.filter((e:any)=>e.from===id))queue.push(e.to);}
  return '';
}
