/**
 * I90 声明式 Remote mount registry（review v2.0 §3.5 / 计划 §18 I90）。
 *
 * I90 前 Remote 资源清单在 client.ts 五处平行维护：namespace 变量、disposer 变量、
 * 16 个 mountRemote 调用、卸载时逐项清空、卸载时逐项释放。本模块把这份清单收敛为
 * **单一声明式数组**：
 *
 * - `RemoteServiceBag`：16 个可选 namespace 字段（从 shared/onboarding/settings/
 *   workbench-settings 的类型单一来源导入）；mount 成功后写 `bag[key] = service`；
 * - registry 数组：16 项，每项含 contribution/serviceKey/label/bind/after/onError，
 *   是 Remote 资源的唯一声明 site；
 * - 内部 `Set<TypertDisposer>`：bind 时收集 disposer，卸载器统一释放
 *   （等价旧 16 个 `if (xxxDisposer) void xxxDisposer()`，review v2.0 §3.5）。
 *
 * 不变式（与 mount.ts / I46 起各迭代 Fiber 生命周期语义一致）：
 * - 卸载（isActive() === false）后完成的 $mount 立即 dispose，不写 bag
 *   （mountRemote 自身保证，见 mount.ts 不变式）；
 * - workspace 是唯一显式 after/onError 特例（viewModel + 作品列表装载 / dispatch
 *   fail 全屏错误），经 hooks 注入 —— registry 不持有 dispatch/store，只做装载；
 * - 卸载器幂等：重复调用只释放已收集的 disposer（Set 清空后再调用为空操作）。
 */
import type { TypertDisposer, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import { mountRemote, type MountContext, type RemoteMount } from './mount.js';
import type {
  BranchNamespace,
  ImportExportNamespace,
  KnowledgeNamespace,
  ProgressNamespace,
  QueueNamespace,
  ReviewNamespace,
  RuleStyleNamespace,
  SearchNamespace,
  StatisticsNamespace,
  TimelineNamespace,
  WorkspaceNamespace,
  WritingNamespace,
} from './shared.js';
import {
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
} from './shared.js';
import { onboardingAnalyzerRemoteContribution, onboardingRemoteContribution, type OnboardingAnalyzerNamespace, type OnboardingNamespace } from './onboarding.js';
import { llmConfigRemoteContribution, type LlmConfigNamespace } from './settings.js';
import { workbenchSettingsRemoteContribution, type WorkbenchSettingsNamespace } from './workbench-settings.js';

/**
 * 全部已挂载 Remote namespace 的 service bag（I90）。
 *
 * 字段与挂载清单一一对应（共 16 个；review v2.0 §3.5 所称「15 个 namespace」为
 * 卡片笔误，枚举清单与 client.ts 迁移前实测均为 16 个）。挂载完成后写
 * `bag[key] = service`；失败/未挂载保持 undefined，消费方一律窄化读取
 * （controllers/ops 经 `() => bag.xxx` 函数延迟读取，避免闭包固化陈旧引用）。
 */
export interface RemoteServiceBag {
  workspace?: WorkspaceNamespace;
  onboarding?: OnboardingNamespace;
  analyzer?: OnboardingAnalyzerNamespace;
  llmConfig?: LlmConfigNamespace;
  workbenchSettings?: WorkbenchSettingsNamespace;
  writing?: WritingNamespace;
  reviewNamespace?: ReviewNamespace;
  queueNamespace?: QueueNamespace;
  knowledgeNamespace?: KnowledgeNamespace;
  ruleStyleNamespace?: RuleStyleNamespace;
  progressNamespace?: ProgressNamespace;
  importExportNamespace?: ImportExportNamespace;
  branchNamespace?: BranchNamespace;
  searchNamespace?: SearchNamespace;
  statisticsNamespace?: StatisticsNamespace;
  timelineNamespace?: TimelineNamespace;
}

/** workspace 特例钩子（client.ts 注入；registry 不持有 dispatch/store）。 */
export interface RemoteMountHooks {
  /** workspace 装载后处理（viewModel + 作品列表装载 / dispatch fail 全屏错误）。 */
  workspaceAfter?(service: WorkspaceNamespace | undefined): void;
  /** workspace mount 失败处理（dispatch fail 全屏错误；其余 Remote 静默降级）。 */
  workspaceError?(cause: Error): void;
}

/** registry 单条目：RemoteMount 之上附加 bag key（key 决定 bind 写入哪个槽位）。 */
type RemoteRegistryEntry = RemoteMount<unknown> & { key: keyof RemoteServiceBag };

/**
 * 声明式挂载全部 Remote 并返回卸载器（I90）。
 *
 * 逐项调用 mountRemote（I83 参数化工厂，语义逐字保持）；bind 统一为
 * 「写 bag[key] + 收集 disposer 入内部 Set」。返回的卸载器释放 Set 内全部
 * disposer，等价迁移前 client.ts 的 15/16 个 `if (xxxDisposer) void xxxDisposer()`。
 */
export function mountRemoteRegistry(ctx: MountContext, bag: RemoteServiceBag, hooks?: RemoteMountHooks): () => void {
  const disposers = new Set<TypertDisposer>();
  const bindInto = (key: keyof RemoteServiceBag) => (disposer: TypertDisposer, service: unknown): void => {
    disposers.add(disposer);
    (bag as Record<string, unknown>)[key] = service;
  };
  // 唯一 registry 声明数组：新增 Remote 只改这一处（review v2.0 §3.5 单份维护）。
  const registry: RemoteRegistryEntry[] = [
    { key: 'workspace', contribution: workspaceRemoteContribution, serviceKey: 'remote.novelWorkspace', label: 'workspace', bind: bindInto('workspace'), after: hooks?.workspaceAfter, onError: hooks?.workspaceError },
    { key: 'analyzer', contribution: onboardingAnalyzerRemoteContribution, serviceKey: 'remote.novelOnboardingAnalyzer', label: 'analyzer', bind: bindInto('analyzer') },
    { key: 'onboarding', contribution: onboardingRemoteContribution, serviceKey: 'remote.novelOnboarding', label: 'onboarding', bind: bindInto('onboarding') },
    { key: 'llmConfig', contribution: llmConfigRemoteContribution, serviceKey: 'remote.novelLlmConfig', label: 'llm config', bind: bindInto('llmConfig') },
    { key: 'workbenchSettings', contribution: workbenchSettingsRemoteContribution, serviceKey: 'remote.novelWorkbenchSettings', label: 'workbench settings', bind: bindInto('workbenchSettings') },
    { key: 'writing', contribution: writingRemoteContribution, serviceKey: 'remote.novelWriting', label: 'writing', bind: bindInto('writing') },
    { key: 'reviewNamespace', contribution: reviewRemoteContribution, serviceKey: 'remote.novelReview', label: 'review', bind: bindInto('reviewNamespace') },
    { key: 'queueNamespace', contribution: queueRemoteContribution, serviceKey: 'remote.novelQueue', label: 'queue', bind: bindInto('queueNamespace') },
    { key: 'knowledgeNamespace', contribution: knowledgeRemoteContribution, serviceKey: 'remote.novelKnowledgeManager', label: 'knowledge', bind: bindInto('knowledgeNamespace') },
    { key: 'ruleStyleNamespace', contribution: ruleStyleRemoteContribution, serviceKey: 'remote.novelRuleStyleManager', label: 'ruleStyle', bind: bindInto('ruleStyleNamespace') },
    { key: 'progressNamespace', contribution: progressRemoteContribution, serviceKey: 'remote.novelOutlineProgress', label: 'progress', bind: bindInto('progressNamespace') },
    { key: 'importExportNamespace', contribution: importExportRemoteContribution, serviceKey: 'remote.novelImportExport', label: 'importExport', bind: bindInto('importExportNamespace') },
    { key: 'branchNamespace', contribution: branchRemoteContribution, serviceKey: 'remote.novelBranches', label: 'branches', bind: bindInto('branchNamespace') },
    { key: 'searchNamespace', contribution: searchRemoteContribution, serviceKey: 'remote.novelSearch', label: 'search', bind: bindInto('searchNamespace') },
    { key: 'statisticsNamespace', contribution: statisticsRemoteContribution, serviceKey: 'remote.novelStatistics', label: 'statistics', bind: bindInto('statisticsNamespace') },
    { key: 'timelineNamespace', contribution: timelineRemoteContribution, serviceKey: 'remote.novelTimeline', label: 'timeline', bind: bindInto('timelineNamespace') },
  ];
  for (const entry of registry) {
    mountRemote(ctx, entry);
  }
  return () => {
    for (const disposer of disposers) { void disposer(); }
    disposers.clear();
  };
}
