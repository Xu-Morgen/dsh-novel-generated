import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { narrativeRepairDescriptors } from '../../app/narrative-repair-contract.js';
import { desktopIpcRegistry } from '../../platform/desktop-ipc-registry.js';
import { IPC_METHOD_IDS } from '../preload/ipc-method-ids.js';
import { DESKTOP_CLIENT_SERVICES } from '../renderer/ipc-client-registry.js';
import { createDesktopPaths } from '../../platform/desktop-paths.js';
import { createDesktopProjectHandlers } from './project-handlers.js';
import { ONBOARDING_PROMPT_EXAMPLE } from '../../core/onboarding/example.js';
import { unwrap } from '../../client/shared.js';

it('locks all additive methods across Main/preload/Renderer and rejects invalid args/results', async () => {
  const base = JSON.parse(await readFile('samples/i200/cases.json', 'utf8'));
  for (const descriptor of narrativeRepairDescriptors) {
    expect(desktopIpcRegistry.get(descriptor.id)).toEqual(descriptor); expect(IPC_METHOD_IDS).toContain(descriptor.id);
    expect(DESKTOP_CLIENT_SERVICES.some(service => service.methods.some(method => method.methodId === descriptor.id))).toBe(true);
    const input = descriptor.method === 'beginBound' ? { input: base.input, onboardingSessionId: 'session-1' } : { projectId: 'book', importSessionId: 'import-test', sourceHash: 'a'.repeat(64), ...(descriptor.namespace === 'novelNarrativeAdaptation' ? { adaptationId: 'a1' } : { revealId: 'r1' }) };
    let calls = 0;
    expect(await desktopIpcRegistry.invoke(descriptor.id, [{ ...input, extra: true }], () => { calls++; })).toMatchObject({ ok: false, error: { code: 'invalid-arguments' } }); expect(calls).toBe(0);
    expect(await desktopIpcRegistry.invoke(descriptor.id, [input], () => ({ attempt: 3 }))).toMatchObject({ ok: false, error: { code: 'invalid-result' } });
  }
});

it('binds the exact Main foundation and rejects cross-project/source use before a model call', async () => {
  const root = await mkdtemp(join(tmpdir(), 'i203-ipc-')), dispose: (() => void)[] = []; let calls = 0;
  const handlers = createDesktopProjectHandlers(await createDesktopPaths({ userDataRoot: root }), () => {}, { onDispose: fn => dispose.push(fn), llm: { async *stream() { calls++; yield { type: 'text-delta' as const, text: JSON.stringify(ONBOARDING_PROMPT_EXAMPLE) }; } }, resolveGenerationSettings: async () => ({ modelRef: 'test/model', credentialRef: 'test/key' }) });
  const invoke = (method: string, ...args: unknown[]) => desktopIpcRegistry.invoke(`novel-creation-tool/${method}`, args, handlers.get(`novel-creation-tool/${method}`));
  try {
    const base = JSON.parse(await readFile('samples/i200/cases.json', 'utf8'));
    const result = await unwrap(invoke('novelOnboardingAnalyzer/begin', { projectId: 'book', sourceHash: base.input.sourceHash, text: Object.values(ONBOARDING_PROMPT_EXAMPLE.evidence).map(e => e.quote).join('\n\n') }, undefined));
    const { onboardingSessionId } = result as { onboardingSessionId: string };
    await expect.poll(async () => unwrap(invoke('novelOnboardingAnalyzer/status', onboardingSessionId))).toBe('succeeded'); const before = calls;
    for (const input of [{ ...base.input, projectId: 'other' }, { ...base.input, sourceHash: 'b'.repeat(64) }]) expect(await invoke('novelNarrativeAdaptation/beginBound', { input, onboardingSessionId })).toMatchObject({ ok: false, error: { message: expect.stringContaining('不一致') } });
    expect(calls).toBe(before);
  } finally { dispose.reverse().forEach(fn => fn()); await rm(root, { recursive: true, force: true }); }
});
