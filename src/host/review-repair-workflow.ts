import { assertTextAnchor, type TextAnchor } from '../core/schema/link.js';
import {
  reviewRepairInputSchema,
  reviewRepairLineageSchema,
  reviewRepairTargetSchema,
  type ReviewRepairInput,
} from '../core/schema/review-repair.js';
import type { ReviewIssue } from '../core/review/issue.js';
import { textContentHash } from '../core/text/index.js';
import type { GenerationSettings } from '../llm/port/index.js';
import { buildReviewRepairPrompt } from '../llm/template/review-repair.js';
import type { NovelReviewService } from './review-service.js';
import type { NovelTextService } from './text-service.js';
import type { WritingCandidate } from '../core/candidate/index.js';
import type { NovelWritingAdjudicationService } from './writing-adjudication-service.js';

export interface ReviewRepairWorkflowDeps {
  readonly review: Pick<NovelReviewService, 'current'>;
  readonly text: Pick<NovelTextService, 'readChapter'>;
  readonly writing: Pick<NovelWritingAdjudicationService, 'propose'>;
}

export interface ReviewRepairProposal {
  readonly projectId: string;
  readonly issueId: string;
  readonly issueFingerprint: string;
  readonly target: { readonly chapterId: string; readonly sceneId: string; readonly sourceHash: string };
  readonly anchor?: TextAnchor;
  readonly lineage: {
    readonly kind: 'review-repair';
    readonly issueId: string;
    readonly issueFingerprint: string;
    readonly sourceHash: string;
  };
  readonly candidate: WritingCandidate;
}

export interface ReviewRepairWorkflow {
  propose(projectId: string, input: ReviewRepairInput, settings?: GenerationSettings, signal?: AbortSignal): Promise<ReviewRepairProposal>;
}

/**
 * I128 R18-3a workflow owner. It reads only the latest Host scan, verifies the
 * current C5 text against the scan evidence, then delegates zero-write rewrite
 * candidate production to the existing writing-adjudication owner.
 */
export function createReviewRepairWorkflow(deps: ReviewRepairWorkflowDeps): ReviewRepairWorkflow {
  return Object.freeze({
    async propose(projectId: string, rawInput: ReviewRepairInput, settings?: GenerationSettings, signal?: AbortSignal): Promise<ReviewRepairProposal> {
      const input = reviewRepairInputSchema.parse(rawInput);
      const issue = deps.review.current(projectId, input.issueId);
      const location = issue.location;
      if (location === undefined) throw new Error('审校问题缺少正文定位，无法生成修复候选');
      const chapter = await deps.text.readChapter(projectId, location.chapterId);
      const scene = chapter.scenes.find((candidate) => candidate.id === location.sceneId);
      if (scene === undefined) throw new Error('审校问题目标场景不存在，请刷新审校结果');
      const sourceHash = textContentHash(scene.content);
      if (issue.provenance !== undefined && issue.provenance.sourceHash !== sourceHash) {
        throw new Error('审校问题正文已变化：修复候选已失效，请先刷新审校');
      }
      if (location.anchor !== undefined) {
        if (location.anchor.sourceHash !== sourceHash) throw new Error('正文锚点已失效，请先刷新审校');
        try {
          assertTextAnchor(scene.content, location.anchor);
        } catch (cause) {
          throw new Error(`正文锚点已失效，请先刷新审校：${cause instanceof Error ? cause.message : String(cause)}`);
        }
      }
      const issueFingerprint = issue.provenance?.issueFingerprint ?? issue.id;
      const result = await deps.writing.propose(projectId, {
        intent: 'rewrite',
        chapterId: location.chapterId,
        sceneId: location.sceneId,
        prompt: buildReviewRepairPrompt({ issue, prose: scene.content, anchor: location.anchor, instruction: input.instruction }),
      }, settings, signal);
      const target = reviewRepairTargetSchema.parse({ chapterId: location.chapterId, sceneId: location.sceneId, sourceHash });
      const lineage = reviewRepairLineageSchema.parse({ kind: 'review-repair', issueId: input.issueId, issueFingerprint, sourceHash });
      return Object.freeze({
        projectId,
        issueId: input.issueId,
        issueFingerprint,
        target,
        ...(location.anchor === undefined ? {} : { anchor: location.anchor }),
        lineage,
        candidate: result.candidate,
      });
    },
  });
}
