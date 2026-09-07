import { LLM_BACKEND_MARKER, type LlmBackend } from '../../llm/port/index.js';
import { llmMonitorSchema, type LlmMonitorSnapshot } from '../llm-monitor-contract.js';
import { OpenAICompatibleError } from '../../platform/openai-compatible-llm.js';

/** Main-only bounded observation; never copies prompts, endpoints or exception messages. */
export class LlmMonitor {
  private sequence = 0;
  private rows: LlmMonitorSnapshot['requests'] = [];
  private disposed = false;
  constructor(private readonly changed: (snapshot: LlmMonitorSnapshot, started: boolean) => void) {}

  snapshot(): LlmMonitorSnapshot { return llmMonitorSchema.parse({ version: 1, requests: this.rows }); }
  dispose(): void { this.disposed = true; this.rows = []; }

  /** Decorates any backend while preserving its chunks/errors and cancellation ownership. */
  wrap(backend: LlmBackend | ((secret: string | undefined) => LlmBackend), resolveSecret: (ref: string) => Promise<string | undefined>): LlmBackend {
    const monitor = this;
    return { [LLM_BACKEND_MARKER]: true, async *stream(request) {
      const row: LlmMonitorSnapshot['requests'][number] = { id: ++monitor.sequence, status: 'connecting', text: '', reasoning: '', error: '' };
      monitor.rows = [...monitor.rows.slice(-29), row];
      monitor.emit(true);
      let secret = '';
      let text = '';
      let reasoning = '';
      let finished = false;
      try {
        secret = await resolveSecret(request.settings.credentialRef) ?? '';
        const source = typeof backend === 'function' ? backend(secret || undefined) : backend;
        const textFilter = new SecretFilter(secret);
        const reasoningFilter = new SecretFilter(secret);
        for await (const chunk of source.stream(request)) {
          const delta = typeof chunk === 'string' ? { text: chunk } : chunk;
          text = (text + textFilter.push(delta.text ?? '')).slice(-16000);
          reasoning = (reasoning + reasoningFilter.push(delta.reasoning ?? '')).slice(-16000);
          row.text = text;
          row.reasoning = reasoning;
          if (delta.text) row.status = 'generating';
          else if (delta.reasoning) row.status = 'reasoning';
          monitor.emit(false);
          yield chunk;
        }
        row.status = request.signal?.aborted ? 'cancelled' : 'complete';
        finished = true;
      } catch (cause) {
        row.status = request.signal?.aborted ? 'cancelled' : 'failed';
        row.error = row.status === 'failed' ? safeError(cause) : '';
        finished = true;
        throw cause;
      } finally {
        if (!finished) row.status = 'cancelled';
        secret = ''; text = ''; reasoning = '';
        monitor.emit(false);
      }
    } };
  }

  private emit(started: boolean): void {
    if (this.disposed) return;
    try { this.changed(this.snapshot(), started); } catch { /* Observation cannot break generation. */ }
  }
}

/** Withhold a trailing secret prefix so a key split across chunks never becomes visible. */
class SecretFilter {
  private pending = '';
  constructor(private readonly secret: string) {}
  push(value: string): string {
    if (!this.secret) return value;
    let safe = (this.pending + value).split(this.secret).join('[已隐藏密钥]');
    this.pending = '';
    for (let length = Math.min(this.secret.length - 1, safe.length); length > 0; length--) {
      if (safe.endsWith(this.secret.slice(0, length))) { this.pending = safe.slice(-length); safe = safe.slice(0, -length); break; }
    }
    return safe;
  }
}

function safeError(cause: unknown): string {
  if (cause instanceof OpenAICompatibleError) {
    const labels = { 'invalid-config': 'AI 配置无效，请检查服务地址与模型。', 'unsupported-provider': '模型与当前服务不匹配。', 'credential-unavailable': '访问密钥不可用，请检查 AI 设置。', cancelled: '请求已取消。', http: 'AI 服务返回 HTTP 错误，请检查密钥、额度或稍后重试。', 'invalid-response': 'AI 服务返回了无法解析的流式数据。', network: 'AI 网络连接或流式传输中断，请检查网络后重试。' };
    return labels[cause.code];
  }
  return 'AI 请求失败，请检查服务地址、访问密钥、网络与模型配置后重试。';
}
