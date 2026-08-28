import type { InvocationParameterDescriptor, TypertCodec } from '@deepseek-ai/dsh-typert-protocol';
import { strictCodec } from './common.js';
import { param, remoteContribution, remoteInvocation } from './shared.js';
import { llmConfigSaveInputSchema, llmConfigSaveResultSchema, llmConfigViewSchema } from '../../core/schema/llm-config.js';

/**
 * LLM 设置页 Remote：`load` 回显（不含 Key）、`save` 落盘三处 DSH 本地文件。
 * 浏览器只提交 Key 一次，永不读回。
 */
// I75：`param`/`llmConfigInvocation` 统一到 shared 接线层（见架构审查 §6.3/§9#1）。
// I91：helper 泛型透传（不标注 `: InvocationDescriptor` 返回类型），否则幻影类型被扩宽抹掉。
const llmConfigInvocation = <const M extends string, const P extends readonly InvocationParameterDescriptor[], const R extends TypertCodec>(
  method: M,
  parameters: P,
  resultSchema: R,
) => remoteInvocation('novelLlmConfig', method, parameters, resultSchema);

export const llmConfigLoadInvocation = llmConfigInvocation('load', [], strictCodec('novel-creation-tool#llmConfigView', llmConfigViewSchema));
export const llmConfigSaveInvocation = llmConfigInvocation('save', [param('input', strictCodec('novel-creation-tool#llmConfigSaveInput', llmConfigSaveInputSchema))], strictCodec('novel-creation-tool#llmConfigSaveResult', llmConfigSaveResultSchema));
export const llmConfigInvocations = [llmConfigLoadInvocation, llmConfigSaveInvocation] as const;
// Unique `package` per client-mounted contribution (see editor.ts note).
// I91：不标注 `: TypertRemoteContribution` —— 保留 descriptor 元素类型供 Client 派生 namespace。
export const llmConfigRemoteContribution = remoteContribution('novel-creation-tool-llm-config', llmConfigInvocations);
