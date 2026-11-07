import React from 'react';
import {kindLabels,roleLabels} from './common.tsx';
import {pipelinePositions} from './pipeline-layout.ts';

/** Text projection of the live draft, ordered by dependencies rather than canvas coordinates. */
export function FlowText({definition,data,selected,onSelect}:any){
  const positions=pipelinePositions(definition),name=(id:string)=>definition.nodes.find((n:any)=>n.id===id)?.name||'未配置节点';
  const nodes=[...definition.nodes].sort((a:any,b:any)=>{const x=positions.get(a.id)!,y=positions.get(b.id)!;return x.x-y.x||x.y-y.y;});
  return <div className="flow-text-outline"><h3>文字流程</h3><p className="muted">与图形流程共用同一草稿。并行步骤分别列出，实际顺序以连线为准。</p><ol aria-label="文字流程步骤">{nodes.map((n:any)=>{
    const component=n.localComponent||data.components.find((c:any)=>c.id===n.componentId),employee=n.localEmployee||data.employees.find((e:any)=>e.id===n.agentId),person=data.users.find((u:any)=>u.id===n.assigneeId);
    const fields=n.fields||component?.inputFields||[],out=definition.edges.filter((e:any)=>e.from===n.id);
    const owner=n.kind==='ai'?employee?.name||'待配置数字员工':person?.name||roleLabels[n.role];
    return <li key={n.id} className={selected===n.id?'selected':''}><button aria-label={'查看步骤：'+n.name} aria-current={selected===n.id?'step':undefined} onClick={()=>onSelect(n.id)}><strong>{n.name}</strong><span>{kindLabels[n.kind]}</span></button>{owner&&<p>负责：{owner}</p>}{component?.responsibility&&<p>职责：{component.responsibility}</p>}{fields.length>0&&<p>输入：{fields.map((f:any)=>f.label+(f.required?'（必填）':'')).join('、')}</p>}{component?.outputs?.length>0&&<p>交付：{component.outputs.join('、')}</p>}{n.kind==='ai'&&employee?.outputRequirements&&<p>输出要求：{employee.outputRequirements}</p>}{component?.acceptance&&<p>验收：{component.acceptance}</p>}{n.kind==='parallel'&&<p>各后续分支并行执行。</p>}{n.kind==='join'&&<p>等待有效前置分支完成后继续。</p>}{n.kind==='condition'&&<p>判断：{n.condition?.sourceNodeId?name(n.condition.sourceNodeId)+' / ':''}{n.condition?.field||'待配置字段'} {({equals:'等于',notEquals:'不等于',greater:'大于'} as Record<string,string>)[n.condition?.operator]||''} {n.condition?.value}</p>}{n.kind==='subflow'&&<p>子流程：{data.definitions.find((d:any)=>d.id===n.subflowId)?.name||'待配置'}</p>}{n.kind==='approval'&&<p>必须人工审批。退回：{n.rejectTo?name(n.rejectTo):'待配置退回目标'}</p>}{out.length>0&&<p className="flow-text-next">下一步：{out.map((e:any)=>(e.outcome==='true'?'满足 → ':e.outcome==='false'?'不满足 → ':'')+name(e.to)).join('；')}</p>}{n.kind==='end'&&<p>本条流程归档结束。</p>}</li>;
  })}</ol></div>;
}
