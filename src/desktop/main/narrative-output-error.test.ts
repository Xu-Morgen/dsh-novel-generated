import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createDesktopPaths } from '../../platform/desktop-paths.js';
import { desktopIpcRegistry } from '../../platform/desktop-ipc-registry.js';
import { createDesktopProjectHandlers } from './project-handlers.js';
import { unwrap } from '../../client/shared.js';

it.each(['{invalid test-only-sensitive-value', '{"outline":{"test-only-sensitive-value":true}}'])('I200 returns only a fixed format diagnostic for malformed output: %s', async (text) => {
  const root = await mkdtemp(join(tmpdir(), 'novel-i200-'));
  const dispose: (() => void)[] = [];
  const handlers = createDesktopProjectHandlers(await createDesktopPaths({ userDataRoot: root }), () => {}, {
    onDispose: fn => { dispose.push(fn); },
    llm: { async *stream() { yield { type: 'text-delta' as const, text }; yield { type: 'finish' as const, reason: { kind: 'stop' as const } }; } },
    resolveGenerationSettings: async () => ({ modelRef: 'test/model', credentialRef: 'test/key' }),
  });
  const invoke = (action: string, args: unknown[]) => {
    const method = `novel-creation-tool/novelNarrativeAdaptation/${action}`;
    return desktopIpcRegistry.invoke(method, args, handlers.get(method));
  };
  try {
    const corpus = JSON.parse(await readFile(new URL('../../../samples/i200/cases.json', import.meta.url), 'utf8')) as { input: unknown };
    const identity = await unwrap(invoke('begin', [corpus.input, undefined]));
    await expect.poll(async () => await unwrap(invoke('status', [identity]))).toMatchObject({ status: 'failed' });
    const result = await invoke('result', [identity]);
    expect(result).toMatchObject({ ok: false, error: { code: 'handler-failed', message: expect.stringContaining('输出格式不符合要求') } });
    expect(JSON.stringify(result)).not.toContain('test-only-sensitive-value');
  } finally { dispose.reverse().forEach(fn => fn()); await rm(root, { recursive: true, force: true }); }
});
