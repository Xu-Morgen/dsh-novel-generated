import { describe, expect, it } from 'vitest';

import { textContentHash } from '../core/text/index.js';
import type { FinalizationPlan } from '../core/schema/finalization.js';
import type { ConfirmationRecord } from '../core/schema/confirm.js';
import type { FinalizationApplicationContext } from './finalization-plan-builder.js';
import { structuralPreviewFingerprint } from './writing-adjudication/structural-preview-plan.js';
import { createFinalizationCoordinator } from './finalization-coordinator.js';

const projectId = 'project-1';
const finalText = '作者保存后的最终正文。';
const finalSourceHash = textContentHash(finalText);
const draftSourceHash = 'a'.repeat(64);
const bindingFingerprint = 'b'.repeat(64);
const b5ContentFingerprint = 'c'.repeat(64);

function plan(): FinalizationPlan {
  return {
    planId: 'finalization-plan-1', projectId, candidateId: 'candidate-1', chapterId: 'chapter-1', sceneId: 'scene-1',
    draftSourceHash, finalSourceHash,
    generationBaseline: {
      kind: 'baseline', generationBaselineId: 'baseline-1', baselineRevision: 1, detailBeatId: 'detail-1',
      b5ContentFingerprint, bindingFingerprint, authoringSourceHash: draftSourceHash,
    },
    layerFingerprints: {
      c2: structuralPreviewFingerprint({}),
      c1: structuralPreviewFingerprint([]),
      c3: structuralPreviewFingerprint({ entries: [], states: [] }),
      c4: structuralPreviewFingerprint([]),
      b2: structuralPreviewFingerprint([]),
    },
    layerChanges: [],
    references: { deterministic: [], semanticCandidates: [], forbiddenAutomatic: [] },
    reconciliation: { status: 'none', items: [] },
    completion: { current: { detailBeatId: null, status: 'unchanged' }, next: { status: 'deferred', reason: 'application-owned-by-i136' } },
    degradedReasons: [], createdAt: '2026-08-31T00:00:00.000Z',
  };
}

function fixture(options: { readonly content?: () => string } = {}) {
  const currentPlan = plan();
  const context: FinalizationApplicationContext = {
    plan: currentPlan,
    structural: { planId: 'structural-plan-1', projectId, candidateId: 'candidate-1', sourceHash: finalSourceHash, generationBaseline: currentPlan.generationBaseline, layerBaselines: [], parserOutputs: {} as never, changes: [], createdAt: currentPlan.createdAt },
  };
  const records = new Map<string, ConfirmationRecord>();
  const calls = { proposed: 0, accepted: 0, rejected: 0, completed: 0, writes: 0 };
  const confirmation = {
    async open() { return undefined; },
    async propose(_projectId: string, input: { id: string; kind: string; payload: unknown }) {
      calls.proposed += 1;
      const record = { ...input, version: 1 as const, status: 'pending' as const } as ConfirmationRecord;
      records.set(input.id, record);
      return record;
    },
    async accept(_projectId: string, id: string) {
      calls.accepted += 1;
      const record = records.get(id);
      if (record === undefined) throw new Error(`Unknown confirmation: ${id}`);
      const next = { ...record, status: 'accepted' as const };
      records.set(id, next);
      return next;
    },
    async reject(_projectId: string, id: string) {
      calls.rejected += 1;
      const record = records.get(id);
      if (record === undefined) throw new Error(`Unknown confirmation: ${id}`);
      const next = { ...record, status: 'rejected' as const };
      records.set(id, next);
      return next;
    },
    get(_projectId: string, id: string) {
      const record = records.get(id);
      if (record === undefined) throw new Error(`Unknown confirmation: ${id}`);
      return record;
    },
    pending: () => [], list: () => [],
  };
  const service = createFinalizationCoordinator({
    planBuilder: { readForApplication: () => context },
    text: { readChapter: async () => ({ id: 'chapter-1', index: 1, title: '第一章', pov: 'mira', status: 'draft', scenes: [{ id: 'scene-1', index: 0, content: options.content?.() ?? finalText, summary: '', beats: [], canonEvents: [], notes: '', branches: [] }] }) },
    state: { current: () => ({}), transaction: async () => { calls.writes += 1; return {} as never; } } as never,
    relationship: { read: async () => [], saveAll: async () => { calls.writes += 1; return []; } } as never,
    knowledge: { read: async () => ({ entries: [], states: [] }), saveAll: async () => { calls.writes += 1; return {} as never; } } as never,
    canon: { query: () => [], append: async () => { calls.writes += 1; return {} as never; }, supersede: async () => { calls.writes += 1; return {} as never; } } as never,
    worldview: { list: async () => [], rewrite: async () => { calls.writes += 1; return {} as never; } } as never,
    outline: { contentFingerprint: async () => b5ContentFingerprint } as never,
    binding: { read: async () => ({ manual: [], effective: [], fingerprint: bindingFingerprint }) } as never,
    baseline: { read: async () => ({ baseline: { status: 'current' }, staleReasons: [] }) } as never,
    reconciliation: { completeAuthorized: async () => { calls.completed += 1; return { status: 'continued', current: { chapterId: 'chapter-1', sceneId: 'scene-1', detailBeatId: 'detail-1', status: 'done' }, next: { chapterId: 'chapter-1', sceneId: 'scene-2', detailBeatId: 'detail-2', baselineId: 'baseline-2' }, progress: { outlineId: 'outline-1', currentAct: 'act-1', currentBeat: 'beat-1', completedBeats: [], deviations: [], tensionLevel: 20 }, b5ContentFingerprint }; } } as never,
    confirmation,
  });
  return { service, confirmation, calls };
}

describe('I136 FinalizationCoordinator', () => {
  it('one proposal/one acceptance applies once and repeated acceptance converges to already-applied', async () => {
    const { service, calls } = fixture();
    const proposed = await service.propose(projectId, { planId: 'finalization-plan-1', decisions: [] });
    expect(calls.proposed).toBe(1);
    const applied = await service.accept(projectId, proposed.proposalId);
    expect(applied).toMatchObject({ status: 'applied', appliedStages: ['b5', 'c6', 'baseline'], next: { status: 'continued' } });
    expect(calls.accepted).toBe(1);
    expect(calls.completed).toBe(1);
    expect(await service.accept(projectId, proposed.proposalId)).toMatchObject({ status: 'already-applied' });
    expect(calls.accepted).toBe(1);
    expect(calls.completed).toBe(1);
  });

  it('source freshness changes fail closed before any layer or completion write', async () => {
    let content = finalText;
    const { service, calls } = fixture({ content: () => content });
    const proposed = await service.propose(projectId, { planId: 'finalization-plan-1', decisions: [] });
    content = '外部修改后的正文。';
    expect(await service.accept(projectId, proposed.proposalId)).toMatchObject({ status: 'stale', reasons: ['source-changed'] });
    expect(calls.completed).toBe(0);
    expect(calls.writes).toBe(0);
  });

  it('one confirmation rejection leaves the finalization plan and every writer untouched', async () => {
    const { service, calls } = fixture();
    const proposed = await service.propose(projectId, { planId: 'finalization-plan-1', decisions: [] });

    expect(await service.reject(projectId, proposed.proposalId)).toMatchObject({ status: 'rejected', planId: 'finalization-plan-1' });
    expect(calls.accepted).toBe(0);
    expect(calls.completed).toBe(0);
    expect(calls.writes).toBe(0);
    expect(await service.reject(projectId, proposed.proposalId)).toMatchObject({ status: 'already-rejected' });
    expect(calls.rejected).toBe(1);
  });
});
