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
    expect(seen.every(value => !value.includes('sk-fi') && !value.includes(request.prompt))).toBe(true);
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
    const first = backend.stream(request)[Symbol.asyncIterator]();
    const second = backend.stream(request)[Symbol.asyncIterator]();
    await Promise.all([first.next(), second.next()]);
    expect(monitor.snapshot().requests.map(row => row.id)).toEqual([1, 2]);
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
});
