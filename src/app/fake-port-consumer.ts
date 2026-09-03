import type { ApplicationComposition, ApplicationCompositionStage } from './kernel.js';

export interface FakePortConsumerProbe {
  readonly stageRuns: string[];
  readonly disposerOrder: string[];
  readonly abortControllersCreated: number;
  readonly abortControllersAborted: number;
  readonly tasksReleasedByAbort: number;
}

interface MutableFakePortConsumerProbe {
  stageRuns: string[];
  disposerOrder: string[];
  abortControllersCreated: number;
  abortControllersAborted: number;
  tasksReleasedByAbort: number;
}

/**
 * A framework-free composition consumer used by I167's positive and negative
 * lifecycle tests. It mirrors base → management → orchestration dependencies
 * and intentionally uses every narrow port needed by Main-owned services.
 */
export function createFakePortConsumer(): {
  readonly composition: ApplicationComposition;
  readonly probe: FakePortConsumerProbe;
} {
  const probe: MutableFakePortConsumerProbe = {
    stageRuns: [],
    disposerOrder: [],
    abortControllersCreated: 0,
    abortControllersAborted: 0,
    tasksReleasedByAbort: 0,
  };

  const base: ApplicationCompositionStage = (ports) => {
    probe.stageRuns.push('base');
    ports.provide('base-service', { name: 'base' });
    ports.registerDisposer(() => { probe.disposerOrder.push('base'); }, 'fake base');

    const controller = ports.createAbortController('fake task');
    probe.abortControllersCreated += 1;
    controller.signal.addEventListener('abort', () => { probe.abortControllersAborted += 1; }, { once: true });
    ports.registerTask(new Promise<void>((resolve) => {
      controller.signal.addEventListener('abort', () => {
        probe.tasksReleasedByAbort += 1;
        resolve();
      }, { once: true });
    }), 'fake task');
  };

  const management: ApplicationCompositionStage = (ports) => {
    probe.stageRuns.push('management');
    const baseService = ports.get<{ readonly name: string }>('base-service');
    if (baseService?.name !== 'base') throw new Error('management stage lost base service');
    ports.provide('management-service', { name: 'management' });
    ports.registerDisposer(() => { probe.disposerOrder.push('management'); }, 'fake management');
  };

  const orchestration: ApplicationCompositionStage = (ports) => {
    probe.stageRuns.push('orchestration');
    const managementService = ports.get<{ readonly name: string }>('management-service');
    if (managementService?.name !== 'management') throw new Error('orchestration stage lost management service');
    ports.provide('orchestration-service', { name: 'orchestration' });
    ports.registerDisposer(() => { probe.disposerOrder.push('orchestration'); }, 'fake orchestration');
  };

  return { composition: { base, management, orchestration }, probe };
}
