import { describe, expect, it } from 'vitest';

import { branchListInvocation } from './branch.js';
import { onboardingAnalysisCancelInvocation } from './onboarding-analyzer.js';
import { textChapterCreateInvocation } from './text-mutation.js';
import { writingAdoptDraftInvocation, writingPrepareFinalizationPlanInvocation, writingProposeAtInvocation } from './writing.js';
import { queueStartAtInvocation } from './queue.js';
import type { MethodSpecFor } from './shared.js';

const branch = { id: 'branch-1', label: '初稿', chosen: true, charCount: 2, hash: 'hash-1' };

// I103 编译期正向夹具：descriptor result codec 同时允许同步结果与 Promise 结果。
const syncListSpec: MethodSpecFor<typeof branchListInvocation> = {
  method: 'list',
  call: () => ({ branches: [branch] }),
};
const asyncListSpec: MethodSpecFor<typeof branchListInvocation> = {
  method: 'list',
  call: async () => ({ branches: [branch] }),
};
const undefinedResultSpec: MethodSpecFor<typeof onboardingAnalysisCancelInvocation> = {
  method: 'cancel',
  call: async () => undefined,
};

// I103 编译期负向夹具：Domain 裸数组不得冒充公开 `{ branches }` wire 结果。
const rawArrayListSpec: MethodSpecFor<typeof branchListInvocation> = {
  method: 'list',
  // @ts-expect-error descriptor result 要求 `{ branches }` envelope，禁止数组直出
  call: async () => [branch],
};

// I103 编译期负向夹具：缺少必填 branches 字段必须在 adapter 接线层失败。
const missingBranchesListSpec: MethodSpecFor<typeof branchListInvocation> = {
  method: 'list',
  // @ts-expect-error descriptor result 要求必填 branches 字段
  call: () => ({}),
};
const invalidUndefinedResultSpec: MethodSpecFor<typeof onboardingAnalysisCancelInvocation> = {
  method: 'cancel',
  // @ts-expect-error z.undefined() result 禁止借 `void` 规则返回任意值
  call: () => ({ ignored: true }),
};
const invalidTextMutationResultSpec: MethodSpecFor<typeof textChapterCreateInvocation> = {
  method: 'chapterCreate',
  // @ts-expect-error I104 wire chapter 是最小 projection，禁止 Domain C5 文档直出
  call: async () => ({ chapter: { id: 'chapter-1', index: 1, title: '章', pov: 'pov-1', status: 'draft', scenes: [] }, fingerprint: 'a'.repeat(64) }),
};
const invalidProposeAtResultSpec: MethodSpecFor<typeof writingProposeAtInvocation> = {
  method: 'proposeAt',
  // @ts-expect-error I105 proposeAt adapter must return the descriptor candidate envelope
  call: async () => ({ candidateId: 'candidate-1' }),
};
const invalidStartAtResultSpec: MethodSpecFor<typeof queueStartAtInvocation> = {
  method: 'startAt',
  // @ts-expect-error I105 startAt adapter must return the complete queue status projection
  call: async () => ({ projectId: 'project', runState: 'running', tasks: [] }),
};

const validDraftAdoptionSpec: MethodSpecFor<typeof writingAdoptDraftInvocation> = {
  method: 'adoptDraft',
  call: async () => ({
    projectId: 'project-1', candidateId: 'candidate-1', chapterId: 'chapter-1', sceneId: 'scene-1', status: 'adopted',
    sourceHash: 'a'.repeat(64), projectFingerprint: 'b'.repeat(64),
  }),
};
const invalidDraftAdoptionSpec: MethodSpecFor<typeof writingAdoptDraftInvocation> = {
  method: 'adoptDraft',
  // @ts-expect-error I135 adoption result must include C5 sourceHash and projectFingerprint
  call: () => ({ projectId: 'project-1', candidateId: 'candidate-1', status: 'adopted' }),
};
const invalidFinalizationResultSpec: MethodSpecFor<typeof writingPrepareFinalizationPlanInvocation> = {
  method: 'prepareFinalizationPlan',
  // @ts-expect-error I135 finalization result is a complete, strict FinalizationPlan
  call: async () => ({ projectId: 'project-1', candidateId: 'candidate-1' }),
};

void rawArrayListSpec;
void missingBranchesListSpec;
void invalidUndefinedResultSpec;
void invalidTextMutationResultSpec;
void invalidProposeAtResultSpec;
void invalidStartAtResultSpec;
void validDraftAdoptionSpec;
void invalidDraftAdoptionSpec;
void invalidFinalizationResultSpec;

describe('I103 MethodSpecFor result codec 类型耦合', () => {
  it('接受同步和 Promise 的 descriptor 派生结果', async () => {
    expect(syncListSpec.call('p1', 'c1', 's1')).toEqual({ branches: [branch] });
    await expect(asyncListSpec.call('p1', 'c1', 's1')).resolves.toEqual({ branches: [branch] });
    await expect(undefinedResultSpec.call('session-1')).resolves.toBeUndefined();
  });
});
