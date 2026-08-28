import { createKnowledgeManagerService } from '../knowledge-manager-service.js';
import { createRuleStyleManagerService } from '../rule-style-manager-service.js';
import { createProgressInspirationService } from '../progress-inspiration-service.js';
import { createImportExportService as createProjectPortabilityService } from '../import-export-service.js';
import { createBranchService } from '../branch-service.js';
import { createSearchService } from '../search-service.js';
import { createStatisticsService, type StatisticsSceneCardFilter, type StatisticsTaskFilter, type NovelStatisticsService } from '../statistics-service.js';
import { createNovelAgentService, registerNovelAgentTools } from '../../agents/agent-tools.js';
import { NOVEL_WORKSPACE_NAMESPACE, hostContribution, createWorkspaceEditorService } from '../../remote.js';
import type { KnowledgeChangeInput } from '../../core/knowledge/actions.js';
import type { RuleInput, RulePatch } from '../../core/schema/rules.js';
import type { StyleProfileInput } from '../../core/schema/style.js';
import type { DeviationRecordInput, InspirationSelectInput } from '../progress-inspiration-service.js';
import type { ImportPreviewInput } from '../import-export-service.js';
import type { ArchiveMode } from '../../core/export/index.js';
import { defineRemote } from '../remote/shared.js';
import { knowledgeInvocations } from '../remote/knowledge.js';
import { ruleStyleInvocations } from '../remote/rule-style.js';
import { progressInvocations } from '../remote/progress.js';
import { importExportInvocations } from '../remote/import-export.js';
import { branchInvocations } from '../remote/branch.js';
import { searchInvocations } from '../remote/search.js';
import { statisticsInvocations } from '../remote/statistics.js';
import type { BaseServices, CompositionBase, ManagementServices } from './types.js';

/**
 * I89 组合根分段（三）：编排面（review v2.0 §3.4 / 计划 §18 I89）。
 *
 * 装配各管理面 Remote（知情/规则文风/进度灵感/导入导出/分支/搜索/统计）、
 * workspace 直通面、对话 Agent 工具与 Typert 注册。统计的 wire 形状转换
 * （位置筛选参数 → domain filter 对象）外移为显式命名适配器（I89 修复：
 * 不再内联在 defineRemote 块内）。
 */
export function assembleOrchestrationSurface(base: CompositionBase, baseServices: BaseServices, management: ManagementServices): void {
  const { ctx } = base;
  const {
    characterService,
    worldviewService,
    outlineService,
    relationshipService,
    stateService,
    canonService,
    confirmationService,
    projectService,
    textService,
    ruleService,
    styleService,
    knowledgeService,
    uploadService,
    workbenchSettingsService,
    inspirationService,
    resolveGenerationSettings,
  } = baseServices;
  const { controlledTextEditService, writingAdjudicationService, nextSceneContext, queueService } = management;
  // I66 C3 知情与揭示管理面（design §14.10 / R14-1）：作者按事实与角色查看
  // holders/revealPlan/status 并受控执行揭示或 holder 变更。复用 I18 领域服务
  // （KnowledgeRepository 唯一 C3 写 owner）+ I11 ConfirmationGate（propose→accept/
  // reject，未确认零写）+ 既有知情不倒退约束（assertKnowledgeOnlyAdvances）。
  // 管理投影只读全量 C3 文档（作者全知面），绝不调用单角色 POV 过滤入口。
  const knowledgeManagerService = createKnowledgeManagerService({
    knowledge: knowledgeService,
    characters: characterService,
    confirmation: confirmationService,
    onDispose: base.onFiberDispose,
  });
  ctx.provide('novelKnowledgeManager', defineRemote('novelKnowledgeManager', 'novelKnowledgeManager', knowledgeManagerService, [
    { method: 'list', call: (projectId: string) => knowledgeManagerService.list(projectId) },
    { method: 'read', call: (projectId: string, entryId: string) => knowledgeManagerService.read(projectId, entryId) },
    { method: 'propose', call: (projectId: string, input: KnowledgeChangeInput) => knowledgeManagerService.propose(projectId, input) },
    { method: 'accept', call: (projectId: string, proposalId: string) => knowledgeManagerService.accept(projectId, proposalId) },
    { method: 'reject', call: (projectId: string, proposalId: string) => knowledgeManagerService.reject(projectId, proposalId) },
    // I77：wire 契约与领域服务返回语义一致 —— pending() 返回裸数组，descriptor
    // result schema 即 z.array(...)（host/remote/knowledge.ts），组合根不再整形
    // envelope；契约漂移不再被接线层掩盖（架构审查 §8#1）。
    { method: 'pending', call: (projectId: string) => knowledgeManagerService.pending(projectId) },
  ], knowledgeInvocations));
  // I67 B1 规则与 B4 文风控制面（design §14.10「B1/B4 控制面」/ R14-2）：作者编辑
  // 规则优先级/immutable 与风格人称/时态/POV/禁用表达表单。复用 I7/I10 领域服务
  // （RuleRepository/StyleRepository 仍是 B1/B4 唯一写 owner，本服务只转发最小
  // owned JSON）；非法枚举/越界优先级在 wire 层与服务端双重拒绝，immutable 规则
  // 改写由 RuleRepository 拒绝（零写）。保存后生成与检测消费的正是同一批存储。
  const ruleStyleManagerService = createRuleStyleManagerService({
    rules: ruleService,
    style: styleService,
    projectsRoot: base.projectsRoot,
    onDispose: base.onFiberDispose,
  });
  ctx.provide('novelRuleStyleManager', defineRemote('novelRuleStyleManager', 'novelRuleStyleManager', ruleStyleManagerService, [
    { method: 'list', call: (projectId: string) => ruleStyleManagerService.list(projectId) },
    { method: 'readRule', call: (projectId: string, ruleId: string) => ruleStyleManagerService.readRule(projectId, ruleId) },
    { method: 'createRule', call: (projectId: string, input: RuleInput) => ruleStyleManagerService.createRule(projectId, input) },
    { method: 'updateRule', call: (projectId: string, ruleId: string, patch: RulePatch) => ruleStyleManagerService.updateRule(projectId, ruleId, patch) },
    { method: 'readStyle', call: (projectId: string) => ruleStyleManagerService.readStyle(projectId) },
    { method: 'saveStyle', call: (projectId: string, input: Omit<StyleProfileInput, 'id'>) => ruleStyleManagerService.saveStyle(projectId, input) },
  ], ruleStyleInvocations));
  // I68 C6 进度与灵感方向落地（design §14.10「C6 与灵感落地」/ R14-3）：进度/
  // 偏差投影 + 导航/完成状态 + 灵感 select→propose→apply + 刷新与审计记录。
  // 复用 I14/I15 outlineService（B5/C6 唯一写 owner）、I11 ConfirmationGate 与
  // I45 灵感 agent；灵感默认只读，选定并确认后才允许改授权的 B5/C6（N-5：
  // 偏差先记录、不自动选方向、不强制改大纲）。重复 apply 由 C6 偏差标记幂等。
  const progressInspirationService = createProgressInspirationService({
    outline: outlineService,
    confirmation: confirmationService,
    inspiration: inspirationService,
    projectsRoot: base.projectsRoot,
    onDispose: base.onFiberDispose,
  });
  ctx.provide('novelOutlineProgress', defineRemote('novelOutlineProgress', 'novelOutlineProgress', progressInspirationService, [
    { method: 'projection', call: (projectId: string) => progressInspirationService.projection(projectId) },
    { method: 'recordDeviation', call: (projectId: string, input: DeviationRecordInput) => progressInspirationService.recordDeviation(projectId, input) },
    { method: 'reconcileDeviation', call: (projectId: string, deviationId: string) => progressInspirationService.reconcileDeviation(projectId, deviationId) },
    { method: 'inspire', call: (projectId: string, prompt?: string) => progressInspirationService.inspire(projectId, prompt) },
    { method: 'select', call: (projectId: string, input: InspirationSelectInput) => progressInspirationService.select(projectId, input) },
    { method: 'apply', call: (projectId: string, proposalId: string) => progressInspirationService.apply(projectId, proposalId) },
    { method: 'reject', call: (projectId: string, proposalId: string) => progressInspirationService.reject(projectId, proposalId) },
    { method: 'pending', call: (projectId: string) => progressInspirationService.pending(projectId) },
    { method: 'audit', call: (projectId: string) => progressInspirationService.audit(projectId) },
  ], progressInvocations));
  // I69 导入导出与备份 UI（design §14.10「导入、导出与备份」/ R14-4）：受控
  // import/export Remote —— I39 可移植档案/纯文本导出下载、round-trip 备份恢复
  // （N-7 非空作品 fail closed + 空壳事务写盘）与 I37 确定性导入预览。复用
  // `core/export` 与 `import` 既有 owner；Client 只接收下载载荷/命令，不持有路径。
  const projectPortabilityService = createProjectPortabilityService(base.projectsRoot);
  ctx.provide('novelImportExport', defineRemote('novelImportExport', 'novelImportExport', projectPortabilityService, [
    { method: 'exportArchive', call: (projectId: string, mode: ArchiveMode) => projectPortabilityService.exportArchive(projectId, mode) },
    { method: 'exportText', call: (projectId: string, format: 'txt' | 'md') => projectPortabilityService.exportText(projectId, format) },
    { method: 'restore', call: (projectId: string, raw: string) => projectPortabilityService.restore(projectId, raw) },
    { method: 'importPreview', call: (projectId: string, input: ImportPreviewInput) => projectPortabilityService.importPreview(projectId, input) },
  ], importExportInvocations));
  // I70 C5 正文版本与分支（design §14.10「正文版本与分支」/ R14-5）：Host-owned
  // 分支/版本模型 —— 候选可保留为分支、比较并选择唯一 chosen。复用 TextRepository
  // （C5 唯一存储 owner；legacy 单版本文档兼容迁移 + fail closed 在 open 内完成）；
  // choose 只写 C5，结构化同步仍必须显式 reparse/Gate。Client 分支面板只提交受控
  // 命令，不持有版本真相。
  const branchService = createBranchService(base.projectsRoot);
  ctx.provide('novelBranches', defineRemote('novelBranches', 'novelBranches', branchService, [
    { method: 'list', call: (projectId: string, chapterId: string, sceneId: string) => branchService.listBranches(projectId, chapterId, sceneId) },
    { method: 'read', call: (projectId: string, chapterId: string, sceneId: string, branchId: string) => branchService.readBranch(projectId, chapterId, sceneId, branchId) },
    { method: 'save', call: (projectId: string, chapterId: string, sceneId: string, label: string) => branchService.saveBranch(projectId, chapterId, sceneId, label) },
    { method: 'choose', call: (projectId: string, chapterId: string, sceneId: string, branchId: string) => branchService.chooseBranch(projectId, chapterId, sceneId, branchId) },
    { method: 'diff', call: (projectId: string, chapterId: string, sceneId: string, fromBranchId: string, toBranchId?: string) => branchService.diffBranches(projectId, chapterId, sceneId, fromBranchId, toBranchId) },
  ], branchInvocations));
  // I71 全局搜索与上下文追踪（design §14.10「搜索与上下文追踪」/ R14-6）：可重建
  // 搜索投影 + 实体交叉引用 + 结果跳转 + 生成注入解释（trace）。搜索索引是派生视图
  // （core/search，可 drop/rebuild，不成为第二真相）；POV 边界在查询时用 live C3
  // knows 过滤；trace 由 writing 路径（novelWriting.preview）返回，本服务只负责
  // 检索/引用/索引生命周期，不持有生成路径。
  const searchService = createSearchService({
    projectsRoot: base.projectsRoot,
    text: textService,
    characters: characterService,
    worldview: worldviewService,
    outline: outlineService,
    canon: canonService,
    knowledge: knowledgeService,
  });
  ctx.provide('novelSearch', defineRemote('novelSearch', 'novelSearch', searchService, [
    { method: 'build', call: (projectId: string) => searchService.build(projectId) },
    { method: 'drop', call: (projectId: string) => searchService.drop(projectId) },
    { method: 'stats', call: (projectId: string) => searchService.stats(projectId) },
    { method: 'search', call: (projectId: string, query: string, pov?: string) => searchService.search(projectId, query, pov) },
    { method: 'references', call: (projectId: string, key: string, pov?: string) => searchService.references(projectId, key, pov) },
  ], searchInvocations));

  // I89 修复：wire 形状转换外移为显式命名适配器 —— sceneCards/tasks 的可选筛选
  // 位置参数（string/number）聚合为 domain filter 对象；不再内联在 defineRemote 块。
  // I91：筛选位 wire codec 是 jsonCodec（z.unknown），descriptor 派生形参为
  // `unknown | undefined`，适配器形参对齐为 unknown（String()/Number() 收敛不变）。
  const sceneCardsWireAdapter = (statisticsService: NovelStatisticsService) =>
    (projectId: string, actId?: unknown, beatId?: unknown, status?: unknown, limit?: unknown): Promise<unknown> => statisticsService.sceneCards(projectId, {
      ...(actId !== undefined && actId !== null ? { actId: String(actId) } : {}),
      ...(beatId !== undefined && beatId !== null ? { beatId: String(beatId) } : {}),
      ...(status !== undefined && status !== null ? { status: String(status) as 'planned' | 'writing' | 'done' } : {}),
      ...(limit !== undefined && limit !== null ? { limit: Number(limit) } : {}),
    } satisfies StatisticsSceneCardFilter);
  const tasksWireAdapter = (statisticsService: NovelStatisticsService) =>
    (projectId: string, status?: unknown, limit?: unknown): Promise<unknown> => statisticsService.tasks(projectId, {
      ...(status !== undefined && status !== null ? { status: String(status) as 'queued' | 'running' | 'candidate-ready' | 'failed' | 'cancelled' | 'completed' } : {}),
      ...(limit !== undefined && limit !== null ? { limit: Number(limit) } : {}),
    } satisfies StatisticsTaskFilter);

  // I72 写作进度面板（design §14.10「写作进度」/ R14-7）：以可重建派生统计展示
  // 章节字数、目标完成度、场景卡状态、POV 分布和任务历史。统计是派生视图
  // （core/statistics，可 drop/rebuild，不成为第二份作品进度真相）；口径复用
  // 既有 owner —— 字数 = countProseUnits（I65 队列同一写作单位）、场景卡联动 =
  // stableSceneId（I65 同一确定性派生）、任务记录只经 I65 队列 status() 读取
  // （零写账本）；概览/筛选/详情全部有界，空作品 empty 标记（无假进度）。
  const statisticsService = createStatisticsService({
    projectsRoot: base.projectsRoot,
    text: textService,
    outline: outlineService,
    queue: queueService,
  });
  ctx.provide('novelStatistics', defineRemote('novelStatistics', 'novelStatistics', statisticsService, [
    { method: 'rebuild', call: (projectId: string) => statisticsService.build(projectId) },
    { method: 'drop', call: (projectId: string) => statisticsService.drop(projectId) },
    { method: 'stats', call: (projectId: string) => statisticsService.stats(projectId) },
    { method: 'overview', call: (projectId: string) => statisticsService.overview(projectId) },
    { method: 'chapterDetail', call: (projectId: string, chapterId: string) => statisticsService.chapterDetail(projectId, chapterId) },
    { method: 'sceneCards', call: sceneCardsWireAdapter(statisticsService) },
    { method: 'tasks', call: tasksWireAdapter(statisticsService) },
  ], statisticsInvocations));
  const workspaceService = createWorkspaceEditorService(
    characterService, worldviewService, outlineService, relationshipService,
    stateService, canonService, confirmationService, projectService, uploadService, textService, controlledTextEditService,
  );
  // The DSH gateway dispatches strict descriptors only to services carrying the
  // `typertRemote` binding; attach it before providing (design §0.1.2).
  // novelWorkspace 是直通面：workspace-service 本身即 wire 方法实现，无需适配闭包。
  ctx.provide(NOVEL_WORKSPACE_NAMESPACE, defineRemote(NOVEL_WORKSPACE_NAMESPACE, NOVEL_WORKSPACE_NAMESPACE, workspaceService));
  // 对话创作入口：Agent 工具层包装既有 Host 服务（novel_* 工具），经 DSH `tools`
  // 注册表暴露给会话。注册与撤销都归属当前 Fiber；`tools` 服务缺席时静默跳过
  // （与 typert 注册同一模式）。config.agentTools === false 可显式关闭。
  const agentService = createNovelAgentService({
    project: projectService,
    characters: characterService,
    worldview: worldviewService,
    outline: outlineService,
    relationship: relationshipService,
    state: stateService,
    canon: canonService,
    style: styleService,
    rules: ruleService,
    knowledge: knowledgeService,
    text: textService,
    writing: writingAdjudicationService,
    // I87：复用生产候选路径的同一 NextSceneContextProvider（含 timeline 过滤），
    // agent 不再自建第二套 builder（review v2.0 §3.2 双 owner 消除）。
    context: nextSceneContext,
    inspiration: inspirationService,
    confirmation: confirmationService,
    resolveSettings: resolveGenerationSettings,
    workbenchSettings: workbenchSettingsService,
  });
  ctx.provide('novelAgent', agentService);
  if (base.config.agentTools !== false) {
    // `tools` 注册表由宿主提供，可能晚于本插件激活：用 inject 懒注册，tools
    // 可用/卸载时回调自动重跑；每次运行都以 ctx.effect 归属注册生命周期。
    ctx.inject(['tools'], (toolsCtx) => {
      toolsCtx.effect(() => registerNovelAgentTools(toolsCtx, agentService));
    });
  }
  const typert = ctx.get('typert', false);
  if (typert !== undefined) {
    ctx.effect(() => typert.register(hostContribution));
  }
}
