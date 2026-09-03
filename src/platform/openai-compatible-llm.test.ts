import { describe, expect, it } from 'vitest';

import { createOpenAICompatibleBackend, OpenAICompatibleError } from './openai-compatible-llm.js';

const settings = {
  modelRef: 'deepseek/deepseek-chat',
  credentialRef: 'NOVEL_API_KEY',
  temperature: 0.4,
  maxTokens: 512,
  stopSequences: ['<END>'],
  reasoning: 'high' as const,
};

function credentialResolver(value: string | undefined, calls: string[] = []) {
  return { resolve: async (ref: string) => { calls.push(ref); return value; } };
}

function streamingResponse(): Response {
  return new Response([
    'data: {"choices":[{"delta":{"reasoning_content":"先判断。"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"海风"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"穿过旧港。"}}]}\n\n',
    'data: [DONE]\n\n',
  ].join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

describe('I170 OpenAI-compatible LlmBackend', () => {
  it('maps validated settings, resolves credentials only in Main, and preserves stream/reasoning/stop', async () => {
    const calls: string[] = [];
    let requestedUrl = '';
    let requestedInit: RequestInit | undefined;
    const backend = createOpenAICompatibleBackend({
      endpoint: 'https://api.example.test/v1/',
      providerId: 'deepseek',
      credentials: credentialResolver('sk-not-in-output', calls),
      fetch: async (url, init) => { requestedUrl = url; requestedInit = init; return streamingResponse(); },
    });

    const chunks = [];
    for await (const chunk of backend.stream({ prompt: '继续。', settings })) chunks.push(chunk);
    const body = JSON.parse(String(requestedInit?.body)) as Record<string, unknown>;
    expect(requestedUrl).toBe('https://api.example.test/v1/chat/completions');
    expect(requestedInit?.headers).toMatchObject({ authorization: 'Bearer sk-not-in-output' });
    expect(body).toMatchObject({
      model: 'deepseek-chat',
      stream: true,
      temperature: 0.4,
      max_tokens: 512,
      stop: ['<END>'],
      reasoning_effort: 'high',
    });
    expect(body.messages).toEqual([{ role: 'user', content: '继续。' }]);
    expect(calls).toEqual(['NOVEL_API_KEY']);
    expect(chunks).toEqual([{ reasoning: '先判断。' }, { text: '海风' }, { text: '穿过旧港。' }, { done: true }]);
    expect(JSON.stringify(chunks)).not.toContain('sk-not-in-output');
  });

  it('maps off reasoning by omission and rejects unsupported provider or credential', async () => {
    const backend = createOpenAICompatibleBackend({
      endpoint: 'https://api.example.test/v1',
      providerId: 'deepseek',
      credentials: credentialResolver('sk-test'),
      fetch: async (_url, init) => {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        expect(body.reasoning_effort).toBeUndefined();
        return streamingResponse();
      },
    });
    const off = { ...settings, reasoning: 'off' as const };
    await expect(collect(backend, { prompt: 'x', settings: off })).resolves.toHaveLength(4);

    await expect(collect(backend, { prompt: 'x', settings: { ...settings, modelRef: 'other/model' } }))
      .rejects.toMatchObject({ code: 'unsupported-provider' });
    const unavailable = createOpenAICompatibleBackend({ endpoint: 'https://api.example.test', providerId: 'deepseek', credentials: credentialResolver(undefined), fetch: async () => streamingResponse() });
    await expect(collect(unavailable, { prompt: 'x', settings })).rejects.toMatchObject({ code: 'credential-unavailable' });
  });

  it('fails closed for invalid endpoint, HTTP failure, malformed stream, and cancellation', async () => {
    expect(() => createOpenAICompatibleBackend({ endpoint: 'file:///tmp', providerId: 'deepseek', credentials: credentialResolver('key') })).toThrowError(OpenAICompatibleError);
    expect(() => createOpenAICompatibleBackend({ endpoint: 'https://user:key@example.test', providerId: 'deepseek', credentials: credentialResolver('key') })).toThrow(/must not contain credentials/);

    const failed = createOpenAICompatibleBackend({ endpoint: 'https://api.example.test', providerId: 'deepseek', credentials: credentialResolver('sk-secret'), fetch: async () => new Response('secret-error', { status: 401 }) });
    await expect(collect(failed, { prompt: 'x', settings })).rejects.toMatchObject({ code: 'http' });
    await expect(collect(failed, { prompt: 'x', settings })).rejects.not.toThrow(/sk-secret/);

    const malformed = createOpenAICompatibleBackend({ endpoint: 'https://api.example.test', providerId: 'deepseek', credentials: credentialResolver('key'), fetch: async () => new Response('data: not-json\n\n') });
    await expect(collect(malformed, { prompt: 'x', settings })).rejects.toMatchObject({ code: 'invalid-response' });

    const controller = new AbortController();
    const cancelled = createOpenAICompatibleBackend({
      endpoint: 'https://api.example.test', providerId: 'deepseek', credentials: credentialResolver('key'),
      fetch: async (_url, init) => new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
      }),
    });
    const pending = collect(cancelled, { prompt: 'x', settings, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
  });
});

async function collect(backend: ReturnType<typeof createOpenAICompatibleBackend>, request: Parameters<typeof backend.stream>[0]): Promise<readonly unknown[]> {
  const chunks = [];
  for await (const chunk of backend.stream(request)) chunks.push(chunk);
  return chunks;
}
