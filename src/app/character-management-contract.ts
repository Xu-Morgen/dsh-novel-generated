import { z } from 'zod';
import { entityIdSchema } from '../core/schema/base.js';
import { characterLifecycleStatusSchema } from '../core/characters/lifecycle.js';
import type { IpcCodec, IpcMethodDescriptor } from './ipc-registry.js';

/** Strict additive lifecycle operations; B3 and existing character methods are unchanged. */
export const characterManagementProjectSchema=z.object({projectId:entityIdSchema}).strict();
export const characterManagementInputSchema=characterManagementProjectSchema.extend({characterId:entityIdSchema,action:z.enum(['freeze','restore','delete'])});
export const characterManagementListSchema=z.array(z.object({id:entityIdSchema,name:z.string(),status:characterLifecycleStatusSchema}).strict());
export const characterManagementPreviewSchema=characterManagementInputSchema.extend({proposalId:entityIdSchema.nullable(),name:z.string(),references:z.array(z.object({layer:z.string(),count:z.number().int().nonnegative()}).strict()),allowed:z.boolean(),message:z.string()});
export const characterManagementDecisionSchema=characterManagementProjectSchema.extend({proposalId:entityIdSchema,accept:z.boolean()});
export const characterManagementResultSchema=z.object({status:z.enum(['done','rejected','stale']),message:z.string()}).strict();
export type CharacterManagementPreview=z.infer<typeof characterManagementPreviewSchema>;
export interface CharacterManagementNamespace{
  characterManageList(input:z.infer<typeof characterManagementProjectSchema>):Promise<z.infer<typeof characterManagementListSchema>>;
  characterManagePropose(input:z.infer<typeof characterManagementInputSchema>):Promise<CharacterManagementPreview>;
  characterManageDecide(input:z.infer<typeof characterManagementDecisionSchema>):Promise<z.infer<typeof characterManagementResultSchema>>;
}
const codec=<T>(name:string,schema:z.ZodType<T>):IpcCodec<T>=>({mode:'strict',typeSymbol:`novel-creation-tool#${name}`,schema:z.toJSONSchema(schema) as IpcCodec['schema'],parse:value=>schema.parse(value)});
const descriptor=(method:keyof CharacterManagementNamespace,input:IpcCodec,result:IpcCodec):IpcMethodDescriptor=>({id:`novel-creation-tool/novelWorkspace/${method}`,service:'novelWorkspace',namespace:'novelWorkspace',method,parameters:[{name:'input',wire:'input',codec:input}],result});
export const characterManagementDescriptors=[
  descriptor('characterManageList',codec('characterManagementProject',characterManagementProjectSchema),codec('characterManagementList',characterManagementListSchema)),
  descriptor('characterManagePropose',codec('characterManagementInput',characterManagementInputSchema),codec('characterManagementPreview',characterManagementPreviewSchema)),
  descriptor('characterManageDecide',codec('characterManagementDecision',characterManagementDecisionSchema),codec('characterManagementResult',characterManagementResultSchema)),
] as const;
