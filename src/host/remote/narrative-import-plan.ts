import type { InvocationParameterDescriptor, TypertCodec } from '@deepseek-ai/dsh-typert-protocol';
import { strictCodec } from './common.js';
import { param, remoteContribution, remoteInvocation } from './shared.js';
import {
  narrativeImportPlanIdentitySchema,
  narrativeImportPlanInputSchema,
  narrativeImportPlanResultSchema,
} from '../../core/schema/narrative-import-plan.js';

/** I148 one-preview/one-confirmation plan Remote; C5 is intentionally absent. */
const planInvocation = <const M extends string, const P extends readonly InvocationParameterDescriptor[], const R extends TypertCodec>(method: M, parameters: P, result: R) => remoteInvocation('novelNarrativeImportPlan', method, parameters, result);
const identityParameter = () => param('input', strictCodec('novel-creation-tool#narrativeImportPlanIdentity', narrativeImportPlanIdentitySchema));

export const narrativeImportPlanProposeInvocation = planInvocation('propose', [param('input', strictCodec('novel-creation-tool#narrativeImportPlanInput', narrativeImportPlanInputSchema))], strictCodec('novel-creation-tool#narrativeImportPlanPropose', narrativeImportPlanResultSchema));
export const narrativeImportPlanReadInvocation = planInvocation('read', [identityParameter()], strictCodec('novel-creation-tool#narrativeImportPlanRead', narrativeImportPlanResultSchema));
export const narrativeImportPlanAcceptInvocation = planInvocation('accept', [identityParameter()], strictCodec('novel-creation-tool#narrativeImportPlanAccept', narrativeImportPlanResultSchema));
export const narrativeImportPlanRejectInvocation = planInvocation('reject', [identityParameter()], strictCodec('novel-creation-tool#narrativeImportPlanReject', narrativeImportPlanResultSchema));
export const narrativeImportPlanRecoverInvocation = planInvocation('recover', [identityParameter()], strictCodec('novel-creation-tool#narrativeImportPlanRecover', narrativeImportPlanResultSchema));
export const narrativeImportPlanInvocations = [narrativeImportPlanProposeInvocation, narrativeImportPlanReadInvocation, narrativeImportPlanAcceptInvocation, narrativeImportPlanRejectInvocation, narrativeImportPlanRecoverInvocation] as const;
export const narrativeImportPlanRemoteContribution = remoteContribution('novel-creation-tool-narrative-import-plan', narrativeImportPlanInvocations);
