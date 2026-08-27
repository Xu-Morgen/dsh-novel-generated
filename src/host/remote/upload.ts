import type { InvocationDescriptor, InvocationParameterDescriptor, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
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
const uploadInvocation = (method: string, parameters: readonly InvocationParameterDescriptor[], resultSchema: { parse(value: unknown): unknown }): InvocationDescriptor =>
  remoteInvocation('novelWorkspace', method, parameters, strictCodec(`novel-creation-tool#${method}:result`, resultSchema));

export const uploadStartInvocation = uploadInvocation('uploadStart', [param('input', strictCodec('novel-creation-tool#uploadStartInput', uploadStartInputSchema))], uploadStartResultSchema);
export const uploadChunkInvocation = uploadInvocation('uploadChunk', [param('uploadId', stringCodec), param('index', numberCodec), param('base64', stringCodec)], uploadChunkResultSchema);
export const uploadFinalizeInvocation = uploadInvocation('uploadFinalize', [param('uploadId', stringCodec)], uploadFinalizeResultSchema);
export const uploadCancelInvocation = uploadInvocation('uploadCancel', [param('uploadId', stringCodec)], z.object({ ok: z.literal(true) }));
export const uploadInvocations = [uploadStartInvocation, uploadChunkInvocation, uploadFinalizeInvocation, uploadCancelInvocation] as const;
export const uploadRemoteContribution: TypertRemoteContribution = remoteContribution('novel-creation-tool', uploadInvocations);
