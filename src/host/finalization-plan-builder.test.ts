import { describe, expect, it } from 'vitest';

import { hashText } from '../core/candidate/index.js';
import type { Chapter } from '../core/schema/text.js';
import type { DraftAdoptionResult, FinalizationPlan } from '../core/schema/finalization.js';
import type { OutlineGenerationBaselineReadResult } from '../core/schema/outline-generation-baseline.js';
import type { TextChangeImpactReport } from '../core/schema/text-change-impact.js';
import type { StructuralPreviewPlan } from './writing-adjudication/structural-preview-plan.js';
import { createFinalizationPlanBuilder } from './finalization-plan-builder.js';

const settings = { modelRef: 'dsh/default', credentialRef: 'dsh/managed' };
const ISO = '2026-08-31T00:00:00.000Z';
const finalText = '作者保存后的最终正文。';
const draftText = '候选接受后的草稿正文。';
const finalSourceHash = hashText(finalText);
const draftSourceHash = hashText(draftText);

function sceneChapter(content = finalText): Chapter {
  return {
    id: 'chapter-1', index: 1, title: '第一章', pov: 'mira', status: 'draft',
    scenes: [{ id: 'scene-1', index: 0, content, summary: '场景', beats: ['beat-1'], canonEvents: [], notes: '', branches: [] }],
  };
}

function adoption(overrides: Partial<DraftAdoptionResult> = {}): DraftAdoptionResult {
  return {
    projectId: 'project-1', candidateId: 'candidate-1', chapterId: 'chapter-1', sceneId: 'scene-1',
    status: 'adopted', sourceHash: draftSourceHash, projectFingerprint: 'f'.repeat(64), ...overrides,
  };
}

function structuralPreview(generationBaseline: StructuralPreviewPlan['generationBaseline']): StructuralPreviewPlan {
  const fingerprint = 'a'.repeat(64);
  return {
    planId: 'preview-candidate-1', projectId: 'project-1', candidateId: 'candidate-1', sourceHash: finalSourceHash,
    generationBaseline,
    layerBaselines: [
      { layer: 'c2', fingerprint, snapshot: {} as never },
      { layer: 'c1', fingerprint, snapshot: [] },
      { layer: 'c3', fingerprint, snapshot: { entries: [], states: [] } },
      { layer: 'c4', fingerprint, snapshot: [] },
      { layer: 'b2', fingerprint, snapshot: [] },
    ],
    parserOutputs: {} as never,
    changes: [
      { layer: 'c1', kind: 'update', entityType: 'relationship', entityId: 'relationship-1', beforeHash: 'b'.repeat(64), afterHash: 'c'.repeat(64), beforeIndex: 0, afterIndex: 0, changedFields: ['affinity'] },
      { layer: 'c4', kind: 'add', entityType: 'canon-event', entityId: 'event-1', afterHash: 'd'.repeat(64), afterIndex: 0, changedFields: ['event'] },
    ],
    createdAt: ISO,
  };
}

function wordingReport(): TextChangeImpactReport {
  return { classification: 'wording-only', affectedDetailBeatIds: [] } as unknown as TextChangeImpactReport;
}

function baselineResult(): OutlineGenerationBaselineReadResult {
  return {
    baseline: {
      baselineId: 'baseline-1', projectId: 'project-1', chapterId: 'chapter-1', sceneId: 'scene-1', detailBeatId: 'detail-1',
      b5ContentFingerprint: 'b'.repeat(64), bindingFingerprint: 'c'.repeat(64), sceneCard: {} as never, revision: 1,
      authoringBase: { content: draftText, sourceHash: draftSourceHash }, status: 'current', generatedCandidateIds: [], createdAt: ISO,
    } as OutlineGenerationBaselineReadResult['baseline'],
    freshness: 'stale', staleReasons: ['source-changed'],
  };
}

function createFixture(options: { readonly withBaseline?: boolean; readonly impact?: TextChangeImpactReport } = {}) {
  const calls = { structural: 0, impact: 0, reconciliation: 0 };
  const baseline = options.withBaseline ? baselineResult() : undefined;
  const builder = createFinalizationPlanBuilder({
    writing: {
      adoptedDraft: () => adoption(options.withBaseline ? { generationBaselineId: 'baseline-1' } : {}),
      async prepareFinalizationStructuralPreview(_candidateId, text, sourceHash, generationBaseline) {
        calls.structural += 1;
        expect(text).toBe(finalText);
        expect(sourceHash).toBe(finalSourceHash);
        expect(generationBaseline.kind).toBe(options.withBaseline ? 'baseline' : 'no-outline-baseline');
        return structuralPreview(generationBaseline);
      },
    },
    text: { readChapter: async () => sceneChapter() },
    outline: { contentFingerprint: async () => 'b'.repeat(64) },
    binding: { read: async () => ({ manual: [], effective: [], fingerprint: 'c'.repeat(64) }) },
    baseline: { read: async () => {
      if (baseline === undefined) throw new Error('baseline should not be read');
      return baseline;
    } },
    impact: {
      async prepare() {
        calls.impact += 1;
        return { impactId: 'impact-1', status: 'ready' };
      },
      read: () => options.impact ?? wordingReport(),
    },
    reconciliation: { prepare: async () => {
      calls.reconciliation += 1;
      throw new Error('wording-only must not prepare reconciliation');
    } },
  });
  return { builder, calls };
}

describe('I135 FinalizationPlanBuilder', () => {
  it('无 baseline 时显式降级、只投影五层变化与引用策略，不伪造 I112/I113 调和', async () => {
    const { builder, calls } = createFixture();
    const plan = await builder.prepare('project-1', { candidateId: 'candidate-1', finalSourceHash }, settings);

    expect(plan).toMatchObject<Partial<FinalizationPlan>>({
      projectId: 'project-1', candidateId: 'candidate-1', draftSourceHash, finalSourceHash,
      generationBaseline: { kind: 'no-outline-baseline' },
      reconciliation: { status: 'degraded', reason: 'no-generation-baseline', items: [] },
      degradedReasons: ['no-generation-baseline'],
    });
    expect(plan.references.deterministic).toEqual(expect.arrayContaining([expect.objectContaining({ owner: 'c4', disposition: 'deterministic-derived' })]));
    expect(plan.references.semanticCandidates).toEqual(expect.arrayContaining([expect.objectContaining({ owner: 'c1', disposition: 'author-semantic-candidate' })]));
    expect(plan.references.forbiddenAutomatic).toEqual(expect.arrayContaining([expect.objectContaining({ owner: 'c5', field: 'scene.content' })]));
    expect(JSON.stringify(plan)).not.toContain(finalText);
    expect(calls).toEqual({ structural: 1, impact: 0, reconciliation: 0 });

    expect(builder.read('project-1', plan.planId)).toEqual(plan);
    await expect(builder.cancel('project-1', plan.planId)).resolves.toEqual({ projectId: 'project-1', planId: plan.planId, status: 'cancelled' });
    expect(() => builder.read('project-1', plan.planId)).toThrow(/cancelled/);
  });

  it('有 baseline 时复用最终保存正文和既有 impact owner；wording-only 不生成 B5 调和计划', async () => {
    const { builder, calls } = createFixture({ withBaseline: true });
    const plan = await builder.prepare('project-1', { candidateId: 'candidate-1', finalSourceHash }, settings);

    expect(plan.generationBaseline).toMatchObject({ kind: 'baseline', generationBaselineId: 'baseline-1', authoringSourceHash: draftSourceHash });
    expect(plan.reconciliation).toEqual({ status: 'none', reason: 'wording-only', items: [] });
    expect(plan.completion.next).toEqual({ status: 'deferred', reason: 'application-owned-by-i136' });
    expect(calls).toEqual({ structural: 1, impact: 1, reconciliation: 0 });
  });

  it('最终 sourceHash 不匹配当前 C5 时在结构预览与下游分析前 fail closed', async () => {
    const { builder, calls } = createFixture({ withBaseline: true });
    await expect(builder.prepare('project-1', { candidateId: 'candidate-1', finalSourceHash: 'e'.repeat(64) }, settings)).rejects.toThrow(/does not match current C5/);
    expect(calls).toEqual({ structural: 0, impact: 0, reconciliation: 0 });
  });

  it('B5 或 binding freshness 变化时拒绝计划，不创建可消费的 session', async () => {
    const { calls } = createFixture({ withBaseline: true });
    const builder = createFinalizationPlanBuilder({
      writing: {
        adoptedDraft: () => adoption({ generationBaselineId: 'baseline-1' }),
        prepareFinalizationStructuralPreview: async () => { calls.structural += 1; return structuralPreview({ kind: 'baseline', generationBaselineId: 'baseline-1', baselineRevision: 1, detailBeatId: 'detail-1', b5ContentFingerprint: 'b'.repeat(64), bindingFingerprint: 'wrong'.repeat(16) }); },
      },
      text: { readChapter: async () => sceneChapter() },
      outline: { contentFingerprint: async () => 'wrong'.repeat(16) },
      binding: { read: async () => ({ manual: [], effective: [], fingerprint: 'd'.repeat(64) }) },
      baseline: { read: async () => baselineResult() },
      impact: { prepare: async () => ({ impactId: 'impact-1', status: 'ready' }), read: () => wordingReport() },
      reconciliation: { prepare: async () => { throw new Error('not reached'); } },
    });
    await expect(builder.prepare('project-1', { candidateId: 'candidate-1', finalSourceHash }, settings)).rejects.toThrow(/binding freshness/);
    expect(calls.structural).toBe(1);
  });
});
