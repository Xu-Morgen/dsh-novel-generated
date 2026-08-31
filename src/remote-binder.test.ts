import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

import { Context } from '@deepseek-ai/cordis';
import * as cordis from '@deepseek-ai/cordis';
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway';
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry';
import { describe, expect, it } from 'vitest';

import { unwrap } from './client/shared.js';
import { branchAggregateWireAdapter, branchListWireAdapter } from './host/composition/orchestration.js';
import { branchRemoteContribution } from './host/remote/branch.js';
import { reviewRemoteContribution } from './host/remote/review.js';
import { reviewRepairRemoteContribution } from './host/remote/review-repair.js';
import { statisticsRemoteContribution } from './host/remote/statistics.js';
import { writingRemoteContribution } from './host/remote/writing.js';
import { queueRemoteContribution } from './host/remote/queue.js';
import { sceneOutlineBindingRemoteContribution } from './host/remote/scene-outline-binding.js';
import { workspaceRemoteContribution } from './host/remote/editor.js';
import { textMutationRemoteContribution } from './host/remote/text-mutation.js';
import { textDeletionRemoteContribution } from './host/remote/text-deletion.js';
import { textChangeImpactRemoteContribution } from './host/remote/text-change-impact.js';
import { outlineReconciliationRemoteContribution } from './host/remote/outline-reconciliation.js';
import { outlineGenerationScopeRemoteContribution } from './host/remote/outline-generation-scope.js';
import { outlineDetailGenerationRemoteContribution } from './host/remote/outline-detail-generation.js';
import { referenceAuditRemoteContribution } from './host/remote/reference-audit.js';
import type {
  QueueNamespace,
  SceneOutlineBindingNamespace,
  TextMutationNamespace,
  TextDeletionNamespace,
  TextChangeImpactNamespace,
  OutlineReconciliationNamespace,
  ReferenceAuditNamespace,
  OutlineGenerationScopeNamespace,
  OutlineDetailGenerationNamespace,
  ReviewRepairNamespace,
  WritingNamespace,
} from './client/remote-namespace.js';
import { createTextService, type NovelTextService } from './host/text-service.js';
import type { NovelProjectService } from './host/project-service.js';
import type { NovelCharacterService } from './host/character-service.js';
import type { NovelWorldviewService } from './host/worldview-service.js';
import type { NovelOutlineService } from './host/outline-service.js';
import type { NovelStateService } from './host/state-service.js';
import type { NovelCanonService } from './host/canon-service.js';
import type { NovelStyleService } from './host/style-service.js';
import type { NovelRuleService } from './host/rule-service.js';
import type { NovelKnowledgeService } from './host/knowledge-service.js';
import type { NovelConfirmationService } from './host/confirmation-service.js';
import { INITIAL_STATE } from './core/schema/project-lifecycle.js';
import { branchAggregateSchema, type BranchAggregate } from './core/schema/branch-aggregate.js';
import { apply } from './index.js';

/**
 * I86 真实 DSH 客户端绑定器端到端契约测试（review v2.0 §3.1 / 计划 §18 I86）。
 *
 * 消除「接线后方法在真实绑定器下可调用」盲区：UI 测试走 fake remote、smoke 是
 * Host-only 脚本，没有任何测试把产品 Remote 跑过真实客户端绑定器。本测试加载
 * 已安装的 `@deepseek-ai/dsh-api-gateway` **客户端 bundle**（rc.2，I85 pin）并用
 * 真实生产 descriptor（writing/review/statistics contribution）挂载，验证：
 * - 实参个数必须精确等于 descriptor 参数个数（`client.js` invoke：缺参即抛
 *   `expected N argument(s), got M`）；
 * - 逐位置 strict parse：jsonCodec 可选参数放行显式 `undefined`（丢弃，不进入
 *   wire args）；string/number strict codec 拒绝 undefined（`rejected "<field>"`）；
 * - 修复方法（propose/adjudicate/scan/sceneCards/tasks/branches.list）以完整实参（缺省位
 *   显式 `undefined`）往返成功，且缺参/错参在业务前仍被拒绝；
 * - 既有正常对照（records/stats 等零可选参数方法）往返不受影响。
 *
 * 约定：本测试验证的是**客户端绑定器语义 + wire args 投影**；connection 为最小
 * stub（记录收到的 args、按 endpoint 返回合法 result fixture）。Host gateway
 * 侧语义（assertExactArguments/resolveParameter）由 workspace-remote.test.ts 与
 * dsh-rc2-compat.test.ts 覆盖。
 */

const here = dirname(fileURLToPath(import.meta.url));
const clientBundlePath = resolve(here, '../node_modules/@deepseek-ai/dsh-api-gateway/lib/client.js');
const clientBundleSource = readFileSync(clientBundlePath, 'utf8');

interface GatewayClientEntry {
  inject: readonly string[];
  apply: (ctx: Context) => void;
}

interface ClientRemoteHandle {
  $mount: (contribution: unknown) => Promise<() => Promise<void>>;
}

/** 加载真实客户端绑定器 bundle（`window.__ModuleLoader__` 合同，与 smoke-i85 Part 2 同法）。 */
function loadGatewayClient(): GatewayClientEntry {
  const pending: Array<{ id: string; factory: (require: (spec: string) => unknown) => GatewayClientEntry }> = [];
  const windowStub = {
    __ModuleLoader__: {
      mode: 'queue',
      pendingQueue: pending,
      load: (registration: unknown) => pending.push(registration as never),
      create: () => { throw new Error('unexpected ModuleLoader.create in binder test'); },
    },
  };
  // client.js 在 vm 内运行，需要宿主全局（installMethods 构造 AbortController 等）。
  const context = createContext({ window: windowStub, console, AbortController, AbortSignal, setTimeout, clearTimeout });
  runInContext(clientBundleSource, context, { filename: clientBundlePath });
  if (pending.length !== 1) throw new Error(`expected one api-gateway client registration, got ${pending.length}`);
  const entry = pending[0].factory((spec) => {
    if (spec === '@deepseek-ai/cordis') return cordis;
    throw new Error(`unexpected require(${spec}) from api-gateway client bundle`);
  });
  return entry;
}

const gatewayClient = loadGatewayClient();

const ISO = '2026-01-01T00:00:00.000Z';
const generationSettings = { modelRef: 'dsh/default', credentialRef: 'dsh/managed' };
const binderLlm = {
  async *stream() {
    yield { type: 'text-delta', text: '米拉推开旧灯塔的门。' };
    yield { type: 'finish', reason: { kind: 'stop' } };
  },
};

const outlineDetailCandidate = {
  candidateId: 'odg-candidate', projectId: 'p1', scope: { kind: 'all' },
  scopeFingerprint: 'a'.repeat(64), b5ContentFingerprint: 'b'.repeat(64),
  items: [{ actId: 'act-1', beatId: 'beat-1', detailBeatId: 'detail-1', position: 0, origin: 'generated',
    after: { id: 'detail-1', title: '细纲卡', summary: '摘要', pov: 'mira', wordTarget: 500, points: ['要点'], status: 'planned' as const },
    choice: 'keep', rationale: '补缺。' }],
  generatedDetailBeatCount: 1, revision: 1, status: 'ready', rationale: '只补缺失卡。', createdAt: ISO, updatedAt: ISO,
};

const finalizationPlan = {
  planId: 'final-plan-1', projectId: 'p1', candidateId: 'cand-1', chapterId: 'chapter-1', sceneId: 'scene-1',
  draftSourceHash: 'a'.repeat(64), finalSourceHash: 'b'.repeat(64), generationBaseline: { kind: 'no-outline-baseline' },
  layerFingerprints: { c2: 'c'.repeat(64), c1: 'd'.repeat(64), c3: 'e'.repeat(64), c4: 'f'.repeat(64), b2: 'a'.repeat(64) },
  layerChanges: [],
  references: { deterministic: [], semanticCandidates: [], forbiddenAutomatic: [{ owner: 'c5', entityId: 'scene-1', field: 'scene.content', disposition: 'forbidden-automatic', reason: '正文由 C5 草稿保存。' }] },
  reconciliation: { status: 'degraded', reason: 'no-generation-baseline', items: [] },
  completion: { current: { detailBeatId: null, status: 'unchanged' }, next: { status: 'deferred', reason: 'application-owned-by-i136' } },
  degradedReasons: ['no-generation-baseline'], createdAt: ISO,
};

/** 每个 endpoint 的合法 result fixture（须通过 descriptor 的 strict result codec）。 */
function fixtureFor(endpoint: string): unknown {
  switch (endpoint) {
    case 'novelWriting/propose':
      return { candidate: { id: 'cand-1', intent: 'continue', target: { projectId: 'p1' }, prompt: '继续写下去', text: '夜色', chunkCount: 1, createdAt: ISO } };
    case 'novelWriting/proposeAt':
      return { candidate: { id: 'cand-at-1', intent: 'continue', target: { projectId: 'p1', chapterId: 'chapter-1', sceneId: 'scene-1' }, prompt: '继续写下去', text: '夜色', chunkCount: 1, createdAt: ISO } };
    case 'novelWriting/adjudicate':
      return { status: 'rejected', candidateId: 'cand-1' };
    case 'novelWriting/previewLayers':
      return {
        candidateId: 'cand-1', sourceHash: 'a'.repeat(64),
        generationBaseline: { kind: 'no-outline-baseline' }, changes: [],
        validation: { status: 'pass', violations: [] },
      };
    case 'novelWriting/adoptDraft':
      return {
        projectId: 'p1', candidateId: 'cand-1', chapterId: 'chapter-1', sceneId: 'scene-1', status: 'adopted',
        sourceHash: 'a'.repeat(64), projectFingerprint: 'b'.repeat(64),
      };
    case 'novelWriting/prepareFinalizationPlan':
    case 'novelWriting/readFinalizationPlan':
      return finalizationPlan;
    case 'novelWriting/cancelFinalizationPlan':
      return { projectId: 'p1', planId: 'final-plan-1', status: 'cancelled' };
    case 'novelWriting/proposeFinalization':
      return { projectId: 'p1', planId: 'final-plan-1', proposalId: 'finalization-proposal-1', operationId: 'finalization-operation-1', status: 'pending' };
    case 'novelWriting/acceptFinalization':
      return { projectId: 'p1', planId: 'final-plan-1', proposalId: 'finalization-proposal-1', operationId: 'finalization-operation-1', status: 'needs-target', reason: 'no-generation-baseline', appliedStages: [] };
    case 'novelWriting/rejectFinalization':
      return { projectId: 'p1', planId: 'final-plan-1', proposalId: 'finalization-proposal-1', operationId: 'finalization-operation-1', status: 'rejected' };
    case 'novelWorkspace/sceneReparsePreview':
      return {
        proposalId: 'scene-reparse-1', range: { start: 1, end: 2 }, replacement: 'x',
        sourceHash: 'a'.repeat(64), targetHash: 'b'.repeat(64),
        generationBaseline: { kind: 'no-outline-baseline' }, changes: [],
        postScan: { status: 'pending', sourceMatched: false, mismatchedLayers: [] },
      };
    case 'novelSceneOutlineBinding/read':
    case 'novelSceneOutlineBinding/save':
    case 'novelSceneOutlineBinding/rebind':
    case 'novelSceneOutlineBinding/unbind':
      return {
        manual: [{ sceneId: 'scene-1', detailBeatId: 'card-1' }],
        effective: [{ sceneId: 'scene-1', detailBeatId: 'card-1', chapterId: 'chapter-1', source: 'manual' }],
        fingerprint: 'f'.repeat(64),
      };
    case 'novelSceneOutlineBinding/impact':
      return {
        kind: 'scene', chapterId: 'chapter-1', sceneId: 'scene-1', bindings: [], fingerprint: 'f'.repeat(64),
      };
    case 'novelReview/scan':
      return { projectId: 'p1', scannedAt: ISO, issues: [], summary: { total: 0, hard: 0, soft: 0, byCategory: { rule: 0, canon: 0, knowledge: 0, relationship: 0, style: 0 } } };
    case 'novelReview/bookReadiness':
    case 'novelReview/bookScan':
      return {
        projectId: 'p1', status: 'ready', gateOpen: true, computedAt: ISO,
        page: { offset: 0, limit: 64, total: 0, nextOffset: null, chapters: [] },
        counts: { chapters: 0, scenes: 0, requiredCards: 0, completedCards: 0, boundCards: 0, proseScenes: 0, hardIssues: 0, warningIssues: 0 },
        review: { status: 'not-run', total: 0, hard: 0, warning: 0 }, issues: [],
        fingerprints: { text: 'a'.repeat(64), outline: 'b'.repeat(64), binding: 'c'.repeat(64) },
      };
    case 'novelReview/records':
      return [];
    case 'novelReviewRepair/propose':
      return {
        projectId: 'p1', issueId: 'iss-1', issueFingerprint: 'iss-1',
        target: { chapterId: 'chapter-1', sceneId: 'scene-1', sourceHash: 'a'.repeat(64) },
        anchor: { start: 0, end: 2, quote: '米拉', sourceHash: 'a'.repeat(64) },
        lineage: { kind: 'review-repair', issueId: 'iss-1', issueFingerprint: 'iss-1', sourceHash: 'a'.repeat(64) },
        candidate: { id: 'repair-1', intent: 'rewrite', target: { projectId: 'p1', chapterId: 'chapter-1', sceneId: 'scene-1', sourceHash: 'a'.repeat(64) }, prompt: '修复', text: '米拉抬起头。', chunkCount: 1, createdAt: ISO },
      };
    case 'novelBranches/list':
      return { branches: [{ id: 'branch-1', label: '初稿', chosen: true, charCount: 2, hash: 'hash-1' }] };
    case 'novelBranches/aggregate':
      return {
        projectId: 'p1',
        chapters: [{
          id: 'chapter-1', index: 1, title: '第一章', pov: 'pov-1', status: 'draft',
          scenes: [{
            id: 'scene-1', index: 0, summary: '开场', versionMode: 'branched',
            branches: [{ id: 'branch-1', label: '初稿', chosen: true, charCount: 2, hash: 'a'.repeat(64) }],
          }],
        }],
      };
    case 'novelBranches/chooseFresh':
      return { branches: [{ id: 'branch-2', label: '新版本', chosen: true, charCount: 3, hash: 'b'.repeat(64) }], content: '新正文' };
    case 'novelText/fingerprint':
      return { fingerprint: 'a'.repeat(64) };
    case 'novelText/chapterCreate':
    case 'novelText/chapterUpdate':
      return { chapter: { id: 'chapter-1', index: 1, title: '第一章', pov: 'pov-1', status: 'draft', sceneCount: 0 }, fingerprint: 'b'.repeat(64) };
    case 'novelText/sceneCreate':
    case 'novelText/sceneUpdate':
      return { chapterId: 'chapter-1', scene: { id: 'scene-1', index: 0, summary: '开场', contentHash: 'c'.repeat(64), branchCount: 0 }, fingerprint: 'd'.repeat(64) };
    case 'novelText/reorder':
      return { chapters: [{ id: 'chapter-1', index: 1, title: '第一章', pov: 'pov-1', status: 'draft', sceneCount: 1 }], fingerprint: 'e'.repeat(64) };
    case 'novelTextDeletion/impact':
      return { status: 'ready', impact: { kind: 'scene', chapterId: 'chapter-1', sceneId: 'scene-1', sceneCount: 1, branchCount: 0, proseCharacters: 2, sources: [{ sceneId: 'scene-1', sourceHash: 'a'.repeat(64), branches: [] }], projectFingerprint: 'a'.repeat(64), targetFingerprint: 'b'.repeat(64), bindings: [], activeQueue: [], activeCandidates: [], historicalReferences: [], opaqueHistoryCount: 0, blockers: [], impactFingerprint: 'c'.repeat(64) } };
    case 'novelTextDeletion/propose':
      return { status: 'pending', proposalId: 'delete-proposal-1', impact: { kind: 'scene', chapterId: 'chapter-1', sceneId: 'scene-1', sceneCount: 1, branchCount: 0, proseCharacters: 2, sources: [{ sceneId: 'scene-1', sourceHash: 'a'.repeat(64), branches: [] }], projectFingerprint: 'a'.repeat(64), targetFingerprint: 'b'.repeat(64), bindings: [], activeQueue: [], activeCandidates: [], historicalReferences: [], opaqueHistoryCount: 0, blockers: [], impactFingerprint: 'c'.repeat(64) } };
    case 'novelTextDeletion/apply':
      return { status: 'already-deleted', proposalId: 'delete-proposal-1', fingerprint: 'd'.repeat(64) };
    case 'novelTextDeletion/reject':
      return { status: 'rejected', proposalId: 'delete-proposal-1' };
    case 'novelTextChangeImpact/prepare':
      return { impactId: 'impact-1', status: 'ready' };
    case 'novelTextChangeImpact/read':
      return {
        impactId: 'impact-1', projectId: 'p1', baselineId: 'baseline-1', chapterId: 'chapter-1', sceneId: 'scene-1',
        baselineSourceHash: 'a'.repeat(64), finalSourceHash: 'b'.repeat(64),
        delta: {
          beforeHash: 'a'.repeat(64), afterHash: 'b'.repeat(64), beforeLength: 1, afterLength: 1,
          beforeRange: { start: 0, end: 1 }, afterRange: { start: 0, end: 1 }, beforeQuote: 'a', afterQuote: 'b', pureFormatting: false,
        },
        classification: 'story-fact', confidence: 'high',
        evidence: [{ sourceHash: 'b'.repeat(64), beforeRange: { start: 0, end: 1 }, afterRange: { start: 0, end: 1 }, beforeQuote: 'a', afterQuote: 'b' }],
        eligibleFutureDetailBeatIds: ['detail-2'], affectedDetailBeatIds: ['detail-2'], rationale: '事实变化', analyzedAt: ISO,
      };
    case 'novelTextChangeImpact/cancel':
      return { impactId: 'impact-1', status: 'cancelled' };
    case 'novelOutlineReconciliation/prepare':
    case 'novelOutlineReconciliation/regenerateOne':
      return {
        planId: 'reconcile-1', projectId: 'p1', reportId: 'impact-1', baselineId: 'baseline-1',
        baselineSourceHash: 'a'.repeat(64), finalSourceHash: 'b'.repeat(64), b5ContentFingerprint: 'c'.repeat(64), bindingFingerprint: 'd'.repeat(64),
        reportClassification: 'story-fact', items: [], revision: 1, status: 'ready', createdAt: ISO, updatedAt: ISO,
      };
    case 'novelOutlineReconciliation/read':
      return {
        planId: 'reconcile-1', projectId: 'p1', reportId: 'impact-1', baselineId: 'baseline-1',
        baselineSourceHash: 'a'.repeat(64), finalSourceHash: 'b'.repeat(64), b5ContentFingerprint: 'c'.repeat(64), bindingFingerprint: 'd'.repeat(64),
        reportClassification: 'story-fact', items: [], revision: 1, status: 'ready', createdAt: ISO, updatedAt: ISO,
      };
    case 'novelOutlineReconciliation/cancel':
      return { planId: 'reconcile-1', status: 'cancelled' };
    case 'novelOutlineReconciliation/propose':
      return { projectId: 'p1', planId: 'reconcile-1', proposalId: 'reconcile-apply-1', status: 'pending', decisions: [] };
    case 'novelOutlineReconciliation/accept':
      return { projectId: 'p1', planId: 'reconcile-1', proposalId: 'reconcile-apply-1', status: 'accepted', appliedDetailBeatIds: [], pendingDetailBeatIds: [], b5ContentFingerprint: 'c'.repeat(64) };
    case 'novelOutlineReconciliation/reject':
      return { projectId: 'p1', planId: 'reconcile-1', proposalId: 'reconcile-apply-1', status: 'rejected' };
    case 'novelOutlineReconciliation/finalize':
      return { projectId: 'p1', planId: 'reconcile-1', baselineId: 'baseline-1', status: 'finalized', current: { chapterId: 'chapter-1', sceneId: 'scene-1', detailBeatId: 'detail-1', status: 'done' }, progress: { outlineId: 'outline-1', currentAct: 'act-1', currentBeat: 'beat-1', completedBeats: [], deviations: [], tensionLevel: 20 }, b5ContentFingerprint: 'c'.repeat(64) };
    case 'novelOutlineReconciliation/continue':
      return { projectId: 'p1', planId: 'reconcile-1', baselineId: 'baseline-1', status: 'needs-target', reason: 'missing-binding', current: { chapterId: 'chapter-1', sceneId: 'scene-1', detailBeatId: 'detail-1', status: 'done' }, progress: { outlineId: 'outline-1', currentAct: 'act-1', currentBeat: 'beat-1', completedBeats: [], deviations: [], tensionLevel: 20 }, b5ContentFingerprint: 'c'.repeat(64) };
    case 'novelReferenceAudit/list':
      return {
        projectId: 'p1', records: [{
          recordId: 'audit-1', projectId: 'p1', operationId: 'operation-1',
          source: { kind: 'candidate-accept', candidateId: 'candidate-1', status: 'accepted' },
          targets: [{ owner: 'c3', entityId: 'secret-1', field: 'knowledge-entry', afterHash: 'a'.repeat(64) }],
          status: 'applied', attempt: 1, createdAt: ISO, updatedAt: ISO,
        }], nextCursor: null,
      };
    case 'novelQueue/startAt':
      return {
        projectId: 'p1', runState: 'idle',
        config: { wordBudget: null, maxRetries: 0, stopOnSoftWarnings: true },
        consumedUnits: 0, updatedAt: ISO, error: null, tasks: [],
      };
    case 'novelOutlineGenerationScope/resolve':
      return {
        projectId: 'p1', scope: { kind: 'all' }, b5ContentFingerprint: 'c'.repeat(64), readiness: 'can-generate',
        targets: [], targetBeatCount: 0, targetDetailBeatCount: 0,
        protectedSet: { actIds: [], beatIds: [], detailBeatIds: [], preserveStableIds: true, preserveOrder: true, outsideScopeWritable: false },
        mutationBudget: { maxNewDetailBeats: 0, allowExistingReplacement: false, allowReorder: false, allowScopeExpansion: false },
        page: { offset: 0, limit: 128, nextOffset: null, totalTargetBeatCount: 0, totalTargetDetailBeatCount: 0 },
      };
    case 'novelOutlineDetailGeneration/generate':
    case 'novelOutlineDetailGeneration/read':
    case 'novelOutlineDetailGeneration/edit':
    case 'novelOutlineDetailGeneration/regenerate':
    case 'novelOutlineDetailGeneration/skip':
      return outlineDetailCandidate;
    case 'novelOutlineDetailGeneration/propose':
      return { projectId: 'p1', candidateId: 'odg-candidate', proposalId: 'odg-proposal', status: 'pending' };
    case 'novelOutlineDetailGeneration/accept':
      return { projectId: 'p1', candidateId: 'odg-candidate', proposalId: 'odg-proposal', status: 'accepted', appliedDetailBeatIds: ['detail-1'], skippedDetailBeatIds: [], b5ContentFingerprint: 'c'.repeat(64) };
    case 'novelOutlineDetailGeneration/reject':
      return { projectId: 'p1', candidateId: 'odg-candidate', proposalId: 'odg-proposal', status: 'rejected' };
    case 'novelOutlineDetailGeneration/cancel':
      return { projectId: 'p1', candidateId: 'odg-candidate', status: 'cancelled' };
    case 'novelStatistics/sceneCards':
      return { total: 0, cards: [] };
    case 'novelStatistics/tasks':
      return { total: 0, tasks: [] };
    case 'novelStatistics/stats':
      return { indexExists: false, counts: { chapters: 0, scenes: 0, cards: 0, tasks: 0 } };
    default:
      throw new Error(`no result fixture for ${endpoint}`);
  }
}

interface Mounted {
  client: Context;
  calls: Array<{ endpoint: string; args: Record<string, unknown> }>;
  dispose: () => Promise<void>;
}

/** 挂载一个真实 contribution 到真实客户端绑定器，connection 记录 wire args。 */
async function mount(contribution: unknown, resultFor: (endpoint: string, args: Record<string, unknown>) => unknown | Promise<unknown> = fixtureFor): Promise<Mounted> {
  const client = new Context();
  client.provide('typert', {
    remotes: { register: () => () => {} },
    contexts: { getClient: () => undefined },
  } as never);
  const calls: Array<{ endpoint: string; args: Record<string, unknown> }> = [];
  client.provide('connection', {
    rpc: {
      call: async (_path: string, endpoint: string, payload: { args: Record<string, unknown> }): Promise<{ ok: boolean; value?: unknown }> => {
        calls.push({ endpoint, args: payload.args });
        return { ok: true, value: await resultFor(endpoint, payload.args) };
      },
    },
  } as never);
  await client.plugin({ name: 'api-gateway-client', inject: gatewayClient.inject, apply: gatewayClient.apply });
  const dispose = await (client.get('remote') as ClientRemoteHandle).$mount(contribution);
  return { client, calls, dispose: () => dispose() };
}

describe('I86 真实 DSH 客户端绑定器契约（R17-3 盲区消除）', () => {
  it('novelWriting.propose：缺省 settings 显式 undefined 往返成功，wire args 不含 settings', async () => {
    const { client, calls, dispose } = await mount(writingRemoteContribution);
    try {
      const ns = client.get('remote.novelWriting') as { propose: (...args: unknown[]) => Promise<unknown> };
      const result = await unwrap(ns.propose('p1', { intent: 'continue' }, undefined)) as { candidate: { id: string } };
      expect(result.candidate.id).toBe('cand-1');
      expect(calls).toEqual([{ endpoint: 'novelWriting/propose', args: { projectId: 'p1', input: { intent: 'continue' } } }]);
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
  });

  it('novelWriting.propose：传入 settings 时原样进入 wire args', async () => {
    const { client, calls, dispose } = await mount(writingRemoteContribution);
    try {
      const ns = client.get('remote.novelWriting') as { propose: (...args: unknown[]) => Promise<unknown> };
      const settings = { generation: { temperature: 0.4 } };
      await unwrap(ns.propose('p1', { intent: 'rewrite', chapterId: 'c1', sceneId: 's1', prompt: '重写' }, settings));
      expect(calls[0]).toEqual({ endpoint: 'novelWriting/propose', args: { projectId: 'p1', input: { intent: 'rewrite', chapterId: 'c1', sceneId: 's1', prompt: '重写' }, settings } });
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
  });

  it('I122 novelWriting.propose：rewrite + polishMode 经真实 binder 往返，非法 mode 在 adapter 前拒绝', async () => {
    const { client, calls, dispose } = await mount(writingRemoteContribution);
    try {
      const writing = client.get('remote.novelWriting') as WritingNamespace;
      await unwrap(writing.propose('p1', {
        intent: 'rewrite', chapterId: 'c1', sceneId: 's1', prompt: '润色', polishMode: 'language',
      }, undefined));
      expect(calls).toEqual([{
        endpoint: 'novelWriting/propose',
        args: { projectId: 'p1', input: { intent: 'rewrite', chapterId: 'c1', sceneId: 's1', prompt: '润色', polishMode: 'language' } },
      }]);
      await expect(Reflect.apply(writing.propose, writing, ['p1', {
        intent: 'rewrite', chapterId: 'c1', sceneId: 's1', prompt: '润色', polishMode: 'invalid',
      }, undefined])).rejects.toThrow(/rejected "input"/);
      expect(calls).toHaveLength(1);
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
  });

  it('I110 novelWriting.previewLayers：真实客户端绑定器返回严格五层预览 projection', async () => {
    const { client, calls, dispose } = await mount(writingRemoteContribution);
    try {
      const writing = client.get('remote.novelWriting') as WritingNamespace;
      const result = await unwrap(writing.previewLayers('cand-1'));
      expect(result).toMatchObject({ candidateId: 'cand-1', sourceHash: 'a'.repeat(64), changes: [] });
      expect(calls).toEqual([{ endpoint: 'novelWriting/previewLayers', args: { candidateId: 'cand-1' } }]);
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
  });

  it('I135 novelWriting 草稿接受与统一定稿计划经真实 binder 往返，wire 参数不漂移', async () => {
    const { client, calls, dispose } = await mount(writingRemoteContribution);
    try {
      const writing = client.get('remote.novelWriting') as WritingNamespace;
      await expect(unwrap(writing.adoptDraft('cand-1'))).resolves.toMatchObject({ status: 'adopted', sceneId: 'scene-1' });
      await expect(unwrap(writing.prepareFinalizationPlan('p1', { candidateId: 'cand-1', finalSourceHash: 'b'.repeat(64) }, undefined))).resolves.toMatchObject({ planId: 'final-plan-1' });
      await expect(unwrap(writing.readFinalizationPlan('p1', 'final-plan-1'))).resolves.toMatchObject({ planId: 'final-plan-1' });
      await expect(unwrap(writing.cancelFinalizationPlan('p1', 'final-plan-1'))).resolves.toEqual({ projectId: 'p1', planId: 'final-plan-1', status: 'cancelled' });
      await expect(Reflect.apply(writing.adoptDraft, writing, [])).rejects.toThrow(/expected 1 argument\(s\), got 0/);
      await expect(Reflect.apply(writing.prepareFinalizationPlan, writing, ['p1', { candidateId: 'cand-1', finalSourceHash: 'invalid' }, undefined])).rejects.toThrow(/rejected "input"/);
      expect(calls).toEqual([
        { endpoint: 'novelWriting/adoptDraft', args: { candidateId: 'cand-1' } },
        { endpoint: 'novelWriting/prepareFinalizationPlan', args: { projectId: 'p1', input: { candidateId: 'cand-1', finalSourceHash: 'b'.repeat(64) } } },
        { endpoint: 'novelWriting/readFinalizationPlan', args: { projectId: 'p1', planId: 'final-plan-1' } },
        { endpoint: 'novelWriting/cancelFinalizationPlan', args: { projectId: 'p1', planId: 'final-plan-1' } },
      ]);
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
  });

  it('I111 novelWorkspace.sceneReparsePreview：Gate pending projection 经真实 binder 往返', async () => {
    const { client, calls, dispose } = await mount(workspaceRemoteContribution);
    try {
      const workspace = client.get('remote.novelWorkspace') as {
        sceneReparsePreview: (...args: unknown[]) => Promise<unknown>;
      };
      const result = await unwrap(workspace.sceneReparsePreview(
        'p1', 'chapter-1', 'scene-1', { start: 1, end: 2 }, 'x', 'a'.repeat(64),
      )) as { proposalId: string; postScan: { status: string } };
      expect(result).toMatchObject({ proposalId: 'scene-reparse-1', postScan: { status: 'pending' } });
      expect(calls).toEqual([{
        endpoint: 'novelWorkspace/sceneReparsePreview',
        args: {
          projectId: 'p1', chapterId: 'chapter-1', sceneId: 'scene-1',
          range: { start: 1, end: 2 }, replacement: 'x', baseHash: 'a'.repeat(64),
        },
      }]);
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
  });

  it('I105 novelWriting.proposeAt keeps its result and rejects compatibility-only prompt before the Remote adapter call', async () => {
    const { client, calls, dispose } = await mount(writingRemoteContribution);
    try {
      const writing = client.get('remote.novelWriting') as WritingNamespace;
      const result = await unwrap(writing.proposeAt('p1', {
        intent: 'continue', chapterId: 'chapter-1', sceneId: 'scene-1',
      }, undefined));
      expect(result).toMatchObject({ candidate: { id: 'cand-at-1', target: { chapterId: 'chapter-1', sceneId: 'scene-1' } } });
      await expect(Reflect.apply(writing.proposeAt, writing, ['p1', {
        intent: 'continue', chapterId: 'chapter-1', sceneId: 'scene-1', prompt: 'must-not-be-public',
      }, undefined])).rejects.toThrow(/rejected "input"/);
      expect(calls).toEqual([{
        endpoint: 'novelWriting/proposeAt',
        args: { projectId: 'p1', input: { intent: 'continue', chapterId: 'chapter-1', sceneId: 'scene-1' } },
      }]);
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
  });

  it('I105 binding five methods and queue.startAt use descriptor-derived namespaces with exact wire args', async () => {
    const bindingMount = await mount(sceneOutlineBindingRemoteContribution);
    try {
      const binding = bindingMount.client.get('remote.novelSceneOutlineBinding') as SceneOutlineBindingNamespace;
      const read = await unwrap(binding.read('p1'));
      const saved = await unwrap(binding.save('p1', { sceneId: 'scene-1', detailBeatId: 'card-1', expectedFingerprint: read.fingerprint }));
      const rebound = await unwrap(binding.rebind('p1', {
        sceneId: 'scene-1', detailBeatId: 'card-1', nextDetailBeatId: 'card-2', expectedFingerprint: saved.fingerprint,
      }));
      await unwrap(binding.unbind('p1', { sceneId: 'scene-1', detailBeatId: 'card-2', expectedFingerprint: rebound.fingerprint }));
      const impact = await unwrap(binding.impact('p1', { kind: 'scene', sceneId: 'scene-1' }));
      expect(impact).toMatchObject({ kind: 'scene', chapterId: 'chapter-1', sceneId: 'scene-1' });
      expect(bindingMount.calls.map((call) => call.endpoint)).toEqual([
        'novelSceneOutlineBinding/read', 'novelSceneOutlineBinding/save', 'novelSceneOutlineBinding/rebind',
        'novelSceneOutlineBinding/unbind', 'novelSceneOutlineBinding/impact',
      ]);
    } finally {
      await bindingMount.dispose();
      await bindingMount.client.fiber.dispose();
    }

    const queueMount = await mount(queueRemoteContribution);
    try {
      const queue = queueMount.client.get('remote.novelQueue') as QueueNamespace;
      const result = await unwrap(queue.startAt('p1', { chapterId: 'chapter-1', cardIds: ['card-1'] }));
      expect(result).toMatchObject({ projectId: 'p1', runState: 'idle', tasks: [] });
      expect(queueMount.calls).toEqual([{ endpoint: 'novelQueue/startAt', args: { projectId: 'p1', input: { chapterId: 'chapter-1', cardIds: ['card-1'] } } }]);
    } finally {
      await queueMount.dispose();
      await queueMount.client.fiber.dispose();
    }
  });

  it('I106 deletion namespace uses the exact four-method strict surface', async () => {
    const mounted = await mount(textDeletionRemoteContribution);
    try {
      const deletion = mounted.client.get('remote.novelTextDeletion') as TextDeletionNamespace;
      const target = { kind: 'scene' as const, chapterId: 'chapter-1', sceneId: 'scene-1' };
      const impact = await unwrap(deletion.impact('p1', target));
      expect(impact.status).toBe('ready');
      const proposal = await unwrap(deletion.propose('p1', target, impact.impact.impactFingerprint));
      expect(proposal.status).toBe('pending');
      await expect(unwrap(deletion.apply('p1', 'delete-proposal-1'))).resolves.toMatchObject({ status: 'already-deleted' });
      await expect(unwrap(deletion.reject('p1', 'delete-proposal-1'))).resolves.toMatchObject({ status: 'rejected' });
      expect(mounted.calls.map((call) => call.endpoint)).toEqual([
        'novelTextDeletion/impact', 'novelTextDeletion/propose', 'novelTextDeletion/apply', 'novelTextDeletion/reject',
      ]);
      await expect(Reflect.apply(deletion.impact, deletion, ['p1', { kind: 'scene', chapterId: 'chapter-1', sceneId: 'scene-1', extra: true }])).rejects.toThrow(/rejected "target"/);
      expect(mounted.calls).toHaveLength(4);
    } finally {
      await mounted.dispose();
      await mounted.client.fiber.dispose();
    }
  });

  it('I112 text-change-impact namespace uses strict prepare/read/cancel and exact wire args', async () => {
    const mounted = await mount(textChangeImpactRemoteContribution);
    try {
      const impact = mounted.client.get('remote.novelTextChangeImpact') as TextChangeImpactNamespace;
      const prepared = await unwrap(impact.prepare('p1', { baselineId: 'baseline-1', finalSourceHash: 'b'.repeat(64) }, undefined));
      expect(prepared).toEqual({ impactId: 'impact-1', status: 'ready' });
      const report = await unwrap(impact.read('p1', 'impact-1'));
      expect(report).toMatchObject({ classification: 'story-fact', affectedDetailBeatIds: ['detail-2'] });
      await expect(unwrap(impact.cancel('p1', 'impact-1'))).resolves.toEqual({ impactId: 'impact-1', status: 'cancelled' });
      expect(mounted.calls).toEqual([
        { endpoint: 'novelTextChangeImpact/prepare', args: { projectId: 'p1', input: { baselineId: 'baseline-1', finalSourceHash: 'b'.repeat(64) } } },
        { endpoint: 'novelTextChangeImpact/read', args: { projectId: 'p1', impactId: 'impact-1' } },
        { endpoint: 'novelTextChangeImpact/cancel', args: { projectId: 'p1', impactId: 'impact-1' } },
      ]);
    } finally {
      await mounted.dispose();
      await mounted.client.fiber.dispose();
    }
  });

  it('I113 outline-reconciliation namespace uses strict candidate methods and exact wire args', async () => {
    const mounted = await mount(outlineReconciliationRemoteContribution);
    try {
      const reconciliation = mounted.client.get('remote.novelOutlineReconciliation') as OutlineReconciliationNamespace;
      const prepared = await unwrap(reconciliation.prepare('p1', { report: fixtureFor('novelTextChangeImpact/read') } as never, undefined));
      expect(prepared).toMatchObject({ planId: 'reconcile-1', status: 'ready', items: [] });
      await expect(unwrap(reconciliation.regenerateOne('p1', { planId: 'reconcile-1', detailBeatId: 'detail-2' }, undefined))).resolves.toMatchObject({ revision: 1 });
      await expect(unwrap(reconciliation.read('p1', 'reconcile-1'))).resolves.toMatchObject({ reportClassification: 'story-fact' });
      await expect(unwrap(reconciliation.cancel('p1', 'reconcile-1'))).resolves.toEqual({ planId: 'reconcile-1', status: 'cancelled' });
      expect(mounted.calls.map((call) => call.endpoint)).toEqual([
        'novelOutlineReconciliation/prepare', 'novelOutlineReconciliation/regenerateOne',
        'novelOutlineReconciliation/read', 'novelOutlineReconciliation/cancel',
      ]);
    } finally {
      await mounted.dispose();
      await mounted.client.fiber.dispose();
    }
  });

  it('I114 outline-reconciliation application methods use the strict client binder contract', async () => {
    const mounted = await mount(outlineReconciliationRemoteContribution);
    try {
      const reconciliation = mounted.client.get('remote.novelOutlineReconciliation') as OutlineReconciliationNamespace;
      const proposal = await unwrap(reconciliation.propose('p1', { planId: 'reconcile-1', decisions: [] }));
      expect(proposal).toMatchObject({ planId: 'reconcile-1', status: 'pending' });
      expect(await unwrap(reconciliation.accept('p1', proposal.proposalId))).toMatchObject({ status: 'accepted' });
      expect(await unwrap(reconciliation.finalize('p1', { planId: 'reconcile-1', finalSourceHash: 'b'.repeat(64) }))).toMatchObject({ status: 'finalized' });
      expect(await unwrap(reconciliation.continue('p1', { planId: 'reconcile-1', finalSourceHash: 'b'.repeat(64) }))).toMatchObject({ status: 'needs-target' });
      expect(mounted.calls.map((call) => call.endpoint)).toEqual([
        'novelOutlineReconciliation/propose', 'novelOutlineReconciliation/accept',
        'novelOutlineReconciliation/finalize', 'novelOutlineReconciliation/continue',
      ]);
      await expect(Reflect.apply(reconciliation.propose, reconciliation, ['p1', { planId: 'reconcile-1', decisions: [], extra: true }])).rejects.toThrow(/rejected "input"/);
      expect(mounted.calls).toHaveLength(4);
    } finally {
      await mounted.dispose();
      await mounted.client.fiber.dispose();
    }
  });

  it('I116 novelReferenceAudit.list returns only the bounded operational projection', async () => {
    const mounted = await mount(referenceAuditRemoteContribution);
    try {
      const audit = mounted.client.get('remote.novelReferenceAudit') as ReferenceAuditNamespace;
      const result = await unwrap(audit.list('p1', { owner: 'c3' }));
      expect(result).toMatchObject({ projectId: 'p1', nextCursor: null, records: [{ status: 'applied', targets: [{ owner: 'c3', entityId: 'secret-1' }] }] });
      expect(mounted.calls).toEqual([{ endpoint: 'novelReferenceAudit/list', args: { projectId: 'p1', input: { owner: 'c3' } } }]);
      await expect(Reflect.apply(audit.list, audit, ['p1', { limit: 0 }])).rejects.toThrow(/rejected "input"/);
      expect(mounted.calls).toHaveLength(1);
    } finally {
      await mounted.dispose();
      await mounted.client.fiber.dispose();
    }
  });

  it('I116 novelReferenceAudit.list rejects malformed operational records at the result boundary', async () => {
    const mounted = await mount(referenceAuditRemoteContribution, () => ({
        projectId: 'p1', records: [{ recordId: 'audit-1', projectId: 'p1', operationId: 'operation-1', status: 'failed', attempt: 1, targets: [], source: { kind: 'candidate-accept', candidateId: 'candidate-1', status: 'accepted' }, createdAt: ISO, updatedAt: ISO }], nextCursor: null,
    }));
    try {
      const audit = mounted.client.get('remote.novelReferenceAudit') as ReferenceAuditNamespace;
      await expect(unwrap(audit.list('p1', undefined))).rejects.toThrow(/result|schema|record/i);
    } finally {
      await mounted.dispose();
      await mounted.client.fiber.dispose();
    }
  });

  it('I105 strict binder negatives reject missing/extra/invalid inputs before RPC', async () => {
    const bindingMount = await mount(sceneOutlineBindingRemoteContribution);
    try {
      const binding = bindingMount.client.get('remote.novelSceneOutlineBinding') as SceneOutlineBindingNamespace;
      await expect(Reflect.apply(binding.read, binding, [])).rejects.toThrow(/expected 1 argument\(s\), got 0/);
      await expect(Reflect.apply(binding.save, binding, ['p1', {
        sceneId: 'scene-1', detailBeatId: 'card-1', expectedFingerprint: 'bad',
      }])).rejects.toThrow(/rejected "input"/);
      await expect(Reflect.apply(binding.impact, binding, ['p1', {
        kind: 'scene', sceneId: 'scene-1', extra: true,
      }])).rejects.toThrow(/rejected "input"/);
      expect(bindingMount.calls).toEqual([]);
    } finally {
      await bindingMount.dispose();
      await bindingMount.client.fiber.dispose();
    }

    const writingMount = await mount(writingRemoteContribution);
    try {
      const writing = writingMount.client.get('remote.novelWriting') as WritingNamespace;
      await expect(Reflect.apply(writing.proposeAt, writing, ['p1', { intent: 'continue', chapterId: 'chapter-1', sceneId: 'scene-1' }]))
        .rejects.toThrow(/expected 3 argument\(s\), got 2/);
      await expect(Reflect.apply(writing.proposeAt, writing, ['p1', { intent: 'rewrite', chapterId: 'chapter-1', sceneId: 'scene-1' }, undefined]))
        .rejects.toThrow(/rejected "input"/);
      expect(writingMount.calls).toEqual([]);
    } finally {
      await writingMount.dispose();
      await writingMount.client.fiber.dispose();
    }

    const queueMount = await mount(queueRemoteContribution);
    try {
      const queue = queueMount.client.get('remote.novelQueue') as QueueNamespace;
      await expect(Reflect.apply(queue.startAt, queue, ['p1'])).rejects.toThrow(/expected 2 argument\(s\), got 1/);
      await expect(Reflect.apply(queue.startAt, queue, ['p1', { chapterId: '', extra: true }])).rejects.toThrow(/rejected "input"/);
      expect(queueMount.calls).toEqual([]);
    } finally {
      await queueMount.dispose();
      await queueMount.client.fiber.dispose();
    }
  });

  it.each([
    ['binding-read', sceneOutlineBindingRemoteContribution, 'remote.novelSceneOutlineBinding', 'read', ['p1']],
    ['binding-impact', sceneOutlineBindingRemoteContribution, 'remote.novelSceneOutlineBinding', 'impact', ['p1', { kind: 'scene', sceneId: 'scene-1' }]],
    ['proposeAt', writingRemoteContribution, 'remote.novelWriting', 'proposeAt', ['p1', { intent: 'continue', chapterId: 'chapter-1', sceneId: 'scene-1' }, undefined]],
    ['adoptDraft', writingRemoteContribution, 'remote.novelWriting', 'adoptDraft', ['cand-1']],
    ['prepare-finalization-plan', writingRemoteContribution, 'remote.novelWriting', 'prepareFinalizationPlan', ['p1', { candidateId: 'cand-1', finalSourceHash: 'a'.repeat(64) }, undefined]],
    ['read-finalization-plan', writingRemoteContribution, 'remote.novelWriting', 'readFinalizationPlan', ['p1', 'final-plan-1']],
    ['cancel-finalization-plan', writingRemoteContribution, 'remote.novelWriting', 'cancelFinalizationPlan', ['p1', 'final-plan-1']],
    ['propose-finalization', writingRemoteContribution, 'remote.novelWriting', 'proposeFinalization', ['p1', { planId: 'final-plan-1', decisions: [] }]],
    ['accept-finalization', writingRemoteContribution, 'remote.novelWriting', 'acceptFinalization', ['p1', 'finalization-proposal-1']],
    ['reject-finalization', writingRemoteContribution, 'remote.novelWriting', 'rejectFinalization', ['p1', 'finalization-proposal-1']],
    ['startAt', queueRemoteContribution, 'remote.novelQueue', 'startAt', ['p1', { chapterId: 'chapter-1', cardIds: [] }]],
    ['text-impact-read', textChangeImpactRemoteContribution, 'remote.novelTextChangeImpact', 'read', ['p1', 'impact-1']],
    ['outline-reconciliation-read', outlineReconciliationRemoteContribution, 'remote.novelOutlineReconciliation', 'read', ['p1', 'reconcile-1']],
  ])('I105 malformed %s result is rejected by the real Client binder', async (_label, contribution, service, method, args) => {
    const mounted = await mount(contribution, () => ({ malformed: true }));
    try {
      const namespace = mounted.client.get(service) as Record<string, Function>;
      await expect(unwrap(Reflect.apply(namespace[method], namespace, args))).rejects.toThrow(/rejected "result"/);
    } finally {
      await mounted.dispose();
      await mounted.client.fiber.dispose();
    }
  });

  it('novelWriting.adjudicate：缺省 settings 显式 undefined 往返成功', async () => {
    const { client, calls, dispose } = await mount(writingRemoteContribution);
    try {
      const ns = client.get('remote.novelWriting') as { adjudicate: (...args: unknown[]) => Promise<unknown> };
      const result = await unwrap(ns.adjudicate('cand-1', 'accept', undefined)) as { status: string };
      expect(result.status).toBe('rejected');
      expect(calls).toEqual([{ endpoint: 'novelWriting/adjudicate', args: { candidateId: 'cand-1', decision: 'accept' } }]);
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
  });

  it('novelReview.scan：缺省 settings 显式 undefined 往返成功', async () => {
    const { client, calls, dispose } = await mount(reviewRemoteContribution);
    try {
      const ns = client.get('remote.novelReview') as { scan: (...args: unknown[]) => Promise<unknown> };
      const result = await unwrap(ns.scan('p1', undefined)) as { projectId: string };
      expect(result.projectId).toBe('p1');
      expect(calls).toEqual([{ endpoint: 'novelReview/scan', args: { projectId: 'p1' } }]);
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
  });

  it('I137 novelReview.bookReadiness/bookScan：分页参数与可选 settings 经真实 binder 往返', async () => {
    const { client, calls, dispose } = await mount(reviewRemoteContribution);
    try {
      const ns = client.get('remote.novelReview') as { bookReadiness: (...args: unknown[]) => Promise<unknown>; bookScan: (...args: unknown[]) => Promise<unknown> };
      const page = { offset: 0, limit: 64 };
      expect((await unwrap(ns.bookReadiness('p1', page)) as { gateOpen: boolean }).gateOpen).toBe(true);
      expect((await unwrap(ns.bookScan('p1', page, undefined)) as { status: string }).status).toBe('ready');
      expect(calls).toEqual([
        { endpoint: 'novelReview/bookReadiness', args: { projectId: 'p1', page } },
        { endpoint: 'novelReview/bookScan', args: { projectId: 'p1', page } },
      ]);
      await expect(Reflect.apply(ns.bookReadiness, ns, ['p1', { offset: -1, limit: 64 }])).rejects.toThrow(/rejected "page"/);
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
  });

  it('I137 负向：全书完成门 result 增加未知字段会被真实 binder 拒绝', async () => {
    const mounted = await mount(reviewRemoteContribution, (endpoint) => endpoint === 'novelReview/bookScan'
      ? { ...fixtureFor(endpoint) as Record<string, unknown>, extra: true }
      : fixtureFor(endpoint));
    try {
      const review = mounted.client.get('remote.novelReview') as { bookScan: (...args: unknown[]) => Promise<unknown> };
      await expect(unwrap(review.bookScan('p1', { offset: 0, limit: 64 }, undefined))).rejects.toThrow(/rejected "result"/);
    } finally {
      await mounted.dispose();
      await mounted.client.fiber.dispose();
    }
  });

  it('I128 novelReviewRepair.propose：真实 binder 保留完整参数并拒绝宽松输入', async () => {
    const { client, calls, dispose } = await mount(reviewRepairRemoteContribution);
    try {
      const repair = client.get('remote.novelReviewRepair') as ReviewRepairNamespace;
      const result = await unwrap(repair.propose('p1', { issueId: 'iss-1' }, undefined));
      expect(result).toMatchObject({ issueId: 'iss-1', candidate: { intent: 'rewrite' } });
      expect(calls).toEqual([{ endpoint: 'novelReviewRepair/propose', args: { projectId: 'p1', input: { issueId: 'iss-1' } } }]);
      await expect(Reflect.apply(repair.propose, repair, ['p1', { issueId: 'iss-1', extra: true }, undefined])).rejects.toThrow(/rejected "input"/);
      expect(calls).toHaveLength(1);
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
  });

  it('novelStatistics.sceneCards：位置参数补齐，未选筛选位显式 undefined 往返成功', async () => {
    const { client, calls, dispose } = await mount(statisticsRemoteContribution);
    try {
      const ns = client.get('remote.novelStatistics') as { sceneCards: (...args: unknown[]) => Promise<unknown> };
      // 无筛选：五个位置实参，后四位 undefined → wire args 只含 projectId。
      expect((await unwrap(ns.sceneCards('p1', undefined, undefined, undefined, undefined)) as { total: number }).total).toBe(0);
      expect(calls[0]).toEqual({ endpoint: 'novelStatistics/sceneCards', args: { projectId: 'p1' } });
      // 带筛选：按 descriptor 顺序 actId/beatId/status。
      expect((await unwrap(ns.sceneCards('p1', 'act-1', 'beat-1', 'done', undefined)) as { total: number }).total).toBe(0);
      expect(calls[1]).toEqual({ endpoint: 'novelStatistics/sceneCards', args: { projectId: 'p1', actId: 'act-1', beatId: 'beat-1', status: 'done' } });
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
  });

  it('novelStatistics.tasks：位置参数补齐，未选 status 显式 undefined 往返成功', async () => {
    const { client, calls, dispose } = await mount(statisticsRemoteContribution);
    try {
      const ns = client.get('remote.novelStatistics') as { tasks: (...args: unknown[]) => Promise<unknown> };
      expect((await unwrap(ns.tasks('p1', undefined, undefined)) as { total: number }).total).toBe(0);
      expect(calls[0]).toEqual({ endpoint: 'novelStatistics/tasks', args: { projectId: 'p1' } });
      expect((await unwrap(ns.tasks('p1', 'completed', undefined)) as { total: number }).total).toBe(0);
      expect(calls[1]).toEqual({ endpoint: 'novelStatistics/tasks', args: { projectId: 'p1', status: 'completed' } });
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
  });

  it('I103 novelBranches.list：Domain 裸数组经唯一 Host adapter/codec/真实 Client binder 返回非空 envelope', async () => {
    const domainCalls: unknown[][] = [];
    const domain = {
      async listBranches(...args: [string, string, string]) {
        domainCalls.push(args);
        return [{ id: 'branch-1', label: '初稿', chosen: true, charCount: 2, hash: 'hash-1' }];
      },
    };
    const { client, calls, dispose } = await mount(branchRemoteContribution, (endpoint, args) => {
      if (endpoint !== 'novelBranches/list') return fixtureFor(endpoint);
      return branchListWireAdapter(domain, String(args.projectId), String(args.chapterId), String(args.sceneId));
    });
    try {
      const branches = client.get('remote.novelBranches') as { list: (...args: unknown[]) => Promise<unknown> };
      const result = await unwrap(branches.list('p1', 'c1', 's1')) as { branches: Array<{ id: string }> };
      expect(result.branches.map((branch) => branch.id)).toEqual(['branch-1']);
      expect(domainCalls).toEqual([['p1', 'c1', 's1']]);
      expect(calls).toEqual([{ endpoint: 'novelBranches/list', args: { projectId: 'p1', chapterId: 'c1', sceneId: 's1' } }]);
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
  });

  it.each([
    ['数组直出', [{ id: 'branch-1', label: '初稿', chosen: true, charCount: 2, hash: 'hash-1' }]],
    ['缺少 branches', {}],
    ['多余字段', { branches: [], extra: true }],
  ])('I103 novelBranches.list 负向：%s 在真实绑定器 result codec fail closed', async (_label, invalidResult) => {
    const { client, dispose } = await mount(branchRemoteContribution, (endpoint) => endpoint === 'novelBranches/list' ? invalidResult : fixtureFor(endpoint));
    try {
      const branches = client.get('remote.novelBranches') as { list: (...args: unknown[]) => Promise<unknown> };
      await expect(unwrap(branches.list('p1', 'c1', 's1'))).rejects.toThrow(/rejected "result"/);
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
  });

  it('I130 novelBranches.aggregate：Host 一次聚合经 strict tree codec 与真实 Client binder 往返', async () => {
    const domainCalls: unknown[][] = [];
    const domain = {
      async aggregate(...args: [string]): Promise<BranchAggregate> {
        domainCalls.push(args);
        return branchAggregateSchema.parse(fixtureFor('novelBranches/aggregate'));
      },
    };
    const { client, calls, dispose } = await mount(branchRemoteContribution, (endpoint, args) => {
      if (endpoint !== 'novelBranches/aggregate') return fixtureFor(endpoint);
      return branchAggregateWireAdapter(domain, String(args.projectId));
    });
    try {
      const branches = client.get('remote.novelBranches') as { aggregate: (...args: unknown[]) => Promise<unknown> };
      const result = await unwrap(branches.aggregate('p1')) as { projectId: string; chapters: Array<{ scenes: Array<{ branches: Array<{ id: string }> }> }> };
      expect(result.projectId).toBe('p1');
      expect(result.chapters[0].scenes[0].branches[0].id).toBe('branch-1');
      expect(domainCalls).toEqual([['p1']]);
      expect(calls).toEqual([{ endpoint: 'novelBranches/aggregate', args: { projectId: 'p1' } }]);
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
  });

  it.each([
    ['缺少 chapters', { projectId: 'p1' }],
    ['正文泄漏字段', { projectId: 'p1', chapters: [{ id: 'chapter-1', index: 1, title: '第一章', pov: 'pov-1', status: 'draft', scenes: [{ id: 'scene-1', index: 0, summary: '开场', versionMode: 'implicit-single', branches: [], content: '不应出现' }] }] }],
    ['多 chosen', { projectId: 'p1', chapters: [{ id: 'chapter-1', index: 1, title: '第一章', pov: 'pov-1', status: 'draft', scenes: [{ id: 'scene-1', index: 0, summary: '开场', versionMode: 'branched', branches: [{ id: 'branch-1', label: '一', chosen: true, charCount: 1, hash: 'a'.repeat(64) }, { id: 'branch-2', label: '二', chosen: true, charCount: 1, hash: 'b'.repeat(64) }] }] }] }],
  ])('I130 novelBranches.aggregate 负向：%s 在真实绑定器 result codec fail closed', async (_label, invalidResult) => {
    const { client, dispose } = await mount(branchRemoteContribution, (endpoint) => endpoint === 'novelBranches/aggregate' ? invalidResult : fixtureFor(endpoint));
    try {
      const branches = client.get('remote.novelBranches') as { aggregate: (...args: unknown[]) => Promise<unknown> };
      await expect(unwrap(branches.aggregate('p1'))).rejects.toThrow(/rejected "result"/);
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
  });

  it('I131 novelBranches.chooseFresh：strict sourceHash 入参与原子切换结果经真实 Client binder 往返', async () => {
    const { client, calls, dispose } = await mount(branchRemoteContribution);
    try {
      const branches = client.get('remote.novelBranches') as { chooseFresh: (...args: unknown[]) => Promise<unknown> };
      const result = await unwrap(branches.chooseFresh('p1', 'c1', 's1', 'branch-2', 'a'.repeat(64))) as { content: string };
      expect(result.content).toBe('新正文');
      expect(calls).toEqual([{ endpoint: 'novelBranches/chooseFresh', args: { projectId: 'p1', chapterId: 'c1', sceneId: 's1', branchId: 'branch-2', sourceHash: 'a'.repeat(64) } }]);
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
  });

  it('I131 novelBranches.chooseFresh 负向：sourceHash 非 sha256 时在真实绑定器入参层拒绝', async () => {
    const { client, dispose } = await mount(branchRemoteContribution);
    try {
      const branches = client.get('remote.novelBranches') as { chooseFresh: (...args: unknown[]) => Promise<unknown> };
      await expect(unwrap(branches.chooseFresh('p1', 'c1', 's1', 'branch-2', 'stale'))).rejects.toThrow(/sourceHash/);
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
  });

  it('I133 novelOutlineGenerationScope.resolve：四模式范围输入与有界结果经真实 binder 往返', async () => {
    const { client, calls, dispose } = await mount(outlineGenerationScopeRemoteContribution);
    try {
      const scope = client.get('remote.novelOutlineGenerationScope') as OutlineGenerationScopeNamespace;
      const result = await unwrap(scope.resolve('p1', { kind: 'all', page: { offset: 0, limit: 128 } }));
      expect(result).toMatchObject({ projectId: 'p1', readiness: 'can-generate', page: { offset: 0, limit: 128, nextOffset: null } });
      expect(calls).toEqual([{ endpoint: 'novelOutlineGenerationScope/resolve', args: { projectId: 'p1', input: { kind: 'all', page: { offset: 0, limit: 128 } } } }]);
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
  });

  it.each([
    ['guessed scope field', { kind: 'act', actId: 'act-1', title: '第一幕' }],
    ['invalid page limit', { kind: 'all', page: { offset: 0, limit: 129 } }],
  ])('I133 scope 负向：%s 在真实绑定器 input codec fail closed', async (_label, input) => {
    const { client, calls, dispose } = await mount(outlineGenerationScopeRemoteContribution);
    try {
      const scope = client.get('remote.novelOutlineGenerationScope') as OutlineGenerationScopeNamespace;
      await expect(Reflect.apply(scope.resolve, scope, ['p1', input])).rejects.toThrow(/rejected "input"/);
      expect(calls).toHaveLength(0);
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
  });

  it('I133 scope 负向：非法分页/结果在真实绑定器 fail closed', async () => {
    const invalidMount = await mount(outlineGenerationScopeRemoteContribution, (endpoint) => endpoint === 'novelOutlineGenerationScope/resolve'
      ? { ...fixtureFor(endpoint) as Record<string, unknown>, page: { offset: 0, limit: 128, nextOffset: null, totalTargetBeatCount: 0, totalTargetDetailBeatCount: 0, extra: true } }
      : fixtureFor(endpoint));
    try {
      const scope = invalidMount.client.get('remote.novelOutlineGenerationScope') as OutlineGenerationScopeNamespace;
      await expect(unwrap(scope.resolve('p1', { kind: 'all' }))).rejects.toThrow(/rejected "result"/);
    } finally {
      await invalidMount.dispose();
      await invalidMount.client.fiber.dispose();
    }
  });

  it('I134 novelOutlineDetailGeneration：候选审阅与 I11 Gate 全套方法经真实 binder 往返', async () => {
    const { client, calls, dispose } = await mount(outlineDetailGenerationRemoteContribution);
    try {
      const detail = client.get('remote.novelOutlineDetailGeneration') as OutlineDetailGenerationNamespace;
      await expect(unwrap(detail.generate('p1', { scope: { kind: 'all' } }, undefined))).resolves.toMatchObject({ candidateId: 'odg-candidate' });
      await expect(unwrap(detail.read('p1', 'odg-candidate'))).resolves.toMatchObject({ status: 'ready' });
      await expect(unwrap(detail.edit('p1', { candidateId: 'odg-candidate', detailBeatId: 'detail-1', value: outlineDetailCandidate.items[0].after }))).resolves.toMatchObject({ revision: 1 });
      await expect(unwrap(detail.regenerate('p1', { candidateId: 'odg-candidate', detailBeatId: 'detail-1' }, undefined))).resolves.toMatchObject({ candidateId: 'odg-candidate' });
      await expect(unwrap(detail.skip('p1', { candidateId: 'odg-candidate', detailBeatId: 'detail-1' }))).resolves.toMatchObject({ candidateId: 'odg-candidate' });
      await expect(unwrap(detail.propose('p1', { candidateId: 'odg-candidate' }))).resolves.toMatchObject({ status: 'pending' });
      await expect(unwrap(detail.accept('p1', 'odg-proposal'))).resolves.toMatchObject({ status: 'accepted' });
      await expect(unwrap(detail.reject('p1', 'odg-proposal'))).resolves.toMatchObject({ status: 'rejected' });
      await expect(unwrap(detail.cancel('p1', 'odg-candidate'))).resolves.toMatchObject({ status: 'cancelled' });
      expect(calls.map((call) => call.endpoint)).toEqual([
        'novelOutlineDetailGeneration/generate', 'novelOutlineDetailGeneration/read', 'novelOutlineDetailGeneration/edit',
        'novelOutlineDetailGeneration/regenerate', 'novelOutlineDetailGeneration/skip', 'novelOutlineDetailGeneration/propose',
        'novelOutlineDetailGeneration/accept', 'novelOutlineDetailGeneration/reject', 'novelOutlineDetailGeneration/cancel',
      ]);
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
  });

  it('I134 负向：候选输入额外字段与非法结果在真实 binder fail closed', async () => {
    const { client, calls, dispose } = await mount(outlineDetailGenerationRemoteContribution);
    try {
      const detail = client.get('remote.novelOutlineDetailGeneration') as OutlineDetailGenerationNamespace;
      await expect(Reflect.apply(detail.generate, detail, ['p1', { scope: { kind: 'all' }, replaceAll: true }, undefined])).rejects.toThrow(/rejected "input"/);
      expect(calls).toHaveLength(0);
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
    const invalid = await mount(outlineDetailGenerationRemoteContribution, (endpoint) => endpoint === 'novelOutlineDetailGeneration/generate' ? { ...outlineDetailCandidate, extra: true } : fixtureFor(endpoint));
    try {
      const detail = invalid.client.get('remote.novelOutlineDetailGeneration') as OutlineDetailGenerationNamespace;
      await expect(unwrap(detail.generate('p1', { scope: { kind: 'all' } }, undefined))).rejects.toThrow(/rejected "result"/);
    } finally {
      await invalid.dispose();
      await invalid.client.fiber.dispose();
    }
  });

  it('I104 novelText additive mutation：strict input/result 经真实 Client binder 往返', async () => {
    const { client, calls, dispose } = await mount(textMutationRemoteContribution);
    try {
      const text = client.get('remote.novelText') as TextMutationNamespace;
      const before = await unwrap(text.fingerprint('p1'));
      const created = await unwrap(text.chapterCreate('p1', {
        id: 'chapter-1', index: 1, title: '第一章', pov: 'pov-1', status: 'draft', expectedFingerprint: before.fingerprint,
      }));
      expect(created.chapter).toMatchObject({ id: 'chapter-1', index: 1, sceneCount: 0 });
      expect(calls).toEqual([
        { endpoint: 'novelText/fingerprint', args: { projectId: 'p1' } },
        { endpoint: 'novelText/chapterCreate', args: { projectId: 'p1', input: { id: 'chapter-1', index: 1, title: '第一章', pov: 'pov-1', status: 'draft', expectedFingerprint: 'a'.repeat(64) } } },
      ]);
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
  });

  it('I104 真实 TextService→adapter→codec→Client 消费者链重开一致', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-i104-binder-'));
    const host = new Context();
    await host.plugin(TypertRegistry);
    await host.plugin(TypertGatewayService);
    await host.plugin(apply, { projectsRoot: root });
    const service = host.get('novelText') as NovelTextService;
    await service.open('p1');
    const gateway = host.get('typertGateway') as TypertGatewayService;
    const mounted = await mount(textMutationRemoteContribution, (endpoint, args) => {
      const separator = endpoint.indexOf('/');
      return gateway.invoke({ namespace: endpoint.slice(0, separator), method: endpoint.slice(separator + 1), args });
    });
    try {
      const text = mounted.client.get('remote.novelText') as TextMutationNamespace;
      const before = await unwrap(text.fingerprint('p1'));
      let fingerprint = (await unwrap(text.chapterCreate('p1', {
        id: 'chapter-1', index: 1, title: '第一章', pov: 'pov-1', status: 'draft', expectedFingerprint: before.fingerprint,
      }))).fingerprint;
      fingerprint = (await unwrap(text.chapterCreate('p1', {
        id: 'chapter-2', index: 2, title: '第二章', pov: 'pov-2', status: 'draft', expectedFingerprint: fingerprint,
      }))).fingerprint;
      fingerprint = (await unwrap(text.sceneCreate('p1', {
        chapterId: 'chapter-1', index: 0, expectedFingerprint: fingerprint,
        scene: { id: 'scene-1', content: '初始正文', summary: '旧摘要', beats: [], canonEvents: [], notes: '' },
      }))).fingerprint;
      fingerprint = (await unwrap(text.sceneCreate('p1', {
        chapterId: 'chapter-2', index: 0, expectedFingerprint: fingerprint,
        scene: { id: 'scene-2', content: '第二章正文', summary: '第二场', beats: [], canonEvents: [], notes: '' },
      }))).fingerprint;
      fingerprint = (await unwrap(text.chapterUpdate('p1', {
        chapterId: 'chapter-2', patch: { title: '终章', status: 'revised' }, expectedFingerprint: fingerprint,
      }))).fingerprint;
      fingerprint = (await unwrap(text.sceneUpdate('p1', {
        chapterId: 'chapter-1', sceneId: 'scene-1', patch: { summary: '新摘要', beats: ['beat-1'], canonEvents: ['event-1'], notes: '作者注' }, expectedFingerprint: fingerprint,
      }))).fingerprint;
      await unwrap(text.reorder('p1', {
        expectedFingerprint: fingerprint,
        chapters: [
          { chapterId: 'chapter-2', sceneIds: ['scene-2'] },
          { chapterId: 'chapter-1', sceneIds: ['scene-1'] },
        ],
      }));

      const reopened = createTextService(root);
      await reopened.open('p1');
      const chapters = await reopened.listChapters('p1');
      expect(chapters.map((chapter) => [chapter.id, chapter.index, chapter.title, chapter.status])).toEqual([
        ['chapter-2', 1, '终章', 'revised'], ['chapter-1', 2, '第一章', 'draft'],
      ]);
      expect(chapters[1].scenes[0]).toMatchObject({
        id: 'scene-1', index: 0, content: '初始正文', summary: '新摘要', beats: ['beat-1'], canonEvents: ['event-1'], notes: '作者注', branches: [],
      });
    } finally {
      await mounted.dispose();
      await mounted.client.fiber.dispose();
      await host.fiber.dispose();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('I105 real TypertRegistry/Gateway/Host composition/Client binder exercises binding five + proposeAt + startAt', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-i105-binder-'));
    const host = new Context();
    host.provide('llm', binderLlm as never);
    await host.plugin(TypertRegistry);
    await host.plugin(TypertGatewayService);
    await host.plugin(apply, { projectsRoot: root, agentTools: false });
    const project = host.get('novelProject') as NovelProjectService;
    const characters = host.get('novelCharacter') as NovelCharacterService;
    const worldview = host.get('novelWorldview') as NovelWorldviewService;
    const outline = host.get('novelOutline') as NovelOutlineService;
    const state = host.get('novelState') as NovelStateService;
    const canon = host.get('novelCanon') as NovelCanonService;
    const style = host.get('novelStyle') as NovelStyleService;
    const rules = host.get('novelRule') as NovelRuleService;
    const knowledge = host.get('novelKnowledge') as NovelKnowledgeService;
    const confirmation = host.get('novelConfirmation') as NovelConfirmationService;
    const text = host.get('novelText') as NovelTextService;
    await project.createProject({ projectId: 'p1', name: 'Binder project' });
    await project.openProject('p1');
    await characters.create('p1', {
      id: 'mira', name: '米拉', aliases: [], kind: 'protagonist', personality: '谨慎', background: '测绘师', motivation: '追查真相',
      goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [], arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [],
    });
    await worldview.create('p1', {
      id: 'harbor', kind: 'geography', title: '北港', content: '北港位于内海。', keywords: ['北港'],
      triggerMode: 'keyword', weight: 1, parent: null, mutable: true, status: 'active', supersededBy: null,
    });
    await outline.save('p1', {
      id: 'outline-1', structure: 'free', logline: 'Binder.', themes: [], foreshadowing: [], endings: [],
      acts: [{ id: 'act-1', index: 0, title: 'Act', goal: 'Bind.', beats: [{
        id: 'beat-1', title: 'Beat', description: 'Bind.', charactersInvolved: ['mira'], conflictType: 'external', prerequisites: [], optional: false,
        detailBeats: ['card-1', 'card-2'].map((id) => ({ id, title: id, summary: id, pov: 'mira', wordTarget: 10, points: [], status: 'planned' })),
      }] }],
    });
    await outline.saveProgress('p1', { outlineId: 'outline-1', currentAct: 'act-1', currentBeat: 'beat-1', completedBeats: [], deviations: [], tensionLevel: 0 });
    await state.open('p1', INITIAL_STATE);
    await canon.open('p1');
    await style.open('p1');
    await style.save('p1', { id: 'style-1', name: '默认', person: 'third-limited', tense: 'past', povScope: 'single', tone: '克制', proseStyle: '简洁', chapterFormat: 'plain', dialogueConventions: 'quotes', forbidden: [] });
    await rules.open('p1');
    await rules.create('p1', { id: 'rule-1', scope: 'global', kind: 'physics', statement: '海图只在月圆显字。', priority: 1, immutable: true, examples: [], active: true });
    await knowledge.open('p1');
    await knowledge.saveAll('p1', [], [{ characterId: 'mira', knows: [] }]);
    await confirmation.open('p1');
    await text.open('p1');
    await text.createChapter('p1', { id: 'chapter-1', index: 1, title: '第一章', pov: 'mira', status: 'draft' });
    await text.appendScene('p1', 'chapter-1', { id: 'scene-1', content: '', summary: '', beats: [], canonEvents: [], notes: '' });
    const gateway = host.get('typertGateway') as TypertGatewayService;
    const throughGateway = (endpoint: string, args: Record<string, unknown>) => {
      const separator = endpoint.indexOf('/');
      return gateway.invoke({ namespace: endpoint.slice(0, separator), method: endpoint.slice(separator + 1), args });
    };
    const bindingMount = await mount(sceneOutlineBindingRemoteContribution, throughGateway);
    const writingMount = await mount(writingRemoteContribution, throughGateway);
    const queueMount = await mount(queueRemoteContribution, throughGateway);
    try {
      const binding = bindingMount.client.get('remote.novelSceneOutlineBinding') as SceneOutlineBindingNamespace;
      const initial = await unwrap(binding.read('p1'));
      const saved = await unwrap(binding.save('p1', { sceneId: 'scene-1', detailBeatId: 'card-1', expectedFingerprint: initial.fingerprint }));
      const rebound = await unwrap(binding.rebind('p1', {
        sceneId: 'scene-1', detailBeatId: 'card-1', nextDetailBeatId: 'card-2', expectedFingerprint: saved.fingerprint,
      }));
      const unbound = await unwrap(binding.unbind('p1', {
        sceneId: 'scene-1', detailBeatId: 'card-2', expectedFingerprint: rebound.fingerprint,
      }));
      expect(unbound.manual).toEqual([]);
      expect(await unwrap(binding.impact('p1', { kind: 'chapter', chapterId: 'chapter-1' }))).toMatchObject({ kind: 'chapter', chapterId: 'chapter-1' });

      const writing = writingMount.client.get('remote.novelWriting') as WritingNamespace;
      const proposed = await unwrap(writing.proposeAt('p1', { intent: 'continue', chapterId: 'chapter-1', sceneId: 'new-scene' }, generationSettings));
      expect(proposed.candidate.target).toMatchObject({ projectId: 'p1', chapterId: 'chapter-1', sceneId: 'new-scene' });
      const queue = queueMount.client.get('remote.novelQueue') as QueueNamespace;
      expect((await unwrap(queue.startAt('p1', { chapterId: 'chapter-1', cardIds: [] }))).projectId).toBe('p1');
    } finally {
      await bindingMount.dispose();
      await bindingMount.client.fiber.dispose();
      await writingMount.dispose();
      await writingMount.client.fiber.dispose();
      await queueMount.dispose();
      await queueMount.client.fiber.dispose();
      await host.fiber.dispose();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('I104 novelText 负向：非法参数与非法结果均在真实 binder fail closed', async () => {
    const invalidMount = await mount(textMutationRemoteContribution, (endpoint) => endpoint === 'novelText/reorder' ? { chapters: [], fingerprint: 'bad' } : fixtureFor(endpoint));
    try {
      const text = invalidMount.client.get('remote.novelText') as TextMutationNamespace;
      await expect(text.chapterCreate('p1', { id: 'chapter-1' } as never)).rejects.toThrow(/rejected "input"/);
      await expect(unwrap(text.reorder('p1', { chapters: [], expectedFingerprint: 'a'.repeat(64) }))).rejects.toThrow(/rejected "result"/);
    } finally {
      await invalidMount.dispose();
      await invalidMount.client.fiber.dispose();
    }
  });

  it('负向：缺参在业务前被真实绑定器拒绝（arity 精确）', async () => {
    const { client, dispose } = await mount(writingRemoteContribution);
    try {
      const writing = client.get('remote.novelWriting') as { propose: (...args: unknown[]) => Promise<unknown>; adjudicate: (...args: unknown[]) => Promise<unknown> };
      await expect(writing.propose('p1', { intent: 'continue' })).rejects.toThrow(/expected 3 argument\(s\), got 2/);
      await expect(writing.propose('p1')).rejects.toThrow(/expected 3 argument\(s\), got 1/);
      await expect(writing.adjudicate('cand-1')).rejects.toThrow(/expected 3 argument\(s\), got 1/);
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
  });

  it('负向：缺参/对象传参在真实绑定器下被拒（sceneCards/tasks/scan）', async () => {
    const { client, dispose } = await mount(statisticsRemoteContribution);
    try {
      const statistics = client.get('remote.novelStatistics') as { sceneCards: (...args: unknown[]) => Promise<unknown>; tasks: (...args: unknown[]) => Promise<unknown> };
      // 对象传参（旧错误调用形状）→ arity 拒绝。
      await expect(statistics.sceneCards('p1', { actId: 'act-1' })).rejects.toThrow(/expected 5 argument\(s\), got 2/);
      await expect(statistics.sceneCards('p1')).rejects.toThrow(/expected 5 argument\(s\), got 1/);
      await expect(statistics.tasks('p1', { status: 'done' })).rejects.toThrow(/expected 3 argument\(s\), got 2/);
      await expect(statistics.tasks('p1')).rejects.toThrow(/expected 3 argument\(s\), got 1/);
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
  });

  it('负向：string/number strict codec 可选参数仍拒绝 undefined（jsonCodec 才是可选参数的放行通道）', async () => {
    // 回归护栏：如果将来有人把 sceneCards 的 actId 改回 stringCodec，显式 undefined
    // 会在真实绑定器被拒（`rejected "actId"`）——这是 I86 把可选筛选参数定为
    // jsonCodec 的原因（计划 §18 I86：缺省位显式传 undefined 对齐 settings 先例）。
    const { client, dispose } = await mount(statisticsRemoteContribution);
    try {
      const statistics = client.get('remote.novelStatistics') as { sceneCards: (...args: unknown[]) => Promise<unknown> };
      const result = await unwrap(statistics.sceneCards('p1', undefined, undefined, undefined, undefined));
      expect(result).toEqual({ total: 0, cards: [] });
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
  });

  it('既有正常对照：零可选参数方法往返不受影响（records/stats）', async () => {
    const { client, dispose } = await mount(reviewRemoteContribution);
    try {
      const review = client.get('remote.novelReview') as { records: (projectId: string) => Promise<unknown> };
      expect(await unwrap(review.records('p1'))).toEqual([]);
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
    const statsMount = await mount(statisticsRemoteContribution);
    try {
      const statistics = statsMount.client.get('remote.novelStatistics') as { stats: (projectId: string) => Promise<unknown> };
      expect((await unwrap(statistics.stats('p1')) as { indexExists: boolean }).indexExists).toBe(false);
    } finally {
      await statsMount.dispose();
      await statsMount.client.fiber.dispose();
    }
  });
});
