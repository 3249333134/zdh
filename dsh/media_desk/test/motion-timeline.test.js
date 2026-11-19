import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeTimeline,resolveTimeline,moveTimeline,trimTimeline,splitTimeline,deleteTimeline,duplicateTimeline,addMediaClip,tracksOf} from '../src/motion-timeline.js'
import {validateEditor} from '../src/motion-editor.js'
const base=()=>normalizeTimeline({width:640,height:360,duration:12,fps:30,assets:[{id:'a',kind:'video',name:'A',duration:20,hasAudio:true},{id:'b',kind:'video',name:'B',duration:20,hasAudio:true}],clips:[{id:'v',type:'video',assetId:'a',title:'A',start:2,duration:4,inPoint:3,volume:1}]})
test('existing original sound becomes an editable linked track without double playback',()=>{
 const p=base();assert.equal(p.clips.length,2);assert.equal(p.clips[0].volume,0);assert.equal(p.clips[1].volume,1);assert.equal(p.clips[1].trackId,'audio-main');assert.equal(p.clips[0].linkId,p.clips[1].linkId)
 assert.equal(normalizeTimeline(p).clips.length,2);validateEditor(p)
})
test('linked video and sound move, change lane, and snap together',()=>{
 const p=base(),next=moveTimeline(p,['v'],2,{targetTrack:'overlay'})
 assert.deepEqual(next.clips.map(c=>c.start),[4,4]);assert.equal(next.clips[0].trackId,'overlay');assert.equal(next.clips[1].trackId,'audio-main')
 const snapped=moveTimeline(p,['v'],2.96,{snap:true,playhead:5,threshold:.15});assert.equal(snapped.clips[0].start,5)
})
test('source boundaries constrain linked trims and keep sound synchronized',()=>{
 const p=base(),left=trimTimeline(p,'v','left',-5)
 assert.deepEqual(left.clips.map(c=>[c.start,c.inPoint,c.duration]),[[0,1,6],[0,1,6]])
 const right=trimTimeline(p,'v','right',50);assert.ok(right.clips.every(c=>c.inPoint+c.duration<=20));validateEditor(right)
})
test('split creates two independent video/sound pairs with correct source in-points',()=>{
 const p=splitTimeline(base(),['v'],4)
 const video=p.clips.filter(c=>c.type==='video'),audio=p.clips.filter(c=>c.type==='audio')
 assert.equal(video.length,2);assert.equal(audio.length,2);assert.equal(video[1].inPoint,5);assert.equal(video[1].linkId,audio[1].linkId);assert.notEqual(video[0].linkId,video[1].linkId);validateEditor(p)
})
test('locked sound protects both members; turning linkage off permits independent video move',()=>{
 const p=base();p.tracks=p.tracks.map(t=>t.id==='audio-main'?{...t,locked:true}:t)
 assert.equal(moveTimeline(p,['v'],2),p);assert.equal(deleteTimeline(p,['v']),p)
 const independent=moveTimeline(p,['v'],2,{linked:false});assert.equal(independent.clips[0].start,4);assert.equal(independent.clips[1].start,2)
})
test('track mute, visibility and ordering resolve identically for preview and export',()=>{
 const p=base();p.tracks=p.tracks.map(t=>({...t,muted:t.id==='audio-main',hidden:t.id==='video-main'}))
 const r=resolveTimeline(p);assert.equal(r.clips[0].hidden,true);assert.equal(r.clips[1].volume,0)
 assert.equal(p.clips[1].volume,1)
})
test('ripple deletion closes selected time on all tracks and trims spanning overlays',()=>{
 const p=base();p.clips.push({id:'later',type:'text',text:'后续',start:8,duration:3},{id:'span',type:'text',text:'长字幕',start:0,duration:12})
 const next=deleteTimeline(p,['v'],{ripple:true});assert.equal(next.duration,8);assert.equal(next.clips.find(c=>c.id==='later').start,4)
 assert.equal(next.clips.filter(c=>c.text==='长字幕').reduce((n,c)=>n+c.duration,0),8);validateEditor(next)
})
test('duplicate does not retain the original link group; normal deletion preserves other clips',()=>{
 const p=base(),copy=duplicateTimeline(p,['v']);assert.equal(copy.clips.length,4);assert.notEqual(copy.clips[0].linkId,copy.clips[2].linkId)
 const removed=deleteTimeline(copy,['v']);assert.equal(removed.clips.length,2);validateEditor(removed)
})
test('several library videos can be appended and the project extends with them',()=>{
 let p={...base(),clips:[],duration:30};p=addMediaClip(p,'a',0);assert.equal(p.duration,20);p=addMediaClip(p,'b',20)
 assert.equal(p.duration,40);assert.deepEqual(p.clips.filter(c=>c.type==='video').map(c=>c.start),[0,20]);assert.equal(tracksOf(p).length,6);validateEditor(p)
})
test('legacy video that covered lower animation layers stays in front after migration',()=>{
 const p=base();delete p.tracks;p.clips=p.clips.filter(c=>c.type==='video').map(c=>({...c,layer:5}));p.clips.push({id:'old-effect',type:'animation',start:0,duration:4,layer:1,code:''})
 const resolved=resolveTimeline(normalizeTimeline(p))
 assert.ok(resolved.clips.find(c=>c.id==='v').layer>resolved.clips.find(c=>c.id==='old-effect').layer)
})
