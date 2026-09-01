import type { InvocationParameterDescriptor, TypertCodec } from '@deepseek-ai/dsh-typert-protocol';
import { strictCodec } from './common.js';
import { param, remoteContribution, remoteInvocation } from './shared.js';
import {
  narrativeAdaptationBeginResultSchema,
  narrativeAdaptationIdentitySchema,
  narrativeAdaptationInputSchema,
  narrativeAdaptationResultSchema,
  narrativeAdaptationStatusResultSchema,
} from '../../core/schema/narrative-adaptation.js';

/** I145 additive, candidate-only POV adaptation Remote. */
const adaptationInvocation = <const M extends string, const P extends readonly InvocationParameterDescriptor[], const R extends TypertCodec>(method: M, parameters: P, result: R) => remoteInvocation('novelNarrativeAdaptation', method, parameters, result);
const identityParameter = () => param('input', strictCodec('novel-creation-tool#narrativeAdaptationIdentity', narrativeAdaptationIdentitySchema));

export const narrativeAdaptationBeginInvocation = adaptationInvocation('begin', [
  param('input', strictCodec('novel-creation-tool#narrativeAdaptationInput', narrativeAdaptationInputSchema)),
  param('settings', undefined, true),
], strictCodec('novel-creation-tool#narrativeAdaptationBegin', narrativeAdaptationBeginResultSchema));
export const narrativeAdaptationStatusInvocation = adaptationInvocation('status', [identityParameter()], strictCodec('novel-creation-tool#narrativeAdaptationStatus', narrativeAdaptationStatusResultSchema));
export const narrativeAdaptationCancelInvocation = adaptationInvocation('cancel', [identityParameter()], strictCodec('novel-creation-tool#narrativeAdaptationCancel', narrativeAdaptationStatusResultSchema));
export const narrativeAdaptationResultInvocation = adaptationInvocation('result', [identityParameter()], strictCodec('novel-creation-tool#narrativeAdaptationResult', narrativeAdaptationResultSchema));
export const narrativeAdaptationInvocations = [narrativeAdaptationBeginInvocation, narrativeAdaptationStatusInvocation, narrativeAdaptationCancelInvocation, narrativeAdaptationResultInvocation] as const;
export const narrativeAdaptationRemoteContribution = remoteContribution('novel-creation-tool-narrative-adaptation', narrativeAdaptationInvocations);
