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
  stateCurrent(projectId: string): Promise<unknown>;
  stateSnapshots(projectId: string): Promise<unknown[]>;
  stateRollback(projectId: string, seq: number): Promise<unknown>;
  stateDiff(projectId: string, fromSeq: number, toSeq: number): Promise<unknown>;
  canonQuery(projectId: string, filter?: unknown): Promise<unknown[]>;
  canonCorrectionPropose(projectId: string, targetId: string, input: unknown): Promise<unknown>;
  canonCorrectionAccept(projectId: string, proposalId: string): Promise<unknown>;
}
/** The mounted `remote.novelWorkspace` namespace service surface. */
export interface WorkspaceNamespace extends EditorRemote {
  viewModel(): Promise<unknown>;
}
export interface WorkspaceSlots {
  inject(key: string, cb: () => () => void): () => void;
  register(options: unknown, component: () => unknown): () => void;
}
export interface ClientPluginEntry {
  readonly name: string;
  readonly inject: readonly string[];
  apply(ctx: {
    slots: WorkspaceSlots;
    remote: { $mount(contribution: TypertRemoteContribution): Promise<TypertDisposer> };
    get(name: string, silent?: boolean): unknown;
  }): void;
}

type WorkspaceState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly model: WorkspaceViewModel };

/** Unwrap a DSH RemoteResult envelope: resolve to `value`, reject on `!ok`. */
function unwrap(promise: Promise<unknown> | undefined): Promise<unknown> {
  if (promise === undefined) return Promise.resolve(undefined);
  return promise.then((result) => {
    const envelope = result as { ok?: boolean; value?: unknown; error?: { message?: string } };
    if (envelope !== null && typeof envelope === 'object' && 'ok' in envelope) {
      if (envelope.ok === true) return envelope.value;
      throw new Error(envelope.error?.message ?? 'Remote call failed');
    }
    return result;
  });
}

function textField(React: ReactFace, label: string, value: string, onChange: (value: string) => void): unknown {
  return React.createElement('label', { key: label }, label,
    React.createElement('input', { value, onChange: (event: { target: { value: string } }) => onChange(event.target.value) }),
  );
}

function editorPanel(React: ReactFace, workspace: WorkspaceNamespace, projectId: string): unknown {
  let selected = 'characters';
  let name = '';
  let title = '';
  let message = '';
  const submit = (event: { preventDefault?: () => void }) => {
    event.preventDefault?.();
    // The Host receives the complete typed payload; the Client owns no schema.
    const operation = selected === 'characters'
      ? unwrap(workspace.characterCreate(projectId, { id: name.toLowerCase().replaceAll(' ', '-'), name, aliases: [], kind: 'extra', personality: '', background: '', motivation: '', goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [], arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [] }))
      : unwrap(workspace.worldviewCreate(projectId, { id: title.toLowerCase().replaceAll(' ', '-'), kind: 'concept', title, content: '', keywords: [], triggerMode: 'constant', weight: 0, parent: null, mutable: true, status: 'active', supersededBy: null }));
    void operation.then(() => { message = 'Saved through Host validation'; }, (error: Error) => { message = error.message; });
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

function outlineRelationshipPanel(React: ReactFace, workspace: WorkspaceNamespace, projectId: string): unknown {
  let mode = 'outline';
  let payload = '';
  let message = '';
  const save = (event: { preventDefault?: () => void }) => {
    event.preventDefault?.();
    let parsed: unknown;
    try { parsed = JSON.parse(payload); } catch { message = 'Host rejected invalid JSON payload'; return; }
    const operation = mode === 'outline'
      ? unwrap(workspace.outlineSave(projectId, parsed))
      : unwrap(workspace.relationshipSave(projectId, parsed));
    void operation.then(() => { message = 'Saved through Host validation'; }, (error: Error) => { message = error.message; });
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

function stateCanonPanel(React: ReactFace, workspace: WorkspaceNamespace, projectId: string): unknown {
  let snapshots: unknown[] = [];
  let canon: unknown[] = [];
  let selectedSeq = 0;
  let targetId = '';
  let correction = '';
  let proposalId = '';
  let message = '';
  const load = () => {
    void Promise.all([unwrap(workspace.stateSnapshots(projectId)), unwrap(workspace.canonQuery(projectId, { superseded: 'all' }))])
      .then(([nextSnapshots, nextCanon]) => { snapshots = (nextSnapshots as unknown[]) ?? []; canon = (nextCanon as unknown[]) ?? []; message = 'Loaded from Host'; }, (error: Error) => { message = error.message; });
  };
  const rollback = () => {
    void unwrap(workspace.stateRollback(projectId, selectedSeq)).then(() => { message = `Rolled back through StateEngine to snapshot ${selectedSeq}`; load(); }, (error: Error) => { message = error.message; });
  };
  const propose = (event: { preventDefault?: () => void }) => {
    event.preventDefault?.();
    let parsed: unknown;
    try { parsed = JSON.parse(correction); } catch { message = 'Host rejected invalid correction JSON'; return; }
    void unwrap(workspace.canonCorrectionPropose(projectId, targetId, parsed)).then((record: unknown) => { proposalId = (record as { id: string }).id; message = 'Correction is pending ConfirmationGate acceptance'; }, (error: Error) => { message = error.message; });
  };
  const accept = () => {
    void unwrap(workspace.canonCorrectionAccept(projectId, proposalId)).then(() => { message = 'Correction appended as a supersede event'; load(); }, (error: Error) => { message = error.message; });
  };
  load();
  return React.createElement('section', { 'data-novel-editors': 'c2-c4' },
    React.createElement('h3', null, 'State snapshots and Canon ledger'),
    React.createElement('div', { 'data-novel-state': 'snapshots' },
      React.createElement('button', { type: 'button', onClick: load }, 'Refresh snapshots and Canon'),
      React.createElement('select', { value: selectedSeq, onChange: (event: { target: { value: string } }) => { selectedSeq = Number(event.target.value); } },
        snapshots.map((snapshot: any) => React.createElement('option', { key: snapshot.seq, value: snapshot.seq }, `Snapshot ${snapshot.seq}`)),
      ),
      React.createElement('button', { type: 'button', onClick: rollback }, 'Rollback through StateEngine'),
    ),
    React.createElement('ol', { 'data-novel-canon': 'readonly' }, canon.map((event: any) => React.createElement('li', { key: event.id }, `${event.seq}: ${event.summary}${event.supersededBy ? ' (superseded)' : ''}`))),
    React.createElement('form', { onSubmit: propose, 'data-novel-canon-correction': 'gate-required' },
      React.createElement('input', { placeholder: 'Canon event id', value: targetId, onChange: (event: { target: { value: string } }) => { targetId = event.target.value; } }),
      React.createElement('textarea', { placeholder: 'Correction JSON', value: correction, onChange: (event: { target: { value: string } }) => { correction = event.target.value; } }),
      React.createElement('button', { type: 'submit' }, 'Propose correction'),
    ),
    React.createElement('input', { placeholder: 'Pending proposal id', value: proposalId, onChange: (event: { target: { value: string } }) => { proposalId = event.target.value; } }),
    React.createElement('button', { type: 'button', onClick: accept }, 'Accept correction through ConfirmationGate'),
    message ? React.createElement('p', { role: 'status' }, message) : null,
  );
}

function view(React: ReactFace, state: WorkspaceState, workspace: WorkspaceNamespace | undefined): unknown {
  if (state.status === 'loading') return React.createElement('section', { 'data-novel-workspace': 'loading' }, 'Loading workspace...');
  if (state.status === 'error') return React.createElement('section', { 'data-novel-workspace': 'error', role: 'alert' }, state.message);
  if (!workspace) return React.createElement('section', { 'data-novel-workspace': 'error', role: 'alert' }, 'Workspace unavailable');
  return React.createElement(
    'section', { 'data-novel-workspace': 'ready' },
    React.createElement('h2', null, 'Novel Creation Workspace'),
    React.createElement('p', null, `Ready · ${state.model.version}`),
    React.createElement('nav', { 'aria-label': 'Writing tools' }, state.model.capabilities.map((capability) =>
      React.createElement('button', { key: capability, type: 'button', 'data-command': capability }, capability),
    )),
    editorPanel(React, workspace, 'default'),
    outlineRelationshipPanel(React, workspace, 'default'),
    stateCanonPanel(React, workspace, 'default'),
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
      let workspace: WorkspaceNamespace | undefined;
      let mounted = false;
      let remoteDisposer: TypertDisposer | undefined;
      ctx.slots.inject('shell.overlay', () => {
        const slotDisposer = ctx.slots.register(
          { name: 'shell.overlay', id: 'novel-creation-tool-workspace', order: 0, label: 'Novel workspace' },
          () => view(React, state, workspace),
        );
        // Self-mount the namespace, then resolve it through `ctx.get` instead of
        // `inject`: injecting `remote.novelWorkspace` here would deadlock, because
        // that service only exists after `$mount` completes.
        void ctx.remote.$mount(workspaceRemoteContribution).then((dispose) => {
          if (!mounted) { void dispose(); return; }
          remoteDisposer = dispose;
          workspace = ctx.get('remote.novelWorkspace', false) as WorkspaceNamespace | undefined;
          if (!workspace) { state = { status: 'error', message: 'Workspace unavailable' }; return; }
          return unwrap(workspace.viewModel()).then(
            (model) => { state = { status: 'ready', model: model as WorkspaceViewModel }; },
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
