import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const catalog=JSON.parse(fs.readFileSync(new URL('../client/motion-catalog.json',import.meta.url),'utf8'))
test('production catalog excludes demo-only entries and declares real package and language for each renderer',()=>{assert.ok(catalog.length>0);const languages=new Set();for(const row of catalog){assert.equal(row.downloadType,'direct-package');assert.equal(row.runtimeReady,true);assert.match(row.downloadUrl,/^https:\/\/motiontemplates\.github\.io\/385712\/downloads\/kinetic-tech-(zh|en)\.motion$/);assert.match(row.packageSha256,/^[a-f0-9]{64}$/);assert.equal(row.ratio,'16:9');assert.ok(['zh','en'].includes(row.language));languages.add(row.language)}assert.deepEqual([...languages].sort(),['en','zh']);assert.ok(!catalog.some(t=>t.id==='986-16x9'))})
