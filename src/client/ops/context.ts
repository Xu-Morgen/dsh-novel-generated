import type { BranchNamespace, ImportExportNamespace, KnowledgeNamespace, ProgressNamespace, QueueNamespace, ReviewNamespace, RuleStyleNamespace, SearchNamespace, StatisticsNamespace, TimelineNamespace, WorkspaceNamespace, WritingNamespace } from '../shared.js';
import type { WorkbenchActions, WorkbenchState } from '../store/types.js';

/**
 * I82 逐层编辑动作（ops）共享上下文（架构审查 §5.1 / §9 #5 拆分：makeOps 1300 行
 * 按层拆为 src/client/ops/ 各层工厂，本接口是它们唯一的依赖面）。
 *
 * 语义不变式：
 * - `snapshot` 是渲染期 store 快照（陈旧的渲染闭包语义：各 ops 工厂在渲染时创建，
 *   显式接收 id 参数的读取不受快照陈旧影响 —— I61 注释「loadScene 必须显式接收
 *   chapterId」）。
 * - `act` 是 renderer 的 baked actions（inject 捕获的同一实例）；一切写经 action，
 *   绝不就地改对象。
 * - `beginOp/endOp` 是 I59 请求去重（R12-6）：同一操作键在 Remote 返回前至多提交一次。
 * - `active` 是 Fiber 存活守卫：Remote 完成晚于卸载时不再 dispatch。
 */
export interface OpsContext {
  snapshot: WorkbenchState;
  act: WorkbenchActions;
  projectId: string | undefined;
  active: boolean;
  beginOp(key: string): boolean;
  endOp(key: string): void;
  workspace: WorkspaceNamespace | undefined;
  writing: WritingNamespace | undefined;
  reviewNamespace: ReviewNamespace | undefined;
  queueNamespace: QueueNamespace | undefined;
  knowledgeNamespace: KnowledgeNamespace | undefined;
  ruleStyleNamespace: RuleStyleNamespace | undefined;
  progressNamespace: ProgressNamespace | undefined;
  importExportNamespace: ImportExportNamespace | undefined;
  branchNamespace: BranchNamespace | undefined;
  searchNamespace: SearchNamespace | undefined;
  statisticsNamespace: StatisticsNamespace | undefined;
  timelineNamespace: TimelineNamespace | undefined;
}
