import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkbenchStore } from '../store.mjs';

test('AI proposal stays draft; human confirmation creates tasks once and records original', () => {
  const s = new WorkbenchStore(':memory:');
  try {
    const p = s.createProject({title:'燃机研发',goal:'完成里程碑',owner:'张工'});
    const body = JSON.stringify({tasks:[{title:'设计评审',owner:'李工',due:'2026-12-01',phase:'P'}]});
    const input = {project_id:p.id,run_id:'r1',session_id:'session1',kind:'plan',body};
    const draft = s.propose(input);
    assert.equal(s.snapshot().tasks.length,0);
    assert.equal(s.propose(input).id,draft.id);
    assert.throws(() => s.propose({...input,body:'other'}));
    s.review(draft.id,'approved',body);
    assert.equal(s.snapshot().tasks.length,1);
    assert.equal(s.snapshot().reviews[0].original,body);
    assert.throws(() => s.review(draft.id,'approved',body));
    assert.equal(s.snapshot().tasks.length,1);
  } finally { s.close(); }
});
test('invalid plan rolls back all tasks; rejection never changes tasks', () => {
  const s = new WorkbenchStore(':memory:');
  try {
    const p = s.createProject({title:'项目',goal:'目标',owner:'本人'});
    const d = s.propose({project_id:p.id,run_id:'r',session_id:'s',kind:'plan',body:'原始结果'});
    assert.throws(() => s.review(d.id,'approved',JSON.stringify({tasks:[{title:'合法',owner:'我',phase:'P'},{title:'非法',owner:'我',phase:'X'}]})));
    assert.equal(s.snapshot().tasks.length,0);
    assert.equal(s.snapshot().drafts[0].status,'pending');
    s.review(d.id,'rejected','请补充依据');
    assert.equal(s.snapshot().tasks.length,0);
  } finally { s.close(); }
});
test('Chinese paths persist records and CSV neutralizes formulas', () => {
  const dir = mkdtempSync(join(process.cwd(),'test-data-'));
  try {
    let s = new WorkbenchStore(join(dir,'业务.sqlite'));
    const p = s.createProject({title:'中文项目',goal:'目标',owner:'我'});
    s.createTask({project_id:p.id,title:'=SUM(A1)',owner:'我',phase:'D'});
    s.close(); s = new WorkbenchStore(join(dir,'业务.sqlite'));
    assert.equal(s.snapshot().projects[0].title,'中文项目');
    assert.match(s.taskCsv(p.id),/'=SUM/);
    s.close();
  } finally {
    assert.ok(dir.startsWith(join(process.cwd(),'test-data-')));
    rmSync(dir,{recursive:true});
  }
});
