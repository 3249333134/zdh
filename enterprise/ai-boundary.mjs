export const name='enterprise-execution-boundary';
export const inject=['tools'];
export function apply(ctx){ctx.tools.guard(()=> '企业流程节点仅允许依据提供的资料生成成果，不允许调用系统或业务写入工具。');}
