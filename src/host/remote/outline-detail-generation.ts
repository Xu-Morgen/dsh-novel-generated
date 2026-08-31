import type { InvocationParameterDescriptor, TypertCodec } from '@deepseek-ai/dsh-typert-protocol';
import { GenerationSettingsSchema } from '../../core/schema/generation-settings.js';
import {
  outlineDetailGenerationAcceptResultSchema,
  outlineDetailGenerationCandidateInputSchema,
  outlineDetailGenerationCandidateSchema,
  outlineDetailGenerationCancelResultSchema,
  outlineDetailGenerationEditInputSchema,
  outlineDetailGenerationGenerateInputSchema,
  outlineDetailGenerationRegenerateInputSchema,
  outlineDetailGenerationRejectResultSchema,
  outlineDetailGenerationSkipInputSchema,
  outlineDetailGenerationProposeResultSchema,
} from '../../core/schema/outline-detail-generation.js';
import { strictCodec, stringCodec } from './common.js';
import { param, remoteContribution, remoteInvocation } from './shared.js';

const detailInvocation = <const M extends string, const P extends readonly InvocationParameterDescriptor[], const R extends TypertCodec>(method: M, parameters: P, result: R) =>
  remoteInvocation('novelOutlineDetailGeneration', method, parameters, result);
const projectParameter = param('projectId', stringCodec);
const settingsParameter = param('settings', strictCodec('novel-creation-tool#generationSettings', GenerationSettingsSchema.optional()), true);
const candidateParameter = (name: 'input' | 'candidate') => param(name, strictCodec(`novel-creation-tool#novelOutlineDetailGeneration:${name}`, outlineDetailGenerationCandidateInputSchema));

export const outlineDetailGenerationGenerateInvocation = detailInvocation('generate', [projectParameter, param('input', strictCodec('novel-creation-tool#novelOutlineDetailGeneration:generateInput', outlineDetailGenerationGenerateInputSchema)), settingsParameter], strictCodec('novel-creation-tool#novelOutlineDetailGeneration:candidate', outlineDetailGenerationCandidateSchema));
export const outlineDetailGenerationReadInvocation = detailInvocation('read', [projectParameter, param('candidateId', stringCodec)], strictCodec('novel-creation-tool#novelOutlineDetailGeneration:read', outlineDetailGenerationCandidateSchema));
export const outlineDetailGenerationEditInvocation = detailInvocation('edit', [projectParameter, param('input', strictCodec('novel-creation-tool#novelOutlineDetailGeneration:editInput', outlineDetailGenerationEditInputSchema))], strictCodec('novel-creation-tool#novelOutlineDetailGeneration:edit', outlineDetailGenerationCandidateSchema));
export const outlineDetailGenerationRegenerateInvocation = detailInvocation('regenerate', [projectParameter, param('input', strictCodec('novel-creation-tool#novelOutlineDetailGeneration:regenerateInput', outlineDetailGenerationRegenerateInputSchema)), settingsParameter], strictCodec('novel-creation-tool#novelOutlineDetailGeneration:regenerate', outlineDetailGenerationCandidateSchema));
export const outlineDetailGenerationSkipInvocation = detailInvocation('skip', [projectParameter, param('input', strictCodec('novel-creation-tool#novelOutlineDetailGeneration:skipInput', outlineDetailGenerationSkipInputSchema))], strictCodec('novel-creation-tool#novelOutlineDetailGeneration:skip', outlineDetailGenerationCandidateSchema));
export const outlineDetailGenerationProposeInvocation = detailInvocation('propose', [projectParameter, candidateParameter('candidate')], strictCodec('novel-creation-tool#novelOutlineDetailGeneration:propose', outlineDetailGenerationProposeResultSchema));
export const outlineDetailGenerationAcceptInvocation = detailInvocation('accept', [projectParameter, param('proposalId', stringCodec)], strictCodec('novel-creation-tool#novelOutlineDetailGeneration:accept', outlineDetailGenerationAcceptResultSchema));
export const outlineDetailGenerationRejectInvocation = detailInvocation('reject', [projectParameter, param('proposalId', stringCodec)], strictCodec('novel-creation-tool#novelOutlineDetailGeneration:reject', outlineDetailGenerationRejectResultSchema));
export const outlineDetailGenerationCancelInvocation = detailInvocation('cancel', [projectParameter, param('candidateId', stringCodec)], strictCodec('novel-creation-tool#novelOutlineDetailGeneration:cancel', outlineDetailGenerationCancelResultSchema));

export const outlineDetailGenerationInvocations = [
  outlineDetailGenerationGenerateInvocation,
  outlineDetailGenerationReadInvocation,
  outlineDetailGenerationEditInvocation,
  outlineDetailGenerationRegenerateInvocation,
  outlineDetailGenerationSkipInvocation,
  outlineDetailGenerationProposeInvocation,
  outlineDetailGenerationAcceptInvocation,
  outlineDetailGenerationRejectInvocation,
  outlineDetailGenerationCancelInvocation,
] as const;
export const outlineDetailGenerationRemoteContribution = remoteContribution('novel-creation-tool-outline-detail-generation', outlineDetailGenerationInvocations);
