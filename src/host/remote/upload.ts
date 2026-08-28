import type { InvocationParameterDescriptor } from '@deepseek-ai/dsh-typert-protocol';
import { z } from 'zod';
import { strictCodec, stringCodec, numberCodec } from './common.js';
import { param, remoteContribution, remoteInvocation } from './shared.js';
import {
  uploadChunkResultSchema,
  uploadFinalizeResultSchema,
  uploadStartInputSchema,
  uploadStartResultSchema,
} from '../../core/schema/upload.js';

// I75：`param` 统一到 shared 接线层；`uploadInvocation` 只保留 strictCodec 包装
// （保持既有 typeSymbol `novel-creation-tool#${method}:result`，见架构审查 §6.3/§9#1）。
// I91：helper 泛型透传（不标注 `: InvocationDescriptor` 返回类型），否则幻影类型被扩宽抹掉。
const uploadInvocation = <const M extends string, const P extends readonly InvocationParameterDescriptor[], Out>(
  method: M,
  parameters: P,
  resultSchema: { parse(value: unknown): Out },
) => remoteInvocation('novelWorkspace', method, parameters, strictCodec(`novel-creation-tool#${method}:result`, resultSchema));

export const uploadStartInvocation = uploadInvocation('uploadStart', [param('input', strictCodec('novel-creation-tool#uploadStartInput', uploadStartInputSchema))], uploadStartResultSchema);
export const uploadChunkInvocation = uploadInvocation('uploadChunk', [param('uploadId', stringCodec), param('index', numberCodec), param('base64', stringCodec)], uploadChunkResultSchema);
export const uploadFinalizeInvocation = uploadInvocation('uploadFinalize', [param('uploadId', stringCodec)], uploadFinalizeResultSchema);
export const uploadCancelInvocation = uploadInvocation('uploadCancel', [param('uploadId', stringCodec)], z.object({ ok: z.literal(true) }));
export const uploadInvocations = [uploadStartInvocation, uploadChunkInvocation, uploadFinalizeInvocation, uploadCancelInvocation] as const;
// I91：不标注 `: TypertRemoteContribution` —— 保留 descriptor 元素类型供 Client 派生 namespace。
export const uploadRemoteContribution = remoteContribution('novel-creation-tool', uploadInvocations);
