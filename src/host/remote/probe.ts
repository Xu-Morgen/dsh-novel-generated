import type { InvocationDescriptor, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry';
import { z } from 'zod';
import { strictCodec } from './common.js';

const probeDataSchema = z.object({ marker: z.string(), ready: z.boolean() });
export const NOVEL_PROBE_NAMESPACE = 'novelProbe';
export const PROBE_MARKER = 'I2-PROBE';
export interface ProbeData { readonly marker: string; readonly ready: boolean; }
export function probeData(): ProbeData { return { marker: PROBE_MARKER, ready: true }; }
export const probeInvocation: InvocationDescriptor = {
  id: 'novel-creation-tool/novelProbe/probe', service: NOVEL_PROBE_NAMESPACE,
  namespace: NOVEL_PROBE_NAMESPACE, method: 'probe', invocation: { kind: 'direct' }, parameters: [],
  result: strictCodec('novel-creation-tool#probeData', probeDataSchema),
};
export const probeContribution: TypertContribution = {
  package: 'novel-creation-tool', face: 'host', schemas: [], model: { services: [], events: [], objects: [] }, invocations: [probeInvocation],
};
export const probeRemoteContribution: TypertRemoteContribution = { package: 'novel-creation-tool', descriptors: [probeInvocation] };
