import type { TypertRemoteContribution, TypertDisposer } from '@deepseek-ai/dsh-typert-protocol';
import { workspaceRemoteContribution, type WorkspaceViewModel } from '../remote.js';

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
  projectList(): Promise<unknown[]>;
  projectCreate(input: unknown): Promise<unknown>;
  projectOpen(projectId: string): Promise<unknown>;
  uploadStart(input: unknown): Promise<unknown>;
  uploadChunk(uploadId: string, index: number, base64: string): Promise<unknown>;
  uploadFinalize(uploadId: string): Promise<unknown>;
  uploadCancel(uploadId: string): Promise<unknown>;
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
    effect(callback: () => void | (() => void), label?: string): () => void;
  }): void;
}

export type WorkspaceStatus =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly model: WorkspaceViewModel };

export interface WorkbenchStyleElement {
  setAttribute(name: string, value: string): void;
  remove(): void;
  textContent: string;
}

export const LAYERS = [
  { id: 'characters', label: '角色', title: '角色核心（B3）', hint: '角色列表与详情表单（I47）。' },
  { id: 'worldview', label: '世界观', title: '世界观（B2）', hint: '世界观条目与改写（supersede）（I47）。' },
  { id: 'outline', label: '大纲', title: '大纲与细纲（B5）', hint: '幕→节→细纲结构化编辑（I48）。' },
  { id: 'relationship', label: '关系', title: '关系（C1）', hint: '关系对结构化编辑（I48）。' },
  { id: 'state', label: '状态', title: '状态快照（C2）', hint: '快照时间线 / 回滚 / diff（I49）。' },
  { id: 'canon', label: '正史', title: '正史账本（C4）', hint: '只读账本与 supersede 更正（I49）。' },
] as const;
export type LayerId = (typeof LAYERS)[number]['id'];

/** Unwrap a DSH RemoteResult envelope: resolve to `value`, reject on `!ok`. */
export function unwrap(promise: Promise<unknown> | undefined): Promise<unknown> {
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

/** Small React.createElement helper shared by layer renderers. */
export type El = (tag: string, props?: Record<string, unknown> | null, ...children: unknown[]) => unknown;
export function el(React: ReactFace): El {
  return (tag, props, ...children) => React.createElement(tag, props ?? null, ...children);
}

/** Render a newline-separated string list as a controlled textarea field. */
export function listField(h: El, label: string, value: string[], onChange: (value: string[]) => void): unknown {
  const text = value.join('\n');
  return h('label', { className: 'nv-field' },
    h('span', { className: 'nv-field__label' }, label),
    h('textarea', {
      className: 'nv-field__input',
      value: text,
      rows: 3,
      onChange: (event: { target: { value: string } }) => onChange(event.target.value.split('\n').map((item) => item.trim()).filter((item) => item.length > 0)),
    }),
  );
}

/** Render a controlled text input or textarea field. */
export function characterText(h: El, label: string, value: string, onChange: (value: string) => void, area = false): unknown {
  return h('label', { className: 'nv-field' },
    h('span', { className: 'nv-field__label' }, label),
    area
      ? h('textarea', { className: 'nv-field__input', value, onChange: (event: { target: { value: string } }) => onChange(event.target.value), rows: 3 })
      : h('input', { type: 'text', className: 'nv-field__input', value, onChange: (event: { target: { value: string } }) => onChange(event.target.value) }),
  );
}

/** Create a stable draft id from a user-visible name. */
export function slug(name: string): string {
  const lowered = name.toLowerCase().replaceAll(' ', '-').replace(/[^a-z0-9_-]/g, '');
  return lowered.slice(0, 64) || 'untitled';
}

export type { TypertDisposer } from '@deepseek-ai/dsh-typert-protocol';
export type { WorkspaceViewModel } from '../remote.js';
export { workspaceRemoteContribution };
