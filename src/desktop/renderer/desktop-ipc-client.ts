import type { IpcEnvelope, IpcErrorCode, IpcJsonValue } from '../../app/ipc-registry.js';
import type { IpcProgressEvent } from '../../app/ipc-transport.js';
import type { ClientServiceBag } from '../../client/service-bag.js';
import type { DesktopBridge } from '../preload/bridge.js';
import { DESKTOP_CLIENT_SERVICES } from './ipc-client-registry.js';

/** Existing Client namespace types, now all synchronously reachable as IPC proxies. */
export type DesktopServiceBag = {
  readonly [Key in keyof ClientServiceBag]-?: NonNullable<ClientServiceBag[Key]>;
};

export type DesktopConnectionStatus = 'ready' | 'error' | 'closed';

/** Renderer-only connection projection; it never carries rejected values or secret-bearing details. */
export interface DesktopClientSnapshot {
  readonly status: DesktopConnectionStatus;
  readonly pendingCount: number;
  readonly lastError?: { readonly code: IpcErrorCode; readonly message: string };
  readonly progress?: { readonly requestId: string; readonly methodId: string; readonly value: IpcJsonValue };
}

type ConsumableResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { readonly message: string } };

/**
 * I174 Renderer transport owner.
 *
 * `services` preserves the 31 historical Client service keys and their derived namespace
 * types. Method names/ids come only from the generated registry. `dispose()` closes the
 * progress listener, cancels every in-flight request, and turns late responses into a
 * stable `bridge-closed` envelope before a consumer can write UI state.
 */
export interface DesktopIpcClient {
  readonly services: DesktopServiceBag;
  getSnapshot(): DesktopClientSnapshot;
  subscribe(listener: () => void): () => void;
  invoke(methodId: string, args: readonly unknown[]): Promise<IpcEnvelope<unknown>>;
  cancel(requestId: string): Promise<IpcEnvelope<unknown>>;
  consume<T>(request: PromiseLike<ConsumableResult<T>>, apply: (value: T) => void): Promise<boolean>;
  dispose(): void;
}

const IPC_ERROR_CODES: ReadonlySet<string> = new Set<IpcErrorCode>([
  'unknown-method',
  'invalid-arguments',
  'invalid-result',
  'not-serializable',
  'handler-unavailable',
  'handler-failed',
  'invalid-request',
  'forbidden-sender',
  'cancelled',
  'bridge-closed',
]);

type IpcFailure = Extract<IpcEnvelope<never>, { readonly ok: false }>;

function failure(code: IpcErrorCode, message: string): IpcFailure {
  return { ok: false, error: { code, message, details: {} } };
}

function normalizeEnvelope(value: unknown): IpcEnvelope<unknown> {
  if (value === null || typeof value !== 'object') return failure('invalid-result', 'Desktop bridge returned an invalid envelope');
  const candidate = value as { ok?: unknown; value?: unknown; error?: unknown };
  if (candidate.ok === true && Object.hasOwn(candidate, 'value')) return { ok: true, value: candidate.value };
  if (candidate.ok !== false || candidate.error === null || typeof candidate.error !== 'object') return failure('invalid-result', 'Desktop bridge returned an invalid envelope');
  const error = candidate.error as { code?: unknown; message?: unknown; details?: unknown };
  if (typeof error.code !== 'string' || !IPC_ERROR_CODES.has(error.code) || typeof error.message !== 'string') {
    return failure('invalid-result', 'Desktop bridge returned an invalid error envelope');
  }
  if (!isErrorDetails(error.details)) return failure('invalid-result', 'Desktop bridge returned invalid error details');
  return {
    ok: false,
    error: {
      code: error.code as IpcErrorCode,
      message: error.message,
      details: error.details,
    },
  };
}

function isErrorDetails(value: unknown): value is Readonly<Record<string, string | number | boolean | null>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every((entry) => entry === null || ['string', 'number', 'boolean'].includes(typeof entry));
}

function createNamespace<T extends object>(
  methods: readonly { readonly method: string; readonly methodId: string }[],
  invoke: (methodId: string, args: readonly unknown[]) => Promise<IpcEnvelope<unknown>>,
): T {
  const namespace: Record<string, (...args: readonly unknown[]) => Promise<IpcEnvelope<unknown>>> = Object.create(null);
  for (const descriptor of methods) {
    namespace[descriptor.method] = (...args) => invoke(descriptor.methodId, args);
  }
  return Object.freeze(namespace) as T;
}

/** Create the sole Renderer client from the versioned preload bridge. */
export function createDesktopIpcClient(bridge: DesktopBridge): DesktopIpcClient {
  let active = true;
  let requestSequence = 0;
  let snapshot: DesktopClientSnapshot = { status: 'ready', pendingCount: 0 };
  const listeners = new Set<() => void>();
  const inFlight = new Map<string, string>();

  const publish = (next: DesktopClientSnapshot): void => {
    if (!active) return;
    snapshot = next;
    for (const listener of [...listeners]) listener();
  };

  const projectError = (envelope: IpcEnvelope<unknown>): void => {
    if (envelope.ok) return;
    publish({ ...snapshot, lastError: { code: envelope.error.code, message: envelope.error.message } });
  };

  const invokeWithRequest = async (methodId: string, args: readonly unknown[]): Promise<IpcEnvelope<unknown>> => {
    if (!active) return failure('bridge-closed', 'Desktop bridge is closed');
    const requestId = `desktop:${++requestSequence}`;
    inFlight.set(requestId, methodId);
    publish({ ...snapshot, pendingCount: inFlight.size });
    let envelope: IpcEnvelope<unknown>;
    try {
      envelope = normalizeEnvelope(await bridge.invoke(methodId, args, requestId));
    } catch {
      const transportFailure = failure('handler-failed', 'Desktop bridge invocation failed');
      envelope = transportFailure;
      publish({ status: 'error', pendingCount: inFlight.size, lastError: { code: transportFailure.error.code, message: transportFailure.error.message } });
    } finally {
      inFlight.delete(requestId);
    }
    if (!active) return failure('bridge-closed', 'Desktop bridge is closed');
    publish({ ...snapshot, pendingCount: inFlight.size });
    projectError(envelope);
    return envelope;
  };

  const mutableBag: Partial<DesktopServiceBag> = {};
  for (const service of DESKTOP_CLIENT_SERVICES) {
    Object.defineProperty(mutableBag, service.key, {
      enumerable: true,
      value: createNamespace(service.methods, invokeWithRequest),
    });
  }
  const services = Object.freeze(mutableBag) as DesktopServiceBag;

  const removeProgressListener = bridge.onProgress((event: IpcProgressEvent) => {
    const methodId = inFlight.get(event.requestId);
    if (!active || methodId === undefined) return;
    publish({ ...snapshot, progress: { ...event, methodId } });
  });

  return Object.freeze({
    services,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      if (!active) return () => {};
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    invoke: invokeWithRequest,
    async cancel(requestId: string) {
      if (!active) return failure('bridge-closed', 'Desktop bridge is closed');
      const envelope = normalizeEnvelope(await bridge.cancel(requestId));
      projectError(envelope);
      return envelope;
    },
    async consume<T>(request: PromiseLike<ConsumableResult<T>>, apply: (value: T) => void): Promise<boolean> {
      let result: ConsumableResult<T>;
      try {
        result = await request;
      } catch {
        if (active) publish({ status: 'error', pendingCount: inFlight.size, lastError: { code: 'handler-failed', message: 'Desktop client request failed' } });
        return false;
      }
      if (!active || !result.ok) return false;
      apply(result.value);
      return true;
    },
    dispose() {
      if (!active) return;
      active = false;
      removeProgressListener();
      for (const requestId of inFlight.keys()) void bridge.cancel(requestId).catch(() => undefined);
      inFlight.clear();
      listeners.clear();
      snapshot = { status: 'closed', pendingCount: 0 };
    },
  });
}
