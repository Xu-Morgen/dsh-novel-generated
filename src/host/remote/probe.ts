import type { InvocationDescriptor, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry';
import { z } from 'zod';
import { strictCodec } from './common.js';
import { remoteContribution, remoteInvocation } from './shared.js';

const probeDataSchema = z.object({ marker: z.string(), ready: z.boolean() });
export const NOVEL_PROBE_NAMESPACE = 'novelProbe';
export const PROBE_MARKER = 'I2-PROBE';
export interface ProbeData { readonly marker: string; readonly ready: boolean; }
export function probeData(): ProbeData { return { marker: PROBE_MARKER, ready: true }; }
// I75：手写 descriptor 收敛到统一 `remoteInvocation`（见架构审查 §6.3/§9#1）。
export const probeInvocation: InvocationDescriptor = remoteInvocation(NOVEL_PROBE_NAMESPACE, 'probe', [], strictCodec('novel-creation-tool#probeData', probeDataSchema));
export const probeContribution: TypertContribution = {
  package: 'novel-creation-tool', face: 'host', schemas: [], model: { services: [], events: [], objects: [] }, invocations: [probeInvocation],
};
export const probeRemoteContribution: TypertRemoteContribution = remoteContribution('novel-creation-tool', [probeInvocation]);
