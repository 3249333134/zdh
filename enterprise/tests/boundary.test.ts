import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Context} from '../../upstream/deepseek-harness-master/vendor/cordis/lib/index.js';
import SystemPrompt from '../../upstream/deepseek-harness-master/packages/core/system-prompt/lib/index.js';
import ToolRuntime,{defineTool} from '../../upstream/deepseek-harness-master/packages/core/tools/lib/index.js';
import * as NativeExecutor from '../../upstream/deepseek-harness-master/packages/core/tool-executor-native/lib/index.js';
import {executeModelToolFixture} from '../../upstream/deepseek-harness-master/packages/test-support/tool-testkit/lib/index.js';
import * as Boundary from '../ai-boundary.mjs';
import * as BusinessTools from '../ai-business-tools.mjs';
test('business gateway plugin admits only the three registered read/proposal tools',async()=>{
  const ctx=new Context();try{await ctx.plugin(SystemPrompt,{});await ctx.plugin(ToolRuntime);await ctx.plugin(NativeExecutor);await ctx.plugin(BusinessTools,{url:'http://127.0.0.1:1',token:'test-only'});let executed=0;
    for(const name of ['execute_shell','read_file','approve_business','confirm_business','database_query']){ctx.tools.register(defineTool({name,description:'被禁止的测试工具',parameters:{},output:{schema:{type:'string'},render:(_a:any,v:string)=>[{type:'text',text:v}]},execute:()=>{executed++;return '禁止';}}));const result=await executeModelToolFixture(ctx,{name,arguments:{},callId:name,signal:new AbortController().signal});assert.equal(result.isError,true);assert.match(JSON.stringify(result.content),/不允许调用/);}assert.equal(executed,0);
  }finally{await ctx.fiber.dispose();}
});
test('enterprise AI boundary blocks system and business approval tools in the actual DSH executor',async()=>{
  const ctx=new Context();try{await ctx.plugin(SystemPrompt,{});await ctx.plugin(ToolRuntime);await ctx.plugin(NativeExecutor);await ctx.plugin(Boundary);let executions=0;
    for(const name of ['execute_shell','approve_business']){ctx.tools.register(defineTool({name,description:'测试工具',parameters:{},output:{schema:{type:'string'},render:(_a:any,value:string)=>[{type:'text',text:value}]},execute:()=>{executions++;return '禁止执行';}}));const result=await executeModelToolFixture(ctx,{name,arguments:{},callId:name,signal:new AbortController().signal});assert.equal(result.isError,true);assert.match(JSON.stringify(result.content),/不允许调用/);}
    assert.equal(executions,0);
  }finally{await ctx.fiber.dispose();}
});
