import test from 'node:test'
import assert from 'node:assert/strict'
import { frameTime,adjacentCut,addTimelineMarker } from '../src/motion-editor-tools.js'
import { applyMotionOperations } from '../src/motion-operations.js'
import { normalizeTimeline } from '../src/motion-timeline.js'
import { validateEditor } from '../src/motion-editor.js'
const fixture=()=>normalizeTimeline({width:1280,height:720,duration:10,fps:30,assets:[{id:'source',kind:'video',hasAudio:true,duration:10}],clips:[{id:'one',type:'video',assetId:'source',start:0,duration:4,volume:1},{id:'two',type:'video',assetId:'source',start:4,duration:6,inPoint:4,volume:1}]})
test('cut navigation skips the current cut and respects beginning/end',()=>{const p=fixture();assert.equal(adjacentCut(p,4,1),10);assert.equal(adjacentCut(p,4,-1),0);assert.equal(adjacentCut(p,0,-1),0);assert.equal(adjacentCut(p,10,1),10);assert.equal(frameTime(61.5,30),'00:01:01:15')})
test('markers remain frame aligned and do not duplicate one frame or mutate the original',()=>{const p=fixture(),a=addTimelineMarker(p,2.345);assert.equal(p.markers,undefined);assert.equal(a.markers[0].time,70/30);assert.equal(addTimelineMarker(a,2.34),a);assert.equal(addTimelineMarker(a,999).markers.at(-1).time,10);validateEditor(a)})
test('AI transform changes only the requested picture and linked fade changes the audio',()=>{const p=fixture(),next=applyMotionOperations(p,[{type:'transform',id:'one',fit:'cover',rotation:20,opacity:.7},{type:'fade',id:'one',seconds:.25}]);assert.equal(next.clips.find(c=>c.id==='one').rotation,20);assert.equal(next.clips.find(c=>c.id==='two').rotation,undefined);assert.equal(next.clips.find(c=>c.type==='audio'&&c.linkId===next.clips.find(c=>c.id==='one').linkId).audioFade,.25);assert.throws(()=>applyMotionOperations(p,[{type:'transform',id:'one',rotation:800}]),/旋转/);assert.throws(()=>applyMotionOperations(p,[{type:'fade',id:'one',seconds:10}]),/淡化/);assert.equal(p.clips.find(c=>c.id==='one').rotation,undefined)})
