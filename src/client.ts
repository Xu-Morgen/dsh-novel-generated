import type { TypertRemoteContribution, TypertDisposer } from '@deepseek-ai/dsh-typert-protocol';
import { workspaceRemoteContribution, type WorkspaceViewModel } from './remote.js';

export type BundleRequire = (spec: string) => unknown;
export interface ReactFace {
  createElement(tag: string, props: Record<string, unknown> | null, ...children: unknown[]): unknown;
}
export interface EditorRemote {
  characterList(projectId: string): Promise<unknown[]>;
  characterRead(projectId: string, entityId: string): Promise<unknown>;
  characterCreate(projectId: string, input: unknown): Promise<unknown>;
  characterUpdate(projectId: string, entityId: string, patch: unknown): Promise<unknown>;
  worldviewList(projectId: string): Promise<unknown[]>;
  worldviewRead(projectId: string, entityId: string): Promise<unknown>;
  worldviewCreate(projectId: string, input: unknown): Promise<unknown>;
  worldviewRewrite(projectId: string, entityId: string, input: unknown): Promise<unknown>;
  outlineRead(projectId: string): Promise<unknown>;
  outlineSave(projectId: string, input: unknown): Promise<unknown>;
  outlineBeatCards(projectId: string): Promise<unknown[]>;
  relationshipRead(projectId: string): Promise<unknown[]>;
  relationshipSave(projectId: string, input: unknown): Promise<unknown>;
}
export interface WorkspaceRemote {
  $mount(contribution: TypertRemoteContribution): Promise<TypertDisposer>;
  novelWorkspace: { viewModel(): Promise<WorkspaceViewModel> };
  novelCharacter?: EditorRemote;
  novelWorldview?: EditorRemote;
  novelOutline?: EditorRemote;
  novelRelationship?: EditorRemote;
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

function textField(React: ReactFace, label: string, value: string, onChange: (value: string) => void): unknown {
  return React.createElement('label', { key: label }, label,
    React.createElement('input', { value, onChange: (event: { target: { value: string } }) => onChange(event.target.value) }),
  );
}

function editorPanel(React: ReactFace, remote: WorkspaceRemote, projectId: string): unknown {
  let selected = 'characters';
  let name = '';
  let title = '';
  let message = '';
  const submit = (event: { preventDefault?: () => void }) => {
    event.preventDefault?.();
    message = 'Saved through Host validation';
    // The Host receives the complete typed payload; the Client owns no schema.
    const operation = selected === 'characters'
      ? remote.novelCharacter?.characterCreate(projectId, { id: name.toLowerCase().replaceAll(' ', '-'), name, aliases: [], kind: 'extra', personality: '', background: '', motivation: '', goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [], arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [] })
      : remote.novelWorldview?.worldviewCreate(projectId, { id: title.toLowerCase().replaceAll(' ', '-'), kind: 'concept', title, content: '', keywords: [], triggerMode: 'constant', weight: 0, parent: null, mutable: true, status: 'active', supersededBy: null });
    void operation?.catch((error: Error) => { message = error.message; });
  };
  return React.createElement('section', { 'data-novel-editors': 'b3-b2' },
    React.createElement('h3', null, 'Character core and Worldview'),
    React.createElement('div', { role: 'tablist' },
      React.createElement('button', { type: 'button', role: 'tab', 'aria-selected': selected === 'characters', onClick: () => { selected = 'characters'; } }, 'Characters'),
      React.createElement('button', { type: 'button', role: 'tab', 'aria-selected': selected === 'worldview', onClick: () => { selected = 'worldview'; } }, 'Worldview'),
    ),
    React.createElement('form', { onSubmit: submit },
      selected === 'characters' ? textField(React, 'Name', name, (value) => { name = value; }) : textField(React, 'Title', title, (value) => { title = value; }),
      React.createElement('button', { type: 'submit' }, 'Save'),
    ),
    message ? React.createElement('p', { role: 'status' }, message) : null,
  );
}

function outlineRelationshipPanel(React: ReactFace, remote: WorkspaceRemote, projectId: string): unknown {
  let mode = 'outline';
  let payload = '';
  let message = '';
  const save = (event: { preventDefault?: () => void }) => {
    event.preventDefault?.();
    let parsed: unknown;
    try { parsed = JSON.parse(payload); } catch { message = 'Host rejected invalid JSON payload'; return; }
    const operation = mode === 'outline'
      ? remote.novelOutline?.outlineSave(projectId, parsed)
      : remote.novelRelationship?.relationshipSave(projectId, parsed);
    void operation?.then(() => { message = 'Saved through Host validation'; }, (error: Error) => { message = error.message; });
  };
  return React.createElement('section', { 'data-novel-editors': 'b5-c1' },
    React.createElement('h3', null, 'Outline, scene cards, and relationships'),
    React.createElement('div', { role: 'tablist' },
      React.createElement('button', { type: 'button', role: 'tab', 'aria-selected': mode === 'outline', onClick: () => { mode = 'outline'; } }, 'Outline / scene cards'),
      React.createElement('button', { type: 'button', role: 'tab', 'aria-selected': mode === 'relationship', onClick: () => { mode = 'relationship'; } }, 'Relationships'),
    ),
    React.createElement('form', { onSubmit: save },
      React.createElement('textarea', { value: payload, placeholder: 'Host-validated JSON payload', onChange: (event: { target: { value: string } }) => { payload = event.target.value; } }),
      React.createElement('button', { type: 'submit' }, 'Save'),
    ),
    message ? React.createElement('p', { role: 'alert' }, message) : null,
  );
}

function view(React: ReactFace, state: WorkspaceState, remote: WorkspaceRemote): unknown {
  if (state.status === 'loading') return React.createElement('section', { 'data-novel-workspace': 'loading' }, 'Loading workspace...');
  if (state.status === 'error') return React.createElement('section', { 'data-novel-workspace': 'error', role: 'alert' }, state.message);
  return React.createElement(
    'section', { 'data-novel-workspace': 'ready' },
    React.createElement('h2', null, 'Novel Creation Workspace'),
    React.createElement('p', null, `Ready · ${state.model.version}`),
    React.createElement('nav', { 'aria-label': 'Writing tools' }, state.model.capabilities.map((capability) =>
      React.createElement('button', { key: capability, type: 'button', 'data-command': capability }, capability),
    )),
    editorPanel(React, remote, 'default'),
    outlineRelationshipPanel(React, remote, 'default'),
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
          () => view(React, state, ctx.remote),
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
