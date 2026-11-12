import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {TrendService,chinaDay,normalizeTrend} from '../src/trends.js'
async function fixture(t,fetchImpl){const root=await mkdtemp(join(tmpdir(),'desk-trends-'));t.after(()=>rm(root,{recursive:true,force:true}));const data={items:[]};let now=Date.parse('2026-11-10T10:00:00+08:00');const service=new TrendService({root,read:async()=>data,mutate:async(_,fn)=>fn(data)},{fetchImpl,now:()=>now,validate:async()=>{}});return {data,service,advance:ms=>{now+=ms}}}
const response=value=>({ok:true,text:async()=>JSON.stringify(value)})
const mock=async url=>url.includes('bilibili')?response({code:0,data:{list:[{title:'拍摄教程',bvid:'BVtest',pubdate:1794276000,stat:{view:123,like:12}}]}}):response({status_code:0,data:{word_list:[{word:'今日话题',hot_value:456,position:1}]}})
test('只接受真实平台 HTTPS 链接，未知热度不伪造',()=>{assert.equal(normalizeTrend({title:'坏链接',url:'http://127.0.0.1/a'},'小红书'),null);const row=normalizeTrend({title:'笔记',url:'https://www.xiaohongshu.com/explore/abc'},'小红书');assert.equal(row.views,null);assert.equal(row.kind,'来源候选');assert.equal(chinaDay(Date.parse('2026-11-09T17:00:00Z')),'2026-11-10')})
test('每日一次、失败单列、并发去重和跨天更新已有卡片',async t=>{let calls=0;const {service,data,advance}=await fixture(t,async url=>{calls++;return mock(url)});const [a,b]=await Promise.all([service.collect(),service.collect()]);assert.equal(a.id,b.id);assert.equal(calls,2);assert.equal(data.items.length,2);assert.ok(a.results.find(r=>r.platform==='小红书').error);assert.equal((await service.collect()).skipped,true);advance(86400000);await service.collect();assert.equal(data.items.length,2);assert.equal(data.trends.runs[0].updated,2)})
test('关闭与未到时不采集，手动运行可用，空数据不报成功',async t=>{const {service,data}=await fixture(t,async()=>({ok:true,text:async()=>''}));await service.configure({enabled:false});assert.equal((await service.collect()).skipped,true);const result=await service.collect(true);assert.equal(result.added,0);assert.ok(result.results.every(r=>!r.ok));assert.equal(data.items.length,0);await assert.rejects(service.collect(true),/稍后/);await assert.rejects(service.configure({time:'25:00'}),/时间格式/)})
