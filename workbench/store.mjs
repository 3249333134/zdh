import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const text = (value, field, limit = 10000) => {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) throw new Error(`${field}不能为空且不能超过 ${limit} 字`);
  return value.trim();
};
const date = value => {
  if (!value) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(value).toISOString().slice(0,10) !== value) throw new Error('日期无效');
  return value;
};

/** Local business authority. AI receives only snapshot() and propose(), never review(). */
export class WorkbenchStore {
  constructor(path) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS schema_version(version INTEGER NOT NULL);
      INSERT INTO schema_version SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM schema_version);
      CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,title TEXT NOT NULL,goal TEXT NOT NULL,owner TEXT NOT NULL,due TEXT NOT NULL,created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id),title TEXT NOT NULL,owner TEXT NOT NULL,due TEXT NOT NULL,phase TEXT NOT NULL,status TEXT NOT NULL,created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS drafts(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id),run_id TEXT NOT NULL UNIQUE,session_id TEXT NOT NULL,kind TEXT NOT NULL,body TEXT NOT NULL,status TEXT NOT NULL,created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY,draft_id TEXT NOT NULL REFERENCES drafts(id),decision TEXT NOT NULL,original TEXT NOT NULL,edited TEXT NOT NULL,note TEXT NOT NULL,created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS materials(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id),name TEXT NOT NULL,body TEXT NOT NULL,created TEXT NOT NULL);`);
    if (this.db.prepare('SELECT version FROM schema_version').get().version !== 1) throw new Error('业务数据库版本不兼容');
  }
  close() { this.db.close(); }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  project(id) {
    const row = this.db.prepare('SELECT * FROM projects WHERE id=?').get(id);
    if (!row) throw new Error('项目不存在');
    return row;
  }
  snapshot() {
    const all = table => this.db.prepare(`SELECT * FROM ${table} ORDER BY created DESC`).all();
    return { projects: all('projects'), tasks: all('tasks'), drafts: all('drafts'), reviews: all('reviews'), materials: all('materials') };
  }
  createProject(input) {
    const row = { id: randomUUID(), title: text(input.title,'项目名称',200), goal: text(input.goal,'项目目标'), owner: text(input.owner,'负责人',100), due: date(input.due), created: new Date().toISOString() };
    this.db.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?)').run(...Object.values(row));
    return row;
  }
  createTask(input) {
    this.project(input.project_id);
    if (!['P','D','C','A'].includes(input.phase)) throw new Error('PDCA 阶段无效');
    const row = { id: randomUUID(), project_id: input.project_id, title: text(input.title,'任务名称',500), owner: text(input.owner,'负责人',100), due: date(input.due), phase: input.phase, status: 'todo', created: new Date().toISOString() };
    this.db.prepare('INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?)').run(...Object.values(row));
    return row;
  }
  updateTask(id, status) {
    if (!['todo','doing','done'].includes(status)) throw new Error('任务状态无效');
    if (!this.db.prepare('UPDATE tasks SET status=? WHERE id=?').run(status,id).changes) throw new Error('任务不存在');
  }
  addMaterial(input) {
    this.project(input.project_id);
    const row = { id: randomUUID(), project_id: input.project_id, name: text(input.name,'文件名',255), body: text(input.body,'资料文字',500000), created: new Date().toISOString() };
    this.db.prepare('INSERT INTO materials VALUES(?,?,?,?,?)').run(...Object.values(row));
    return row;
  }
  propose(input) {
    this.project(input.project_id);
    if (!['plan','progress','weekly','retro'].includes(input.kind)) throw new Error('成果类型无效');
    const run = text(input.run_id,'运行标识',200);
    const existing = this.db.prepare('SELECT * FROM drafts WHERE run_id=?').get(run);
    if (existing) {
      if (existing.project_id !== input.project_id || existing.session_id !== input.session_id || existing.body !== input.body || existing.kind !== input.kind) throw new Error('运行标识已用于其他结果');
      return existing;
    }
    const row = { id: randomUUID(), project_id: input.project_id, run_id: run, session_id: text(input.session_id,'DSH 会话标识',200), kind: input.kind, body: text(input.body,'成果内容',100000), status: 'pending', created: new Date().toISOString() };
    this.db.prepare('INSERT INTO drafts VALUES(?,?,?,?,?,?,?,?)').run(...Object.values(row));
    return row;
  }
  review(id, decision, edited, note = '') {
    return this.transaction(() => {
      const draft = this.db.prepare('SELECT * FROM drafts WHERE id=?').get(id);
      if (!draft || draft.status !== 'pending') throw new Error('成果不存在或已审核');
      if (!['approved','rejected'].includes(decision)) throw new Error('审核决定无效');
      const body = text(edited,'审核内容',100000);
      // Structured plans are validated entirely before the transaction commits.
      if (decision === 'approved' && (draft.kind === 'plan' || draft.kind === 'retro')) {
        const plan = JSON.parse(body);
        if (!Array.isArray(plan.tasks) || plan.tasks.length > 100) throw new Error('计划应包含最多 100 项 tasks');
        for (const task of plan.tasks) this.createTask({ ...task, project_id: draft.project_id });
      }
      this.db.prepare('INSERT INTO reviews VALUES(?,?,?,?,?,?,?)').run(randomUUID(),id,decision,draft.body,body,String(note).slice(0,10000),new Date().toISOString());
      this.db.prepare('UPDATE drafts SET status=? WHERE id=?').run(decision,id);
      return { id, status: decision };
    });
  }
  taskCsv(projectId) {
    this.project(projectId);
    const cell = value => '"' + String(/^[=+@\-\t\r]/.test(String(value)) ? "'" + value : value).replaceAll('"','""') + '"';
    const rows = this.db.prepare('SELECT title,owner,due,phase,status FROM tasks WHERE project_id=? ORDER BY created').all(projectId);
    return '\uFEFF' + [['任务','负责人','截止日期','阶段','状态'],...rows.map(Object.values)].map(row => row.map(cell).join(',')).join('\r\n');
  }
  exportBackup() { return {format:'enterprise-workbench',version:1,created:new Date().toISOString(),data:this.snapshot()}; }
  restoreBackup(backup) {
    if(backup?.format!=='enterprise-workbench'||backup.version!==1)throw new Error('备份格式或版本不兼容');
    // Validate against a fresh database first, including all foreign keys and uniqueness rules.
    const candidate=new WorkbenchStore(':memory:');
    const columns={projects:['id','title','goal','owner','due','created'],tasks:['id','project_id','title','owner','due','phase','status','created'],drafts:['id','project_id','run_id','session_id','kind','body','status','created'],reviews:['id','draft_id','decision','original','edited','note','created'],materials:['id','project_id','name','body','created']};
    const load=target=>{
      for(const [table,keys] of Object.entries(columns)) {
        const rows=backup.data?.[table];
        if(!Array.isArray(rows)||rows.length>100000)throw new Error('备份数据无效');
        for(const row of rows) {
          if(!row||Object.keys(row).length!==keys.length||!keys.every(k=>typeof row[k]==='string'))throw new Error('备份记录字段无效');
          if(table==='tasks'&&(!['P','D','C','A'].includes(row.phase)||!['todo','doing','done'].includes(row.status)))throw new Error('备份任务无效');
          if(table==='drafts'&&(!['plan','progress','weekly','retro'].includes(row.kind)||!['pending','approved','rejected'].includes(row.status)))throw new Error('备份成果无效');
          target.db.prepare(`INSERT INTO ${table} VALUES(${keys.map(()=>'?').join(',')})`).run(...keys.map(k=>row[k]));
        }
      }
    };
    try {candidate.transaction(()=>load(candidate));}finally{candidate.close();}
    const previous=this.exportBackup();
    this.transaction(()=>{
      for(const table of ['reviews','drafts','materials','tasks','projects'])this.db.exec(`DELETE FROM ${table}`);
      load(this);
    });
    return previous;
  }
}
