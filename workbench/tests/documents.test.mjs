import {test} from 'node:test';
import assert from 'node:assert/strict';
import {extractDocument,reportDocx} from '../documents.mjs';
import {WorkbenchStore} from '../store.mjs';
test('DOCX export escapes XML and imported Chinese text round trips',async()=>{
  const bytes=reportDocx('项目 <验收>','第一行 & 第二行\n本周完成评审');
  const text=await extractDocument('周报.docx',bytes);
  assert.match(text,/项目 <验收>/);assert.match(text,/第一行 & 第二行/);assert.match(text,/本周完成评审/);
  await assert.rejects(()=>extractDocument('空.txt',new Uint8Array()),/未提取到文字/);
  await assert.rejects(()=>extractDocument('file.exe',new Uint8Array([1])),/支持/);
});
test('backup restores business data; invalid restore is atomic and excludes credentials',()=>{
  const s=new WorkbenchStore(':memory:');
  try{
    const p=s.createProject({title:'备份项目',goal:'验收',owner:'本人'});
    s.addMaterial({project_id:p.id,name:'资料.txt',body:'资料正文'});
    const backup=s.exportBackup();
    s.createProject({title:'恢复前项目',goal:'验收',owner:'本人'});
    const previous=s.restoreBackup(backup);
    assert.equal(previous.data.projects.length,2);assert.equal(s.snapshot().projects.length,1);
    assert.equal(s.snapshot().materials[0].body,'资料正文');
    const broken=structuredClone(backup);broken.data.materials[0].project_id='missing';
    assert.throws(()=>s.restoreBackup(broken));assert.equal(s.snapshot().projects[0].id,p.id);
    assert.deepEqual(Object.keys(backup.data).sort(),['drafts','materials','projects','reviews','tasks']);
  }finally{s.close();}
});
test('text PDF extracts real page content; empty PDF reports OCR limitation',async()=>{
  function pdf(content){
    const stream=`BT /F1 12 Tf 50 750 Td (${content}) Tj ET`;
    const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
    let text='%PDF-1.4\n';const offsets=[0];
    objects.forEach((body,i)=>{offsets.push(text.length);text+=`${i+1} 0 obj\n${body}\nendobj\n`;});
    const start=text.length;text+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
    return new TextEncoder().encode(text);
  }
  assert.match(await extractDocument('report.pdf',pdf('Project review complete')),/Project review complete/);
  await assert.rejects(()=>extractDocument('scan.pdf',pdf('')),/OCR/);
});
