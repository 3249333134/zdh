import test from 'node:test'
import assert from 'node:assert/strict'
import { compileVideoEdit,planVideoEdit } from '../src/motion-video-edit.js'
const project=()=>({width:1280,height:720,fps:30,duration:64,assets:[{id:'source',name:'source.mov',kind:'video',duration:64,hasAudio:true}],clips:[{id:'old',type:'animation',start:0,duration:10,code:''}]})
test('real source in/out cuts become a new contiguous timeline with original sound',()=>{
 const p=compileVideoEdit(project(),{title:'Vlog',segments:[{assetId:'source',inPoint:30,duration:3,title:'开场',caption:'日常片段'},{assetId:'source',inPoint:4,duration:5,title:'主体'},{assetId:'source',inPoint:58,duration:4,mute:true}]})
 const clips=p.clips.filter(c=>c.type==='video')
 assert.deepEqual(clips.map(c=>[c.start,c.inPoint,c.duration,c.volume]),[[0,30,3,0],[3,4,5,0],[8,58,4,0]])
 assert.equal(p.clips.filter(c=>c.type==='audio').length,2)
 assert.equal(p.duration,12);assert.ok(!p.clips.some(c=>c.type==='animation'));assert.equal(p.clips.filter(c=>c.type==='text').length,1)
})
test('invalid source IDs and source overrun cannot be submitted as completed edits',()=>{
 assert.throws(()=>compileVideoEdit(project(),{segments:[{assetId:'missing',inPoint:0,duration:3}]}))
 assert.throws(()=>compileVideoEdit(project(),{segments:[{assetId:'source',inPoint:63,duration:5}]}))
})
test('malformed array JSON is repaired automatically without changing the project first',async()=>{
 const p=project();const prior=JSON.stringify(p);let calls=0
 const patch=await planVideoEdit({project:p,analysis:{videos:[]},instruction:'帮我生成vlog',targetDuration:30,call:async request=>{
  assert.ok(!request.user.includes('old'));calls++
  return {text:calls===1?' {"segments":[{"assetId":"source","inPoint":0,"duration":3} {oops}]}':JSON.stringify({segments:[{assetId:'source',inPoint:10,duration:3}]})}
 }})
 assert.equal(calls,2);assert.equal(patch.duration,3);assert.equal(JSON.stringify(p),prior)
})
test('old inspiration and animation content never enter the video edit prompt',async()=>{
 const p={...project(),script:'OLD_HARRY_SCRIPT',notes:'OLD_IMAGE_NOTES'}
 await planVideoEdit({project:p,analysis:{videos:[{id:'source',duration:64}],visualAnalysis:'可见人物在镜头前做动作'},instruction:'生成vlog',targetDuration:30,call:async request=>{
  assert.ok(!request.user.includes('OLD_'));return {text:JSON.stringify({segments:[{assetId:'source',inPoint:5,duration:4}]})}
 }})
})
