import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { LlmMonitor } from './llm-monitor.js';
import { LlmTraceStore, llmOutputDiagnostic } from './llm-trace-store.js';

const request = { prompt: 'private prompt', settings: { modelRef: 'test/model', credentialRef: 'test/ref' } };
it('records full outputs beyond the monitor tail, streams, safe errors and per-call isolation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'i202-trace-')); const monitor = new LlmMonitor(() => {}, new LlmTraceStore(root));
  try {
    const backend = monitor.wrap({ async *stream() { yield { text: 'BEGIN' + 'x'.repeat(20000) + 'sk-fi', reasoning: 'sk-fi' }; yield { text: 'xture END', reasoning: 'xture' }; } }, async () => 'sk-fixture');
    await Promise.all([1, 2].map(async () => { for await (const chunk of backend.stream(request)) void chunk; }));
    const files = await readdir(root); expect(files).toHaveLength(6);
    for (const file of files) {
      const text = await readFile(join(root, file), 'utf8');
      expect(text).not.toContain('sk-fi');
      if (file.endsWith('.input.txt')) { expect(text).toBe(request.prompt); continue; }
      expect(text).not.toContain('private prompt');
      if (file.endsWith('.result.txt')) expect(text).toBe('BEGIN' + 'x'.repeat(20000) + '[已隐藏密钥] END');
      else { expect(text).toContain('"status":"complete"'); expect(text).toContain('"reasoning":"[已隐藏密钥]"'); }
    }
    expect(monitor.snapshot().requests[0].text).not.toContain('BEGIN');
    expect(monitor.snapshot().requests[0].text).toHaveLength(16000);
  } finally { monitor.dispose(); await rm(root, { recursive: true, force: true }); }
});

it('logs interruption/disposal and isolates filesystem failure from generation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'i202-trace-')); const monitor = new LlmMonitor(() => {}, new LlmTraceStore(root));
  try {
    const cause = new Error('provider private secret');
    const backend = monitor.wrap({ async *stream() { yield 'partial'; throw cause; } }, async () => undefined);
    await expect((async () => { for await (const chunk of backend.stream(request)) void chunk; })()).rejects.toBe(cause);
    const iterator = backend.stream(request)[Symbol.asyncIterator](); await iterator.next(); monitor.dispose(); await iterator.return?.();
    const logs = await Promise.all((await readdir(root)).filter(file => file.endsWith('.stream.txt')).map(file => readFile(join(root, file), 'utf8')));
    expect(logs.some(text => text.includes('"status":"failed"'))).toBe(true);
    expect(logs.some(text => text.includes('"status":"cancelled"'))).toBe(true);
    expect(logs.join('')).not.toContain(cause.message);
    const blocker = join(root, 'not-a-directory'); await writeFile(blocker, 'x');
    const broken = new LlmMonitor(() => {}, new LlmTraceStore(blocker));
    const values = [];
    for await (const chunk of broken.wrap({ async *stream() { yield 'ok'; } }, async () => undefined).stream(request)) values.push(chunk);
    expect(values).toEqual(['ok']); expect(broken.snapshot().requests[0].error).toContain('记录保存失败'); broken.dispose();
  } finally { monitor.dispose(); await rm(root, { recursive: true, force: true }); }
});

it('reports precise schema paths without private values or invented keys', () => {
  const fixture = { confidence: 'high', evidenceParagraphIds: ['p1'], outline: { id: 'o', structure: 'WRONG-PRIVATE-VALUE', logline: 'a', themes: [], acts: [], foreshadowing: [], endings: [], 'PRIVATE-KEY': true }, rationale: 'a' };
  const report = JSON.stringify(llmOutputDiagnostic(JSON.stringify(fixture), 'adaptation'));
  expect(report).toContain('["outline","structure"]'); expect(report).not.toContain('PRIVATE');
  expect(llmOutputDiagnostic('tail only', 'adaptation')).toEqual({ validation: 'invalid-json' });
  expect(llmOutputDiagnostic('{}', 'other')).toEqual({ validation: 'not-checked' });
});
