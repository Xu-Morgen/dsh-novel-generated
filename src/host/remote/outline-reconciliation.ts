import type { InvocationParameterDescriptor, TypertCodec } from '@deepseek-ai/dsh-typert-protocol';
import { GenerationSettingsSchema } from '../../core/schema/generation-settings.js';
import {
  outlineReconciliationCancelResultSchema,
  outlineReconciliationPlanSchema,
  outlineReconciliationPrepareInputSchema,
  outlineReconciliationRegenerateOneInputSchema,
} from '../../core/schema/outline-reconciliation.js';
import {
  outlineReconciliationAcceptResultSchema as applicationAcceptResultSchema,
  outlineReconciliationContinueResultSchema as applicationContinueResultSchema,
  outlineReconciliationFinalizeInputSchema as applicationFinalizeInputSchema,
  outlineReconciliationFinalizeResultSchema as applicationFinalizeResultSchema,
  outlineReconciliationProposeInputSchema as applicationProposeInputSchema,
  outlineReconciliationProposeResultSchema as applicationProposeResultSchema,
  outlineReconciliationRejectResultSchema as applicationRejectResultSchema,
} from '../../core/schema/outline-reconciliation-application.js';
import { strictCodec, stringCodec } from './common.js';
import { param, remoteContribution, remoteInvocation } from './shared.js';

/** I113 additive strict planner Remote; it exposes candidates only, never B5 apply. */
const reconciliationInvocation = <const M extends string, const P extends readonly InvocationParameterDescriptor[], const R extends TypertCodec>(
  method: M,
  parameters: P,
  result: R,
) => remoteInvocation('novelOutlineReconciliation', method, parameters, result);

const projectParameter = param('projectId', stringCodec);
const settingsParameter = param('settings', strictCodec('novel-creation-tool#generationSettings', GenerationSettingsSchema.optional()), true);

export const outlineReconciliationPrepareInvocation = reconciliationInvocation(
  'prepare',
  [projectParameter, param('input', strictCodec('novel-creation-tool#novelOutlineReconciliation:prepareInput', outlineReconciliationPrepareInputSchema)), settingsParameter],
  strictCodec('novel-creation-tool#novelOutlineReconciliation:prepare', outlineReconciliationPlanSchema),
);
export const outlineReconciliationRegenerateOneInvocation = reconciliationInvocation(
  'regenerateOne',
  [projectParameter, param('input', strictCodec('novel-creation-tool#novelOutlineReconciliation:regenerateOneInput', outlineReconciliationRegenerateOneInputSchema)), settingsParameter],
  strictCodec('novel-creation-tool#novelOutlineReconciliation:regenerateOne', outlineReconciliationPlanSchema),
);
export const outlineReconciliationReadInvocation = reconciliationInvocation(
  'read',
  [projectParameter, param('planId', stringCodec)],
  strictCodec('novel-creation-tool#novelOutlineReconciliation:read', outlineReconciliationPlanSchema),
);
export const outlineReconciliationCancelInvocation = reconciliationInvocation(
  'cancel',
  [projectParameter, param('planId', stringCodec)],
  strictCodec('novel-creation-tool#novelOutlineReconciliation:cancel', outlineReconciliationCancelResultSchema),
);

/** I114 application commands; only accept/finalize/continue can reach writers. */
export const outlineReconciliationProposeInvocation = reconciliationInvocation(
  'propose',
  [projectParameter, param('input', strictCodec('novel-creation-tool#novelOutlineReconciliation:proposeInput', applicationProposeInputSchema))],
  strictCodec('novel-creation-tool#novelOutlineReconciliation:propose', applicationProposeResultSchema),
);
export const outlineReconciliationAcceptInvocation = reconciliationInvocation(
  'accept',
  [projectParameter, param('proposalId', stringCodec)],
  strictCodec('novel-creation-tool#novelOutlineReconciliation:accept', applicationAcceptResultSchema),
);
export const outlineReconciliationRejectInvocation = reconciliationInvocation(
  'reject',
  [projectParameter, param('proposalId', stringCodec)],
  strictCodec('novel-creation-tool#novelOutlineReconciliation:reject', applicationRejectResultSchema),
);
export const outlineReconciliationFinalizeInvocation = reconciliationInvocation(
  'finalize',
  [projectParameter, param('input', strictCodec('novel-creation-tool#novelOutlineReconciliation:finalizeInput', applicationFinalizeInputSchema))],
  strictCodec('novel-creation-tool#novelOutlineReconciliation:finalize', applicationFinalizeResultSchema),
);
export const outlineReconciliationContinueInvocation = reconciliationInvocation(
  'continue',
  [projectParameter, param('input', strictCodec('novel-creation-tool#novelOutlineReconciliation:continueInput', applicationFinalizeInputSchema))],
  strictCodec('novel-creation-tool#novelOutlineReconciliation:continue', applicationContinueResultSchema),
);

export const outlineReconciliationPlannerInvocations = [
  outlineReconciliationPrepareInvocation,
  outlineReconciliationRegenerateOneInvocation,
  outlineReconciliationReadInvocation,
  outlineReconciliationCancelInvocation,
] as const;

export const outlineReconciliationApplicationInvocations = [
  outlineReconciliationProposeInvocation,
  outlineReconciliationAcceptInvocation,
  outlineReconciliationRejectInvocation,
  outlineReconciliationFinalizeInvocation,
  outlineReconciliationContinueInvocation,
] as const;

export const outlineReconciliationInvocations = [
  ...outlineReconciliationPlannerInvocations,
  ...outlineReconciliationApplicationInvocations,
] as const;

export const outlineReconciliationRemoteContribution = remoteContribution(
  'novel-creation-tool-outline-reconciliation',
  outlineReconciliationInvocations,
);
