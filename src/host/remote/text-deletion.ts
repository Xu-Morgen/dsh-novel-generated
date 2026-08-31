import type { InvocationParameterDescriptor, TypertCodec } from '@deepseek-ai/dsh-typert-protocol';
import {
  textDeletionApplyResultSchema,
  textDeletionImpactResultSchema,
  textDeletionProposeResultSchema,
  textDeletionRejectResultSchema,
  textDeletionTargetSchema,
} from '../../core/schema/text-deletion.js';
import { strictCodec, stringCodec } from './common.js';
import { param, remoteContribution, remoteInvocation } from './shared.js';

/**
 * I106 additive deletion Remote. The four methods are the complete public
 * surface: impact is read-only, propose creates one I11 record, apply performs
 * binding-first/C5-second deletion, and reject discards the proposal.
 */
const deletionInvocation = <const M extends string, const P extends readonly InvocationParameterDescriptor[], const R extends TypertCodec>(
  method: M,
  parameters: P,
  result: R,
) => remoteInvocation('novelTextDeletion', method, parameters, result);

const projectParameter = param('projectId', stringCodec);
const targetParameter = param('target', strictCodec('novel-creation-tool#novelTextDeletion:target', textDeletionTargetSchema));
const proposalParameter = param('proposalId', stringCodec);
const fingerprintParameter = param('expectedImpactFingerprint', stringCodec);

export const textDeletionImpactInvocation = deletionInvocation('impact', [projectParameter, targetParameter], strictCodec('novel-creation-tool#novelTextDeletion:impact', textDeletionImpactResultSchema));
export const textDeletionProposeInvocation = deletionInvocation('propose', [projectParameter, targetParameter, fingerprintParameter], strictCodec('novel-creation-tool#novelTextDeletion:propose', textDeletionProposeResultSchema));
export const textDeletionApplyInvocation = deletionInvocation('apply', [projectParameter, proposalParameter], strictCodec('novel-creation-tool#novelTextDeletion:apply', textDeletionApplyResultSchema));
export const textDeletionRejectInvocation = deletionInvocation('reject', [projectParameter, proposalParameter], strictCodec('novel-creation-tool#novelTextDeletion:reject', textDeletionRejectResultSchema));

export const textDeletionInvocations = [
  textDeletionImpactInvocation,
  textDeletionProposeInvocation,
  textDeletionApplyInvocation,
  textDeletionRejectInvocation,
] as const;

export const textDeletionRemoteContribution = remoteContribution('novel-creation-tool-text-deletion', textDeletionInvocations);
