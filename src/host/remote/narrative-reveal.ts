import type { InvocationParameterDescriptor, TypertCodec } from '@deepseek-ai/dsh-typert-protocol';
import { strictCodec } from './common.js';
import { param, remoteContribution, remoteInvocation } from './shared.js';
import {
  narrativeRevealIdentitySchema,
  narrativeRevealInputSchema,
  narrativeRevealResultSchema,
  narrativeRevealBeginResultSchema,
  narrativeRevealStatusResultSchema,
} from '../../core/schema/narrative-reveal.js';

/** I146 additive, candidate-only C3 reveal planner Remote. */
const revealInvocation = <const M extends string, const P extends readonly InvocationParameterDescriptor[], const R extends TypertCodec>(method: M, parameters: P, result: R) => remoteInvocation('novelNarrativeReveal', method, parameters, result);
const identityParameter = () => param('input', strictCodec('novel-creation-tool#narrativeRevealIdentity', narrativeRevealIdentitySchema));

export const narrativeRevealBeginInvocation = revealInvocation('begin', [
  param('input', strictCodec('novel-creation-tool#narrativeRevealInput', narrativeRevealInputSchema)),
  param('settings', undefined, true),
], strictCodec('novel-creation-tool#narrativeRevealBegin', narrativeRevealBeginResultSchema));
export const narrativeRevealStatusInvocation = revealInvocation('status', [identityParameter()], strictCodec('novel-creation-tool#narrativeRevealStatus', narrativeRevealStatusResultSchema));
export const narrativeRevealCancelInvocation = revealInvocation('cancel', [identityParameter()], strictCodec('novel-creation-tool#narrativeRevealCancel', narrativeRevealStatusResultSchema));
export const narrativeRevealResultInvocation = revealInvocation('result', [identityParameter()], strictCodec('novel-creation-tool#narrativeRevealResult', narrativeRevealResultSchema));
export const narrativeRevealInvocations = [narrativeRevealBeginInvocation, narrativeRevealStatusInvocation, narrativeRevealCancelInvocation, narrativeRevealResultInvocation] as const;
export const narrativeRevealRemoteContribution = remoteContribution('novel-creation-tool-narrative-reveal', narrativeRevealInvocations);
