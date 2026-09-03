import type { ApplicationLifecyclePort } from '../app/ports.js';
import type {
  IpcEnvelope,
  IpcErrorCode,
  IpcErrorDetails,
  IpcHandler,
  IpcInvocationContext,
  IpcJsonValue,
  IpcMethodDescriptor,
  IpcRegistry,
} from '../app/ipc-registry.js';
import {
  IPC_CANCEL_CHANNEL,
  IPC_INVOKE_CHANNEL,
  IPC_PROGRESS_CHANNEL,
  type IpcCancelRequest,
  type IpcInvokeRequest,
} from '../app/ipc-transport.js';

/** Minimum Electron IPC Main shape needed by the binder and its fake fixture. */
export interface ElectronIpcMainLike {
  handle(channel: string, listener: (event: DesktopIpcInvokeEvent, payload: unknown) => Promise<IpcEnvelope<unknown>>): void;
  removeHandler(channel: string): void;
}

/** Sender projection kept small so tests do not need an Electron runtime. */
export interface DesktopIpcSender {
  send(channel: string, payload: unknown): void;
}

export interface DesktopIpcInvokeEvent {
  readonly sender: DesktopIpcSender;
}

export interface DesktopIpcBinderOptions {
  readonly ipcMain: ElectronIpcMainLike;
  readonly registry: IpcRegistry<readonly IpcMethodDescriptor[]>;
  readonly handlers: ReadonlyMap<string, IpcHandler> | Readonly<Record<string, IpcHandler>>;
  readonly isSenderAllowed?: (event: DesktopIpcInvokeEvent) => boolean;
  readonly registerDisposer?: ApplicationLifecyclePort['registerDisposer'];
}

export interface DesktopIpcBinderSnapshot {
  readonly active: boolean;
  readonly pendingRequests: number;
  readonly inFlight: number;
}

export interface DesktopIpcBinder {
  readonly invokeChannel: typeof IPC_INVOKE_CHANNEL;
  readonly cancelChannel: typeof IPC_CANCEL_CHANNEL;
  readonly progressChannel: typeof IPC_PROGRESS_CHANNEL;
  snapshot(): DesktopIpcBinderSnapshot;
  dispose(): Promise<void>;
}

interface PendingRequest {
  readonly controller: AbortController;
  readonly sender: DesktopIpcSender;
}

/**
 * Bind exactly two fixed channels to the canonical registry.
 *
 * Main validates transport messages before registry validation, binds a
 * lifecycle-owned AbortController to each request, and removes both handlers
 * only after all in-flight operations have settled. Progress is Main-originated
 * and bounded to the requesting sender; a late result becomes a stable
 * `bridge-closed`/`cancelled` envelope rather than writing to Renderer state.
 */
export function bindElectronIpc(options: DesktopIpcBinderOptions): DesktopIpcBinder {
  let active = true;
  let disposed = false;
  let unregister: (() => void) | undefined;
  const pending = new Map<string, PendingRequest>();
  const inFlight = new Set<Promise<IpcEnvelope<unknown>>>();

  const invokeListener = (event: DesktopIpcInvokeEvent, payload: unknown): Promise<IpcEnvelope<unknown>> => {
    const operation = handleInvoke(event, payload);
    inFlight.add(operation);
    void operation.then(() => inFlight.delete(operation), () => inFlight.delete(operation));
    return operation;
  };
  const cancelListener = async (event: DesktopIpcInvokeEvent, payload: unknown): Promise<IpcEnvelope<unknown>> => handleCancel(event, payload);

  try {
    options.ipcMain.handle(IPC_INVOKE_CHANNEL, invokeListener);
    options.ipcMain.handle(IPC_CANCEL_CHANNEL, cancelListener);
  } catch (cause) {
    active = false;
    try { options.ipcMain.removeHandler(IPC_INVOKE_CHANNEL); } catch { /* registration may have failed before the channel existed */ }
    try { options.ipcMain.removeHandler(IPC_CANCEL_CHANNEL); } catch { /* registration may have failed before the channel existed */ }
    throw cause;
  }

  const binder: DesktopIpcBinder = {
    invokeChannel: IPC_INVOKE_CHANNEL,
    cancelChannel: IPC_CANCEL_CHANNEL,
    progressChannel: IPC_PROGRESS_CHANNEL,
    snapshot: () => ({ active, pendingRequests: pending.size, inFlight: inFlight.size }),
    dispose: async () => {
      if (disposed) return;
      disposed = true;
      active = false;
      for (const request of pending.values()) request.controller.abort();
      options.ipcMain.removeHandler(IPC_INVOKE_CHANNEL);
      options.ipcMain.removeHandler(IPC_CANCEL_CHANNEL);
      await Promise.allSettled([...inFlight]);
      pending.clear();
      inFlight.clear();
      unregister?.();
      unregister = undefined;
    },
  };
  unregister = options.registerDisposer?.(binder.dispose, 'desktop IPC handlers');
  return Object.freeze(binder);

  async function handleInvoke(event: DesktopIpcInvokeEvent, payload: unknown): Promise<IpcEnvelope<unknown>> {
    if (!active) return failure('bridge-closed', 'IPC bridge is closed');
    if (!isAllowedSender(event)) return failure('forbidden-sender', 'IPC sender is not allowed');
    const request = decodeInvokeRequest(payload);
    if (request === undefined) return failure('invalid-request', 'IPC invocation request is invalid');
    if (pending.has(request.requestId)) return failure('invalid-request', 'IPC request id is already active', { requestId: request.requestId });

    const controller = new AbortController();
    pending.set(request.requestId, { controller, sender: event.sender });
    const context: IpcInvocationContext = {
      signal: controller.signal,
      reportProgress(value: IpcJsonValue) {
        if (!active || controller.signal.aborted) return;
        try { event.sender.send(IPC_PROGRESS_CHANNEL, { requestId: request.requestId, value }); } catch { /* destroyed WebContents is already being disposed */ }
      },
    };
    try {
      const result = await options.registry.invoke(request.methodId, request.args, lookupHandler(request.methodId), context);
      if (!active) return failure('bridge-closed', 'IPC bridge is closed');
      if (controller.signal.aborted) return failure('cancelled', 'IPC request cancelled', { requestId: request.requestId });
      return result;
    } finally {
      pending.delete(request.requestId);
    }
  }

  async function handleCancel(event: DesktopIpcInvokeEvent, payload: unknown): Promise<IpcEnvelope<unknown>> {
    if (!active) return failure('bridge-closed', 'IPC bridge is closed');
    if (!isAllowedSender(event)) return failure('forbidden-sender', 'IPC sender is not allowed');
    const request = decodeCancelRequest(payload);
    if (request === undefined) return failure('invalid-request', 'IPC cancellation request is invalid');
    const pendingRequest = pending.get(request.requestId);
    if (pendingRequest !== undefined) {
      if (pendingRequest.sender !== event.sender) return failure('forbidden-sender', 'IPC request belongs to another sender');
      pendingRequest.controller.abort();
    }
    return { ok: true, value: undefined };
  }

  function lookupHandler(methodId: string): IpcHandler | undefined {
    if (typeof (options.handlers as ReadonlyMap<string, IpcHandler>).get === 'function') return (options.handlers as ReadonlyMap<string, IpcHandler>).get(methodId);
    return (options.handlers as Readonly<Record<string, IpcHandler>>)[methodId];
  }

  function isAllowedSender(event: DesktopIpcInvokeEvent): boolean {
    try { return options.isSenderAllowed?.(event) ?? true; } catch { return false; }
  }
}

function decodeInvokeRequest(value: unknown): IpcInvokeRequest | undefined {
  if (!isPlainRecord(value)) return undefined;
  if (!hasExactKeys(value, ['args', 'methodId', 'requestId'])) return undefined;
  const candidate = value as { methodId?: unknown; args?: unknown; requestId?: unknown };
  if (typeof candidate.methodId !== 'string' || !isRequestId(candidate.requestId) || !Array.isArray(candidate.args)) return undefined;
  return { methodId: candidate.methodId, args: candidate.args, requestId: candidate.requestId };
}

function decodeCancelRequest(value: unknown): IpcCancelRequest | undefined {
  if (!isPlainRecord(value)) return undefined;
  if (!hasExactKeys(value, ['requestId'])) return undefined;
  const requestId = (value as { requestId?: unknown }).requestId;
  return isRequestId(requestId) ? { requestId } : undefined;
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === [...expected].sort()[index]);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isRequestId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && /^[A-Za-z0-9:_-]+$/.test(value);
}

function failure(code: IpcErrorCode, message: string, details: IpcErrorDetails = {}): IpcEnvelope<never> {
  return { ok: false, error: { code, message, details } };
}
