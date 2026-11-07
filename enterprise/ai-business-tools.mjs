import {defineTool} from '../upstream/deepseek-harness-master/packages/core/tools/lib/index.js';
export const name='enterprise-business-gateway';
export const inject=['tools'];
export function apply(ctx,config){
  const admitted=['business_catalog','business_query','business_propose'];
  ctx.tools.guard(exec=>admitted.includes(exec.name)?undefined:'企业助手不允许调用系统工具、直接写数据库或代替人工确认和审批。');
  const register=(name,path,description,parameters)=>ctx.tools.register(defineTool({name,description,parameters,output:{schema:{type:'string'},render:(_a,v)=>[{type:'text',text:v}]},async execute(args,exec){exec.signal.throwIfAborted();const response=await fetch(config.url+path,{method:'POST',headers:{authorization:'Bearer '+config.token,'content-type':'application/json'},body:JSON.stringify(path==='/propose'?{...args,args:JSON.parse(args.args)}:args),signal:exec.signal});const value=await response.json();if(!response.ok)throw new Error(value.error||'业务网关拒绝操作');return JSON.stringify(value);}}));
  register('business_catalog','/catalog','读取本人身份、允许的业务动作、参数和业务规则。不能变更权限。',{});
  register('business_query','/query','查询当前员工及本次项目授权范围内的实际业务。kind可为projects/tasks/components/materials/instances/factoryCases/factoryRecords/factoryKnowledge/wiki；wiki用search检索已发布Wiki页面并返回版本与来源；制造事项只能查询，不可签字或闭环，资料仅返回岗位卡授权材料。',{kind:{type:'string',required:true},projectId:{type:'string'},search:{type:'string'}});
  register('business_propose','/propose','预览并提交一个业务动作建议，绝不会直接修改正式记录。先读取动作目录并使用真实记录ID。args为JSON字符串，仅允许目录声明字段。key为本次稳定唯一请求编号，重试保持不变。',{action:{type:'string',required:true},args:{type:'string',required:true},key:{type:'string',required:true}});
}
