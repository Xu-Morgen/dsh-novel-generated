import { describe, expect, it } from 'vitest';

import { createFakePortConsumer } from './fake-port-consumer.js';
import { ApplicationKernel, createApplicationKernel } from './kernel.js';
import { DesktopLifecycle } from './lifecycle.js';

describe('I167 ApplicationKernel', () => {
  it('composes in order and owns task, abort, service, and disposer cleanup', async () => {
    const fake = createFakePortConsumer();
    const kernel = new ApplicationKernel({ composition: fake.composition });

    await kernel.start();
    expect(fake.probe.stageRuns).toEqual(['base', 'management', 'orchestration']);
    expect(kernel.snapshot()).toMatchObject({
      state: 'running',
      serviceCount: 3,
      lifecycle: { state: 'running', disposers: 3, tasks: 1, abortControllers: 1 },
    });

    await kernel.start();
    expect(fake.probe.stageRuns).toHaveLength(3);
    expect(kernel.snapshot().lifecycle.disposers).toBe(3);

    await kernel.stop();
    expect(fake.probe.abortControllersAborted).toBe(1);
    expect(fake.probe.tasksReleasedByAbort).toBe(1);
    expect(fake.probe.disposerOrder).toEqual(['orchestration', 'management', 'base']);
    expect(kernel.snapshot()).toMatchObject({
      state: 'stopped',
      serviceCount: 0,
      lifecycle: { state: 'stopped', disposers: 0, tasks: 0, abortControllers: 0 },
    });

    await kernel.stop();
    expect(fake.probe.disposerOrder).toHaveLength(3);
  });

  it('restart creates exactly one fresh registration set per cycle', async () => {
    const fake = createFakePortConsumer();
    const kernel = createApplicationKernel({ composition: fake.composition });

    await kernel.start();
    await kernel.restart();
    expect(fake.probe.stageRuns).toEqual([
      'base', 'management', 'orchestration',
      'base', 'management', 'orchestration',
    ]);
    expect(fake.probe.abortControllersCreated).toBe(2);
    expect(fake.probe.abortControllersAborted).toBe(1);
    expect(kernel.snapshot().lifecycle).toMatchObject({ disposers: 3, tasks: 1, abortControllers: 1 });

    await kernel.stop();
    expect(fake.probe.abortControllersAborted).toBe(2);
    expect(fake.probe.disposerOrder).toEqual([
      'orchestration', 'management', 'base',
      'orchestration', 'management', 'base',
    ]);
  });

  it('fails closed on duplicate service ownership and leaves no lifecycle residue', async () => {
    const kernel = createApplicationKernel({
      composition: {
        base: (ports) => {
          ports.provide('owned-once', { value: 1 });
          ports.provide('owned-once', { value: 2 });
        },
        management: () => undefined,
        orchestration: () => undefined,
      },
    });

    await expect(kernel.start()).rejects.toThrow('already provided: owned-once');
    expect(kernel.snapshot()).toMatchObject({
      state: 'stopped',
      serviceCount: 0,
      lifecycle: { state: 'stopped', disposers: 0, tasks: 0, abortControllers: 0 },
    });
  });
});

describe('I167 DesktopLifecycle', () => {
  it('rejects out-of-cycle registrations and drains abort-driven tasks on stop', async () => {
    const lifecycle = new DesktopLifecycle();
    expect(() => lifecycle.registerDisposer(() => undefined)).toThrow('while idle');
    lifecycle.start();
    expect(() => lifecycle.start()).toThrow('cannot start from starting');

    const controller = lifecycle.createAbortController('test controller');
    lifecycle.registerTask(new Promise<void>((resolve) => {
      controller.signal.addEventListener('abort', () => resolve(), { once: true });
    }), 'test task');
    await lifecycle.stop();

    expect(controller.signal.aborted).toBe(true);
    expect(lifecycle.snapshot()).toEqual({
      state: 'stopped',
      disposers: 0,
      tasks: 0,
      abortControllers: 0,
    });
    expect(() => lifecycle.createAbortController()).toThrow('while stopped');
  });
});
