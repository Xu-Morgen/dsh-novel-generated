/**
 * I91 Client 派生 Remote namespace（review v2.0 §3.1 根因 / 计划 §18 I91）。
 *
 * 目标：消除 Client 侧手写 `Promise<unknown>` namespace 接口与消费处
 * `as unknown as X` 强转 —— 各 namespace 类型从 Host 侧 contribution 的
 * descriptor 元素**派生**（descriptor ↔ Host adapter ↔ Client namespace 三方
 * 类型耦合），Remote 方法参数/返回签名变更在接线层与 Client 消费处即报编译错。
 *
 * 机制：
 * - `NamespaceOf<C>`：按 contribution 的 descriptor 元素派生扁平方法面 ——
 *   每个方法的调用形参由 descriptor `parameters` 元组的幻影 `_out` 派生
 *   （acceptsUndefined → `T | undefined`，无 `_out` → `unknown`），返回类型
 *   由 descriptor `result` codec 的 schema 输出类型派生，包 I86 实证的
 *   `RemoteResult` 信封（{ ok:true, value } | { ok:false, error }）。
 * - 本模块只依赖类型（`import type`），不进入 Client bundle 运行图；派生所需
 *   的 contribution 类型从 `../remote.js` 的 host descriptor 单一来源读取。
 *
 * 不变式：派生形状与既有手写接口同名同形状（消费方零改动迁移）；`RemoteResult`
 * 信封合同与 I86 真实客户端绑定器实证一致。
 */
import type { InvocationDescriptor, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import type {
  branchRemoteContribution,
  importExportRemoteContribution,
  knowledgeRemoteContribution,
  progressRemoteContribution,
  queueRemoteContribution,
  reviewRemoteContribution,
  ruleStyleRemoteContribution,
  searchRemoteContribution,
  statisticsRemoteContribution,
  timelineRemoteContribution,
  workspaceRemoteContribution,
  writingRemoteContribution,
} from '../remote.js';

/** I86 实证的 DSH RemoteResult 信封合同（review v2.0 §3.1；client 消费经 `unwrap` 解包）。 */
export type RemoteResult<R> =
  | { readonly ok: true; readonly value: R }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string; readonly details: unknown } };

/** 从参数描述符提取输出类型（无 `_out` 幻影时退化为 unknown）。 */
type ParamOut<P> = P extends { readonly _out?: infer Out } ? Out : unknown;

/** 单参数调用形参：`_optional: true`（wire acceptsUndefined）→ `T | undefined`。 */
type ParamShapeOf<P> = P extends { readonly _optional: true } ? ParamOut<P> | undefined : ParamOut<P>;

/**
 * 由 descriptor 参数元组递归派生调用形参元组（与 host `ParametersCallShape` 同构）。
 * 递归（非 `keyof` 映射）保证在泛型延迟求值上下文中仍产出**元组**；`_optional`
 * 必填幻影避免延迟 infer 丢失 `| undefined`。
 */
export type ParametersCallShape<Params extends readonly unknown[]> =
  Params extends readonly [infer Head, ...infer Tail]
    ? [ParamShapeOf<Head>, ...ParametersCallShape<Tail>]
    : [];

/** 从 result codec 提取校验输出类型（strict codec 的 schema.parse 返回类型）。 */
type ResultOut<C> = C extends { readonly schema: { parse(value: unknown): infer Out } } ? Out : unknown;

/** 单个 descriptor 派生的方法类型：调用形参 + `Promise<RemoteResult<结果>>`。 */
type NamespaceMethod<D extends InvocationDescriptor> = (
  ...args: ParametersCallShape<D['parameters']>
) => Promise<RemoteResult<ResultOut<D['result']>>>;

/**
 * 从 contribution 的 descriptor 元素派生扁平 namespace 方法面（单 namespace
 * contribution；method 名即公开 wire 方法名）。
 */
export type NamespaceOf<C extends TypertRemoteContribution> = {
  [Method in C['descriptors'][number]['method']]: NamespaceMethod<Extract<C['descriptors'][number], { method: Method }>>;
};

// —— 与 src/client/shared.ts 既有手写接口同名同形状的派生类型（消费方零改动）——
export type WorkspaceNamespace = NamespaceOf<typeof workspaceRemoteContribution>;
export type WritingNamespace = NamespaceOf<typeof writingRemoteContribution>;
export type ReviewNamespace = NamespaceOf<typeof reviewRemoteContribution>;
export type QueueNamespace = NamespaceOf<typeof queueRemoteContribution>;
export type KnowledgeNamespace = NamespaceOf<typeof knowledgeRemoteContribution>;
export type RuleStyleNamespace = NamespaceOf<typeof ruleStyleRemoteContribution>;
export type ProgressNamespace = NamespaceOf<typeof progressRemoteContribution>;
export type ImportExportNamespace = NamespaceOf<typeof importExportRemoteContribution>;
export type BranchNamespace = NamespaceOf<typeof branchRemoteContribution>;
export type SearchNamespace = NamespaceOf<typeof searchRemoteContribution>;
export type StatisticsNamespace = NamespaceOf<typeof statisticsRemoteContribution>;
export type TimelineNamespace = NamespaceOf<typeof timelineRemoteContribution>;
