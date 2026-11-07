import React from 'react';

/** Shows configuration gaps from the signed-in user's current server snapshot. */
export function Readiness({data,open}:any){
  const models=data.models||[],employees=data.employees||[];
  const configured=employees.filter((e:any)=>models.some((m:any)=>m.id===e.modelId));
  const gaps=[
    !models.length&&{text:'企业 AI 尚未配置。个人对话的模型不会自动成为企业执行模型。',action:'配置企业模型',tab:'settings',subtab:'models'},
    (!employees.length||configured.length<employees.length)&&{text:`数字员工已关联企业模型 ${configured.length} / ${employees.length}。请确认岗位、资料范围和允许工具。`,action:'配置数字员工',tab:'employees'},
    !(data.materials||[]).length&&{text:'还没有企业资料。上传真实 SOP、标准或项目材料后，再授权给对应岗位。',action:'导入业务资料',tab:'materials'},
    !(data.versions||[]).length&&{text:'还没有已发布流程。先指定人工责任人、审核岗位及退回路径，再发布。',action:'配置业务流程',tab:'designer'},
  ].filter(Boolean) as any[];
  if(!gaps.length)return null;
  return <section aria-label="企业启用检查"><h2>先把这几项准备好</h2><p>员工办理待办，AI 准备草稿，指定人员审核后交接下一岗位。</p>{gaps.map(g=><div className="record" key={g.action}><p>{g.text}</p><button onClick={()=>open(g.tab,g.subtab)}>{g.action}</button></div>)}<small>这里根据当前配置检查缺项；保存模型不代表已通过真实模型联调。</small></section>;
}
