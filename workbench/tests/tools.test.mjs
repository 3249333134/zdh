import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Context} from '../../upstream/deepseek-harness-master/vendor/cordis/lib/index.js';
import SystemPrompt from '../../upstream/deepseek-harness-master/packages/core/system-prompt/lib/index.js';
import ToolRuntime,{defineTool} from '../../upstream/deepseek-harness-master/packages/core/tools/lib/index.js';
import * as NativeExecutor from '../../upstream/deepseek-harness-master/packages/core/tool-executor-native/lib/index.js';
import * as BusinessTools from '../tools.mjs';
import {executeModelToolFixture} from '../../upstream/deepseek-harness-master/packages/test-support/tool-testkit/lib/index.js';
import {WorkbenchStore} from '../store.mjs';
test('real DSH executor denies non-business tools before executing their bodies',async()=>{
  const ctx=new Context();const store=new WorkbenchStore(':memory:');
  try{
    await ctx.plugin(SystemPrompt,{});await ctx.plugin(ToolRuntime);await ctx.plugin(NativeExecutor);
    ctx.provide('enterpriseStore',store);
    const fiber=await ctx.plugin(BusinessTools);
    let ran=false;
    ctx.tools.register(defineTool({name:'forbidden_shell',description:'test',parameters:{},output:{schema:{type:'string'},render:(_a,value)=>[{type:'text',text:value}]},execute:()=>{ran=true;return 'forbidden';}}));
    const result=await executeModelToolFixture(ctx,{name:'forbidden_shell',arguments:{},callId:'guard-test',signal:new AbortController().signal});
    assert.equal(ran,false);assert.equal(result.isError,true);assert.match(JSON.stringify(result.content),/企业数字员工/);
    const p=store.createProject({title:'只读',goal:'验证',owner:'本人'});
    const read=await executeModelToolFixture(ctx,{name:'enterprise_read',arguments:{project_id:p.id},callId:'read-test',signal:new AbortController().signal});
    assert.notEqual(read.isError,true);assert.match(JSON.stringify(read.content),/只读/);
    await fiber.dispose();
    const after=await executeModelToolFixture(ctx,{name:'enterprise_read',arguments:{project_id:p.id},callId:'disposed-test',signal:new AbortController().signal});
    assert.equal(after.isError,true);
  }finally{await ctx.fiber.dispose();store.close();}
});
