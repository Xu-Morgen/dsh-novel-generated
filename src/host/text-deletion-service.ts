import { createHash, randomUUID } from 'node:crypto';
import { entityIdSchema } from '../core/schema/base.js';
import {
  textDeletionApplyResultSchema,
  textDeletionImpactSchema,
  textDeletionProposeInputSchema,
  textDeletionProposalPayloadSchema,
  textDeletionProposeResultSchema,
  textDeletionTargetSchema,
  textDeletionRejectResultSchema,
  type TextDeletionApplyResult,
  type TextDeletionImpact,
  type TextDeletionProposeInput,
  type TextDeletionProposeResult,
  type TextDeletionTarget,
} from '../core/schema/text-deletion.js';
import type { TextDeleteImpact } from '../core/text/index.js';
import type { QueueService, QueueStatusView } from './queue-service.js';
import type { NovelConfirmationService } from './confirmation-service.js';
import type { NovelSceneOutlineBindingService } from './scene-outline-binding-service.js';
import type { NovelTextServiceBundle } from './text-service.js';
import type { WritingCandidateActivity, NovelWritingAdjudicationService } from './writing-adjudication-service.js';

const DELETE_PROPOSAL_KIND = 'text.delete';

type TargetScene = { readonly chapterId: string; readonly sceneId: string };

export interface TextDeletionServiceDeps {
  readonly text: Pick<NovelTextServiceBundle, 'projectFingerprint' | 'listChapters' | 'inspectChapterDelete' | 'inspectSceneDelete' | 'deleteChapterPrimitive' | 'deleteScenePrimitive'>;
  readonly binding: Pick<NovelSceneOutlineBindingService, 'impact' | 'cleanupForDeletion'>;
  readonly confirmation: NovelConfirmationService;
  readonly queue?: Pick<QueueService, 'status'>;
  readonly writing?: Pick<NovelWritingAdjudicationService, 'listActiveCandidates'>;
}

export interface NovelTextDeletionService {
  impact(projectId: string, target: TextDeletionTarget): Promise<{ readonly status: 'ready' | 'blocked'; readonly impact: TextDeletionImpact }>;
  propose(projectId: string, input: TextDeletionProposeInput): Promise<TextDeletionProposeResult>;
  apply(projectId: string, proposalId: string): Promise<TextDeletionApplyResult>;
  reject(projectId: string, proposalId: string): Promise<{ readonly status: 'rejected' | 'already-rejected'; readonly proposalId: string }>;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}

function targetSceneIds(impact: TextDeleteImpact): TargetScene[] {
  return impact.sources.map((source) => ({ chapterId: impact.chapterId, sceneId: source.sceneId }));
}

function targetMatches(impact: TextDeleteImpact, target: TextDeletionTarget): boolean {
  return impact.kind === target.kind
    && impact.chapterId === target.chapterId
    && (target.kind === 'chapter' || impact.sceneId === target.sceneId);
}

function withoutMutableBindingFields(impact: TextDeletionImpact): Record<string, unknown> {
  const { bindings: _bindings, impactFingerprint: _impactFingerprint, ...stable } = impact;
  return stable;
}

function sameImpactExceptBinding(left: TextDeletionImpact, right: TextDeletionImpact): boolean {
  return stableJson(withoutMutableBindingFields(left)) === stableJson(withoutMutableBindingFields(right));
}

function candidateActivitiesForTarget(target: TextDeletionTarget, activities: readonly WritingCandidateActivity[]): WritingCandidateActivity[] {
  return activities
    .filter((activity) => activity.chapterId === target.chapterId && (target.kind === 'chapter' || activity.sceneId === target.sceneId))
    .sort((left, right) => left.candidateId.localeCompare(right.candidateId));
}

function queueActivitiesForTarget(target: TextDeletionTarget, status: QueueStatusView | undefined) {
  return (status?.tasks ?? [])
    .filter((task) => ['queued', 'running', 'candidate-ready'].includes(task.status)
      && task.chapterId === target.chapterId
      && (target.kind === 'chapter' || task.sceneId === target.sceneId))
    .map((task) => ({ id: task.id, chapterId: task.chapterId, sceneId: task.sceneId, status: task.status as 'queued' | 'running' | 'candidate-ready', candidateId: task.candidateId }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function blockersFor(impact: Pick<TextDeletionImpact, 'kind' | 'sceneCount' | 'activeQueue' | 'activeCandidates'>, totalSceneCount: number): Array<'last-scene-landing' | 'active-queue' | 'active-candidate'> {
  const blockers: Array<'last-scene-landing' | 'active-queue' | 'active-candidate'> = [];
  if (totalSceneCount > 0 && totalSceneCount - impact.sceneCount === 0) blockers.push('last-scene-landing');
  if (impact.activeQueue.length > 0) blockers.push('active-queue');
  if (impact.activeCandidates.length > 0) blockers.push('active-candidate');
  return blockers;
}

/**
 * I106 is deliberately a short coordinator: C5, binding, queue and candidate
 * owners remain authoritative. `apply` accepts one I11 record and performs the
 * binding-first/C5-second sequence synchronously; it does not create a second
 * deletion state machine or recovery journal (design §14.14 / I106).
 */
export function createTextDeletionService(deps: TextDeletionServiceDeps): NovelTextDeletionService {
  const buildImpact = async (projectId: string, targetInput: TextDeletionTarget): Promise<TextDeletionImpact> => {
    const target = textDeletionTargetSchema.parse(targetInput);
    const chapters = await deps.text.listChapters(projectId);
    const allSceneCount = chapters.reduce((sum, chapter) => sum + chapter.scenes.length, 0);
    const c5 = target.kind === 'chapter'
      ? await deps.text.inspectChapterDelete(projectId, target.chapterId)
      : await deps.text.inspectSceneDelete(projectId, target.chapterId, target.sceneId);
    const binding = await deps.binding.impact(projectId, target.kind === 'scene'
      ? { kind: 'scene', sceneId: target.sceneId }
      : target);
    const [queue, candidates] = await Promise.all([
      deps.queue?.status(projectId),
      deps.writing?.listActiveCandidates?.(projectId) ?? Promise.resolve([] as readonly WritingCandidateActivity[]),
    ]);
    const activeQueue = queueActivitiesForTarget(target, queue);
    const activeCandidates = candidateActivitiesForTarget(target, candidates);
    const raw = {
      ...c5,
      bindings: [...binding.bindings].sort((left, right) => left.sceneId.localeCompare(right.sceneId) || left.detailBeatId.localeCompare(right.detailBeatId)),
      activeQueue,
      activeCandidates: activeCandidates.map((item) => ({ ...item })),
      historicalReferences: [],
      opaqueHistoryCount: 0,
      blockers: [] as Array<'last-scene-landing' | 'active-queue' | 'active-candidate'>,
    };
    const blockers = blockersFor(raw, allSceneCount);
    return textDeletionImpactSchema.parse({ ...raw, blockers, impactFingerprint: fingerprint({ ...raw, blockers }) });
  };

  const requireRecord = (projectId: string, proposalId: string) => {
    entityIdSchema.parse(projectId);
    entityIdSchema.parse(proposalId);
    const record = deps.confirmation.get(projectId, proposalId);
    if (record.kind !== DELETE_PROPOSAL_KIND) throw new Error(`Confirmation is not a text deletion proposal: ${proposalId}`);
    const payload = textDeletionProposalPayloadSchema.parse(record.payload);
    return { record, payload };
  };

  return Object.freeze({
    async impact(projectId: string, target: TextDeletionTarget) {
      const impact = await buildImpact(projectId, target);
      return Object.freeze({ status: impact.blockers.length === 0 ? 'ready' as const : 'blocked' as const, impact });
    },
    async propose(projectId: string, input: TextDeletionProposeInput) {
      const parsed = textDeletionProposeInputSchema.parse(input);
      const current = await buildImpact(projectId, parsed.target);
      if (current.impactFingerprint !== parsed.expectedImpactFingerprint) {
        return textDeletionProposeResultSchema.parse({ status: 'stale', impact: current });
      }
      if (current.blockers.length > 0) {
        return textDeletionProposeResultSchema.parse({ status: 'blocked', impact: current });
      }
      const record = await deps.confirmation.propose(projectId, {
        id: randomUUID(),
        kind: DELETE_PROPOSAL_KIND,
        payload: { ...parsed, impact: current },
      });
      return textDeletionProposeResultSchema.parse({ status: 'pending', proposalId: record.id, impact: current });
    },
    async apply(projectId: string, proposalId: string) {
      const { record, payload } = requireRecord(projectId, proposalId);
      if (record.status === 'rejected') throw new Error(`Deletion proposal is rejected: ${proposalId}`);
      if (record.status === 'pending') await deps.confirmation.accept(projectId, proposalId);

      let current: TextDeletionImpact;
      try {
        current = await buildImpact(projectId, payload.target);
      } catch (error) {
        // The proposal is already authorized. A missing target means the C5
        // delete happened before a response was observed; report the current
        // fingerprint so a retry is safely idempotent.
        if (error instanceof Error && /^Unknown (chapter|scene):/.test(error.message)) {
          return textDeletionApplyResultSchema.parse({ status: 'already-deleted', proposalId, fingerprint: await deps.text.projectFingerprint(projectId) });
        }
        throw error;
      }
      if (!targetMatches(current, payload.target) || !sameImpactExceptBinding(current, payload.impact)) {
        return textDeletionApplyResultSchema.parse({ status: 'stale', impact: current });
      }
      if (current.blockers.length > 0) {
        return textDeletionApplyResultSchema.parse({ status: 'blocked', impact: current });
      }
      const scenes = targetSceneIds(current);
      await deps.binding.cleanupForDeletion(projectId, scenes.map((scene) => scene.sceneId), proposalId);
      const result = current.kind === 'chapter'
        ? await deps.text.deleteChapterPrimitive(projectId, current.chapterId, current.projectFingerprint)
        : await deps.text.deleteScenePrimitive(projectId, current.chapterId, current.sceneId!, current.projectFingerprint);
      return textDeletionApplyResultSchema.parse({ status: 'deleted', proposalId, fingerprint: result.fingerprint });
    },
    async reject(projectId: string, proposalId: string) {
      const { record } = requireRecord(projectId, proposalId);
      if (record.status === 'rejected') return textDeletionRejectResultSchema.parse({ status: 'already-rejected', proposalId });
      if (record.status === 'accepted') throw new Error(`Deletion proposal is already accepted: ${proposalId}`);
      await deps.confirmation.reject(projectId, proposalId);
      return textDeletionRejectResultSchema.parse({ status: 'rejected', proposalId });
    },
  });
}
