import { type FormEvent, useRef, useState } from 'react';

import { OpenAICompatClient } from '../llm/backend/openai-compat.js';

type GenerationStatus = 'idle' | 'streaming' | 'done' | 'error';

/** Minimal I1b input → streamed output surface; engine logic stays in the backend seam. */
export function App(): JSX.Element {
  const [endpoint, setEndpoint] = useState(
    import.meta.env.VITE_OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
  );
  const [model, setModel] = useState(
    import.meta.env.VITE_OPENAI_MODEL ?? '',
  );
  const [apiKey, setApiKey] = useState('');
  const [prompt, setPrompt] = useState('写一个雨夜抵达旧城的小说开篇。');
  const [output, setOutput] = useState('');
  const [status, setStatus] = useState<GenerationStatus>('idle');
  const [error, setError] = useState('');
  const activeRequest = useRef<AbortController>();

  async function generate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    activeRequest.current?.abort();

    const controller = new AbortController();
    activeRequest.current = controller;
    setOutput('');
    setError('');
    setStatus('streaming');

    try {
      const client = new OpenAICompatClient();
      for await (const chunk of client.send({
        endpoint,
        apiKey: apiKey.trim() || undefined,
        model,
        messages: [{ role: 'user', content: prompt }],
        signal: controller.signal,
      })) {
        if (
          activeRequest.current !== controller ||
          controller.signal.aborted
        ) {
          return;
        }
        setOutput((current) => current + chunk);
      }
      if (activeRequest.current === controller && !controller.signal.aborted) {
        setStatus('done');
      }
    } catch (caught) {
      if (activeRequest.current !== controller) {
        return;
      }
      if (controller.signal.aborted) {
        setStatus('idle');
        return;
      }
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus('error');
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = undefined;
      }
    }
  }

  function cancel(): void {
    const controller = activeRequest.current;
    if (controller === undefined) {
      return;
    }

    activeRequest.current = undefined;
    controller.abort();
    setError('');
    setStatus('idle');
  }

  return (
    <main className="shell">
      <header className="hero">
        <p className="eyebrow">I1b · OpenAI-compatible stream</p>
        <h1>把一句灵感，写成正在发生的故事。</h1>
        <p>
          连接一个 OpenAI 兼容端点，正文会随模型分片逐字追加。连接信息仅保留在当前页面内存中。
        </p>
      </header>

      <section className="workspace" aria-label="流式生成工作区">
        <form className="composer" onSubmit={(event) => void generate(event)}>
          <div className="connection-grid">
            <label>
              <span>接口地址</span>
              <input
                type="url"
                value={endpoint}
                onChange={(event) => setEndpoint(event.target.value)}
                placeholder="https://api.openai.com/v1"
                required
              />
            </label>
            <label>
              <span>模型</span>
              <input
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder="模型名称"
                required
              />
            </label>
            <label className="wide-field">
              <span>API Key（可选）</span>
              <input
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="不会写入本地存储"
              />
            </label>
          </div>

          <label className="prompt-field">
            <span>创作指令</span>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={6}
              required
            />
          </label>

          <div className="actions">
            <button type="submit" disabled={status === 'streaming'}>
              {status === 'streaming' ? '生成中…' : '开始生成'}
            </button>
            {status === 'streaming' ? (
              <button className="secondary" type="button" onClick={cancel}>
                停止
              </button>
            ) : null}
            <span className={`status status-${status}`} role="status">
              {statusLabel(status)}
            </span>
          </div>
        </form>

        <article className="output-panel" aria-label="生成正文">
          <div className="output-heading">
            <span>正文</span>
            <span>{output.length} 字符</span>
          </div>
          {error.length > 0 ? <p className="error">{error}</p> : null}
          <pre aria-live="polite">
            {output || '正文将在这里随流式响应逐步出现。'}
          </pre>
        </article>
      </section>
    </main>
  );
}

function statusLabel(status: GenerationStatus): string {
  switch (status) {
    case 'streaming':
      return '正在接收分片';
    case 'done':
      return '生成完成';
    case 'error':
      return '生成失败';
    default:
      return '等待输入';
  }
}
