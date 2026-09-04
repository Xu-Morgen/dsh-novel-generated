import { z } from 'zod';

import desktopContract from '../../contracts/desktop/ipc-methods.json' with { type: 'json' };

import {
  createIpcRegistry,
  type IpcCodec,
  type IpcMethodDescriptor,
  type IpcParameterDescriptor,
  type IpcRegistry,
} from '../app/ipc-registry.js';

/**
 * The production desktop registry is independent of the retired DSH/Cordis
 * composition. Its descriptor and schema bodies come from the checked-in
 * canonical desktop lock; Main reconstructs strict parsers from those bodies
 * and owns the only runtime registry (design §0.1.1 / plan I183).
 *
 * The lock is an evidence artifact, not a second wire contract: descriptor
 * ids, ordering, type symbols and schema bodies are copied into the registry
 * unchanged, while parsing is supplied by the local zod JSON-schema adapter.
 */
interface DesktopContract {
  readonly schemaVersion: 1;
  readonly namespace: 'desktopIpc';
  readonly descriptorIds: readonly string[];
  readonly descriptors: Readonly<Record<string, {
    readonly id: string;
    readonly service: string;
    readonly namespace: string;
    readonly method: string;
    readonly parameters: readonly {
      readonly name: string;
      readonly wire: string;
      readonly acceptsUndefined?: boolean;
      readonly codec: { readonly typeSymbol: string; readonly schemaId: string };
    }[];
    readonly result: { readonly typeSymbol: string; readonly schemaId: string };
  }>>;
  readonly schemas: Readonly<Record<string, { readonly typeSymbol: string; readonly schema: unknown }>>;
}

const canonicalContract = desktopContract as unknown as DesktopContract;
const schemaCache = new Map<string, z.ZodType>();

function strictSchema(schemaId: string): z.ZodType {
  const cached = schemaCache.get(schemaId);
  if (cached !== undefined) return cached;
  const locked = canonicalContract.schemas[schemaId];
  if (locked === undefined) throw new Error(`Desktop IPC schema is missing: ${schemaId}`);
  const schema = isUndefinedSchema(locked.schema)
    ? z.undefined()
    : z.fromJSONSchema(locked.schema as Parameters<typeof z.fromJSONSchema>[0]);
  schemaCache.set(schemaId, schema);
  return schema;
}

function isUndefinedSchema(schema: unknown): schema is { readonly $dshType: 'undefined' } {
  return typeof schema === 'object' && schema !== null && (schema as { readonly $dshType?: unknown }).$dshType === 'undefined';
}

function lockedCodec(reference: { readonly typeSymbol: string; readonly schemaId: string }): IpcCodec {
  const locked = canonicalContract.schemas[reference.schemaId];
  if (locked === undefined) throw new Error(`Desktop IPC schema is missing: ${reference.schemaId}`);
  const schema = strictSchema(reference.schemaId);
  return Object.freeze({
    mode: 'strict' as const,
    typeSymbol: reference.typeSymbol,
    schema: locked.schema as never,
    parse: (value: unknown) => schema.parse(value),
  });
}

function buildCanonicalDescriptors(): readonly IpcMethodDescriptor[] {
  return Object.freeze(canonicalContract.descriptorIds.map((id) => {
    const locked = canonicalContract.descriptors[id];
    if (locked === undefined) throw new Error(`Desktop IPC descriptor is missing: ${id}`);
    return Object.freeze({
      id: locked.id,
      service: locked.service,
      namespace: locked.namespace,
      method: locked.method,
      parameters: Object.freeze(locked.parameters.map((parameter): IpcParameterDescriptor => Object.freeze({
        name: parameter.name,
        wire: parameter.wire,
        ...(parameter.acceptsUndefined ? { acceptsUndefined: true as const } : {}),
        codec: lockedCodec(parameter.codec),
      }))),
      result: lockedCodec(locked.result),
    });
  }));
}

export const desktopIpcMethodDescriptors = buildCanonicalDescriptors();

/** The sole canonical desktop registry; the legacy Host has no registration path. */
export const desktopIpcRegistry: IpcRegistry<readonly IpcMethodDescriptor[]> = createIpcRegistry(desktopIpcMethodDescriptors);
