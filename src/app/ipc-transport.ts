import type { IpcJsonValue } from './ipc-registry.js';

/** Fixed channels owned by the one versioned desktop bridge. */
export const IPC_INVOKE_CHANNEL = 'novelDesktop.invoke' as const;
export const IPC_CANCEL_CHANNEL = 'novelDesktop.cancel' as const;
export const IPC_PROGRESS_CHANNEL = 'novelDesktop.progress' as const;

/** Transport envelope; business parameters remain the registry's concern. */
export interface IpcInvokeRequest {
  readonly methodId: string;
  readonly args: readonly unknown[];
  readonly requestId: string;
}

/** Cancellation is a control message, never a business invocation. */
export interface IpcCancelRequest {
  readonly requestId: string;
}

/** Main-originated, bounded progress projection. */
export interface IpcProgressEvent {
  readonly requestId: string;
  readonly value: IpcJsonValue;
}
