import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots';
import { describe, expect, it } from 'vitest';
import factory from './client.js';

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap { root: { kind: 'single'; scope: 'root' }; }
}

describe('I33 product Client workspace', () => {
  it('registers one Slot entry and renders the Host view model', async () => {
    const registrations: Array<{ options: Record<string, unknown>; component: () => unknown }> = [];
    let resolveModel!: (value: unknown) => void;
    const model = new Promise<any>((resolve) => { resolveModel = resolve; });
    const fakeReact = { createElement: (tag: string, props: Record<string, unknown> | null, ...children: unknown[]) => ({ tag, props, children }) };
    let disposeCount = 0;
    const remote = { $mount: async () => async () => { disposeCount += 1; }, novelWorkspace: { viewModel: () => model } };
    const slots = {
      inject(key: string, cb: () => () => void) { expect(key).toBe('shell.overlay'); return cb(); },
      register(options: Record<string, unknown>, component: () => unknown) { registrations.push({ options, component }); return () => {}; },
    };
    const entry = factory((spec) => spec === 'react' ? fakeReact : undefined);
    entry.apply({ slots, remote });
    expect(entry.inject).toEqual(['slots', 'remote']);
    expect(registrations).toHaveLength(1);
    expect((registrations[0].component() as { props: Record<string, unknown> }).props['data-novel-workspace']).toBe('loading');
    resolveModel({ product: 'novel-creation-tool', version: '2.0.0', ready: true, capabilities: ['generate', 'rewrite', 'continue', 'inspire'] });
    await Promise.resolve();
    await Promise.resolve();
    expect((registrations[0].component() as { props: Record<string, unknown> }).props['data-novel-workspace']).toBe('ready');
    expect(registrations[0].options).toMatchObject({ id: 'novel-creation-tool-workspace' });
  });

  it('shows an error state when the Host Remote fails and disposes the Remote', async () => {
    const registrations: Array<() => unknown> = [];
    const fakeReact = { createElement: (tag: string, props: Record<string, unknown> | null, ...children: unknown[]) => ({ tag, props, children }) };
    let rejectModel!: (error: Error) => void;
    const model = new Promise<never>((_, reject) => { rejectModel = reject; });
    let disposeCount = 0;
    const remote = { $mount: async () => async () => { disposeCount += 1; }, novelWorkspace: { viewModel: () => model } };
    let slotDispose!: () => void;
    const slots = {
      inject(_: string, cb: () => () => void) { slotDispose = cb(); return () => {}; },
      register(_: unknown, component: () => unknown) { registrations.push(component); return () => {}; },
    };
    factory((spec) => spec === 'react' ? fakeReact : undefined).apply({ slots, remote });
    rejectModel(new Error('offline'));
    await Promise.resolve();
    await Promise.resolve();
    expect((registrations[0]() as { props: Record<string, unknown> }).props['data-novel-workspace']).toBe('error');
    slotDispose();
    expect(disposeCount).toBe(1);
  });

  it('renders B3/B2 editor controls without adding browser file or schema owners', async () => {
    const fakeReact = { createElement: (tag: string, props: Record<string, unknown> | null, ...children: unknown[]) => ({ tag, props, children }) };
    const model = Promise.resolve({ product: 'novel-creation-tool' as const, version: '2.0.0' as const, ready: true as const, capabilities: ['generate', 'rewrite', 'continue', 'inspire'] as const });
    const remote = { $mount: async () => async () => {}, novelWorkspace: { viewModel: () => model } };
    const registrations: Array<() => any> = [];
    const slots = { inject(_: string, cb: () => () => void) { cb(); return () => {}; }, register(_: unknown, component: () => unknown) { registrations.push(component); return () => {}; } };
    factory((spec) => spec === 'react' ? fakeReact : undefined).apply({ slots, remote });
    await Promise.resolve();
    await Promise.resolve();
    const rendered = registrations[0]();
    const children = (rendered as any).children as any[];
    expect(children.some((child) => child?.props?.['data-novel-editors'] === 'b5-c1')).toBe(true);
  });

  it('keeps the verified SlotCore registration reversible', () => {
    const core = new SlotCore();
    const disposer = core.register({ name: 'root' }, () => null);
    expect(core.entries('root')).toHaveLength(1);
    disposer();
    expect(core.entries('root')).toHaveLength(0);
  });
});
