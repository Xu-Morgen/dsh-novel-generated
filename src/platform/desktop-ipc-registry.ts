import type { InvocationDescriptor, TypertCodec } from '@deepseek-ai/dsh-typert-protocol';
import { z } from 'zod';

import {
  createIpcRegistry,
  type IpcCodec,
  type IpcJsonValue,
  type IpcMethodDescriptor,
  type IpcParameterDescriptor,
  type IpcRegistry,
} from '../app/ipc-registry.js';
import { hostContribution } from '../host/remote/host-contribution.js';
import { reviewRepairInvocations } from '../host/remote/review-repair.js';
import { desktopSaveFileInvocation } from '../desktop/file-dialog-contract.js';
import {
  desktopAssistantAdjudicationResultSchema,
  desktopAssistantContextResultSchema,
  desktopAssistantInspireResultSchema,
  desktopAssistantOpenResultSchema,
  desktopAssistantStatusResponseSchema,
  desktopAssistantCandidateSchema,
  DESKTOP_ASSISTANT_METHOD_IDS,
} from '../core/schema/desktop-assistant.js';
import {
  desktopMigrationExecutionSchema,
  desktopMigrationPreviewSchema,
  desktopMigrationRollbackSchema,
  DESKTOP_MIGRATION_METHOD_IDS,
} from '../core/schema/desktop-migration.js';

/**
 * Current migration adapter from the historical Remote declarations to the
 * framework-neutral desktop registry (design §0.1.1 / plan I171).
 *
 * This is intentionally the only place where the legacy Typert descriptor is
 * translated. The app registry and its dispatcher know only strict parse
 * functions and reviewable JSON Schema contracts; I172 can bind the exported
 * registry without importing individual Remote modules.
 */
const assistantCodec = <Output>(typeSymbol: string, schema: z.ZodType<Output>): IpcCodec<Output> => Object.freeze({
  mode: 'strict' as const,
  typeSymbol,
  schema: z.toJSONSchema(schema) as IpcJsonValue,
  parse: (value: unknown) => schema.parse(value),
});

const assistantParameter = <Output>(name: string, codec: IpcCodec<Output>, acceptsUndefined = false): IpcParameterDescriptor<Output> => Object.freeze({
  name,
  wire: name,
  codec,
  ...(acceptsUndefined ? { acceptsUndefined: true as const } : {}),
});

const assistantProjectId = assistantCodec('novel-creation-tool#desktopAssistant:projectId', z.string().min(1).max(64));
const assistantCandidateId = assistantCodec('novel-creation-tool#desktopAssistant:candidateId', z.string().min(1).max(128));
const assistantDecision = assistantCodec('novel-creation-tool#desktopAssistant:decision', z.enum(['accept', 'reject', 'rewrite']));
const assistantOptionalId = assistantCodec('novel-creation-tool#desktopAssistant:optionalId', z.string().min(1).max(64));
const migrationOperationId = assistantCodec('novel-creation-tool#desktopMigration:operationId', z.string().min(1).max(64));

/** I181 strict additive IPC descriptors for the Main-owned assistant surface. */
export const desktopAssistantInvocations = Object.freeze([
  {
    id: DESKTOP_ASSISTANT_METHOD_IDS.open, service: 'novelAssistant', namespace: 'novelAssistant', method: 'open',
    parameters: [assistantParameter('projectId', assistantProjectId)], result: assistantCodec('novel-creation-tool#desktopAssistant:open', desktopAssistantOpenResultSchema),
  },
  {
    id: DESKTOP_ASSISTANT_METHOD_IDS.status, service: 'novelAssistant', namespace: 'novelAssistant', method: 'status',
    parameters: [assistantParameter('projectId', assistantProjectId, true)], result: assistantCodec('novel-creation-tool#desktopAssistant:status', desktopAssistantStatusResponseSchema),
  },
  {
    id: DESKTOP_ASSISTANT_METHOD_IDS.context, service: 'novelAssistant', namespace: 'novelAssistant', method: 'context',
    parameters: [assistantParameter('projectId', assistantProjectId)], result: assistantCodec('novel-creation-tool#desktopAssistant:context', desktopAssistantContextResultSchema),
  },
  {
    id: DESKTOP_ASSISTANT_METHOD_IDS.continue, service: 'novelAssistant', namespace: 'novelAssistant', method: 'continue',
    parameters: [assistantParameter('projectId', assistantProjectId), assistantParameter('chapterId', assistantOptionalId, true), assistantParameter('sceneId', assistantOptionalId, true)],
    result: assistantCodec('novel-creation-tool#desktopAssistant:continue', desktopAssistantCandidateSchema),
  },
  {
    id: DESKTOP_ASSISTANT_METHOD_IDS.adjudicate, service: 'novelAssistant', namespace: 'novelAssistant', method: 'adjudicate',
    parameters: [assistantParameter('candidateId', assistantCandidateId), assistantParameter('decision', assistantDecision)],
    result: assistantCodec('novel-creation-tool#desktopAssistant:adjudicate', desktopAssistantAdjudicationResultSchema),
  },
  {
    id: DESKTOP_ASSISTANT_METHOD_IDS.inspire, service: 'novelAssistant', namespace: 'novelAssistant', method: 'inspire',
    parameters: [assistantParameter('projectId', assistantProjectId)], result: assistantCodec('novel-creation-tool#desktopAssistant:inspire', desktopAssistantInspireResultSchema),
  },
] as const satisfies readonly IpcMethodDescriptor[]);

/** I182 strict additive IPC descriptors for the explicit migration wizard. */
export const desktopMigrationInvocations = Object.freeze([
  {
    id: DESKTOP_MIGRATION_METHOD_IDS.preview, service: 'novelMigration', namespace: 'novelMigration', method: 'preview',
    parameters: [], result: assistantCodec('novel-creation-tool#desktopMigration:preview', desktopMigrationPreviewSchema),
  },
  {
    id: DESKTOP_MIGRATION_METHOD_IDS.execute, service: 'novelMigration', namespace: 'novelMigration', method: 'execute',
    parameters: [assistantParameter('operationId', migrationOperationId)], result: assistantCodec('novel-creation-tool#desktopMigration:execute', desktopMigrationExecutionSchema),
  },
  {
    id: DESKTOP_MIGRATION_METHOD_IDS.rollback, service: 'novelMigration', namespace: 'novelMigration', method: 'rollback',
    parameters: [assistantParameter('operationId', migrationOperationId)], result: assistantCodec('novel-creation-tool#desktopMigration:rollback', desktopMigrationRollbackSchema),
  },
] as const satisfies readonly IpcMethodDescriptor[]);

export const desktopIpcMethodDescriptors = Object.freeze(
  [
    ...hostContribution.invocations.map((descriptor) => adaptDescriptor(descriptor)),
    ...reviewRepairInvocations.map((descriptor) => adaptDescriptor(descriptor)),
    adaptDescriptor(desktopSaveFileInvocation),
    ...desktopAssistantInvocations,
    ...desktopMigrationInvocations,
  ],
);

/** The sole canonical registry: historical baseline plus migrated desktop seams through I180. */
export const desktopIpcRegistry: IpcRegistry<readonly IpcMethodDescriptor[]> = createIpcRegistry(desktopIpcMethodDescriptors);

function adaptDescriptor(descriptor: InvocationDescriptor): IpcMethodDescriptor {
  return {
    id: descriptor.id,
    service: descriptor.service,
    namespace: descriptor.namespace,
    method: descriptor.method,
    parameters: descriptor.parameters.map((parameter): IpcParameterDescriptor => ({
      name: parameter.name,
      wire: parameter.wire,
      ...(parameter.acceptsUndefined === true ? { acceptsUndefined: true as const } : {}),
      codec: adaptCodec(parameter.codec),
    })),
    result: adaptCodec(descriptor.result),
  };
}

function adaptCodec(codec: TypertCodec): IpcCodec {
  if (codec.mode !== 'strict') throw new TypeError('IPC registry requires a strict codec');
  const strictCodec = codec;
  const schema = strictCodec.schema as z.ZodType;
  return Object.freeze({
    mode: 'strict' as const,
    typeSymbol: strictCodec.typeSymbol,
    schema: (schema instanceof z.ZodUndefined ? { $dshType: 'undefined' } : z.toJSONSchema(schema)) as IpcJsonValue,
    parse: (value: unknown) => schema.parse(value),
  });
}
