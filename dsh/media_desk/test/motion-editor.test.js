import test from 'node:test'
import assert from 'node:assert/strict'
import { validateEditor, editorDocument } from '../src/motion-editor.js'
const base = () => ({ width: 1280, height: 720, fps: 30, duration: 20, assets: [], clips: [] })
test('independent animation clips have no prerequisite restriction or six shot cap', () => {
  const project = base()
  project.clips = Array.from({ length: 12 }, (_, i) => ({ id: 'scene-' + i, type: 'animation', start: i, duration: 1, code: 'ctx.fillRect(time,0,10,10)' }))
  assert.equal(validateEditor(project).clips.length, 12)
})
test('reject invalid ranges, missing assets, duplicate ids, odd dimensions and nonfinite layer', () => {
  for (const fields of [{ start: -1 }, { duration: 30 }, { assetId: 'missing' }, { layer: NaN }]) {
    const project = base(); project.clips = [{ id: 'a', type: 'animation', start: 0, duration: 3, code: '', ...fields }]
    assert.throws(() => validateEditor(project))
  }
  assert.throws(() => validateEditor({ ...base(), width: 721 }))
  assert.throws(() => validateEditor({ ...base(), clips: Array(2).fill({ id: 'a', type: 'text', start: 0, duration: 2 }) }))
})
test('preview document prevents HTML breakout and excludes system privileges', () => {
  const p = base(); p.clips = [{ id: 'a', type: 'text', start: 0, duration: 2, text: '</script><script>alert(1)</script>' }]
  const html = editorDocument(p, {}, 'token')
  assert.equal((html.match(/<script>/g) || []).length, 1)
  assert.ok(html.includes("connect-src 'none'"))
  assert.ok(html.includes('event.source'))
})
test('accepts director styling and rejects invalid fade ranges', () => {
  const p = base()
  p.clips = [{ id: 'a', type: 'text', start: 0, duration: 3, text: '标题', fadeIn: .5, fadeOut: .8, align: 'center', fontWeight: 800, lineHeight: 1.2, strokeWidth: 2, boxColor: '#000000' }]
  assert.equal(validateEditor(p).clips.length, 1)
  const html = editorDocument(p, {}, 'token')
  assert.ok(html.includes('strokeText'))
  assert.ok(html.includes('fadeIn'))
  const invalid = base()
  invalid.clips = [{ id: 'a', type: 'text', start: 0, duration: 1, fadeIn: .8, fadeOut: .8 }]
  assert.throws(() => validateEditor(invalid))
  const badFilter = base()
  badFilter.clips = [{ id: 'a', type: 'image', start: 0, duration: 2, opacity: 1, brightness: 400 }]
  assert.throws(() => validateEditor(badFilter))
})
test('accepts transitions, keyframes, speed and blend for video clips', () => {
  const p = base()
  p.assets = [{ id: 'v', kind: 'video', name: 'V', duration: 10, hasAudio: false }]
  p.clips = [{
    id: 'a', type: 'video', assetId: 'v', start: 0, duration: 4, inPoint: 0, speed: 2,
    transitionIn: 'zoom-in', transitionOut: 'wipe-left', transitionDuration: .6,
    blend: 'screen', vignette: 30, hue: 10, sepia: 20,
    keyframes: { opacity: [{ t: 0, v: 0 }, { t: 1, v: 1 }], scale: [{ t: 0, v: 1 }, { t: 2, v: 1.2 }] },
  }]
  assert.equal(validateEditor(p).clips.length, 1)
  const html = editorDocument(p, {}, 'token')
  assert.ok(html.includes('zoom-in'))
  assert.ok(html.includes('keyframes'))
  assert.ok(html.includes('motion-editor-cover'))
  const invalid = base()
  invalid.assets = [{ id: 'v', kind: 'video', name: 'V', duration: 3, hasAudio: false }]
  invalid.clips = [{ id: 'a', type: 'video', assetId: 'v', start: 0, duration: 2, speed: 2 }]
  assert.throws(() => validateEditor(invalid))
  const badKey = base()
  badKey.clips = [{ id: 'a', type: 'text', start: 0, duration: 2, keyframes: { scale: [{ t: 0, v: 99 }] } }]
  assert.throws(() => validateEditor(badKey))
})
