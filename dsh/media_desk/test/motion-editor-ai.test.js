import test from 'node:test'
import assert from 'node:assert/strict'
import { animationBody, generateAnimation, fitAnimationPlan } from '../src/motion-editor-ai.js'
import { validateEditor } from '../src/motion-editor.js'
test('accept raw code or model function wrappers without executing code on host', () => {
  assert.equal(animationBody('```js\nfunction(ctx,time){ctx.fillRect(time,0,10,10)}\n```'), 'ctx.fillRect(time,0,10,10)')
  assert.throws(() => animationBody('const = ;'))
  assert.ok(animationBody('throw Error("must not execute")').includes('throw'))
})
test('plan and code calls are separate; invalid code retries only the affected scene', async () => {
  let calls = 0
  const project = { width: 640, height: 360, fps: 24, duration: 3, assets: [], clips: [] }
  const result = await generateAnimation({ project, call: async () => ({ text: [JSON.stringify({ clips: [{ title: 'a', start: 0, duration: 1 }, { title: 'b', start: 1, duration: 2 }] }), 'ctx.fillRect(0,0,10,10)', 'const =;', 'function(ctx,time){ctx.fillRect(time,0,20,20)}'][calls++] }) })
  assert.equal(calls, 4); assert.equal(result.clips.length, 2); assert.ok(result.clips[1].code.includes('time'))
})
test('selected scene is independent and retains its identity and timing', async () => {
  const project = { width: 640, height: 360, fps: 24, duration: 10, assets: [], clips: [{ id: 'scene', type: 'animation', title: 'selected', start: 5, duration: 2, code: '' }] }
  const result = await generateAnimation({ project, selectedId: 'scene', call: async () => ({ text: 'ctx.fillRect(0,0,10,10)' }) })
  assert.equal(result.clips[0].id, 'scene'); assert.equal(result.clips[0].start, 5)
})
test('long script plan exceeding the 30 second project is fitted before any code call', async () => {
  const project = { width: 640, height: 360, fps: 30, duration: 30, assets: [], clips: [] }
  const messages = [], streamed = []
  let calls = 0
  const result = await generateAnimation({ project, script: '长文案。'.repeat(500), onText: text => messages.push(text), onClip: clip => streamed.push(clip), call: async request => {
    calls++
    if (calls === 1) return { text: JSON.stringify({ clips: Array.from({ length: 8 }, (_, i) => ({ title: '镜头' + i, start: i * 20, duration: 20 })) }) }
    const scene = JSON.parse(request.user).scene
    assert.ok(scene.start + scene.duration <= 30)
    return { text: 'ctx.fillRect(time,0,10,10)' }
  } })
  assert.equal(result.clips.length, 8)
  assert.equal(streamed.length, 8)
  assert.equal(Math.max(...result.clips.map(c => c.start + c.duration)), 30)
  assert.ok(messages.some(text => text.includes('自动适配')))
  validateEditor({ ...project, clips: result.clips })
})
test('missing, negative, string and timecode timings become finite frame-aligned ranges', () => {
  const project = { width: 640, height: 360, fps: 24, duration: 3, assets: [], clips: [] }
  const clips = fitAnimationPlan(project, { clips: [{ duration: '00:08' }, { start: -2, duration: 0 }, { start: '00:30', duration: '12' }] })
  validateEditor({ ...project, clips })
  for (const clip of clips) { assert.ok(clip.start >= 0); assert.ok(clip.start + clip.duration <= 3.001); assert.ok(Math.abs(clip.duration * 24 - Math.round(clip.duration * 24)) < .00001) }
})
test('valid planned gaps and overlaps retain their timing', () => {
  const p = { width: 640, height: 360, fps: 30, duration: 30, assets: [], clips: [] }
  const clips = fitAnimationPlan(p, { clips: [{ start: 2, duration: 5 }, { start: 4, duration: 8 }] })
  assert.deepEqual(clips.map(({ start, duration }) => [start, duration]), [[2, 5], [4, 8]])
})
test('already streamed scenes survive a later scene generation failure', async () => {
  const project = { width: 640, height: 360, fps: 30, duration: 30, assets: [], clips: [] }
  const completed = []; let calls = 0
  await assert.rejects(generateAnimation({ project, onClip: clip => completed.push(clip), call: async () => ({ text: [JSON.stringify({ clips: [{ start: 0, duration: 2 }, { start: 2, duration: 2 }] }), 'ctx.fillRect(0,0,20,20)', 'const =;', 'const =;'][calls++] }) }))
  assert.equal(completed.length, 1)
  assert.ok(completed[0].code)
})
