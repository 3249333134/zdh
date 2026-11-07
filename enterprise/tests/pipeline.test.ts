import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pipelinePositions,connectionError} from '../client/pipeline-layout.ts';
import {validateDefinition,validateNodePositions} from '../src/engine.ts';

test('pipeline layout separates parallel lanes, ranks joins after parents and tolerates incomplete drafts',()=>{
  const d={nodes:['s','p','a','b','j','e','draft'].map(id=>({id})),edges:[['s','p'],['p','a'],['p','b'],['a','j'],['b','j'],['j','e']].map(([from,to])=>({from,to}))};
  const p=pipelinePositions(d);assert.equal(p.get('a')!.x,p.get('b')!.x);assert.notEqual(p.get('a')!.y,p.get('b')!.y);assert.ok(p.get('j')!.x>p.get('a')!.x);assert.equal(p.size,7);
  const cyclic=pipelinePositions({nodes:[{id:'a'},{id:'b'}],edges:[{from:'a',to:'b'},{from:'b',to:'a'}]});assert.equal(cyclic.size,2);
  const large=pipelinePositions({nodes:Array.from({length:100},(_,i)=>({id:String(i)})),edges:Array.from({length:99},(_,i)=>({from:String(i),to:String(i+1)}))});
  for(const position of large.values())validateNodePositions([{id:'n',name:'n',kind:'human',position}]);
});
test('direct wire editing rejects cycles, duplicates and invalid start/end connections',()=>{
  const d={nodes:[{id:'s',kind:'start'},{id:'h',kind:'human'},{id:'a',kind:'ai'},{id:'e',kind:'end'}],edges:[{id:'1',from:'s',to:'h'},{id:'2',from:'h',to:'a'},{id:'3',from:'a',to:'e'}]};
  assert.match(connectionError(d,'a','h'),/循环/);assert.match(connectionError(d,'s','h'),/已经连接/);assert.match(connectionError(d,'h','s'),/开始/);assert.match(connectionError(d,'e','h'),/结束/);
  assert.equal(connectionError(d,'h','e','2'),'');assert.equal(connectionError(d,'s','a','1'),'');
});
test('expanded pipeline coordinates publish while non-finite and over-limit coordinates fail',()=>{
  const d:any={id:'large',name:'长流水线',description:'',nodes:[{id:'s',name:'开始',kind:'start',position:{x:10,y:10}},{id:'h',name:'执行',kind:'human',role:'executor',position:{x:3500,y:600}},{id:'e',name:'结束',kind:'end',position:{x:30000,y:16000}}],edges:[{id:'1',from:'s',to:'h'},{id:'2',from:'h',to:'e'}]};
  validateDefinition(d);for(const x of [-1,30001,Infinity,NaN])assert.throws(()=>validateNodePositions([{...d.nodes[1],position:{x,y:0}}]),/位置/);
  assert.throws(()=>validateNodePositions([{...d.nodes[1],position:{x:0,y:16001}}]),/位置/);
});
