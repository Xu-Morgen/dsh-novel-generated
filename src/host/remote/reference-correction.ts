import type { InvocationParameterDescriptor, TypertCodec } from '@deepseek-ai/dsh-typert-protocol';
import { GenerationSettingsSchema } from '../../core/schema/generation-settings.js';
import {
  referenceCorrectionAcceptResultSchema,
  referenceCorrectionPendingResultSchema,
  referenceCorrectionProposeInputSchema,
  referenceCorrectionProposeResultSchema,
  referenceCorrectionRejectResultSchema,
} from '../../core/schema/reference-correction.js';
import { strictCodec, stringCodec } from './common.js';
import { param, remoteContribution, remoteInvocation } from './shared.js';

/** I118 strict candidate-preview / I11 Gate application Remote. */
const correctionInvocation = <const M extends string, const P extends readonly InvocationParameterDescriptor[], const R extends TypertCodec>(
  method: M,
  parameters: P,
  result: R,
) => remoteInvocation('novelReferenceCorrection', method, parameters, result);

const projectParameter = param('projectId', stringCodec);
const settingsParameter = param('settings', strictCodec('novel-creation-tool#generationSettings', GenerationSettingsSchema.optional()), true);

export const referenceCorrectionProposeInvocation = correctionInvocation(
  'propose',
  [projectParameter, param('input', strictCodec('novel-creation-tool#novelReferenceCorrection:proposeInput', referenceCorrectionProposeInputSchema)), settingsParameter],
  strictCodec('novel-creation-tool#novelReferenceCorrection:propose', referenceCorrectionProposeResultSchema),
);
export const referenceCorrectionAcceptInvocation = correctionInvocation(
  'accept',
  [projectParameter, param('proposalId', stringCodec)],
  strictCodec('novel-creation-tool#novelReferenceCorrection:accept', referenceCorrectionAcceptResultSchema),
);
export const referenceCorrectionRejectInvocation = correctionInvocation(
  'reject',
  [projectParameter, param('proposalId', stringCodec)],
  strictCodec('novel-creation-tool#novelReferenceCorrection:reject', referenceCorrectionRejectResultSchema),
);
export const referenceCorrectionPendingInvocation = correctionInvocation(
  'pending',
  [projectParameter],
  strictCodec('novel-creation-tool#novelReferenceCorrection:pending', referenceCorrectionPendingResultSchema),
);

export const referenceCorrectionInvocations = [
  referenceCorrectionProposeInvocation,
  referenceCorrectionAcceptInvocation,
  referenceCorrectionRejectInvocation,
  referenceCorrectionPendingInvocation,
] as const;

export const referenceCorrectionRemoteContribution = remoteContribution(
  'novel-creation-tool-reference-correction',
  referenceCorrectionInvocations,
);
