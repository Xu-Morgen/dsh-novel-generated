import { z } from 'zod';
import { entityIdSchema } from '../core/schema/base.js';
import type { IpcCodec, IpcMethodDescriptor } from './ipc-registry.js';

/** I212 explicit saved B5 target; source facts are resolved only by Main. */
export const descriptionTargetSchema = z.discriminatedUnion('kind', [
  z.object({ projectId: entityIdSchema, kind: z.literal('act'), actId: entityIdSchema }).strict(),
  z.object({ projectId: entityIdSchema, kind: z.literal('beat'), actId: entityIdSchema, beatId: entityIdSchema }).strict(),
]);
/** Model output can only replace prose; identity, children and statuses are forbidden. */
export const descriptionOutputSchema = z.object({ description: z.string().trim().min(1).max(1000) }).strict();
/** Author preview and durable I11 identity; no full source snapshot crosses IPC. */
export const descriptionProposalSchema = z.object({ proposalId: entityIdSchema, target: descriptionTargetSchema, before: z.string(), after: z.string().min(1).max(1000), status: z.enum(['pending', 'accepted', 'rejected']) }).strict();
/** Explicit replace-or-retain decision; Main owns freshness and single-field application. */
export const descriptionDecisionSchema = z.object({ projectId: entityIdSchema, proposalId: entityIdSchema, accept: z.boolean() }).strict();
export type DescriptionTarget = z.infer<typeof descriptionTargetSchema>;
export type DescriptionProposal = z.infer<typeof descriptionProposalSchema>;
/** Shared strict Main/Renderer contract; generation proposes, decision uses I11. */
export interface OutlineDescriptionNamespace {
  descriptionGenerate(input: DescriptionTarget): Promise<DescriptionProposal>;
  descriptionDecide(input: z.infer<typeof descriptionDecisionSchema>): Promise<DescriptionProposal>;
}
const codec = <T>(name: string, schema: z.ZodType<T>): IpcCodec<T> => ({ mode: 'strict', typeSymbol: `novel-creation-tool#${name}`, schema: z.toJSONSchema(schema) as IpcCodec['schema'], parse: value => schema.parse(value) });
const descriptor = (method: keyof OutlineDescriptionNamespace, input: IpcCodec): IpcMethodDescriptor => ({ id: `novel-creation-tool/novelWorkspace/${method}`, service: 'novelWorkspace', namespace: 'novelWorkspace', method, parameters: [{ name: 'input', wire: 'input', codec: input }], result: codec('outlineDescriptionProposal', descriptionProposalSchema) });
export const outlineDescriptionDescriptors = [descriptor('descriptionGenerate', codec('outlineDescriptionTarget', descriptionTargetSchema)), descriptor('descriptionDecide', codec('outlineDescriptionDecision', descriptionDecisionSchema))] as const;
