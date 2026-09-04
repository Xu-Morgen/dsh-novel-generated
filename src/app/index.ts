export { ApplicationKernel, createApplicationKernel } from './kernel.js';
export type {
  ApplicationComposition,
  ApplicationCompositionStage,
  ApplicationKernelOptions,
  ApplicationKernelSnapshot,
  ApplicationKernelState,
} from './kernel.js';
export { DesktopLifecycle } from './lifecycle.js';
export type { DesktopLifecycleSnapshot, DesktopLifecycleState } from './lifecycle.js';
export type {
  ApplicationDisposer,
  ApplicationLifecyclePort,
  ApplicationLogger,
  ApplicationPorts,
  ApplicationServicePort,
} from './ports.js';
export type { DesktopPaths } from './paths.js';
export { workspaceViewModel } from './workspace-view-model.js';
export type { WorkspaceViewModel } from './workspace-view-model.js';
export { createCredentialStore } from './credentials.js';
export type {
  CredentialDescription,
  CredentialStore,
  CredentialStoreBundle,
  MainCredentialResolver,
  SecureSecretStorage,
} from './credentials.js';
export { createIpcDispatcher, createIpcRegistry, IpcContractError } from './ipc-registry.js';
export type {
  IpcCodec,
  IpcContractLock,
  IpcErrorCode,
  IpcErrorDetails,
  IpcEnvelope,
  IpcHandler,
  IpcInvocationContext,
  IpcJsonObject,
  IpcJsonValue,
  IpcMethodContract,
  IpcMethodDescriptor,
  IpcParameterDescriptor,
  IpcRegistry,
  IpcSchemaContract,
} from './ipc-registry.js';
export { IPC_CANCEL_CHANNEL, IPC_INVOKE_CHANNEL, IPC_PROGRESS_CHANNEL } from './ipc-transport.js';
export type { IpcCancelRequest, IpcInvokeRequest, IpcProgressEvent } from './ipc-transport.js';
