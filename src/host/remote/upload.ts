import type { InvocationDescriptor, InvocationParameterDescriptor, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import { z } from 'zod';
import { strictCodec, stringCodec, numberCodec } from './common.js';
import {
  uploadChunkResultSchema,
  uploadFinalizeResultSchema,
  uploadStartInputSchema,
  uploadStartResultSchema,
} from '../../core/schema/upload.js';

const param = (name: string, codec = strictCodec('novel-creation-tool#json', z.unknown())): InvocationParameterDescriptor => ({ name, wire: name, source: 'json', codec });

function uploadInvocation(method: string, parameters: readonly InvocationParameterDescriptor[], resultSchema: { parse(value: unknown): unknown }): InvocationDescriptor {
  return { id: `novel-creation-tool/novelWorkspace/${method}`, service: 'novelWorkspace', namespace: 'novelWorkspace', method, invocation: { kind: 'direct' }, parameters, result: strictCodec(`novel-creation-tool#${method}:result`, resultSchema) };
}

export const uploadStartInvocation = uploadInvocation('uploadStart', [param('input', strictCodec('novel-creation-tool#uploadStartInput', uploadStartInputSchema))], uploadStartResultSchema);
export const uploadChunkInvocation = uploadInvocation('uploadChunk', [param('uploadId', stringCodec), param('index', numberCodec), param('base64', stringCodec)], uploadChunkResultSchema);
export const uploadFinalizeInvocation = uploadInvocation('uploadFinalize', [param('uploadId', stringCodec)], uploadFinalizeResultSchema);
export const uploadCancelInvocation = uploadInvocation('uploadCancel', [param('uploadId', stringCodec)], z.object({ ok: z.literal(true) }));
export const uploadInvocations = [uploadStartInvocation, uploadChunkInvocation, uploadFinalizeInvocation, uploadCancelInvocation] as const;
export const uploadRemoteContribution: TypertRemoteContribution = { package: 'novel-creation-tool', descriptors: [...uploadInvocations] };
