import { z } from 'zod';
import type { IpcCodec, IpcMethodDescriptor } from './ipc-registry.js';
import { narrativeAdaptationInputSchema, narrativeAdaptationIdentitySchema } from '../core/schema/narrative-adaptation.js';
import { narrativeRevealIdentitySchema } from '../core/schema/narrative-reveal.js';
import { onboardingSessionIdSchema } from '../core/schema/onboarding.js';

/** I203 input binds to a successful Main foundation; no caller-supplied character table. */
export const boundAdaptationSchema = z.object({ input: narrativeAdaptationInputSchema, onboardingSessionId: onboardingSessionIdSchema }).strict();
export const repairProgressSchema = z.object({ attempt: z.number().int().min(0).max(2) }).strict();
export interface BoundAdaptationNamespace {
  beginBound(input: z.infer<typeof boundAdaptationSchema>): Promise<z.infer<typeof narrativeAdaptationIdentitySchema>>;
  repairProgress(input: z.infer<typeof narrativeAdaptationIdentitySchema>): Promise<z.infer<typeof repairProgressSchema>>;
}
export interface RevealRepairNamespace {
  repairProgress(input: z.infer<typeof narrativeRevealIdentitySchema>): Promise<z.infer<typeof repairProgressSchema>>;
}
const codec = <T>(name: string, schema: z.ZodType<T>): IpcCodec<T> => ({ mode: 'strict', typeSymbol: `novel-creation-tool#${name}`, schema: z.toJSONSchema(schema) as IpcCodec['schema'], parse: raw => schema.parse(raw) });
const descriptor = (namespace: string, method: string, input: IpcCodec, result: IpcCodec): IpcMethodDescriptor => ({ id: `novel-creation-tool/${namespace}/${method}`, service: namespace, namespace, method, parameters: [{ name: 'input', wire: 'input', codec: input }], result });
export const narrativeRepairDescriptors = [
  descriptor('novelNarrativeAdaptation', 'beginBound', codec('boundAdaptation', boundAdaptationSchema), codec('boundAdaptationIdentity', narrativeAdaptationIdentitySchema)),
  descriptor('novelNarrativeAdaptation', 'repairProgress', codec('adaptationRepairIdentity', narrativeAdaptationIdentitySchema), codec('narrativeRepairProgress', repairProgressSchema)),
  descriptor('novelNarrativeReveal', 'repairProgress', codec('revealRepairIdentity', narrativeRevealIdentitySchema), codec('narrativeRepairProgress', repairProgressSchema)),
] as const;
