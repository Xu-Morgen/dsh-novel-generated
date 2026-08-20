/**
 * I2 gate-only Client probe (design §0.1.3 I2, §0.1.2; H0-5, H0-8).
 *
 * This module is the package's client half (`exports["./client"]`), compiled by
 * `scripts/build-client.mjs` into the `window.__ModuleLoader__.load({id,factory})`
 * bundle the DSH client module system serves at
 * `/plugins/novel-creation-tool/client.js` (design §0.1.3 I2).
 *
 * It is deliberately non-product: it registers ONE static marker into the
 * verified additive `shell.overlay` Slot and reads no domain state. The
 * registration runs through the Fiber so unloading the plugin removes the Slot
 * (design §0.1.2, §0.1.4, H0-6).
 */

/** Synchronous module-table require handed to the bundle factory. */
export type BundleRequire = (spec: string) => unknown;

/** Minimal React face used only to create the static marker element. */
export interface ReactFace {
  createElement(tag: string, props: Record<string, unknown>, ...children: string[]): unknown;
}

/** Minimal Slot face the probe consumes (the real one is DSH's SlotRegistry). */
export interface ProbeSlots {
  /** Run `cb` once `key` is declared; fold its disposer into this plugin's Fiber. */
  inject(key: string, cb: () => () => void): () => void;
  /** Contribute a component to a declared Slot; returns the registration disposer. */
  register(options: unknown, component: () => unknown): () => void;
}

/** Minimal Cordis client plugin entry returned by the bundle factory. */
export interface ClientPluginEntry {
  readonly name: string;
  readonly inject: readonly string[];
  apply(ctx: { slots: ProbeSlots }): void;
}

/**
 * The bundle factory: returns the Client plugin entry. `require` resolves the
 * shell-own `react` module (static in the DSH client module table), so the
 * bundle itself carries no React copy (design §0.1.3 I2).
 */
export default function factory(require: BundleRequire): ClientPluginEntry {
  const React = require('react') as ReactFace;
  return {
    name: 'novel-creation-tool-client',
    inject: ['slots'],
    apply(ctx: { slots: ProbeSlots }): void {
      // `slots.inject` waits for `shell.overlay` (declared by the shell layout)
      // and folds `register`'s disposer into this plugin's Fiber on unload.
      ctx.slots.inject('shell.overlay', () =>
        ctx.slots.register(
          { name: 'shell.overlay', id: 'novel-creation-tool-probe', order: 0, label: 'I2 probe' },
          () => React.createElement('div', { 'data-i2-probe': 'marker' }, 'I2-PROBE'),
        ),
      );
    },
  };
}
