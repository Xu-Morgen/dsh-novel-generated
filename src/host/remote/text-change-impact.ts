import type { InvocationParameterDescriptor, TypertCodec } from '@deepseek-ai/dsh-typert-protocol';
import {
  textChangeImpactCancelResultSchema,
  textChangeImpactPrepareInputSchema,
  textChangeImpactPrepareResultSchema,
  textChangeImpactReportSchema,
} from '../../core/schema/text-change-impact.js';
import { GenerationSettingsSchema } from '../../core/schema/generation-settings.js';
import { strictCodec, stringCodec } from './common.js';
import { param, remoteContribution, remoteInvocation } from './shared.js';

/** I112 additive, strict, zero-write正文影响分析 Remote。 */
const impactInvocation = <const M extends string, const P extends readonly InvocationParameterDescriptor[], const R extends TypertCodec>(
  method: M,
  parameters: P,
  result: R,
) => remoteInvocation('novelTextChangeImpact', method, parameters, result);

const projectParameter = param('projectId', stringCodec);
const prepareInput = param('input', strictCodec('novel-creation-tool#novelTextChangeImpact:prepareInput', textChangeImpactPrepareInputSchema));
const settingsParameter = param('settings', strictCodec('novel-creation-tool#generationSettings', GenerationSettingsSchema.optional()), true);

export const textChangeImpactPrepareInvocation = impactInvocation(
  'prepare',
  [projectParameter, prepareInput, settingsParameter],
  strictCodec('novel-creation-tool#novelTextChangeImpact:prepare', textChangeImpactPrepareResultSchema),
);
export const textChangeImpactReadInvocation = impactInvocation(
  'read',
  [projectParameter, param('impactId', stringCodec)],
  strictCodec('novel-creation-tool#novelTextChangeImpact:read', textChangeImpactReportSchema),
);
export const textChangeImpactCancelInvocation = impactInvocation(
  'cancel',
  [projectParameter, param('impactId', stringCodec)],
  strictCodec('novel-creation-tool#novelTextChangeImpact:cancel', textChangeImpactCancelResultSchema),
);

export const textChangeImpactInvocations = [
  textChangeImpactPrepareInvocation,
  textChangeImpactReadInvocation,
  textChangeImpactCancelInvocation,
] as const;

export const textChangeImpactRemoteContribution = remoteContribution(
  'novel-creation-tool-text-change-impact',
  textChangeImpactInvocations,
);
