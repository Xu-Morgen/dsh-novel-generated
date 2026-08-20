import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots';
import { describe, expect, it } from 'vitest';

import factory from './client.js';

/**
 * I2 Slot contract (design §0.1.2, §0.1.4; H0-5, H0-6): the probe registers ONE
 * static marker into a single additive Slot and Fiber dispose removes it. The
 * probe's runtime target `shell.overlay` is exercised through the factory test
 * below; here the real SlotCore mechanics prove register/dispose and the
 * fail-loud undeclared-slot rule. `root` is declared locally to mirror the
 * shell's single a-priori declaration without importing the shell layout.
 */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'root': { kind: 'single'; scope: 'root' };
  }
}

describe('I2 Slot registration / disposal', () => {
  it('registers exactly one entry and removes it on dispose', () => {
    const core = new SlotCore();
    const disposer = core.register({ name: 'root' }, () => null);

    expect(core.entries('root')).toHaveLength(1);

    disposer();
    expect(core.entries('root')).toHaveLength(0);
  });

  it('registering into an undeclared slot fails loud (no silent skip)', () => {
    const core = new SlotCore();
    expect(() =>
      (core as unknown as { register(o: unknown, c: unknown): unknown }).register(
        { name: 'undeclared.slot' },
        () => null,
      ),
    ).toThrow();
  });
});

describe('I2 client probe factory', () => {
  it('returns a client entry that registers exactly one shell.overlay marker', () => {
    const registrations: Array<{ options: Record<string, unknown>; component: () => unknown }> = [];
    const injected: string[] = [];
    const fakeReact = {
      createElement: (tag: string, props: Record<string, unknown>, ...children: string[]) =>
        ({ tag, props, children }),
    };
    const slots = {
      inject(key: string, cb: () => () => void): () => void {
        injected.push(key);
        cb();
        return () => {};
      },
      register(options: Record<string, unknown>, component: () => unknown): () => void {
        registrations.push({ options, component });
        return () => {};
      },
    };

    const entry = factory((spec: string) => (spec === 'react' ? fakeReact : undefined));
    expect(entry.name).toBe('novel-creation-tool-client');
    expect(entry.inject).toEqual(['slots']);

    entry.apply({ slots });

    expect(injected).toEqual(['shell.overlay']);
    expect(registrations).toHaveLength(1);
    expect(registrations[0].options).toMatchObject({
      name: 'shell.overlay',
      id: 'novel-creation-tool-probe',
    });

    // The marker is static and non-domain: a single div carrying the probe tag.
    const rendered = registrations[0].component();
    expect(rendered).toEqual({
      tag: 'div',
      props: { 'data-i2-probe': 'marker' },
      children: ['I2-PROBE'],
    });
  });
});
