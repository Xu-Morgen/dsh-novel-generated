import { describe, expect, it } from 'vitest';
import { createOnboardingAnalyzerService } from './onboarding-analyzer-service.js';
import type { OnboardingAnalysisOutput } from '../core/schema/onboarding.js';

const settings = { modelRef: 'dsh/default', credentialRef: 'dsh/managed' };

function emptyOutput(): OnboardingAnalysisOutput {
  return {
    evidence: { e1: { sourceChunkIndex: 0, quote: '原文' } },
    layers: {
      characters: { candidates: [{ id: 'mira', name: '米拉', aliases: [], kind: 'protagonist', personality: '', background: '', motivation: '', goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [], arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [] }], confidence: 'high', warnings: [], evidenceIds: ['e1'] },
      worldview: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
      outline: { candidates: [{ id: 'outline', structure: 'free', logline: '故事。', themes: [], acts: [], foreshadowing: [], endings: [] }], confidence: 'low', warnings: [], evidenceIds: [] },
      relationship: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
      state: { candidates: [{ id: 'initial-state', storyTime: '', scene: { location: '', timeOfDay: '', weather: '', season: '', atmosphere: '' }, characters: [{ characterId: 'mira', location: '', alive: true, health: '健康', mood: '', inventory: [], condition: '', currentGoal: '', flags: {} }] }], confidence: 'medium', warnings: [], evidenceIds: ['e1'] },
      canon: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
    },
  };
}

function backendReturning(value: unknown) {
  // DSH-shaped llm stream (the create*Service seam adapts it via asLlmBackend).
  return { async *stream() { yield { type: 'text-delta', text: JSON.stringify(value) }; yield { type: 'finish', reason: { kind: 'stop' } }; } };
}

const sourceHash = 'a'.repeat(64);

describe('I52 onboarding analyzer Host service', () => {
  it('runs start→succeeded and binds project/session/sourceHash', async () => {
    const service = createOnboardingAnalyzerService(backendReturning(emptyOutput()));
    const result = await service.start({ projectId: 'demo', sourceHash, text: '米拉是一名测绘师。' }, settings);
    expect(result.projectId).toBe('demo');
    expect(result.onboardingSessionId).toBeTruthy();
    expect(result.sourceHash).toBe(sourceHash);
    expect(result.layers.characters.candidates).toHaveLength(1);
    expect(service.status(result.onboardingSessionId)).toBe('succeeded');
  });

  it('fails closed when the LLM backend is unavailable', async () => {
    const service = createOnboardingAnalyzerService(undefined);
    await expect(service.start({ projectId: 'demo', sourceHash, text: '文本' }, settings)).rejects.toThrow(/unavailable/);
  });

  it('reports status and rejects unknown sessions', () => {
    const service = createOnboardingAnalyzerService(undefined);
    expect(() => service.status('does-not-exist')).toThrow(/Unknown onboarding session/);
  });

  it('cancels after success and blocks regeneration on a non-succeeded job', async () => {
    const service = createOnboardingAnalyzerService(backendReturning(emptyOutput()));
    const started = await service.start({ projectId: 'demo', sourceHash, text: '米拉是一名测绘师。' }, settings);
    await service.cancel(started.onboardingSessionId);
    expect(service.status(started.onboardingSessionId)).toBe('cancelled');
    await expect(service.regenerate(started.onboardingSessionId, 'worldview', settings)).rejects.toThrow(/not analyzable/);
  });

  it('rejects oversized free text before the LLM is entered', async () => {
    const service = createOnboardingAnalyzerService(backendReturning(emptyOutput()));
    await expect(service.start({ projectId: 'demo', sourceHash, text: 'x'.repeat(2 * 1024 * 1024 + 1) }, settings)).rejects.toThrow(/2 MiB/);
  });

  it('regenerate keeps the binding triple and returns a fresh result for the layer', async () => {
    // DSH-shaped backend: first call (full analysis) returns the full envelope,
    // later calls (regenerate) return a single character layer.
    let calls = 0;
    const backend = { async *stream() {
      const value = calls++ === 0 ? emptyOutput() : emptyOutput().layers.characters;
      yield { type: 'text-delta', text: JSON.stringify(value) };
      yield { type: 'finish', reason: { kind: 'stop' } };
    } };
    const service = createOnboardingAnalyzerService(backend);
    const started = await service.start({ projectId: 'demo', sourceHash, text: '米拉是一名测绘师。' }, settings);
    const regenerated = await service.regenerate(started.onboardingSessionId, 'characters', settings);
    expect(regenerated.onboardingSessionId).toBe(started.onboardingSessionId);
    expect(regenerated.projectId).toBe('demo');
    expect(regenerated.sourceHash).toBe(sourceHash);
    expect(regenerated.layers.worldview).toEqual(started.layers.worldview);
  });

  it('disposes all jobs on Fiber dispose without leaking', async () => {
    let disposeJobs: undefined | (() => void);
    const service = createOnboardingAnalyzerService(backendReturning(emptyOutput()), (dispose) => { disposeJobs = dispose; });
    const started = await service.start({ projectId: 'demo', sourceHash, text: '米拉是一名测绘师。' }, settings);
    expect(service.status(started.onboardingSessionId)).toBe('succeeded');
    disposeJobs?.();
    // After dispose the session store is cleared, so status must throw.
    expect(() => service.status(started.onboardingSessionId)).toThrow(/Unknown onboarding session/);
  });

  it('I57 begin returns the session id immediately and reaches succeeded with a bound result', async () => {
    const service = createOnboardingAnalyzerService(backendReturning(emptyOutput()));
    const begun = service.begin({ projectId: 'demo', sourceHash, text: '米拉是一名测绘师。' }, settings);
    expect(begun.onboardingSessionId).toBeTruthy();
    // Background job: wait for the fake backend to settle.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(service.status(begun.onboardingSessionId)).toBe('succeeded');
    const result = service.result(begun.onboardingSessionId);
    expect(result.onboardingSessionId).toBe(begun.onboardingSessionId);
    expect(result.projectId).toBe('demo');
    expect(result.layers.characters.candidates).toHaveLength(1);
  });

  it('I57 result throws for unfinished / failed / cancelled / unknown sessions', async () => {
    const service = createOnboardingAnalyzerService(undefined, undefined, () => undefined);
    expect(() => service.result('does-not-exist')).toThrow(/Unknown onboarding session/);
    // Unavailable backend → the background job fails closed and result surfaces it.
    const begun = service.begin({ projectId: 'demo', sourceHash, text: '米拉是一名测绘师。' }, settings);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(service.status(begun.onboardingSessionId)).toBe('failed');
    expect(() => service.result(begun.onboardingSessionId)).toThrow();
  });

  it('I84 reports a failed background job without changing status/result semantics', async () => {
    const reported: Array<{ error: unknown; sessionId: string }> = [];
    const service = createOnboardingAnalyzerService(undefined, undefined, (error, sessionId) => reported.push({ error, sessionId }));
    const begun = service.begin({ projectId: 'demo', sourceHash, text: '米拉是一名测绘师。' }, settings);
    for (let attempt = 0; attempt < 20 && reported.length === 0; attempt += 1) await Promise.resolve();
    expect(service.status(begun.onboardingSessionId)).toBe('failed');
    expect(reported).toHaveLength(1);
    expect(reported[0].sessionId).toBe(begun.onboardingSessionId);
    expect(reported[0].error).toBeInstanceOf(Error);
    expect(() => service.result(begun.onboardingSessionId)).toThrow();
  });

  it('I57 cancel mid-flight stops the job with zero result and no layer writes', async () => {
    // A backend that never settles until the job is cancelled.
    let release: undefined | (() => void);
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const hangingBackend = { async *stream() {
      yield { type: 'text-delta', text: '{"evidence":{},"layers":{}}' };
      await gate;
      throw new Error('aborted by controller');
    } };
    const service = createOnboardingAnalyzerService(hangingBackend);
    const begun = service.begin({ projectId: 'demo', sourceHash, text: '米拉是一名测绘师。' }, settings);
    await service.cancel(begun.onboardingSessionId);
    expect(service.status(begun.onboardingSessionId)).toBe('cancelled');
    expect(service.getResult(begun.onboardingSessionId)).toBeUndefined();
    expect(() => service.result(begun.onboardingSessionId)).toThrow(/取消/);
    release?.();
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
});
