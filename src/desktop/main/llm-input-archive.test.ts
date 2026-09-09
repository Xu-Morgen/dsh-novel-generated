import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { LlmMonitor } from './llm-monitor.js';
import { LlmTraceStore } from './llm-trace-store.js';

it('I211 archives complete redacted inputs before failures/cancellation and excludes unresolved credentials', async () => {
  const root = await mkdtemp(join(tmpdir(), 'i211-input-'));
  const monitor = new LlmMonitor(() => {}, new LlmTraceStore(root));
  const input = { prompt: '开头\n' + '字'.repeat(270000) + '\nsk-fixture\n结尾', settings: { modelRef: 'test', credentialRef: 'ref' } };
  try {
    const failing = monitor.wrap({ async *stream() { throw new Error('failure'); yield ''; } }, async () => 'sk-fixture');
    await expect((async () => { for await (const chunk of failing.stream(input)) void chunk; })()).rejects.toThrow('failure');
    const cancelled = monitor.wrap({ async *stream() { yield 'partial'; yield 'later'; } }, async () => 'sk-fixture');
    const iterator = cancelled.stream({ ...input, prompt: '取消输入 sk-fixture' })[Symbol.asyncIterator]();
    await iterator.next(); await iterator.return?.();
    const unavailable = monitor.wrap({ async *stream() { yield 'unexpected'; } }, async () => { throw new Error('credential failure'); });
    await expect((async () => { for await (const chunk of unavailable.stream({ ...input, prompt: 'unresolved private input' })) void chunk; })()).rejects.toThrow('credential failure');
    monitor.dispose();
    const files = await readdir(root);
    const inputs = await Promise.all(files.filter(file => file.endsWith('.input.txt')).map(file => readFile(join(root, file), 'utf8')));
    expect(inputs).toHaveLength(2);
    expect(inputs).toContain(input.prompt.replace('sk-fixture', '[已隐藏密钥]'));
    expect(inputs).toContain('取消输入 [已隐藏密钥]');
    for (const file of files) {
      const text = await readFile(join(root, file), 'utf8');
      expect(text).not.toContain('sk-fixture'); expect(text).not.toContain('unresolved private input');
    }
    for (const file of files.filter(file => file.endsWith('.input.txt'))) {
      const stream = await readFile(join(root, file.replace('.input.txt', '.stream.txt')), 'utf8');
      expect(stream).toMatch(/"status":"(failed|cancelled)"/);
    }
  } finally { monitor.dispose(); await rm(root, { recursive: true, force: true }); }
});
