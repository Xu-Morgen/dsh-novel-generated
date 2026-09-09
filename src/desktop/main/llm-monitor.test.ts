import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { LlmMonitor } from './llm-monitor.js';
import { llmMonitorSchema } from '../llm-monitor-contract.js';

const request = { prompt: 'private prompt', settings: { modelRef: 'test/model', credentialRef: 'TEST_KEY' } };
describe('I197 unified backend observation', () => {
  it('preserves chunks and redacts keys split across text/reasoning chunks in every snapshot', async () => {
    const seen: string[] = [];
    const monitor = new LlmMonitor(value => seen.push(JSON.stringify(value)));
    const chunks = [{ text: 'hello sk-fi' }, { text: 'xture-secret end', reasoning: 'sk-fixture-secret' }];
    const backend = monitor.wrap({ async *stream() { yield* chunks; } }, async () => 'sk-fixture-secret');
    const actual = [];
    for await (const chunk of backend.stream(request)) actual.push(chunk);
    expect(actual).toEqual(chunks);
    expect(seen.every(value => !value.includes('sk-fi'))).toBe(true);
    expect(monitor.snapshot().requests[0].prompt).toBe(request.prompt);
    expect(monitor.snapshot().requests[0]).toMatchObject({ status: 'complete', text: 'hello [已隐藏密钥] end' });
  });
  it('retains sanitized failure, cancellation and isolates concurrent requests', async () => {
    const monitor = new LlmMonitor(() => {});
    const cause = new Error('secret raw provider response');
    const backend = monitor.wrap({ async *stream() { throw cause; } }, async () => undefined);
    const drain = async (signal?: AbortSignal) => { for await (const chunk of backend.stream({ ...request, signal })) void chunk; };
    const controller = new AbortController(); controller.abort();
    await expect(drain()).rejects.toBe(cause);
    await expect(drain(controller.signal)).rejects.toBe(cause);
    expect(monitor.snapshot().requests.map(row => row.status)).toEqual(['failed', 'cancelled']);
    expect(JSON.stringify(monitor.snapshot())).not.toContain(cause.message);
    monitor.dispose(); expect(monitor.snapshot().requests).toEqual([]);
  });
  it('locks the strict push contract and rejects extra fields, invalid phases and oversize payloads', async () => {
    const lock = JSON.parse(await readFile('contracts/desktop/llm-monitor.json', 'utf8'));
    expect(z.toJSONSchema(llmMonitorSchema)).toEqual(lock);
    expect(llmMonitorSchema.safeParse({ version: 1, requests: [], secret: 'x' }).success).toBe(false);
    expect(llmMonitorSchema.safeParse({ version: 1, requests: [{ id: 1, status: 'bad', text: '', reasoning: '', error: '' }] }).success).toBe(false);
    expect(llmMonitorSchema.safeParse({ version: 1, requests: [{ id: 1, status: 'complete', text: 'x'.repeat(16001), reasoning: '', error: '' }] }).success).toBe(false);
  });
  it('keeps simultaneous requests separate and records early consumer termination as cancellation', async () => {
    const monitor = new LlmMonitor(() => {});
    const backend = monitor.wrap({ async *stream() { yield 'one'; yield 'two'; } }, async () => undefined);
    const first = backend.stream({ ...request, prompt: 'first input' })[Symbol.asyncIterator]();
    const second = backend.stream({ ...request, prompt: 'second input' })[Symbol.asyncIterator]();
    await Promise.all([first.next(), second.next()]);
    expect(monitor.snapshot().requests.map(row => row.id)).toEqual([1, 2]);
    expect(monitor.snapshot().requests.map(row => row.prompt)).toEqual(['first input', 'second input']);
    await first.return?.(); await second.next(); await second.next();
    expect(monitor.snapshot().requests.map(row => row.status)).toEqual(['cancelled', 'complete']);
    expect(monitor.snapshot().requests[1].text).toBe('onetwo');
  });
  it('redacts before truncation and keeps the last 30 rows bounded', async () => {
    const monitor = new LlmMonitor(() => {});
    const backend = monitor.wrap({ async *stream() { yield 'secret' + 'x'.repeat(40000); } }, async () => 'secret');
    for (let i = 0; i < 35; i++) for await (const chunk of backend.stream(request)) void chunk;
    expect(monitor.snapshot().requests).toHaveLength(30);
    expect(monitor.snapshot().requests.every(row => row.text.length === 16000 && !row.text.includes('secret'))).toBe(true);
  });
  it('I207 keeps redacted inputs on failures/cancellation and never changes backend requests', async () => {
    const seen: string[] = [];
    const monitor = new LlmMonitor(value => seen.push(JSON.stringify(value)));
    const cause = new Error('private failure');
    const input = { ...request, prompt: 'input <script>literal</script> secret-value' };
    const backend = monitor.wrap({ async *stream(actual) { expect(actual).toBe(input); throw cause; } }, async () => 'secret-value');
    await expect(async () => { for await (const chunk of backend.stream(input)) void chunk; }).rejects.toBe(cause);
    expect(monitor.snapshot().requests[0]).toMatchObject({ status: 'failed', prompt: 'input <script>literal</script> [已隐藏密钥]', promptTruncated: false });
    expect(seen.every(value => !value.includes('secret-value'))).toBe(true);
    const cancelled = monitor.wrap({ async *stream() { yield 'one'; yield 'two'; } }, async () => undefined);
    const iterator = cancelled.stream({ ...request, prompt: 'cancel input' })[Symbol.asyncIterator]();
    await iterator.next(); await iterator.return?.();
    expect(monitor.snapshot().requests[1]).toMatchObject({ status: 'cancelled', prompt: 'cancel input' });
  });
  it('I207 limits input after redaction and withholds it when credentials cannot be checked', async () => {
    const monitor = new LlmMonitor(() => {});
    const backend = monitor.wrap({ async *stream() { yield 'ok'; } }, async () => 'secret-value');
    for await (const chunk of backend.stream({ ...request, prompt: 'x'.repeat(255995) + 'secret-value' + 'z'.repeat(50) })) void chunk;
    expect(monitor.snapshot().requests[0].prompt).toHaveLength(256000);
    expect(monitor.snapshot().requests[0].promptTruncated).toBe(true);
    expect(monitor.snapshot().requests[0].prompt).not.toContain('secret');
    const failed = monitor.wrap({ async *stream() { throw new Error('must not run'); } }, async () => { throw new Error('credential failure'); });
    await expect(async () => { for await (const chunk of failed.stream(request)) void chunk; }).rejects.toThrow('credential failure');
    expect(monitor.snapshot().requests[1].prompt).toBeUndefined();
    const row = { id: 1, status: 'complete', text: '', reasoning: '', error: '' };
    expect(llmMonitorSchema.safeParse({ version: 1, requests: [row] }).success).toBe(true);
    expect(llmMonitorSchema.safeParse({ version: 1, requests: [{ ...row, prompt: 'x'.repeat(256001) }] }).success).toBe(false);
    expect(llmMonitorSchema.safeParse({ version: 1, requests: [{ ...row, promptTruncated: 'yes' }] }).success).toBe(false);
  });
});
