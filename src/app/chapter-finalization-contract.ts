import { z } from 'zod';
import { entityIdSchema } from '../core/schema/base.js';
import { finalizationLayerChangeSchema } from '../core/schema/finalization.js';
import type { IpcCodec, IpcMethodDescriptor } from './ipc-registry.js';

/** I217: chapter identity resolves saved prose in Main, independent of candidate sessions. */
export const chapterTargetSchema = z.object({ projectId: entityIdSchema, chapterId: entityIdSchema }).strict();
export const chapterManuscriptSchema = chapterTargetSchema.extend({
  title: z.string(), status: z.enum(['draft', 'revised', 'canon']), sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  scenes: z.array(z.object({ id: entityIdSchema, index: z.number().int().nonnegative(), content: z.string() }).strict()),
}).strict();
export const chapterAnalysisSchema = chapterTargetSchema.extend({
  proposalId: entityIdSchema, sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  sceneCount: z.number().int().positive(), emptySceneCount: z.number().int().nonnegative(),
  completedBeatCount: z.number().int().nonnegative(),
  changes: finalizationLayerChangeSchema.array().max(512),
}).strict();
export const chapterDecisionSchema = z.object({ projectId: entityIdSchema, proposalId: entityIdSchema, accept: z.boolean() }).strict();
export const chapterDecisionResultSchema = z.object({
  chapterId: entityIdSchema, status: z.enum(['done', 'rejected', 'stale', 'partial-failure']),
  message: z.string().max(300), nextChapterId: entityIdSchema.nullable(),
}).strict();
export type ChapterManuscript = z.infer<typeof chapterManuscriptSchema>;
export type ChapterAnalysis = z.infer<typeof chapterAnalysisSchema>;
export type ChapterDecisionResult = z.infer<typeof chapterDecisionResultSchema>;
/** Additive strict chapter workflow; existing scene methods retain their contracts. */
export interface ChapterFinalizationNamespace {
  chapterManuscript(input: z.infer<typeof chapterTargetSchema>): Promise<ChapterManuscript>;
  chapterAnalyze(input: z.infer<typeof chapterTargetSchema>): Promise<ChapterAnalysis>;
  chapterFinalize(input: z.infer<typeof chapterDecisionSchema>): Promise<ChapterDecisionResult>;
}
const codec = <T>(name: string, schema: z.ZodType<T>): IpcCodec<T> => ({ mode: 'strict', typeSymbol: `novel-creation-tool#${name}`, schema: z.toJSONSchema(schema) as IpcCodec['schema'], parse: value => schema.parse(value) });
const descriptor = (method: keyof ChapterFinalizationNamespace, input: IpcCodec, result: IpcCodec): IpcMethodDescriptor => ({ id: `novel-creation-tool/novelWorkspace/${method}`, service: 'novelWorkspace', namespace: 'novelWorkspace', method, parameters: [{ name: 'input', wire: 'input', codec: input }], result });
export const chapterFinalizationDescriptors = [
  descriptor('chapterManuscript', codec('chapterTarget', chapterTargetSchema), codec('chapterManuscript', chapterManuscriptSchema)),
  descriptor('chapterAnalyze', codec('chapterTarget', chapterTargetSchema), codec('chapterAnalysis', chapterAnalysisSchema)),
  descriptor('chapterFinalize', codec('chapterDecision', chapterDecisionSchema), codec('chapterDecisionResult', chapterDecisionResultSchema)),
] as const;
