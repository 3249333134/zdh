import test from 'node:test'
import assert from 'node:assert/strict'
import {applyMotionOperations} from '../src/motion-operations.js'
import {planMotionCommand} from '../src/motion-assistant.js'
import {normalizeTimeline} from '../src/motion-timeline.js'
const project=()=>normalizeTimeline({width:640,height:360,fps:30,duration:10,assets:[{id:'v',kind:'video',duration:20,hasAudio:true}],clips:[{id:'first',type:'video',assetId:'v',start:0,duration:5,inPoint:0,volume:1},{id:'other',type:'video',assetId:'v',start:5,duration:5,inPoint:10,volume:1}]})
test('selected-only trim preserves other clips and follows linked original sound',()=>{
 const p=project(),next=applyMotionOperations(p,[{type:'trim',duration:3}],'first')
 assert.equal(next.clips.find(c=>c.id==='first').duration,3)
 assert.equal(next.clips.find(c=>c.type==='audio'&&c.start===0).duration,3)
 assert.deepEqual(next.clips.filter(c=>c.start===5),p.clips.filter(c=>c.start===5))
 assert.equal(p.clips[0].duration,5)
})
test('selected volume targets separated original sound, not silent picture',()=>{
 const next=applyMotionOperations(project(),[{type:'volume',volume:.3}],'first')
 assert.equal(next.clips.find(c=>c.id==='first').volume,0)
 assert.equal(next.clips.find(c=>c.type==='audio'&&c.start===0).volume,.3)
})
test('rejects out of source bounds, unknown commands, and locked linked tracks',()=>{
 assert.throws(()=>applyMotionOperations(project(),[{type:'source',inPoint:19}],'first'),/超出/)
 assert.throws(()=>applyMotionOperations(project(),[{type:'eval',code:'evil'}],'first'),/不支持/)
 const p=project();p.tracks.find(t=>t.id==='audio-main').locked=true
 assert.throws(()=>applyMotionOperations(p,[{type:'trim',duration:3}],'first'),/锁定/)
})
test('assistant validates returned operation before execution',async()=>{
 await assert.rejects(()=>planMotionCommand({project:project(),selectedId:'first',time:1,message:'修改这一段',call:async()=>({text:JSON.stringify({task:'operations',operations:[{type:'source',inPoint:30}]})})}),/超出/)
})
test('track commands and linked splits affect real editable tracks',()=>{
 const next=applyMotionOperations(project(),[{type:'track',trackId:'audio-music',muted:true},{type:'split',id:'first',time:2}])
 assert.equal(next.tracks.find(t=>t.id==='audio-music').muted,true)
 assert.equal(next.clips.filter(c=>c.type==='video').length,3)
 assert.equal(next.clips.filter(c=>c.type==='audio').length,3)
})
