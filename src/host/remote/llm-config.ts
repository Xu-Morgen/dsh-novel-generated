import type { InvocationDescriptor, InvocationParameterDescriptor, TypertCodec, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import { strictCodec } from './common.js';
import { param, remoteContribution, remoteInvocation } from './shared.js';
import { llmConfigSaveInputSchema, llmConfigSaveResultSchema, llmConfigViewSchema } from '../../core/schema/llm-config.js';

/**
 * LLM 设置页 Remote：`load` 回显（不含 Key）、`save` 落盘三处 DSH 本地文件。
 * 浏览器只提交 Key 一次，永不读回。
 */
// I75：`param`/`llmConfigInvocation` 统一到 shared 接线层（见架构审查 §6.3/§9#1）。
const llmConfigInvocation = (method: string, parameters: readonly InvocationParameterDescriptor[], resultSchema: TypertCodec): InvocationDescriptor =>
  remoteInvocation('novelLlmConfig', method, parameters, resultSchema);

export const llmConfigLoadInvocation = llmConfigInvocation('load', [], strictCodec('novel-creation-tool#llmConfigView', llmConfigViewSchema));
export const llmConfigSaveInvocation = llmConfigInvocation('save', [param('input', strictCodec('novel-creation-tool#llmConfigSaveInput', llmConfigSaveInputSchema))], strictCodec('novel-creation-tool#llmConfigSaveResult', llmConfigSaveResultSchema));
export const llmConfigInvocations = [llmConfigLoadInvocation, llmConfigSaveInvocation] as const;
// Unique `package` per client-mounted contribution (see editor.ts note).
export const llmConfigRemoteContribution: TypertRemoteContribution = remoteContribution('novel-creation-tool-llm-config', llmConfigInvocations);
