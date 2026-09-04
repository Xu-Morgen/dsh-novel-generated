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

/**
 * Current migration adapter from the historical Remote declarations to the
 * framework-neutral desktop registry (design §0.1.1 / plan I171).
 *
 * This is intentionally the only place where the legacy Typert descriptor is
 * translated. The app registry and its dispatcher know only strict parse
 * functions and reviewable JSON Schema contracts; I172 can bind the exported
 * registry without importing individual Remote modules.
 */
export const desktopIpcMethodDescriptors = Object.freeze(
  [...hostContribution.invocations, ...reviewRepairInvocations, desktopSaveFileInvocation].map((descriptor) => adaptDescriptor(descriptor)),
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
