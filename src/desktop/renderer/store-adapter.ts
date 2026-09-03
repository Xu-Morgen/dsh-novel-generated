import { useSyncExternalStore } from 'react';

import { createWorkbenchStore } from '../../client/store/index.js';
import type {
  BakedStoreActions,
  DefineStore,
  WorkbenchActions,
  WorkbenchState,
} from '../../client/store/types.js';

/**
 * Electron Renderer 的 framework-neutral store 实例。
 *
 * I173 只替换旧 DSH `defineStore` adapter，不改变 `WorkbenchState` 或
 * `WorkbenchActions`。`dispose()` 是桌面 root 的生命周期边界：卸载后既不通知
 * listener，也不再接受迟到 action，避免旧 Fiber 语义在 React root 外泄漏。
 * 见设计 §0.1.2、§14.32.1。
 */
export interface DesktopStoreInstance<T, A> {
  readonly actions: A;
  getSnapshot(): T;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

function cloneState<T>(state: T): T {
  return structuredClone(state);
}

const desktopStoreDisposers = new WeakMap<object, () => void>();

/**
 * 把既有 mutable-draft action 表适配为不可变快照 store。
 *
 * 每个 action 先复制当前快照，再运行原 action；action 抛错时不发布半成品快照。
 * 每次 `create()` 都产生独立实例，Renderer 不存在跨窗口 singleton 真相。
 */
export const desktopDefineStore: DefineStore = (spec) => ({
  create(): DesktopStoreInstance<ReturnType<typeof spec.init>, BakedStoreActions<ReturnType<typeof spec.init>, typeof spec.actions>> {
    type State = ReturnType<typeof spec.init>;
    type Actions = typeof spec.actions;

    let active = true;
    let state: State = spec.init();
    const listeners = new Set<() => void>();
    const actions = {} as BakedStoreActions<State, Actions>;

    for (const name of Object.keys(spec.actions) as Array<keyof Actions>) {
      const action = spec.actions[name];
      actions[name] = ((...params: never[]) => {
        if (!active) return;
        const next = cloneState(state);
        action(next, ...params);
        state = next;
        for (const listener of [...listeners]) listener();
      }) as BakedStoreActions<State, Actions>[keyof Actions];
    }

    const instance = {
      actions,
      getSnapshot: () => state,
      subscribe(listener: () => void) {
        if (!active) return () => {};
        listeners.add(listener);
        return () => { listeners.delete(listener); };
      },
      dispose() {
        active = false;
        listeners.clear();
      },
    };
    desktopStoreDisposers.set(instance, instance.dispose);
    return instance;
  },
});

/** 创建供唯一桌面 React root 使用的既有创作台 store。 */
export function createDesktopWorkbenchStore(): DesktopStoreInstance<WorkbenchState, WorkbenchActions> {
  const store = createWorkbenchStore(desktopDefineStore).create();
  return {
    actions: store.actions,
    getSnapshot: store.getSnapshot,
    subscribe: store.subscribe,
    dispose: () => { desktopStoreDisposers.get(store)?.(); },
  };
}

/** React 18 并发安全订阅；server snapshot 与 client snapshot 保持同源。 */
export function useDesktopStore<T>(store: DesktopStoreInstance<WorkbenchState, WorkbenchActions>, select: (state: WorkbenchState) => T): T {
  return useSyncExternalStore(store.subscribe, () => select(store.getSnapshot()), () => select(store.getSnapshot()));
}
