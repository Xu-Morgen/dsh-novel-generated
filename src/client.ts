/**
 * I33 product Client bundle. It owns only Slot view state; Host owns the
 * workspace model and all domain behavior (design §0.1.2, plan I33).
 */
import type { TypertRemoteContribution, TypertDisposer } from '@deepseek-ai/dsh-typert-protocol';
import { workspaceRemoteContribution, type WorkspaceViewModel } from './remote.js';

export type BundleRequire = (spec: string) => unknown;
export interface ReactFace {
  createElement(tag: string, props: Record<string, unknown> | null, ...children: unknown[]): unknown;
}
export interface WorkspaceRemote {
  $mount(contribution: TypertRemoteContribution): Promise<TypertDisposer>;
  novelWorkspace: { viewModel(): Promise<WorkspaceViewModel> };
}
export interface WorkspaceSlots {
  inject(key: string, cb: () => () => void): () => void;
  register(options: unknown, component: () => unknown): () => void;
}
export interface ClientPluginEntry {
  readonly name: string;
  readonly inject: readonly string[];
  apply(ctx: { slots: WorkspaceSlots; remote: WorkspaceRemote }): void;
}

type WorkspaceState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly model: WorkspaceViewModel };

function view(React: ReactFace, state: WorkspaceState): unknown {
  if (state.status === 'loading') return React.createElement('section', { 'data-novel-workspace': 'loading' }, 'Loading workspace...');
  if (state.status === 'error') return React.createElement('section', { 'data-novel-workspace': 'error', role: 'alert' }, state.message);
  return React.createElement(
    'section', { 'data-novel-workspace': 'ready' },
    React.createElement('h2', null, 'Novel Creation Workspace'),
    React.createElement('p', null, `Ready · ${state.model.version}`),
    React.createElement('nav', { 'aria-label': 'Writing tools' }, state.model.capabilities.map((capability) =>
      React.createElement('button', { key: capability, type: 'button', 'data-command': capability }, capability),
    )),
  );
}

/** Public bundle factory; React and Remote are supplied by the DSH client shell. */
export default function factory(require: BundleRequire): ClientPluginEntry {
  const React = require('react') as ReactFace;
  return {
    name: 'novel-creation-tool-client',
    inject: ['slots', 'remote'],
    apply(ctx): void {
      let state: WorkspaceState = { status: 'loading' };
      let mounted = false;
      let remoteDisposer: TypertDisposer | undefined;
      ctx.slots.inject('shell.overlay', () => {
        const slotDisposer = ctx.slots.register(
          { name: 'shell.overlay', id: 'novel-creation-tool-workspace', order: 0, label: 'Novel workspace' },
          () => view(React, state),
        );
        void ctx.remote.$mount(workspaceRemoteContribution).then((dispose) => {
          if (!mounted) { void dispose(); return; }
          remoteDisposer = dispose;
          return ctx.remote.novelWorkspace.viewModel().then(
            (model) => { state = { status: 'ready', model }; },
            () => { state = { status: 'error', message: 'Workspace unavailable' }; },
          );
        }, () => { state = { status: 'error', message: 'Workspace unavailable' }; });
        mounted = true;
        return () => {
          mounted = false;
          slotDisposer();
          if (remoteDisposer) void remoteDisposer();
        };
      });
    },
  };
}
