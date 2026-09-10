import { z } from 'zod';
import { entityIdSchema } from '../core/schema/base.js';
import { characterCoreSchema } from '../core/schema/characters.js';
import { characterStateSchema } from '../core/schema/state.js';
import type { IpcCodec, IpcMethodDescriptor } from './ipc-registry.js';

/** I221 additive contract: explicit identity and author-selected data sources. */
export const mergeChoiceSchema=z.enum(['source','target']);
export const mergeFieldSchema=characterCoreSchema.omit({id:true,version:true}).keyof();
export const characterMergeInputSchema=z.object({projectId:entityIdSchema,sourceId:entityIdSchema,targetId:entityIdSchema,fields:z.array(z.object({field:mergeFieldSchema,from:mergeChoiceSchema}).strict()),stateFrom:mergeChoiceSchema,knowledgeFrom:mergeChoiceSchema}).strict();
export const characterMergePreviewSchema=z.object({proposalId:entityIdSchema,source:characterCoreSchema,target:characterCoreSchema,result:characterCoreSchema,state:characterStateSchema.extend({flags:z.record(z.string(),z.json())}).nullable(),knownFacts:z.array(z.string()),changes:z.array(z.string())}).strict();
export const characterMergeProjectSchema=z.object({projectId:entityIdSchema}).strict();
export const characterMergeDecideSchema=characterMergeProjectSchema.extend({proposalId:entityIdSchema,accept:z.boolean()});
export const characterMergeResultSchema=z.object({status:z.enum(['done','rejected','stale']),message:z.string()}).strict();
export const characterMergePendingSchema=z.array(z.object({proposalId:entityIdSchema,sourceId:entityIdSchema,targetId:entityIdSchema,accepted:z.boolean()}).strict());
export type CharacterMergeInput=z.infer<typeof characterMergeInputSchema>;
export type CharacterMergePreview=z.infer<typeof characterMergePreviewSchema>;
export interface CharacterMergeNamespace{
  characterMergePropose(input:CharacterMergeInput):Promise<CharacterMergePreview>;
  characterMergeDecide(input:z.infer<typeof characterMergeDecideSchema>):Promise<z.infer<typeof characterMergeResultSchema>>;
  characterMergePending(input:z.infer<typeof characterMergeProjectSchema>):Promise<z.infer<typeof characterMergePendingSchema>>;
}
const codec=<T>(name:string,schema:z.ZodType<T>):IpcCodec<T>=>({mode:'strict',typeSymbol:`novel-creation-tool#${name}`,schema:z.toJSONSchema(schema) as IpcCodec['schema'],parse:value=>schema.parse(value)});
const descriptor=(method:keyof CharacterMergeNamespace,input:IpcCodec,result:IpcCodec):IpcMethodDescriptor=>({id:`novel-creation-tool/novelWorkspace/${method}`,service:'novelWorkspace',namespace:'novelWorkspace',method,parameters:[{name:'input',wire:'input',codec:input}],result});
export const characterMergeDescriptors=[
  descriptor('characterMergePropose',codec('characterMergeInput',characterMergeInputSchema),codec('characterMergePreview',characterMergePreviewSchema)),
  descriptor('characterMergeDecide',codec('characterMergeDecide',characterMergeDecideSchema),codec('characterMergeResult',characterMergeResultSchema)),
  descriptor('characterMergePending',codec('characterMergeProject',characterMergeProjectSchema),codec('characterMergePending',characterMergePendingSchema)),
] as const;
