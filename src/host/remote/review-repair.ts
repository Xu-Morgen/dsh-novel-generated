import type { InvocationParameterDescriptor, TypertCodec } from '@deepseek-ai/dsh-typert-protocol';
import { z } from 'zod';
import { GenerationSettingsSchema } from '../../core/schema/generation-settings.js';
import {
  reviewRepairAnchorSchema,
  reviewRepairInputSchema,
  reviewRepairLineageSchema,
  reviewRepairTargetSchema,
} from '../../core/schema/review-repair.js';
import { strictCodec, stringCodec } from './common.js';
import { writingCandidateWireSchema } from './writing.js';
import { param, remoteContribution, remoteInvocation } from './shared.js';

/** I128 additive review→router→rewrite-candidate contract (R18-3a). */
const reviewRepairInvocation = <const M extends string, const P extends readonly InvocationParameterDescriptor[], const R extends TypertCodec>(
  method: M,
  parameters: P,
  result: R,
) => remoteInvocation('novelReviewRepair', method, parameters, result);

const reviewRepairResultSchema = z.object({
  projectId: z.string().min(1),
  issueId: z.string().min(1).max(128),
  issueFingerprint: z.string().min(1).max(128),
  target: reviewRepairTargetSchema,
  anchor: reviewRepairAnchorSchema.optional(),
  lineage: reviewRepairLineageSchema,
  candidate: writingCandidateWireSchema,
}).strict().readonly();
export type ReviewRepairProposalShape = z.infer<typeof reviewRepairResultSchema>;

const settingsParameter = param('settings', strictCodec('novel-creation-tool#generationSettings', GenerationSettingsSchema.optional()), true);

export const reviewRepairProposeInvocation = reviewRepairInvocation(
  'propose',
  [
    param('projectId', stringCodec),
    param('input', strictCodec('novel-creation-tool#novelReviewRepair:input', reviewRepairInputSchema)),
    settingsParameter,
  ],
  strictCodec('novel-creation-tool#novelReviewRepair:propose', reviewRepairResultSchema),
);

export const reviewRepairInvocations = [reviewRepairProposeInvocation] as const;
export const reviewRepairRemoteContribution = remoteContribution('novel-creation-tool-review-repair', reviewRepairInvocations);
