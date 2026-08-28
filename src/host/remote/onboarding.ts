import type { InvocationParameterDescriptor, TypertCodec } from '@deepseek-ai/dsh-typert-protocol';
import { z } from 'zod';
import { strictCodec, stringCodec } from './common.js';
import { param, remoteContribution, remoteInvocation } from './shared.js';
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
// I75：`param`/`onboardingInvocation` 统一到 shared 接线层（见架构审查 §6.3/§9#1）。
// I91：helper 泛型透传（不标注 `: InvocationDescriptor` 返回类型），否则幻影类型被扩宽抹掉。
const onboardingInvocation = <const M extends string, const P extends readonly InvocationParameterDescriptor[], const R extends TypertCodec>(
  method: M,
  parameters: P,
  resultSchema: R,
  service = 'novelOnboarding',
) => remoteInvocation(service, method, parameters, resultSchema);

export const onboardingAdjudicateInvocation = onboardingInvocation('adjudicate', [
  param('input', strictCodec('novel-creation-tool#onboardingAdjudicateInput', onboardingAdjudicateInputSchema)),
  param('settings', undefined, true),
], strictCodec('novel-creation-tool#onboardingAdjudicate:result', confirmationRecordSchema));
export const onboardingAcceptedLayersInvocation = onboardingInvocation('acceptedLayers', [param('onboardingSessionId', stringCodec)], strictCodec('novel-creation-tool#onboardingAcceptedLayers', z.array(z.json())));
export const onboardingFinalApplyInvocation = onboardingInvocation('finalApply', [param('input', strictCodec('novel-creation-tool#onboardingFinalApplyInput', onboardingFinalApplyInputSchema))], strictCodec('novel-creation-tool#onboardingFinalApply:result', onboardingApplyResultSchema));
export const onboardingInvocations = [onboardingAdjudicateInvocation, onboardingAcceptedLayersInvocation, onboardingFinalApplyInvocation] as const;
// Unique `package` per client-mounted contribution (see editor.ts note).
// I91：不标注 `: TypertRemoteContribution` —— 保留 descriptor 元素类型供 Client 派生 namespace。
export const onboardingRemoteContribution = remoteContribution('novel-creation-tool-onboarding', onboardingInvocations);
