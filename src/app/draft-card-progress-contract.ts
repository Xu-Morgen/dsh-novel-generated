import { z } from 'zod';
import { entityIdSchema } from '../core/schema/base.js';
import { detailBeatSchema } from '../core/schema/outline.js';
import { draftAdoptionResultSchema } from '../core/schema/finalization.js';
import type { IpcCodec, IpcMethodDescriptor } from './ipc-registry.js';

/** I216 Main resolves the actual frozen candidate card; Renderer never supplies a card ID. */
export const cardDraftInputSchema = z.object({ candidateId: entityIdSchema }).strict();
export const nextCardDecisionSchema = z.object({ projectId: entityIdSchema, proposalId: entityIdSchema, accept: z.boolean() }).strict();
export const nextCardProposalSchema = z.object({ proposalId: entityIdSchema, card: detailBeatSchema }).strict();
export const cardDraftResultSchema = z.object({ adoption: draftAdoptionResultSchema, completion: z.enum(['pending', 'done']), next: nextCardProposalSchema.nullable() }).strict();
export const nextCardResultSchema = z.object({ status: z.enum(['accepted', 'rejected']) }).strict();
export type CardDraftResult = z.infer<typeof cardDraftResultSchema>;
/** Strict additive author workflow; the old C5-only adoption contract is unchanged. */
export interface DraftCardProgressNamespace {
  sceneCardDraftAdopt(input: z.infer<typeof cardDraftInputSchema>): Promise<CardDraftResult>;
  sceneCardNextDecide(input: z.infer<typeof nextCardDecisionSchema>): Promise<z.infer<typeof nextCardResultSchema>>;
}
const codec = <T>(name: string, schema: z.ZodType<T>): IpcCodec<T> => ({ mode: 'strict', typeSymbol: `novel-creation-tool#${name}`, schema: z.toJSONSchema(schema) as IpcCodec['schema'], parse: value => schema.parse(value) });
const descriptor = (method: keyof DraftCardProgressNamespace, input: IpcCodec, result: IpcCodec): IpcMethodDescriptor => ({ id: `novel-creation-tool/novelWorkspace/${method}`, service: 'novelWorkspace', namespace: 'novelWorkspace', method, parameters: [{ name: 'input', wire: 'input', codec: input }], result });
export const draftCardProgressDescriptors = [descriptor('sceneCardDraftAdopt', codec('cardDraftInput', cardDraftInputSchema), codec('cardDraftResult', cardDraftResultSchema)), descriptor('sceneCardNextDecide', codec('nextCardDecision', nextCardDecisionSchema), codec('nextCardResult', nextCardResultSchema))] as const;
