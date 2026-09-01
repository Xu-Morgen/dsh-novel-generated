import { describe, expect, it } from 'vitest';
import { createNarrativeRevealPlanner } from './narrative-reveal-planner-service.js';
import { narrativeRevealInputSchema } from '../core/schema/narrative-reveal.js';

const settings = { modelRef: 'dsh/fake', credentialRef: 'dsh/test' };
const output = {
  confidence: 'high' as const,
  entries: [{ id: 'secret-ash', fact: '档案中的机制需要经过调查逐步验证。', kind: 'secret' as const, holders: ['archivist'], revealPlan: { revealTo: ['mira'], revealAt: 'act-1-beat-1' }, status: 'hidden' as const, evidenceParagraphIds: ['paragraph-0001'] }],
  states: [{ characterId: 'archivist', knows: ['secret-ash'] }, { characterId: 'mira', knows: [] }],
  rationale: '让主角在第一幕保持未知，并以调查锚点安排逐步揭示',
};
const input = narrativeRevealInputSchema.parse({
  projectId: 'demo', importSessionId: 'imp-reveal-service', sourceHash: 'a'.repeat(64), sourceRole: 'background-material', treatment: 'adapt-pov',
  narrativeIntent: { pov: 'limited', protagonistId: 'mira', initialKnown: [], revealPacing: 'balanced' }, b5CandidateId: 'narrative-candidate-1',
  b5Anchors: [{ id: 'act-1-beat-1', actId: 'act-1', beatId: 'beat-1', label: '调查开始' }], characterIds: ['archivist', 'mira'],
  evidence: [{ paragraphId: 'paragraph-0001', role: 'world-truth', text: '一条幕后事实。' }],
});
function backendReturning(value: unknown) {
  return { async *stream() { yield { type: 'text-delta' as const, text: JSON.stringify(value) }; yield { type: 'finish' as const, reason: { kind: 'stop' } }; } };
}

describe('I146 narrative reveal planner service', () => {
  it('runs as a zero-write, source-bound candidate job', async () => {
    const planner = createNarrativeRevealPlanner(backendReturning(output));
    const identity = planner.begin(input, settings);
    expect(identity).toMatchObject({ projectId: 'demo', importSessionId: 'imp-reveal-service', revealId: 'narrative-reveal-1' });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(planner.status(identity).status).toBe('succeeded');
    expect(planner.result(identity).candidate).toMatchObject({ b5CandidateId: 'narrative-candidate-1', entries: output.entries, states: output.states });
    expect(() => planner.status({ ...identity, sourceHash: 'b'.repeat(64) })).toThrow(/source hash mismatch/);
  });

  it('cancels, records model failure, and disposes jobs without a writer', async () => {
    const slow = { async *stream() { await new Promise<void>((resolve) => setTimeout(resolve, 20)); yield { type: 'text-delta' as const, text: JSON.stringify(output) }; } };
    const cancelled = createNarrativeRevealPlanner(slow);
    const identity = cancelled.begin(input, settings);
    await expect(cancelled.cancel(identity)).resolves.toMatchObject({ status: 'cancelled' });
    expect(() => cancelled.result(identity)).toThrow(/cancelled/);
    const failed = createNarrativeRevealPlanner(backendReturning({ invalid: true }));
    const failedIdentity = failed.begin({ ...input, importSessionId: 'imp-reveal-failed' }, settings);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(failed.status(failedIdentity).status).toBe('failed');
    expect(() => failed.result(failedIdentity)).toThrow(/expected|schema|entries/i);
    failed.dispose();
    expect(() => failed.status(failedIdentity)).toThrow(/disposed/);
  });
});
