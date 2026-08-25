import type { InvocationDescriptor, InvocationParameterDescriptor, TypertCodec, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import { z } from 'zod';
import { strictCodec, stringCodec } from './common.js';
import {
  onboardingAdjudicateInputSchema,
  onboardingApplyResultSchema,
  onboardingFinalApplyInputSchema,
} from '../../core/schema/onboarding.js';
import { confirmationRecordSchema } from '../../core/schema/confirm.js';

/**
 * I53 onboarding adjudication Remote: per-layer verdicts and the final apply
 * both cross the Host/Client seam as strict JSON. `adjudicate` returns the Gate
 * record (accepted, or a new pending successor); `finalApply` returns the
 * minimal structured `partial-retryable` result.
 */
const param = (name: string, codec: TypertCodec = strictCodec('novel-creation-tool#json', z.unknown())): InvocationParameterDescriptor => ({ name, wire: name, source: 'json', codec });

function onboardingInvocation(method: string, parameters: readonly InvocationParameterDescriptor[], resultSchema: TypertCodec, service = 'novelOnboarding'): InvocationDescriptor {
  return { id: `novel-creation-tool/${service}/${method}`, service, namespace: service, method, invocation: { kind: 'direct' }, parameters, result: resultSchema };
}

export const onboardingAdjudicateInvocation = onboardingInvocation('adjudicate', [
  param('input', strictCodec('novel-creation-tool#onboardingAdjudicateInput', onboardingAdjudicateInputSchema)),
  param('settings'),
], strictCodec('novel-creation-tool#onboardingAdjudicate:result', confirmationRecordSchema));
export const onboardingAcceptedLayersInvocation = onboardingInvocation('acceptedLayers', [param('onboardingSessionId', stringCodec)], strictCodec('novel-creation-tool#onboardingAcceptedLayers', z.array(z.json())));
export const onboardingFinalApplyInvocation = onboardingInvocation('finalApply', [param('input', strictCodec('novel-creation-tool#onboardingFinalApplyInput', onboardingFinalApplyInputSchema))], strictCodec('novel-creation-tool#onboardingFinalApply:result', onboardingApplyResultSchema));
export const onboardingInvocations = [onboardingAdjudicateInvocation, onboardingAcceptedLayersInvocation, onboardingFinalApplyInvocation] as const;
export const onboardingRemoteContribution: TypertRemoteContribution = { package: 'novel-creation-tool', descriptors: [...onboardingInvocations] };
