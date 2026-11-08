export class RoutineScheduler {
  #timer = null; #running = false; #stopped = false;
  constructor(store, adapter, intervalMs = 30000) {
    this.store = store; this.adapter = adapter; this.intervalMs = intervalMs;
  }
  start() {
    this.#timer = setInterval(() => void this.tick(), this.intervalMs);
  }
  stop() { this.#stopped = true; if (this.#timer) clearInterval(this.#timer); }
  async tick() {
    if (this.#running || this.#stopped) return;
    this.#running = true;
    try {
      const now = Date.now();
      for (const job of this.store.list('routines')) {
        if (!job.enabled || !job.nextAt) continue;
        if (new Date(job.nextAt).getTime() > now) continue;
        await this.runJob(job.id, {manual:false});
      }
    } finally { this.#running = false; }
  }
  async runJob(jobId, {manual = false} = {}) {
    const job = this.store.find('routines', jobId);
    if (!job) throw new Error('定时任务不存在');
    if (job.enabled === false && !manual) return;
    const related = this.store.list('dispatches').filter(d => d.targetWorkbenchId === job.workbenchId);
    const sources = related.map(d => ({kind:'dispatch',id:d.id,title:d.title,status:d.status}));
    const result = await this.adapter.runRoutine(job, {sources});
    const output = this.store.append('routineOutputs', {
      id: manual ? `O-manual-${Date.now()}` : undefined,
      jobId:job.id,workbenchId:job.workbenchId,status:'pending',kind:job.outputKind,
      title:job.name,summary:result.summary,sources,generatedAt:result.generatedAt,decision:null
    });
    job.lastAt = result.generatedAt;
    job.lastStatus = 'pending';
    job.lastError = '';
    job.lastResult = output.id;
    job.nextAt = this.#nextDaily(job.schedule.at || '09:00');
    this.store.put('routines', job);
    this.store.audit('scheduler', manual ? 'routine.manualRun' : 'routine.autoRun', job.id, {outputId:output.id,dryRun:result.dryRun});
    return output;
  }
  #nextDaily(at) {
    const [hh,mm] = at.split(':').map(Number);
    const d = new Date(); d.setHours(hh, mm, 0, 0);
    if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
    return d.toISOString();
  }
}
