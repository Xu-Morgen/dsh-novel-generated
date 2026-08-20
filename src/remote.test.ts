import { Context } from '@deepseek-ai/cordis';
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry';
import { describe, expect, it } from 'vitest';

import {
  NOVEL_PROBE_NAMESPACE,
  PROBE_MARKER,
  probeContribution,
  probeData,
  probeInvocation,
  probeRemoteContribution,
} from './remote.js';

/**
 * I2 public Remote contract (design §0.1.2, §0.1.3 I2; H0-9): an ordinary
 * out-of-tree plugin exposes one Remote method, `novelProbe/probe`, through the
 * public Typert registry (`ctx.typert.register`). This is NOT dynamic
 * `harness.handle`/`host.call` and NOT an internal builder — it is the
 * version-locked public contract (@deepseek-ai/dsh-typert-*@0.1.0-rc.7).
 */
describe('I2 public Remote probe', () => {
  it('registers the contribution and resolves the endpoint, then disposes', async () => {
    const root = new Context();
    await root.plugin(TypertRegistry);

    const disposer = root.typert.register(probeContribution);
    expect(root.typert.local.get(`${NOVEL_PROBE_NAMESPACE}/probe`)).toBe(probeInvocation);

    disposer();
    expect(root.typert.local.get(`${NOVEL_PROBE_NAMESPACE}/probe`)).toBeUndefined();
    await root.fiber.dispose();
  });

  it('round-trips probe data through the descriptor-driven dispatch', async () => {
    const root = new Context();
    await root.plugin(TypertRegistry);
    root.provide(NOVEL_PROBE_NAMESPACE, { probe: probeData });
    const disposer = root.typert.register(probeContribution);

    // The DSH gateway resolves `namespace/method` -> descriptor -> Cordis
    // service method. This reproduces that dispatch against the live registry.
    const descriptor = root.typert.local.get(`${NOVEL_PROBE_NAMESPACE}/probe`);
    expect(descriptor).toBeDefined();
    const service = root.get(NOVEL_PROBE_NAMESPACE) as Record<string, () => unknown>;
    expect(descriptor!.method).toBe('probe');
    expect(service[descriptor!.method]()).toEqual({ marker: PROBE_MARKER, ready: true });

    disposer();
    await root.fiber.dispose();
    expect(root.get(NOVEL_PROBE_NAMESPACE, false)).toBeUndefined();
  });

  it('exposes the same descriptors as the client $mount contribution', () => {
    expect(probeRemoteContribution.package).toBe('novel-creation-tool');
    expect(probeRemoteContribution.descriptors).toEqual([probeInvocation]);
  });
});
