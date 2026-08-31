import type { InvocationParameterDescriptor, TypertCodec } from '@deepseek-ai/dsh-typert-protocol';
import { outlineGenerationScopeInputSchema, outlineGenerationScopeResultSchema } from '../../core/schema/outline-generation-scope.js';
import { strictCodec, stringCodec } from './common.js';
import { param, remoteContribution, remoteInvocation } from './shared.js';

/** I133 read-only scope resolver; no LLM call and no B5 write crosses this Remote. */
const scopeInvocation = <const M extends string, const P extends readonly InvocationParameterDescriptor[], const R extends TypertCodec>(method: M, parameters: P, result: R) =>
  remoteInvocation('novelOutlineGenerationScope', method, parameters, result);

export const outlineGenerationScopeResolveInvocation = scopeInvocation('resolve', [
  param('projectId', stringCodec),
  param('input', strictCodec('novel-creation-tool#novelOutlineGenerationScope:input', outlineGenerationScopeInputSchema)),
], strictCodec('novel-creation-tool#novelOutlineGenerationScope:result', outlineGenerationScopeResultSchema));

export const outlineGenerationScopeInvocations = [outlineGenerationScopeResolveInvocation] as const;
export const outlineGenerationScopeRemoteContribution = remoteContribution('novel-creation-tool-outline-generation-scope', outlineGenerationScopeInvocations);
