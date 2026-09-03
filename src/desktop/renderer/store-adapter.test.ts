import { describe, expect, it, vi } from 'vitest';

import { createDesktopWorkbenchStore } from './store-adapter.js';

describe('I173 desktop Store adapter', () => {
  it('preserves WorkbenchActions semantics with immutable snapshots', () => {
    const store = createDesktopWorkbenchStore();
    const initial = store.getSnapshot();

    store.actions.collapse();
    expect(store.getSnapshot()).not.toBe(initial);
    expect(store.getSnapshot().collapsed).toBe(true);
    expect(initial.collapsed).toBe(false);

    store.actions.setNavWidth(-1);
    store.actions.setPanelWidth(99_999);
    store.actions.activateView('characters');
    store.actions.newProjectName('雾港纪事');

    expect(store.getSnapshot()).toMatchObject({
      navWidth: 120,
      panelWidth: 1600,
      activeView: 'characters',
      newProjectName: '雾港纪事',
    });
  });

  it('creates isolated instances and publishes exactly once per successful action', () => {
    const first = createDesktopWorkbenchStore();
    const second = createDesktopWorkbenchStore();
    const listener = vi.fn();
    const unsubscribe = first.subscribe(listener);

    first.actions.newProjectName('只属于第一个窗口');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(second.getSnapshot().newProjectName).toBe('');

    unsubscribe();
    first.actions.collapse();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('keeps the old snapshot and emits nothing when an action fails', () => {
    const store = createDesktopWorkbenchStore();
    const before = store.getSnapshot();
    const listener = vi.fn();
    store.subscribe(listener);

    expect(() => store.actions.characterMutate(() => { throw new Error('fixture failure'); })).toThrow('fixture failure');
    expect(store.getSnapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it('drops listeners and late actions after disposal', () => {
    const store = createDesktopWorkbenchStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const before = store.getSnapshot();

    store.dispose();
    store.actions.collapse();

    expect(store.getSnapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });
});
