import { DesktopLifecycle, type DesktopLifecycleSnapshot, type DesktopLifecycleState } from './lifecycle.js';
import type { ApplicationLogger, ApplicationPorts } from './ports.js';

export type ApplicationCompositionStage = (ports: ApplicationPorts) => void | Promise<void>;

/**
 * The three ordered composition phases retained from Cordis. Later phases
 * may consume services from earlier phases, never the reverse.
 */
export interface ApplicationComposition {
  readonly base: ApplicationCompositionStage;
  readonly management: ApplicationCompositionStage;
  readonly orchestration: ApplicationCompositionStage;
}

/** Construction contract for the single Main-owned composition owner. */
export interface ApplicationKernelOptions {
  readonly composition: ApplicationComposition;
  readonly logger?: ApplicationLogger;
}

/** Stable lifecycle and ownership counts exposed for shutdown assertions. */
export interface ApplicationKernelSnapshot {
  readonly state: ApplicationKernelState;
  readonly serviceCount: number;
  readonly lifecycle: DesktopLifecycleSnapshot;
}

export type ApplicationKernelState = DesktopLifecycleState;

const COMPOSITION_STAGE_NAMES = ['base', 'management', 'orchestration'] as const;
const NOOP_LOGGER: ApplicationLogger = Object.freeze({
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
});

/**
 * The framework-neutral application composition owner.
 *
 * `start` is idempotent while running, `stop` is idempotent after teardown,
 * and `restart` creates a fresh service registry and lifecycle cycle. This is
 * the single seam that Main can consume before platform adapters are attached.
 */
export class ApplicationKernel {
  readonly lifecycle: DesktopLifecycle;
  readonly ports: ApplicationPorts;

  private state: ApplicationKernelState = 'idle';
  private readonly services = new Map<string, unknown>();
  private readonly composition: ApplicationComposition;
  private readonly rootLogger: ApplicationLogger;
  private startPromise: Promise<void> | undefined;
  private stopPromise: Promise<void> | undefined;

  constructor(options: ApplicationKernelOptions) {
    validateComposition(options.composition);
    this.composition = options.composition;
    this.rootLogger = options.logger ?? NOOP_LOGGER;
    this.lifecycle = new DesktopLifecycle();
    const ports: ApplicationPorts = {
      provide: <T>(key: string, value: T): void => this.provide(key, value),
      get: <T>(key: string): T | undefined => this.get<T>(key),
      has: (key: string): boolean => this.services.has(key),
      registerDisposer: (dispose: Parameters<ApplicationPorts['registerDisposer']>[0], label?: string): (() => void) => this.lifecycle.registerDisposer(dispose, label),
      registerTask: (task: PromiseLike<unknown>, label?: string): (() => void) => this.lifecycle.registerTask(task, label),
      createAbortController: (label?: string): AbortController => this.lifecycle.createAbortController(label),
      trackAbortController: (controller: AbortController, label?: string): (() => void) => this.lifecycle.trackAbortController(controller, label),
      logger: (scope: string): ApplicationLogger => this.scopedLogger(scope),
    };
    this.ports = Object.freeze(ports);
  }

  /** Compose the three stages once for the current lifecycle cycle. */
  async start(): Promise<ApplicationKernelSnapshot> {
    if (this.state === 'running') return this.snapshot();
    if (this.state === 'starting') {
      await this.startPromise;
      return this.snapshot();
    }
    if (this.state === 'stopping') {
      await this.stopPromise;
      return this.start();
    }

    this.services.clear();
    this.lifecycle.start();
    this.state = 'starting';
    const starting = this.compose();
    this.startPromise = starting;
    try {
      await starting;
      return this.snapshot();
    } finally {
      if (this.startPromise === starting) this.startPromise = undefined;
    }
  }

  /** Stop the current cycle and clear all service registrations. */
  async stop(): Promise<ApplicationKernelSnapshot> {
    if (this.state === 'idle' || this.state === 'stopped') return this.snapshot();
    if (this.state === 'starting') {
      await this.startPromise?.catch(() => undefined);
      return this.stop();
    }
    if (this.state === 'stopping') {
      await this.stopPromise;
      return this.snapshot();
    }

    this.state = 'stopping';
    const stopping = this.disposeCurrentCycle();
    this.stopPromise = stopping;
    try {
      await stopping;
      return this.snapshot();
    } finally {
      if (this.stopPromise === stopping) this.stopPromise = undefined;
    }
  }

  /** Stop and start a fresh cycle without duplicating registrations. */
  async restart(): Promise<ApplicationKernelSnapshot> {
    await this.stop();
    return this.start();
  }

  /** Alias for Main shutdown hooks. */
  async dispose(): Promise<ApplicationKernelSnapshot> {
    return this.stop();
  }

  /** Read the current observable ownership counts for smoke assertions. */
  snapshot(): ApplicationKernelSnapshot {
    return Object.freeze({
      state: this.state,
      serviceCount: this.services.size,
      lifecycle: this.lifecycle.snapshot(),
    });
  }

  private async compose(): Promise<void> {
    try {
      for (const stageName of COMPOSITION_STAGE_NAMES) {
        await this.composition[stageName](this.ports);
      }
      this.lifecycle.activate();
      this.state = 'running';
    } catch (cause) {
      let cleanupError: unknown;
      try {
        await this.lifecycle.stop();
      } catch (error) {
        cleanupError = error;
      }
      this.services.clear();
      this.state = 'stopped';
      if (cleanupError !== undefined) {
        throw new AggregateError([cause, cleanupError], 'ApplicationKernel composition failed and cleanup failed');
      }
      throw cause;
    }
  }

  private async disposeCurrentCycle(): Promise<void> {
    try {
      await this.lifecycle.stop();
    } finally {
      this.services.clear();
      this.state = 'stopped';
    }
  }

  private provide<T>(key: string, value: T): void {
    this.assertComposing(`provide service ${key}`);
    if (this.services.has(key)) throw new Error(`Application service already provided: ${key}`);
    this.services.set(key, value);
  }

  private get<T>(key: string): T | undefined {
    this.assertReadable(`read service ${key}`);
    return this.services.get(key) as T | undefined;
  }

  private scopedLogger(scope: string): ApplicationLogger {
    const prefix = scope.length > 0 ? `[${scope}] ` : '';
    return {
      debug: (message, ...parameters) => this.rootLogger.debug(`${prefix}${message}`, ...parameters),
      info: (message, ...parameters) => this.rootLogger.info(`${prefix}${message}`, ...parameters),
      warn: (message, ...parameters) => this.rootLogger.warn(`${prefix}${message}`, ...parameters),
      error: (message, ...parameters) => this.rootLogger.error(`${prefix}${message}`, ...parameters),
    };
  }

  private assertComposing(operation: string): void {
    if (this.state !== 'starting' && this.state !== 'running') {
      throw new Error(`ApplicationKernel cannot ${operation} while ${this.state}`);
    }
  }

  private assertReadable(operation: string): void {
    if (this.state !== 'starting' && this.state !== 'running') {
      throw new Error(`ApplicationKernel cannot ${operation} while ${this.state}`);
    }
  }
}

/** Construct a kernel without exposing a platform-specific implementation. */
export function createApplicationKernel(options: ApplicationKernelOptions): ApplicationKernel {
  return new ApplicationKernel(options);
}

function validateComposition(composition: ApplicationComposition): void {
  for (const name of COMPOSITION_STAGE_NAMES) {
    if (typeof composition[name] !== 'function') {
      throw new TypeError(`ApplicationKernel composition stage ${name} must be a function`);
    }
  }
}
