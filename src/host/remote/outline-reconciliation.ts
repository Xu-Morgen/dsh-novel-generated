import type { InvocationParameterDescriptor, TypertCodec } from '@deepseek-ai/dsh-typert-protocol';
import { GenerationSettingsSchema } from '../../core/schema/generation-settings.js';
import {
  outlineReconciliationCancelResultSchema,
  outlineReconciliationPlanSchema,
  outlineReconciliationPrepareInputSchema,
  outlineReconciliationRegenerateOneInputSchema,
} from '../../core/schema/outline-reconciliation.js';
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

export const outlineReconciliationInvocations = [
  outlineReconciliationPrepareInvocation,
  outlineReconciliationRegenerateOneInvocation,
  outlineReconciliationReadInvocation,
  outlineReconciliationCancelInvocation,
] as const;

export const outlineReconciliationRemoteContribution = remoteContribution(
  'novel-creation-tool-outline-reconciliation',
  outlineReconciliationInvocations,
);
