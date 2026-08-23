import { z } from 'zod';

export const lifecycleOperationSchema = z.enum(['install', 'upgrade', 'uninstall', 'reinstall']);
export type LifecycleOperation = z.infer<typeof lifecycleOperationSchema>;
export const lifecycleRuntimeStateSchema = z.enum(['installed', 'upgraded', 'uninstalled']);
export type LifecycleRuntimeState = z.infer<typeof lifecycleRuntimeStateSchema>;

export interface LifecycleRuntimeSnapshot {
  readonly state: LifecycleRuntimeState;
  readonly version?: string;
  readonly effects: number;
  readonly dataPreserved: boolean;
}

/**
 * I45 full package lifecycle gate. It models the selected-profile install,
 * version switch, teardown, and clean reinstall contract without owning
 * project data. Every registered effect is disposed before an upgrade/uninstall.
 */
export class PluginLifecycleGate {
  private state: LifecycleRuntimeState | 'empty' = 'empty';
  private version: string | undefined;
  private effects = new Set<() => void>();

  install(version: string): LifecycleRuntimeSnapshot {
    if (this.state !== 'empty') throw new Error('Plugin is already installed');
    this.version = z.string().min(1).parse(version);
    this.state = 'installed';
    return this.snapshot();
  }

  upgrade(version: string): LifecycleRuntimeSnapshot {
    if (this.state === 'empty' || this.state === 'uninstalled') throw new Error('Plugin is not installed');
    this.teardown();
    this.version = z.string().min(1).parse(version);
    this.state = 'upgraded';
    return this.snapshot();
  }

  uninstall(): LifecycleRuntimeSnapshot {
    if (this.state === 'empty' || this.state === 'uninstalled') throw new Error('Plugin is not installed');
    this.teardown();
    this.version = undefined;
    this.state = 'uninstalled';
    return this.snapshot();
  }

  reinstall(version: string): LifecycleRuntimeSnapshot {
    if (this.state !== 'uninstalled') throw new Error('Plugin must be uninstalled before reinstall');
    this.version = z.string().min(1).parse(version);
    this.state = 'installed';
    return this.snapshot();
  }

  registerEffect(dispose: () => void): () => void {
    if (this.state === 'empty' || this.state === 'uninstalled') throw new Error('Plugin is not active');
    let active = true;
    this.effects.add(dispose);
    return () => { if (active) { active = false; this.effects.delete(dispose); dispose(); } };
  }

  snapshot(): LifecycleRuntimeSnapshot {
    if (this.state === 'empty') throw new Error('Plugin has not been installed');
    return Object.freeze({ state: this.state, version: this.version, effects: this.effects.size, dataPreserved: true });
  }

  private teardown(): void {
    for (const dispose of [...this.effects]) dispose();
    this.effects.clear();
  }
}
