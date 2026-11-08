// DSH 边界适配器：后续真实模型调用只允许在本文件替换。
// 原则：AI 输出永远是“待确认草稿/建议”，不得直接写状态、账目、知识发布或外发消息。
export class DshAdapter {
  constructor(options = {}) {
    this.sourceRoot = options.sourceRoot || process.env.DSH_SOURCE_ROOT || '';
    this.configured = Boolean(this.sourceRoot);
  }

  async runRoutine(job, context = {}) {
    const at = new Date().toISOString();
    const base = {
      jobId: job.id,
      workbenchId: job.workbenchId,
      generatedAt: at,
      dryRun: !this.configured,
      aiMode: this.configured ? 'configured-pending-wiring' : 'rule-template',
      modelId: this.configured ? 'dsh-configured' : 'rule-template',
      sources: context.sources || [],
      sourceCount: context.sources?.length || 0
    };
    if (!this.configured) {
      return {
        ...base,
        status: 'pending',
        summary: `【规则草稿 · 待确认】${job.name}：未配置真实 DSH 模型调用；已按规则模板汇总 ${base.sourceCount} 条来源，不得作为正式结论。`
      };
    }
    // TODO: 复用上游 DSH harness：启动隔离 home、注入 boundary patch、执行结构化 prompt；
    // 此处不伪造模型返回。配置就绪后由本文件统一替换，路由层不直接接触模型调用。
    return {
      ...base,
      status: 'pending',
      summary: `【待接线】${job.name}：DSH 已定位但当前骨架未执行模型调用；请在 dsh-adapter.mjs 接入真实 harness。`
    };
  }

  async ask({workbenchId, question, sources = []}) {
    return {
      generatedAt:new Date().toISOString(),
      workbenchId,
      question,
      dryRun:!this.configured,
      answer:`问答为本地只读草稿。已匹配 ${sources.length} 条公开知识；正式 AI 回答应经 DSH 上下文装配、引用来源并保持人工确认。`,
      sources,
      needsConfirmation:true
    };
  }
}
