/**
 * Framework-neutral strict IPC contract primitives.
 *
 * The registry owns the boundary semantics; a platform adapter supplies
 * codecs and a later Electron binder supplies transport. Keeping this module
 * free of Electron, Node, and DSH imports makes the method surface reusable
 * by Main, Preload, Renderer types, and deterministic consumer fixtures.
 *
 * Invariants (design §0.1.2 / §14.32.3): method ids and namespace/method
 * pairs are unique, every argument is validated before dispatch, every result
 * is validated before it crosses the boundary, and failures never echo the
 * rejected value or the underlying exception.
 */

export type IpcJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly IpcJsonValue[]
  | { readonly [key: string]: IpcJsonValue };

export type IpcJsonObject = { readonly [key: string]: IpcJsonValue };

/** A strict codec supplied by a platform or schema adapter. */
export interface IpcCodec<Output = unknown> {
  readonly mode: 'strict';
  readonly typeSymbol: string;
  /** JSON-schema-shaped, reviewable contract material for the lock file. */
  readonly schema: IpcJsonValue;
  parse(value: unknown): Output;
}

/** One ordered business argument in a canonical IPC method. */
export interface IpcParameterDescriptor<Output = unknown> {
  readonly name: string;
  readonly wire: string;
  readonly acceptsUndefined?: true;
  readonly codec: IpcCodec<Output>;
}

/** Canonical method descriptor consumed by all future IPC binders. */
export interface IpcMethodDescriptor<
  Parameters extends readonly IpcParameterDescriptor[] = readonly IpcParameterDescriptor[],
  Result = unknown,
> {
  readonly id: string;
  readonly service: string;
  readonly namespace: string;
  readonly method: string;
  readonly parameters: Parameters;
  readonly result: IpcCodec<Result>;
}

/** Stable error codes emitted by the framework-neutral dispatcher. */
export type IpcErrorCode =
  | 'unknown-method'
  | 'invalid-arguments'
  | 'invalid-result'
  | 'not-serializable'
  | 'handler-unavailable'
  | 'handler-failed';

/** Error details contain only safe, non-secret location metadata. */
export type IpcErrorDetails = Readonly<Record<string, string | number | boolean | null>>;

/** Stable Main–Renderer result envelope. */
export type IpcEnvelope<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly error: { readonly code: IpcErrorCode; readonly message: string; readonly details: IpcErrorDetails } };

/** A handler receives already validated positional arguments. */
export type IpcHandler = (...args: readonly unknown[]) => unknown | PromiseLike<unknown>;

/** Reviewable descriptor projection used by the desktop contract lock. */
export interface IpcMethodContract {
  readonly id: string;
  readonly service: string;
  readonly namespace: string;
  readonly method: string;
  readonly parameters: readonly {
    readonly name: string;
    readonly wire: string;
    readonly acceptsUndefined: boolean;
    readonly codec: { readonly typeSymbol: string; readonly schemaId: string };
  }[];
  readonly result: { readonly typeSymbol: string; readonly schemaId: string };
}

/** Deduplicated schema bodies retained by the contract lock. */
export interface IpcSchemaContract {
  readonly typeSymbol: string;
  readonly schema: IpcJsonValue;
}

/** Checked lock payload generated from one canonical registry. */
export interface IpcContractLock {
  readonly schemaVersion: 1;
  readonly namespace: 'desktopIpc';
  readonly descriptorIds: readonly string[];
  readonly descriptors: Readonly<Record<string, IpcMethodContract>>;
  readonly schemas: Readonly<Record<string, IpcSchemaContract>>;
}

export class IpcContractError extends Error {
  readonly code: IpcErrorCode;
  readonly details: IpcErrorDetails;

  constructor(code: IpcErrorCode, message: string, details: IpcErrorDetails = {}) {
    super(message);
    this.name = 'IpcContractError';
    this.code = code;
    this.details = details;
  }
}

export interface IpcRegistry<Descriptors extends readonly IpcMethodDescriptor[]> {
  readonly descriptors: Descriptors;
  readonly size: number;
  get(methodId: string): Descriptors[number] | undefined;
  list(): readonly Descriptors[number][];
  parseArguments(methodId: string, args: readonly unknown[]): readonly unknown[];
  parseResult(methodId: string, value: unknown): unknown;
  invoke(methodId: string, args: readonly unknown[], handler?: IpcHandler): Promise<IpcEnvelope<unknown>>;
  contractLock(): IpcContractLock;
}

/**
 * Create and validate the one canonical method registry.
 *
 * The returned dispatcher accepts a full stable method id, not a caller-owned
 * channel or dynamically discovered method name. Missing/duplicate entries
 * fail at construction so a binder cannot publish a partial or ambiguous
 * surface accidentally.
 */
export function createIpcRegistry<const Descriptors extends readonly IpcMethodDescriptor[]>(
  descriptors: Descriptors,
): IpcRegistry<Descriptors> {
  const normalized = descriptors.map((descriptor) => normalizeDescriptor(descriptor));
  const byId = new Map<string, IpcMethodDescriptor>();
  const byNamespaceMethod = new Map<string, IpcMethodDescriptor>();
  for (const descriptor of normalized) {
    if (byId.has(descriptor.id)) throw new TypeError(`duplicate IPC method id: ${descriptor.id}`);
    const namespaceMethod = `${descriptor.namespace}/${descriptor.method}`;
    if (byNamespaceMethod.has(namespaceMethod)) throw new TypeError(`duplicate IPC namespace/method: ${namespaceMethod}`);
    byId.set(descriptor.id, descriptor);
    byNamespaceMethod.set(namespaceMethod, descriptor);
  }

  const exposedDescriptors = Object.freeze(normalized) as unknown as Descriptors;
  const registry: IpcRegistry<Descriptors> = {
    descriptors: exposedDescriptors,
    size: normalized.length,
    get(methodId) { return byId.get(methodId) as Descriptors[number] | undefined; },
    list() { return Object.freeze([...normalized]) as readonly Descriptors[number][]; },
    parseArguments(methodId, args) {
      const descriptor = requireDescriptor(byId, methodId);
      return parseArguments(descriptor, args);
    },
    parseResult(methodId, value) {
      const descriptor = requireDescriptor(byId, methodId);
      return parseResult(descriptor, value);
    },
    async invoke(methodId, args, handler) {
      const descriptor = byId.get(methodId);
      if (descriptor === undefined) return failure(new IpcContractError('unknown-method', 'IPC method is not allowlisted', { methodId }));
      if (handler === undefined) return failure(new IpcContractError('handler-unavailable', 'IPC method handler is unavailable', { methodId }));

      let parsedArgs: readonly unknown[];
      try {
        parsedArgs = parseArguments(descriptor, args);
      } catch (cause) {
        return failure(cause);
      }

      let value: unknown;
      try {
        value = await handler(...parsedArgs);
      } catch {
        return failure(new IpcContractError('handler-failed', 'IPC method handler failed', { methodId }));
      }

      try {
        return { ok: true, value: parseResult(descriptor, value) };
      } catch (cause) {
        return failure(cause);
      }
    },
    contractLock() {
      const locked: Record<string, IpcMethodContract> = {};
      const schemas: Record<string, IpcSchemaContract> = {};
      for (const descriptor of normalized) locked[descriptor.id] = methodContract(descriptor, schemas);
      return {
        schemaVersion: 1,
        namespace: 'desktopIpc',
        descriptorIds: normalized.map((descriptor) => descriptor.id),
        descriptors: locked,
        schemas,
      };
    },
  };
  return Object.freeze(registry);
}

/** Construct a future transport binder from the canonical registry. */
export function createIpcDispatcher(
  registry: IpcRegistry<readonly IpcMethodDescriptor[]>,
  handlers: ReadonlyMap<string, IpcHandler> | Readonly<Record<string, IpcHandler>>,
): { invoke(methodId: string, args: readonly unknown[]): Promise<IpcEnvelope<unknown>> } {
  const lookup = (methodId: string): IpcHandler | undefined => {
    if (typeof (handlers as ReadonlyMap<string, IpcHandler>).get === 'function') return (handlers as ReadonlyMap<string, IpcHandler>).get(methodId);
    return (handlers as Readonly<Record<string, IpcHandler>>)[methodId];
  };
  return Object.freeze({
    invoke: (methodId: string, args: readonly unknown[]) => registry.invoke(methodId, args, lookup(methodId)),
  });
}

function normalizeDescriptor(descriptor: IpcMethodDescriptor): IpcMethodDescriptor {
  validateDescriptor(descriptor);
  const parameters = Object.freeze(descriptor.parameters.map((parameter) => Object.freeze({ ...parameter })));
  return Object.freeze({ ...descriptor, parameters });
}

function validateDescriptor(descriptor: IpcMethodDescriptor): void {
  for (const field of ['id', 'service', 'namespace', 'method'] as const) {
    if (typeof descriptor[field] !== 'string' || descriptor[field].length === 0) throw new TypeError(`IPC descriptor ${field} is required`);
  }
  if (!Array.isArray(descriptor.parameters)) throw new TypeError(`IPC descriptor parameters are invalid: ${descriptor.id}`);
  const wires = new Set<string>();
  for (const parameter of descriptor.parameters) {
    if (typeof parameter.name !== 'string' || parameter.name.length === 0 || typeof parameter.wire !== 'string' || parameter.wire.length === 0) {
      throw new TypeError(`IPC parameter name/wire is invalid: ${descriptor.id}`);
    }
    if (wires.has(parameter.wire)) throw new TypeError(`duplicate IPC parameter wire: ${descriptor.id}/${parameter.wire}`);
    wires.add(parameter.wire);
    if (parameter.acceptsUndefined !== undefined && parameter.acceptsUndefined !== true) throw new TypeError(`IPC optional marker is invalid: ${descriptor.id}/${parameter.name}`);
    validateCodec(parameter.codec, `${descriptor.id}/${parameter.name}`);
  }
  validateCodec(descriptor.result, `${descriptor.id}/result`);
}

function validateCodec(codec: IpcCodec, location: string): void {
  if (codec.mode !== 'strict' || typeof codec.typeSymbol !== 'string' || codec.typeSymbol.length === 0 || typeof codec.parse !== 'function') {
    throw new TypeError(`IPC codec is not strict: ${location}`);
  }
  assertSerializable(codec.schema, 'schema');
}

function requireDescriptor(byId: ReadonlyMap<string, IpcMethodDescriptor>, methodId: string): IpcMethodDescriptor {
  const descriptor = byId.get(methodId);
  if (descriptor === undefined) throw new IpcContractError('unknown-method', 'IPC method is not allowlisted', { methodId });
  return descriptor;
}

function parseArguments(descriptor: IpcMethodDescriptor, args: readonly unknown[]): readonly unknown[] {
  if (!Array.isArray(args) || args.length !== descriptor.parameters.length) {
    throw new IpcContractError('invalid-arguments', 'IPC argument count is invalid', { methodId: descriptor.id, expected: descriptor.parameters.length, received: Array.isArray(args) ? args.length : -1 });
  }
  return descriptor.parameters.map((parameter, index) => {
    const value = args[index];
    if (value === undefined && parameter.acceptsUndefined !== true) {
      throw new IpcContractError('invalid-arguments', 'IPC argument is invalid', { methodId: descriptor.id, parameter: parameter.name });
    }
    try {
      assertSerializable(value, 'argument');
      const parsed = parameter.codec.parse(value);
      assertSerializable(parsed, 'argument');
      return parsed;
    } catch (cause) {
      if (cause instanceof IpcContractError) throw cause;
      throw new IpcContractError('invalid-arguments', 'IPC argument is invalid', { methodId: descriptor.id, parameter: parameter.name });
    }
  });
}

function parseResult(descriptor: IpcMethodDescriptor, value: unknown): unknown {
  let parsed: unknown;
  try {
    parsed = descriptor.result.parse(value);
  } catch {
    throw new IpcContractError('invalid-result', 'IPC result is invalid', { methodId: descriptor.id });
  }
  try {
    assertSerializable(parsed, 'result');
  } catch {
    throw new IpcContractError('not-serializable', 'IPC result is not serializable', { methodId: descriptor.id });
  }
  return parsed;
}

function methodContract(descriptor: IpcMethodDescriptor, schemas: Record<string, IpcSchemaContract>): IpcMethodContract {
  const codecContract = (codec: IpcCodec): { readonly typeSymbol: string; readonly schemaId: string } => {
    const schemaId = `${codec.typeSymbol}@${schemaFingerprint(codec.schema)}`;
    const existing = schemas[schemaId];
    if (existing !== undefined && JSON.stringify(existing.schema) !== JSON.stringify(codec.schema)) {
      throw new TypeError(`IPC schema fingerprint collision: ${schemaId}`);
    }
    if (existing === undefined) schemas[schemaId] = { typeSymbol: codec.typeSymbol, schema: codec.schema };
    return { typeSymbol: codec.typeSymbol, schemaId };
  };
  return {
    id: descriptor.id,
    service: descriptor.service,
    namespace: descriptor.namespace,
    method: descriptor.method,
    parameters: descriptor.parameters.map((parameter) => ({
      name: parameter.name,
      wire: parameter.wire,
      acceptsUndefined: parameter.acceptsUndefined === true,
      codec: codecContract(parameter.codec),
    })),
    result: codecContract(descriptor.result),
  };
}

function schemaFingerprint(schema: IpcJsonValue): string {
  let hash = 2_166_136_261;
  for (const character of JSON.stringify(schema)) hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function failure(cause: unknown): IpcEnvelope<never> {
  if (cause instanceof IpcContractError) return { ok: false, error: { code: cause.code, message: cause.message, details: cause.details } };
  return { ok: false, error: { code: 'handler-failed', message: 'IPC method handler failed', details: {} } };
}

function assertSerializable(value: unknown, location: string, seen = new Set<object>()): asserts value is IpcJsonValue | undefined {
  if (value === undefined || value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return;
    throw new TypeError(`${location} contains a non-finite number`);
  }
  if (typeof value !== 'object' || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') throw new TypeError(`${location} is not serializable`);
  if (seen.has(value)) throw new TypeError(`${location} is cyclic`);
  seen.add(value);
  if (Object.getOwnPropertySymbols(value).length > 0) throw new TypeError(`${location} contains symbols`);
  if (Array.isArray(value)) {
    for (const item of value) assertSerializable(item, location, seen);
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${location} has an unsupported prototype`);
    for (const [key, item] of Object.entries(value)) assertSerializable(item, `${location}.${key}`, seen);
  }
  seen.delete(value);
}
