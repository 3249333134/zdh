import { defineTool } from '@deepseek-ai/dsh-tools';
export const name = 'enterprise-business-tools';
export const inject = ['tools','enterpriseStore'];
export function apply(ctx) {
  // This preset intentionally mounts no shell, filesystem, plugin-manager or delegation tools.
  ctx.tools.guard(exec => ['enterprise_read','enterprise_propose'].includes(exec.name) ? undefined : '企业数字员工仅允许读取项目和提交待审成果，不能执行系统或文件操作。');
  ctx.tools.register(defineTool({
    name:'enterprise_read',description:'读取项目、任务及资料，只读。',
    parameters:{project_id:{type:'string',required:true}},
    output:{schema:{type:'string'},render:(_a,value)=>[{type:'text',text:value}]},
    execute(args,exec) {
      exec.signal.throwIfAborted();
      const s=ctx.enterpriseStore.snapshot();
      return JSON.stringify({project:ctx.enterpriseStore.project(args.project_id),tasks:s.tasks.filter(x=>x.project_id===args.project_id),materials:s.materials.filter(x=>x.project_id===args.project_id)});
    }
  }));
  ctx.tools.register(defineTool({
    name:'enterprise_propose',description:'提交项目成果草稿，必须经人工审核后生效。计划和复盘正文为包含 tasks 数组的 JSON，其他类型为中文报告。',
    parameters:{project_id:{type:'string',required:true},kind:{type:'string',required:true},body:{type:'string',required:true},run_id:{type:'string',required:true}},
    output:{schema:{type:'string'},render:(_a,value)=>[{type:'text',text:value}]},
    execute(args,exec) {
      exec.signal.throwIfAborted();
      if (!exec.agent) throw new Error('缺少 DSH Agent 身份');
      const draft=ctx.enterpriseStore.propose({...args,session_id:exec.agent.session.id});
      return JSON.stringify({id:draft.id,status:draft.status,session_id:draft.session_id});
    }
  }));
}
