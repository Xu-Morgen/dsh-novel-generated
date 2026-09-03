import type { IpcEnvelope } from '../../app/ipc-registry.js';
import type { IpcCancelRequest, IpcInvokeRequest, IpcProgressEvent } from '../../app/ipc-transport.js';

export const DESKTOP_BRIDGE_VERSION = 1 as const;

export type DesktopBridgeResult = Promise<IpcEnvelope<unknown>>;
export type DesktopProgressListener = (event: IpcProgressEvent) => void;

export interface DesktopBridgeTransport {
  invoke(request: IpcInvokeRequest): DesktopBridgeResult;
  cancel(request: IpcCancelRequest): DesktopBridgeResult;
  onProgress(listener: DesktopProgressListener): () => void;
}

export interface DesktopBridge {
  readonly version: typeof DESKTOP_BRIDGE_VERSION;
  /** Runtime-checks the generated allowlist before reaching the fixed channel. */
  invoke(methodId: string, args: readonly unknown[], requestId?: string): DesktopBridgeResult;
  cancel(requestId: string): DesktopBridgeResult;
  onProgress(listener: DesktopProgressListener): () => void;
}

/**
 * Build the only API object that Preload may expose.
 *
 * `methodIds` is a generated snapshot of the canonical registry. The bridge
 * never accepts a caller-provided channel and never exposes ipcRenderer;
 * unknown methods are rejected before transport. Request IDs are explicit so
 * a later Client can cancel long-running Main work without passing an
 * AbortSignal through structured clone.
 */
export function createDesktopBridge(methodIds: readonly string[], transport: DesktopBridgeTransport): DesktopBridge {
  const allowlist = new Set(methodIds);
  let nextRequestId = 0;
  const createRequestId = (): string => `renderer-${++nextRequestId}`;

  const invalidRequest = (message: string): DesktopBridgeResult => Promise.resolve({
    ok: false,
    error: { code: 'invalid-request', message, details: {} },
  });

  const bridge: DesktopBridge = {
    version: DESKTOP_BRIDGE_VERSION,
    invoke(methodId, args, requestId = createRequestId()) {
      if (!allowlist.has(methodId)) return invalidRequest('IPC method is not allowlisted');
      if (!Array.isArray(args)) return invalidRequest('IPC arguments must be an array');
      if (!isRequestId(requestId)) return invalidRequest('IPC request id is invalid');
      return transport.invoke({ methodId, args, requestId });
    },
    cancel(requestId) {
      if (!isRequestId(requestId)) return invalidRequest('IPC request id is invalid');
      return transport.cancel({ requestId });
    },
    onProgress(listener) {
      if (typeof listener !== 'function') throw new TypeError('IPC progress listener must be a function');
      return transport.onProgress(listener);
    },
  };
  return Object.freeze(bridge);
}

function isRequestId(value: string): boolean {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && /^[A-Za-z0-9:_-]+$/.test(value);
}
