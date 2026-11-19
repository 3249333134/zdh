import test from 'node:test'
import assert from 'node:assert/strict'
import { Script } from 'node:vm'
import { designedSceneCode } from '../src/motion-design.js'
import { generateAnimation } from '../src/motion-editor-ai.js'
const base = () => ({width:1280,height:720,fps:30,duration:30,assets:[{id:'cover',kind:'image',name:'成稿封面'}],clips:[],generationMode:'designed',visualStyle:'cinematic'})
test('designed code safely compiles quoted titles and chooses actual source imagery', () => {
  const code=designedSceneCode({title:'魔杖与"弹壳" rgba(0,0,0,.5)',subtitle:"don't break"},{assets:base().assets})
  new Script('(function(motion){'+code+'})')
  assert.ok(code.includes('"imageId":"cover"'));assert.ok(code.startsWith('// 导演排版'))
})
test('director generation uses structured design and reliable code instead of asking for freehand scene sketches', async () => {
  let calls=0;const progress=[]
  const result=await generateAnimation({project:base(),onClip:c=>progress.push(c),call:async request=>{calls++;assert.ok(request.system.includes('禁止用几根线'));return {text:JSON.stringify({clips:[{title:'开场',start:0,duration:10,design:{layout:'poster',title:'魔法遇见科技',imageId:'cover'}}]})}}})
  assert.equal(calls,1);assert.equal(progress.length,1);assert.ok(result.clips[0].code.includes('motion.scene'))
})
test('director can redesign a selected scene independently, retaining timing and identity', async () => {
  const p=base();p.clips=[{id:'selected',type:'animation',start:8,duration:5,title:'镜头',code:'ctx.fillRect(0,0,5,5)'}]
  const result=await generateAnimation({project:p,selectedId:'selected',call:async()=>({text:JSON.stringify({design:{layout:'compare',title:'两种力量',left:'魔杖',right:'手枪'}})})})
  assert.equal(result.clips[0].id,'selected');assert.equal(result.clips[0].start,8);assert.ok(result.clips[0].code.includes('compare'))
})
