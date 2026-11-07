import React,{useState} from 'react';
import {Input,Text,Select,Checks,Table,Actions,FieldEditor,roleLabels,Badge,download} from './common.tsx';
const roleOptions=Object.entries(roleLabels).map(([id,name])=>({id,name}));
export function Entities({kind,title,data,api,act,actor,onTrial,onBeforeEdit}:any){
  const [edit,setEdit]=useState<any>(null);const rows=data[kind]||[];
  const fresh=()=>({id:'',name:'',title:'',departmentId:actor.departmentId||'',enabled:true,inputFields:[],outputs:[],ownerRole:'executor',skills:[],materialIds:[],allowedTools:['read_context','submit_result'],outputRequirements:'依据所选资料输出结果，标明来源及待补充信息',handoffRule:'资料不足或涉及承诺时转人工',teamIds:[actor.id],status:'todo',dependencies:[],modelId:'',parentId:'',milestones:[]});
  const change=(key:string,value:any)=>setEdit({...edit,[key]:value});
  const save=async()=>{const body={...edit};if(!body.id)delete body.id;await api('/api/'+kind,'POST',body);setEdit(null);};
  const admin=actor.roles.includes('admin'),manager=admin||actor.roles.includes('manager');const canEdit=['departments','employees','users'].includes(kind)?admin:kind==='tasks'||kind==='feedback'?true:manager;
  const person=(id:string)=>data.users.find((u:any)=>u.id===id)?.name||'未分配';
  return <><section><div className="toolbar"><h2>{title}</h2><div className="top-actions">{kind==='tasks'&&<button onClick={()=>{const cell=(v:any)=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';download('任务清单.csv','\uFEFF'+[['任务','负责人','截止时间','状态','进展'],...rows.map((r:any)=>[r.title,person(r.assigneeId),r.due,r.status,r.progress])].map(row=>row.map(cell).join(',')).join('\r\n'),'text/csv;charset=utf-8');}}>导出任务清单</button>}{canEdit&&(kind!=='tasks'||manager)&&<button className="primary" onClick={()=>setEdit(fresh())}>新建{title.replace('与',' / ')}</button>}</div></div>
    <Table heads={['名称','归属 / 责任人','状态','操作']} rows={rows.map((r:any)=>[r.name||r.title,kind==='tasks'?person(r.assigneeId):data.departments.find((d:any)=>d.id===r.departmentId)?.name||'企业级',kind==='tasks'?(r.sourceInstanceId&&r.status==='done'&&r.acceptanceStatus!=='approved'?'已提交待验收':<Badge status={r.status}/>):r.enabled===false?'已停用':'可用',<div className="actions">{kind==='employees'&&onTrial&&<button onClick={()=>onTrial(r.id)}>试运行</button>}{canEdit&&<><button onClick={()=>act(async()=>{if(!onBeforeEdit||await onBeforeEdit(r))setEdit(structuredClone(r));})}>配置</button>{kind!=='users'&&<button onClick={()=>setEdit({...structuredClone(r),id:'',name:(r.name||r.title)+'（副本）',title:(r.title||r.name)+'（副本）'})}>复制</button>}</>}{kind==='tasks'&&<button onClick={()=>setEdit(structuredClone(r))}>更新进度</button>}</div>])}/>
  </section>{edit&&<section><h2>{edit.id?'编辑配置':'新建配置'}</h2><form onSubmit={e=>{e.preventDefault();act(save);}}>
    <Input label={['projects','tasks'].includes(kind)?'名称与交付目标':'名称'} value={edit.name||edit.title} required onChange={(v:string)=>change(['projects','tasks'].includes(kind)?'title':'name',v)}/>
    {kind!=='tasks'&&kind!=='users'&&kind!=='departments'&&<Select label="所属部门" value={edit.departmentId} options={data.departments} onChange={(v:string)=>change('departmentId',v)} empty="企业共享"/>}
    {kind==='departments'&&<Select label="上级部门" value={edit.parentId} options={rows.filter((r:any)=>r.id!==edit.id)} onChange={(v:string)=>change('parentId',v)} empty="企业根节点"/>}
    {kind==='components'&&<>
      <Text label="岗位职责／业务能力" value={edit.responsibility} required onChange={(v:string)=>change('responsibility',v)}/>
      <div className="row"><Select label="责任岗位" value={edit.ownerRole} options={roleOptions} onChange={(v:string)=>change('ownerRole',v)}/><Select label="数字员工帮手" value={edit.agentId} options={data.employees} onChange={(v:string)=>change('agentId',v)} empty="由人工办理"/></div>
      <Select label="上级业务组件" value={edit.parentComponentId} options={data.components.filter((r:any)=>r.id!==edit.id)} onChange={(v:string)=>change('parentComponentId',v)} empty="无上级组件"/>
      <FieldEditor fields={edit.inputFields} onChange={(v:any)=>change('inputFields',v)}/><Text label="输出交付物（每行一项）" value={(edit.outputs||[]).join('\n')} onChange={(v:string)=>change('outputs',v.split('\n').filter(Boolean))} required/>
      <Text label="验收规则" value={edit.acceptance} onChange={(v:string)=>change('acceptance',v)} required/>
    </>}
    {kind==='employees'&&<>
      <Text label="岗位卡：职责与能力范围" value={edit.purpose} required onChange={(v:string)=>change('purpose',v)}/><Select label="模型服务" value={edit.modelId} options={data.models} onChange={(v:string)=>change('modelId',v)} empty="尚未配置模型"/>
      <Text label="技能与业务规则（每行一项）" value={(edit.skills||[]).join('\n')} onChange={(v:string)=>change('skills',v.split('\n').filter(Boolean))}/><Checks label="允许使用的资料" values={edit.materialIds} options={data.materials} onChange={(v:any)=>change('materialIds',v)}/>
      <p className="muted">业务数字员工只接收授权上下文和提交结果，系统命令、文件修改及自动审批被服务端阻止。</p>
      <Text label="成果要求" value={edit.outputRequirements} required onChange={(v:string)=>change('outputRequirements',v)}/><Text label="必须转人工的情形" value={edit.handoffRule} required onChange={(v:string)=>change('handoffRule',v)}/>
      <Select label="运营阶段" value={edit.stage||'trial'} options={[{id:'trial',name:'见习期'},{id:'certified',name:'持证上岗'}]} onChange={(v:string)=>change('stage',v)}/><Text label="考核标准与限制" value={edit.assessment} onChange={(v:string)=>change('assessment',v)}/>
    </>}
    {kind==='projects'&&<>
      <Text label="目标和验收标准" value={edit.goal} required onChange={(v:string)=>change('goal',v)}/><div className="row"><Select label="项目负责人" value={edit.ownerId} options={data.users} onChange={(v:string)=>change('ownerId',v)}/><Input label="目标日期" type="date" value={edit.due} onChange={(v:string)=>change('due',v)}/></div><Checks label="项目成员" values={edit.teamIds} options={data.users} onChange={(v:any)=>change('teamIds',v)}/>
    </>}
    {kind==='tasks'&&<>
      <Select label="所属项目" value={edit.projectId} options={data.projects.map((p:any)=>({id:p.id,name:p.title}))} onChange={(v:string)=>change('projectId',v)}/>
      <div className="row"><Select label="负责人" value={edit.assigneeId} options={data.users} onChange={(v:string)=>change('assigneeId',v)}/><Input label="截止日期" type="date" value={edit.due} onChange={(v:string)=>change('due',v)}/><Select label="状态" value={edit.status} options={[{id:'todo',name:'待开始'},{id:'doing',name:'进行中'},{id:'done',name:'已完成'}]} onChange={(v:string)=>change('status',v)}/></div>
      <Select label="上级任务" value={edit.parentId} options={rows.filter((r:any)=>r.id!==edit.id&&r.projectId===edit.projectId).map((r:any)=>({id:r.id,name:r.title}))} onChange={(v:string)=>change('parentId',v)} empty="顶层任务"/>
      <Checks label="前置依赖" values={edit.dependencies} options={rows.filter((r:any)=>r.id!==edit.id&&r.projectId===edit.projectId).map((r:any)=>({id:r.id,name:r.title}))} onChange={(v:any)=>change('dependencies',v)}/><label><input type="checkbox" checked={edit.milestone||false} onChange={e=>change('milestone',e.target.checked)}/>标记为项目里程碑</label><Text label="进展、问题与交付记录" value={edit.progress} onChange={(v:string)=>change('progress',v)}/>
      <Checks label="关联交付资料" values={edit.attachments||[]} options={data.materials} onChange={(v:any)=>change('attachments',v)}/>{edit.history?.length>0&&<details><summary>历史进展</summary>{edit.history.map((h:any,i:number)=><p key={i}>{h.at} · {person(h.actorId)} · {h.note}</p>)}</details>}
    </>}
    {kind==='users'&&<><Input label="登录账号" value={edit.login} onChange={(v:string)=>change('login',v)} required/><Input label={edit.id?'新密码（留空保持原密码）':'初始密码（至少12位）'} type="password" value={edit.password} onChange={(v:string)=>change('password',v)} required={!edit.id}/><Select label="所属部门" value={edit.departmentId} options={data.departments} onChange={(v:string)=>change('departmentId',v)} empty="企业级"/><Checks label="角色权限" values={edit.roles||[]} options={roleOptions} onChange={(v:any)=>change('roles',v)}/></>}
    {kind==='feedback'&&<><Select label="关联数字员工" value={edit.employeeId} options={data.employees} onChange={(v:string)=>change('employeeId',v)}/><Text label="不满意案例、原因与改进建议" value={edit.description} required onChange={(v:string)=>change('description',v)}/><Select label="处理状态" value={edit.status||'open'} options={[{id:'open',name:'待分析'},{id:'improving',name:'优化中'},{id:'closed',name:'已验证关闭'}]} onChange={(v:string)=>change('status',v)}/></>}
    {!['tasks','feedback'].includes(kind)&&<label><input type="checkbox" checked={edit.enabled!==false} onChange={e=>change('enabled',e.target.checked)}/>启用</label>}
    <Actions><button className="primary">保存配置</button><button type="button" onClick={()=>setEdit(null)}>取消编辑</button></Actions>
  </form></section>}</>;
}
