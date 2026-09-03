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
export { createCredentialStore } from './credentials.js';
export type {
  CredentialDescription,
  CredentialStore,
  CredentialStoreBundle,
  MainCredentialResolver,
  SecureSecretStorage,
} from './credentials.js';
