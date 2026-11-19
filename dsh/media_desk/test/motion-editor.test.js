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
  assert.ok(html.includes('event.source===parent'))
})
