import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createConfirmationService, type NovelConfirmationService } from './confirmation-service.js';
import { createTextDeletionService, type TextDeletionServiceDeps } from './text-deletion-service.js';
import type { TextDeleteImpact } from '../core/text/index.js';

const roots: string[] = [];
const hash = 'a'.repeat(64);
const sceneImpact: TextDeleteImpact = {
  kind: 'scene', chapterId: 'chapter-a', sceneId: 'scene-a', sceneCount: 1, branchCount: 1, proseCharacters: 9,
  sources: [{ sceneId: 'scene-a', sourceHash: hash, branches: [{ id: 'branch-a', label: 'old', chosen: true, sourceHash: hash }] }],
  projectFingerprint: hash, targetFingerprint: hash,
};

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'novel-text-deletion-'));
  roots.push(root);
  const confirmation = createConfirmationService(root);
  await confirmation.open('project');
  let deleted = false;
  let cleanupCalls = 0;
  const bindingState = { bindings: [{ sceneId: 'scene-a', detailBeatId: 'card-a', chapterId: 'chapter-a', source: 'manual' as const }] };
  const deps: TextDeletionServiceDeps = {
    text: {
      listChapters: async () => deleted ? [] : [{ id: 'chapter-a', index: 1, title: 'A', pov: 'hero', status: 'draft', scenes: [{ id: 'scene-a', index: 0, content: '正文', summary: '', beats: [], canonEvents: [], notes: '', branches: [] }, { id: 'scene-b', index: 1, content: '其余正文', summary: '', beats: [], canonEvents: [], notes: '', branches: [] }] }],
      projectFingerprint: async () => deleted ? 'b'.repeat(64) : hash,
      inspectChapterDelete: async () => { throw new Error('not used'); },
      inspectSceneDelete: async () => { if (deleted) throw new Error('Unknown scene: scene-a'); return sceneImpact; },
      deleteChapterPrimitive: async () => { throw new Error('not used'); },
      deleteScenePrimitive: async () => { deleted = true; return { impact: sceneImpact, fingerprint: 'b'.repeat(64) }; },
    },
    binding: {
      impact: async () => ({ kind: 'scene', chapterId: 'chapter-a', sceneId: 'scene-a', bindings: bindingState.bindings, fingerprint: hash }),
      cleanupForDeletion: async (_projectId, _sceneIds, proposalId) => { cleanupCalls += 1; bindingState.bindings = []; return { proposalId, removed: 1, fingerprint: 'c'.repeat(64) }; },
    },
    confirmation,
  };
  return { root, confirmation, deps, service: createTextDeletionService(deps), get deleted() { return deleted; }, get cleanupCalls() { return cleanupCalls; } };
}

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe('I106 text deletion service', () => {
  it('keeps impact read-only, requires I11, and applies binding-first with already-deleted retry', async () => {
    const fixtureValue = await fixture();
    const target = { kind: 'scene' as const, chapterId: 'chapter-a', sceneId: 'scene-a' };
    const impact = await fixtureValue.service.impact('project', target);
    expect(impact.status).toBe('ready');
    expect(fixtureValue.cleanupCalls).toBe(0);

    const proposal = await fixtureValue.service.propose('project', { target, expectedImpactFingerprint: impact.impact.impactFingerprint });
    expect(proposal.status).toBe('pending');
    expect(fixtureValue.deleted).toBe(false);
    expect(fixtureValue.cleanupCalls).toBe(0);

    const applied = await fixtureValue.service.apply('project', proposal.status === 'pending' ? proposal.proposalId : 'missing');
    expect(applied).toMatchObject({ status: 'deleted' });
    expect(fixtureValue.cleanupCalls).toBe(1);
    expect(fixtureValue.deleted).toBe(true);

    const retried = await fixtureValue.service.apply('project', proposal.status === 'pending' ? proposal.proposalId : 'missing');
    expect(retried).toMatchObject({ status: 'already-deleted' });
    expect(fixtureValue.cleanupCalls).toBe(1);
  });

  it('does not create a proposal for stale impact or active queue/candidate blockers', async () => {
    const fixtureValue = await fixture();
    const target = { kind: 'scene' as const, chapterId: 'chapter-a', sceneId: 'scene-a' };
    const stale = await fixtureValue.service.propose('project', { target, expectedImpactFingerprint: 'f'.repeat(64) });
    expect(stale).toMatchObject({ status: 'stale' });
    expect(fixtureValue.confirmation.pending('project')).toHaveLength(0);

    const blockedDeps: TextDeletionServiceDeps = {
      ...fixtureValue.deps,
      queue: { status: async () => ({ projectId: 'project', runState: 'running', config: { wordBudget: null, maxRetries: 0, stopOnSoftWarnings: true }, consumedUnits: 0, updatedAt: new Date(0).toISOString(), error: null, tasks: [{ id: 'task-a', chapterId: 'chapter-a', sceneId: 'scene-a', cardTitle: 'Card', cardPov: 'hero', status: 'running', candidateId: null, attempts: 0, error: null, budgetUnits: null, createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() }] }) },
      writing: { listActiveCandidates: async () => [{ candidateId: 'candidate-a', intent: 'continue', chapterId: 'chapter-a', sceneId: 'scene-a' }] },
    };
    const blockedService = createTextDeletionService(blockedDeps);
    const blocked = await blockedService.impact('project', target);
    expect(blocked.status).toBe('blocked');
    expect(blocked.impact.blockers).toEqual(['active-queue', 'active-candidate']);
  });

  it('rejects the proposal without touching either owner', async () => {
    const fixtureValue = await fixture();
    const target = { kind: 'scene' as const, chapterId: 'chapter-a', sceneId: 'scene-a' };
    const impact = await fixtureValue.service.impact('project', target);
    const proposal = await fixtureValue.service.propose('project', { target, expectedImpactFingerprint: impact.impact.impactFingerprint });
    if (proposal.status !== 'pending') throw new Error('fixture did not produce pending proposal');
    await expect(fixtureValue.service.reject('project', proposal.proposalId)).resolves.toMatchObject({ status: 'rejected' });
    expect(fixtureValue.deleted).toBe(false);
    expect(fixtureValue.cleanupCalls).toBe(0);
  });
});
