import type { InvocationParameterDescriptor, TypertCodec } from '@deepseek-ai/dsh-typert-protocol';
import { GenerationSettingsSchema } from '../../core/schema/generation-settings.js';
import {
  longDraftOutlineAcceptResultSchema,
  longDraftOutlineApplyProposalSchema,
  longDraftOutlineCandidateSchema,
  longDraftOutlineRejectResultSchema,
  longDraftOutlineInputSchema,
  longDraftReadinessSchema,
  longDraftWorkflowBeginResultSchema,
  longDraftWorkflowCancelResultSchema,
  longDraftWorkflowRecoverResultSchema,
  longDraftWorkflowResultSchema,
  longDraftWorkflowStatusSchema,
} from '../../core/schema/long-draft.js';
import { strictCodec, stringCodec } from './common.js';
import { param, remoteContribution, remoteInvocation } from './shared.js';

/** I119 candidate-only long-draft outline workflow Remote. */
const longDraftInvocation = <const M extends string, const P extends readonly InvocationParameterDescriptor[], const R extends TypertCodec>(
  method: M,
  parameters: P,
  result: R,
) => remoteInvocation('novelLongDraft', method, parameters, result);

const projectParameter = param('projectId', stringCodec);
const settingsParameter = param('settings', strictCodec('novel-creation-tool#generationSettings', GenerationSettingsSchema.optional()), true);

export const longDraftPreflightInvocation = longDraftInvocation(
  'preflight',
  [projectParameter],
  strictCodec('novel-creation-tool#longDraftReadiness', longDraftReadinessSchema),
);
export const longDraftBeginInvocation = longDraftInvocation(
  'begin',
  [projectParameter, param('input', strictCodec('novel-creation-tool#longDraftOutlineInput', longDraftOutlineInputSchema)), settingsParameter],
  strictCodec('novel-creation-tool#longDraftWorkflowBegin', longDraftWorkflowBeginResultSchema),
);
export const longDraftStatusInvocation = longDraftInvocation(
  'status',
  [param('workflowId', stringCodec)],
  strictCodec('novel-creation-tool#longDraftWorkflowStatus', longDraftWorkflowStatusSchema),
);
export const longDraftCancelInvocation = longDraftInvocation(
  'cancel',
  [param('workflowId', stringCodec)],
  strictCodec('novel-creation-tool#longDraftWorkflowCancel', longDraftWorkflowCancelResultSchema),
);
export const longDraftResultInvocation = longDraftInvocation(
  'result',
  [param('workflowId', stringCodec)],
  strictCodec('novel-creation-tool#longDraftWorkflowResult', longDraftWorkflowResultSchema),
);
export const longDraftProposeApplyInvocation = longDraftInvocation(
  'proposeApply',
  [projectParameter, param('candidate', strictCodec('novel-creation-tool#longDraftOutlineCandidate', longDraftOutlineCandidateSchema))],
  strictCodec('novel-creation-tool#longDraftOutlineApplyProposal', longDraftOutlineApplyProposalSchema),
);
export const longDraftAcceptInvocation = longDraftInvocation(
  'accept',
  [projectParameter, param('proposalId', stringCodec), param('sourceHash', stringCodec, true)],
  strictCodec('novel-creation-tool#longDraftOutlineAccept', longDraftOutlineAcceptResultSchema),
);
export const longDraftRejectInvocation = longDraftInvocation(
  'reject',
  [projectParameter, param('proposalId', stringCodec)],
  strictCodec('novel-creation-tool#longDraftOutlineReject', longDraftOutlineRejectResultSchema),
);
export const longDraftRecoverInvocation = longDraftInvocation(
  'recover',
  [projectParameter],
  strictCodec('novel-creation-tool#longDraftWorkflowRecover', longDraftWorkflowRecoverResultSchema),
);

export const longDraftInvocations = [
  longDraftPreflightInvocation,
  longDraftBeginInvocation,
  longDraftStatusInvocation,
  longDraftCancelInvocation,
  longDraftResultInvocation,
  longDraftProposeApplyInvocation,
  longDraftAcceptInvocation,
  longDraftRejectInvocation,
  longDraftRecoverInvocation,
] as const;

export const longDraftRemoteContribution = remoteContribution(
  'novel-creation-tool-long-draft',
  longDraftInvocations,
);
