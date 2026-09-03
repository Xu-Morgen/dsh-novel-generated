import type { ApplicationDisposer } from './ports.js';

export type DesktopLifecycleState = 'idle' | 'starting' | 'running' | 'stopping' | 'stopped';

/** Observable resource counts used by the kernel and lifecycle smoke gates. */
export interface DesktopLifecycleSnapshot {
  readonly state: DesktopLifecycleState;
  readonly disposers: number;
  readonly tasks: number;
  readonly abortControllers: number;
}

interface DisposerEntry {
  readonly dispose: ApplicationDisposer;
  readonly label: string;
}

interface TaskEntry {
  readonly task: PromiseLike<unknown>;
  readonly label: string;
}

interface AbortControllerEntry {
  readonly controller: AbortController;
  readonly label: string;
}

/**
 * Owns all application-scoped asynchronous work and external side effects.
 *
 * Startup is explicit (`start` → `activate`), disposal is idempotent, abort
 * controllers are signalled before outstanding tasks are awaited, and
 * disposers run in reverse registration order. These invariants are the
 * framework-neutral replacement for Fiber-owned `effect` cleanup (design
 * §14.32.1; requirement H0-6).
 */
export class DesktopLifecycle {
  private state: DesktopLifecycleState = 'idle';
  private nextId = 0;
  private readonly disposers = new Map<number, DisposerEntry>();
  private readonly tasks = new Map<number, TaskEntry>();
  private readonly abortControllers = new Map<number, AbortControllerEntry>();
  private stopPromise: Promise<void> | undefined;

  /** Begin a new lifecycle cycle. The kernel calls `activate` after composition. */
  start(): void {
    if (this.state !== 'idle' && this.state !== 'stopped') {
      throw new Error(`DesktopLifecycle cannot start from ${this.state}`);
    }
    this.state = 'starting';
  }

  /** Mark a successfully composed lifecycle cycle as available to consumers. */
  activate(): void {
    if (this.state !== 'starting') {
      throw new Error(`DesktopLifecycle cannot activate from ${this.state}`);
    }
    this.state = 'running';
  }

  /** Register a disposer and return an idempotent unregister function. */
  registerDisposer(dispose: ApplicationDisposer, label = 'anonymous disposer'): () => void {
    this.assertActive('register a disposer');
    const id = ++this.nextId;
    this.disposers.set(id, { dispose, label });
    let registered = true;
    return () => {
      if (!registered) return;
      registered = false;
      this.disposers.delete(id);
    };
  }

  /**
   * Track a task until it settles. Rejections are observed for cleanup
   * purposes; the task owner remains responsible for reporting its failure.
   */
  registerTask(task: PromiseLike<unknown>, label = 'anonymous task'): () => void {
    this.assertActive('register a task');
    const tracked = Promise.resolve(task);
    const id = ++this.nextId;
    this.tasks.set(id, { task: tracked, label });
    void tracked.then(
      () => { this.tasks.delete(id); },
      () => { this.tasks.delete(id); },
    );
    let registered = true;
    return () => {
      if (!registered) return;
      registered = false;
      this.tasks.delete(id);
    };
  }

  /** Create and own an AbortController for the current lifecycle cycle. */
  createAbortController(label = 'anonymous abort controller'): AbortController {
    const controller = new AbortController();
    this.trackAbortController(controller, label);
    return controller;
  }

  /** Adopt a controller created by a service so stop can signal it. */
  trackAbortController(controller: AbortController, label = 'anonymous abort controller'): () => void {
    this.assertActive('track an AbortController');
    const id = ++this.nextId;
    const entry: AbortControllerEntry = { controller, label };
    this.abortControllers.set(id, entry);
    const onAbort = (): void => { this.abortControllers.delete(id); };
    controller.signal.addEventListener('abort', onAbort, { once: true });
    let registered = true;
    return () => {
      if (!registered) return;
      registered = false;
      this.abortControllers.delete(id);
      controller.signal.removeEventListener('abort', onAbort);
    };
  }

  /**
   * Stop the cycle once. Abort is sent before tasks are awaited and every
   * disposer is attempted even if an earlier disposer throws.
   */
  stop(): Promise<void> {
    if (this.state === 'idle' || this.state === 'stopped') return Promise.resolve();
    if (this.state === 'stopping') return this.stopPromise ?? Promise.resolve();

    this.state = 'stopping';
    const stopping = this.stopResources();
    this.stopPromise = stopping;
    return stopping;
  }

  /** Alias used by owners that model lifecycle cleanup as disposal. */
  dispose(): Promise<void> {
    return this.stop();
  }

  snapshot(): DesktopLifecycleSnapshot {
    return Object.freeze({
      state: this.state,
      disposers: this.disposers.size,
      tasks: this.tasks.size,
      abortControllers: this.abortControllers.size,
    });
  }

  private assertActive(operation: string): void {
    if (this.state !== 'starting' && this.state !== 'running') {
      throw new Error(`DesktopLifecycle cannot ${operation} while ${this.state}`);
    }
  }

  private async stopResources(): Promise<void> {
    const errors: Error[] = [];

    for (const { controller, label } of this.abortControllers.values()) {
      try {
        if (!controller.signal.aborted) controller.abort();
      } catch (cause) {
        errors.push(asLifecycleError(cause, `AbortController cleanup failed: ${label}`));
      }
    }

    await Promise.all([...this.tasks.values()].map(async ({ task }) => {
      await Promise.resolve(task).catch(() => undefined);
    }));

    const entries = [...this.disposers.values()].reverse();
    for (const { dispose, label } of entries) {
      try {
        await dispose();
      } catch (cause) {
        errors.push(asLifecycleError(cause, `Disposer failed: ${label}`));
      }
    }

    this.tasks.clear();
    this.abortControllers.clear();
    this.disposers.clear();
    this.state = 'stopped';
    this.stopPromise = undefined;

    if (errors.length > 0) throw new AggregateError(errors, 'DesktopLifecycle stop failed');
  }
}

function asLifecycleError(cause: unknown, fallback: string): Error {
  return cause instanceof Error ? cause : new Error(fallback, { cause });
}
