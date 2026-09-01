import type { InvocationParameterDescriptor, TypertCodec } from '@deepseek-ai/dsh-typert-protocol';
import { strictCodec } from './common.js';
import { param, remoteContribution, remoteInvocation } from './shared.js';
import {
  ruleStyleImportDecisionInputSchema,
  ruleStyleImportIdentitySchema,
  ruleStyleImportProjectionSchema,
  ruleStyleImportProposeInputSchema,
} from '../../core/schema/rule-style-import-initialization.js';

/** I151 strict additive Remote; only accept crosses the existing B1/B4 owners. */
const invocation = <const M extends string, const P extends readonly InvocationParameterDescriptor[], const R extends TypertCodec>(method: M, parameters: P, result: R) =>
  remoteInvocation('novelRuleStyleImportInitialization', method, parameters, result);
const identity = () => param('input', strictCodec('novel-creation-tool#ruleStyleImportIdentity', ruleStyleImportIdentitySchema));
const projection = strictCodec('novel-creation-tool#ruleStyleImportProjection', ruleStyleImportProjectionSchema);

export const ruleStyleImportInitializationBeginInvocation = invocation('begin', [identity(), param('settings', undefined, true)], projection);
export const ruleStyleImportInitializationStatusInvocation = invocation('status', [identity()], projection);
export const ruleStyleImportInitializationResultInvocation = invocation('result', [identity()], projection);
export const ruleStyleImportInitializationProposeInvocation = invocation('propose', [param('input', strictCodec('novel-creation-tool#ruleStyleImportProposeInput', ruleStyleImportProposeInputSchema))], projection);
export const ruleStyleImportInitializationAcceptInvocation = invocation('accept', [param('input', strictCodec('novel-creation-tool#ruleStyleImportDecisionInput', ruleStyleImportDecisionInputSchema))], projection);
export const ruleStyleImportInitializationRejectInvocation = invocation('reject', [param('input', strictCodec('novel-creation-tool#ruleStyleImportRejectInput', ruleStyleImportDecisionInputSchema))], projection);
export const ruleStyleImportInitializationCancelInvocation = invocation('cancel', [identity()], projection);

export const ruleStyleImportInitializationInvocations = [
  ruleStyleImportInitializationBeginInvocation,
  ruleStyleImportInitializationStatusInvocation,
  ruleStyleImportInitializationResultInvocation,
  ruleStyleImportInitializationProposeInvocation,
  ruleStyleImportInitializationAcceptInvocation,
  ruleStyleImportInitializationRejectInvocation,
  ruleStyleImportInitializationCancelInvocation,
] as const;

export const ruleStyleImportInitializationRemoteContribution = remoteContribution(
  'novel-creation-tool-rule-style-import-initialization',
  ruleStyleImportInitializationInvocations,
);
