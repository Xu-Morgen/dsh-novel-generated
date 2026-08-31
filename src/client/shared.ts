import type { TypertRemoteContribution, TypertDisposer } from '@deepseek-ai/dsh-typert-protocol';
import { workspaceRemoteContribution, writingRemoteContribution, reviewRemoteContribution, queueRemoteContribution, knowledgeRemoteContribution, ruleStyleRemoteContribution, progressRemoteContribution, importExportRemoteContribution, branchRemoteContribution, searchRemoteContribution, statisticsRemoteContribution, timelineRemoteContribution, type WorkspaceViewModel } from '../remote.js';
// I91：namespace 类型从 host contribution 派生（见 remote-namespace.ts）——
// 消除手写 `Promise<unknown>` 接口，方法签名变更在 Client 消费处即报编译错
// （review v2.0 §3.1 / 计划 §18 I91）。
export type {
  WorkspaceNamespace,
  WritingNamespace,
  ReviewNamespace,
  ReviewRepairNamespace,
  QueueNamespace,
  KnowledgeNamespace,
  RuleStyleNamespace,
  ProgressNamespace,
  ImportExportNamespace,
  BranchNamespace,
  SearchNamespace,
  StatisticsNamespace,
  SceneOutlineBindingNamespace,
  TimelineNamespace,
  TextMutationNamespace,
  TextDeletionNamespace,
  OutlineGenerationBaselineNamespace,
  OutlineReconciliationNamespace,
  ReferenceAuditNamespace,
  ReferenceCorrectionNamespace,
  LongDraftNamespace,
  OutlineGenerationScopeNamespace,
  RemoteResult,
} from './remote-namespace.js';
export type { ReviewRepairProposalShape } from '../host/remote/review-repair.js';
import type {
  WorkspaceNamespace,
  WritingNamespace,
  ReviewNamespace,
  ReviewRepairNamespace,
  QueueNamespace,
  KnowledgeNamespace,
  RuleStyleNamespace,
  ProgressNamespace,
  ImportExportNamespace,
  BranchNamespace,
  SearchNamespace,
  StatisticsNamespace,
  SceneOutlineBindingNamespace,
  TimelineNamespace,
  TextMutationNamespace,
  TextDeletionNamespace,
  RemoteResult,
  OutlineReconciliationNamespace,
  ReferenceAuditNamespace,
  ReferenceCorrectionNamespace,
  LongDraftNamespace,
} from './remote-namespace.js';

export type BundleRequire = (spec: string) => unknown;

export interface ReactFace {
  createElement(tag: string, props: Record<string, unknown> | null, ...children: unknown[]): unknown;
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
  { id: 'characters', label: '角色', title: '角色核心', hint: '角色列表与详情表单。' },
  { id: 'worldview', label: '世界观', title: '世界观', hint: '世界观条目与改写。' },
  { id: 'outline', label: '大纲', title: '大纲与细纲', hint: '幕、节与细纲结构化编辑。' },
  { id: 'relationship', label: '关系', title: '关系', hint: '角色关系对结构化编辑。' },
  { id: 'state', label: '状态', title: '状态快照', hint: '快照时间线、回滚与差异查看。' },
  { id: 'canon', label: '正史', title: '正史账本', hint: '只读账本与更正。' },
] as const;
export type LayerId = (typeof LAYERS)[number]['id'];

/**
 * Unwrap a DSH RemoteResult envelope: resolve to `value`, reject on `!ok`,
 * pass through non-envelope results unchanged（I91 泛型化 —— 派生 namespace 的
 * `Promise<RemoteResult<T>>` 解包为 `Promise<T>`，消费处不再需要 `as unknown as`）。
 * 注意：`unwrap(promise: Promise<T>)` 的 `T` 是**已 resolve 值**的类型，
 * 因此本类型直接对 `T` 判信封，不再经 `Promise<infer P>` 解一层。
 */
export type UnwrapValue<T> =
  T extends { ok: true; value: infer V } ? V
  : T extends { ok: false; error: unknown } ? never
  : T;

export function unwrap<T>(promise: Promise<T> | undefined): Promise<UnwrapValue<T>> {
  if (promise === undefined) return Promise.resolve(undefined as never);
  return promise.then((raw) => {
    const result: unknown = raw;
    if (result !== null && typeof result === 'object' && 'ok' in result) {
      const envelope = result as { ok?: boolean; value?: unknown; error?: { message?: string } };
      if (envelope.ok === true) return envelope.value as UnwrapValue<T>;
      throw new Error(envelope.error?.message ?? '创作服务调用失败');
    }
    return result as UnwrapValue<T>;
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
export { workspaceRemoteContribution, writingRemoteContribution, reviewRemoteContribution, queueRemoteContribution, knowledgeRemoteContribution, ruleStyleRemoteContribution, progressRemoteContribution, importExportRemoteContribution, branchRemoteContribution, searchRemoteContribution, statisticsRemoteContribution, timelineRemoteContribution, outlineReconciliationRemoteContribution } from '../remote.js';
