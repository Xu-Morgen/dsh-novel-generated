/** A cleanup callback owned by the application lifecycle. */
export type ApplicationDisposer = () => void | Promise<void>;

/**
 * The deliberately small service registry surface consumed by composition
 * stages. A stage may publish a service once and may read services published
 * by an earlier stage; it cannot replace an existing owner silently.
 */
export interface ApplicationServicePort {
  provide<T>(key: string, value: T): void;
  get<T>(key: string): T | undefined;
  has(key: string): boolean;
}

/**
 * The lifecycle side effects available to a composition stage. Every task,
 * abort controller, and disposer registered here is reclaimed by the same
 * `DesktopLifecycle` instance when the application stops.
 */
export interface ApplicationLifecyclePort {
  registerDisposer(dispose: ApplicationDisposer, label?: string): () => void;
  registerTask(task: PromiseLike<unknown>, label?: string): () => void;
  createAbortController(label?: string): AbortController;
  trackAbortController(controller: AbortController, label?: string): () => void;
}

/**
 * Framework-neutral ports passed to Main-owned composition stages.
 *
 * No Electron, Node, DSH, or provider object crosses this boundary. Platform
 * adapters can be supplied by the caller through services and narrow ports.
 */
export interface ApplicationPorts extends ApplicationServicePort, ApplicationLifecyclePort {
  logger(scope: string): ApplicationLogger;
}

/** Logger seam kept intentionally smaller than any host framework logger. */
export interface ApplicationLogger {
  debug(message: string, ...parameters: readonly unknown[]): void;
  info(message: string, ...parameters: readonly unknown[]): void;
  warn(message: string, ...parameters: readonly unknown[]): void;
  error(message: string, ...parameters: readonly unknown[]): void;
}
