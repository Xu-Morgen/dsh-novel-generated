import type { InvocationParameterDescriptor, TypertCodec } from '@deepseek-ai/dsh-typert-protocol';
import {
  outlineGenerationBaselineAttachGeneratedInputSchema,
  outlineGenerationBaselineCreateInputSchema,
  outlineGenerationBaselineCurrentInputSchema,
  outlineGenerationBaselineCurrentResultSchema,
  outlineGenerationBaselineReadResultSchema,
} from '../../core/schema/outline-generation-baseline.js';
import { strictCodec, stringCodec } from './common.js';
import { param, remoteContribution, remoteInvocation } from './shared.js';

/** I108 additive baseline namespace; the baseline is Host evidence, not a B5/C5 editor. */
const baselineInvocation = <const M extends string, const P extends readonly InvocationParameterDescriptor[], const R extends TypertCodec>(
  method: M,
  parameters: P,
  result: R,
) => remoteInvocation('novelOutlineGenerationBaseline', method, parameters, result);

const projectParameter = param('projectId', stringCodec);
const createInput = param('input', strictCodec('novel-creation-tool#novelOutlineGenerationBaseline:createInput', outlineGenerationBaselineCreateInputSchema));
const currentInput = param('input', strictCodec('novel-creation-tool#novelOutlineGenerationBaseline:currentInput', outlineGenerationBaselineCurrentInputSchema));
const attachInput = param('input', strictCodec('novel-creation-tool#novelOutlineGenerationBaseline:attachGeneratedInput', outlineGenerationBaselineAttachGeneratedInputSchema));
const readResult = strictCodec('novel-creation-tool#novelOutlineGenerationBaseline:read', outlineGenerationBaselineReadResultSchema);
const currentResult = strictCodec('novel-creation-tool#novelOutlineGenerationBaseline:current', outlineGenerationBaselineCurrentResultSchema);

export const outlineGenerationBaselineCreateInvocation = baselineInvocation('create', [projectParameter, createInput], readResult);
export const outlineGenerationBaselineReadInvocation = baselineInvocation('read', [projectParameter, param('baselineId', stringCodec)], readResult);
export const outlineGenerationBaselineCurrentInvocation = baselineInvocation('current', [projectParameter, currentInput], currentResult);
export const outlineGenerationBaselineAttachGeneratedInvocation = baselineInvocation('attachGenerated', [projectParameter, attachInput], readResult);

export const outlineGenerationBaselineInvocations = [
  outlineGenerationBaselineCreateInvocation,
  outlineGenerationBaselineReadInvocation,
  outlineGenerationBaselineCurrentInvocation,
  outlineGenerationBaselineAttachGeneratedInvocation,
] as const;

export const outlineGenerationBaselineRemoteContribution = remoteContribution(
  'novel-creation-tool-outline-generation-baseline',
  outlineGenerationBaselineInvocations,
);
