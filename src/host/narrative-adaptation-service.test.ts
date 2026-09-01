import { describe, expect, it } from 'vitest';
import { createNarrativeAdaptationService } from './narrative-adaptation-service.js';
import { narrativeAdaptationInputSchema } from '../core/schema/narrative-adaptation.js';

const settings = { modelRef: 'dsh/fake', credentialRef: 'dsh/test' };
const output = {
  confidence: 'high' as const,
  evidenceParagraphIds: ['paragraph-0001'],
  outline: { id: 'adapted-outline', structure: 'three-act' as const, logline: '调查者追踪异常线索', themes: ['记忆'], acts: [{ id: 'act-1', index: 0, title: '调查开始', goal: '找到第一条可验证线索', beats: [{ id: 'beat-1', title: '跟随线索', description: '调查者发现矛盾并作出暂时误判', charactersInvolved: ['mira'], conflictType: 'external' as const, prerequisites: [], optional: false, detailBeats: [] }] }], foreshadowing: [], endings: [] },
  rationale: '先让读者经历调查，再逐步揭示幕后事实',
};
const input = narrativeAdaptationInputSchema.parse({
  projectId: 'demo', importSessionId: 'imp-adapt-1', sourceHash: 'a'.repeat(64), sourceRole: 'background-material', treatment: 'adapt-pov',
  narrativeIntent: { pov: 'limited', protagonistId: 'mira', initialKnown: [], revealPacing: 'balanced' },
  evidence: [{ paragraphId: 'paragraph-0001', role: 'world-truth', text: '一条幕后事实。' }],
});
function backendReturning(value: unknown) {
  return { async *stream() { yield { type: 'text-delta' as const, text: JSON.stringify(value) }; yield { type: 'finish' as const, reason: { kind: 'stop' } }; } };
}

describe('I145 narrative adaptation service', () => {
  it('runs as a zero-write, identity-bound candidate job', async () => {
    const service = createNarrativeAdaptationService(backendReturning(output));
    const identity = service.begin(input, settings);
    expect(identity).toMatchObject({ projectId: 'demo', importSessionId: 'imp-adapt-1', sourceHash: 'a'.repeat(64), adaptationId: 'narrative-adaptation-1' });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(service.status(identity).status).toBe('succeeded');
    expect(service.result(identity).candidate).toMatchObject({ projectId: 'demo', sourceRole: 'background-material', treatment: 'adapt-pov', outline: output.outline });
    expect(() => service.status({ ...identity, sourceHash: 'b'.repeat(64) })).toThrow(/source hash mismatch/);
  });

  it('cancels, rejects unavailable/malformed generation, and disposes jobs', async () => {
    const slow = { async *stream() { await new Promise<void>((resolve) => setTimeout(resolve, 20)); yield { type: 'text-delta' as const, text: JSON.stringify(output) }; } };
    const cancelled = createNarrativeAdaptationService(slow);
    const identity = cancelled.begin(input, settings);
    await expect(cancelled.cancel(identity)).resolves.toMatchObject({ status: 'cancelled' });
    expect(() => cancelled.result(identity)).toThrow(/cancelled/);
    const failed = createNarrativeAdaptationService(backendReturning({ invalid: true }));
    const failedIdentity = failed.begin({ ...input, importSessionId: 'imp-adapt-failed' }, settings);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(failed.status(failedIdentity).status).toBe('failed');
    expect(() => failed.result(failedIdentity)).toThrow(/expected|schema|outline/i);
    failed.dispose();
    expect(() => failed.status(failedIdentity)).toThrow(/disposed/);
  });
});
