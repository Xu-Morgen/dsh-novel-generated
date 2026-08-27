import type { Context } from '@deepseek-ai/cordis';

import { createCanonService } from './host/canon-service.js';
import { createCharacterService } from './host/character-service.js';
import { createConfirmationService } from './host/confirmation-service.js';
import { createProjectService } from './host/project-service.js';
import { createRuleService } from './host/rule-service.js';
import { createStateService } from './host/state-service.js';
import { createStyleService } from './host/style-service.js';
import { createTextService } from './host/text-service.js';
import { createWorldviewService } from './host/worldview-service.js';
import { createOutlineService } from './host/outline-service.js';
import { createRelationshipService } from './host/relationship-service.js';
import { createKnowledgeService } from './host/knowledge-service.js';
import { createGenerationService } from './host/generation-service.js';
import { createStoryGenerationService } from './host/story-generation-service.js';
import { createSettingsService } from './host/settings-service.js';
import { createStoryLifecycleService } from './host/story-lifecycle-service.js';
import { createConsistencyDetectionService } from './host/consistency-detection-service.js';
import { createKnowledgeLeakDetectionService } from './host/knowledge-leak-detection-service.js';
import { createRelationshipStyleDetectionService } from './host/relationship-style-detection-service.js';
import { createStateParserService } from './host/state-parser-service.js';
import { createRelationshipParserService } from './host/relationship-parser-service.js';
import { createKnowledgeParserService } from './host/knowledge-parser-service.js';
import { createWorldviewParserService } from './host/worldview-parser-service.js';
import { createExtensionService } from './host/extension-service.js';
import { createHostImportService } from './host/import-service.js';
import { createSplitAgentService } from './host/split-agent-service.js';
import { createExportService } from './host/export-service.js';
import { createClassifierService } from './host/classifier-service.js';
import { createLocalizedEditService } from './host/edit-service.js';
import { createTextEditService } from './host/text-edit-service.js';
import { createWritingCandidateService } from './host/candidate-service.js';
import { createChapterWritingService } from './host/chapter-writing-service.js';
import { createWritingAdjudicationService, type WritingProposeInput } from './host/writing-adjudication-service.js';
import { createReviewService } from './host/review-service.js';
import { createQueueService, type QueueStartInput } from './host/queue-service.js';
import { createKnowledgeManagerService } from './host/knowledge-manager-service.js';
import type { KnowledgeChangeInput } from './core/knowledge/actions.js';
import { createRuleStyleManagerService } from './host/rule-style-manager-service.js';
import { createProgressInspirationService, type DeviationRecordInput, type InspirationSelectInput } from './host/progress-inspiration-service.js';
import { createImportExportService, type ImportPreviewInput } from './host/import-export-service.js';
import { createBranchService } from './host/branch-service.js';
import { createSearchService } from './host/search-service.js';
import { createStatisticsService, type StatisticsSceneCardFilter, type StatisticsTaskFilter } from './host/statistics-service.js';
import { createTimelineService, type NovelTimelineService } from './host/timeline-service.js';
import { createNextSceneContextBuilder } from './host/writing-context.js';
import { createInspirationService } from './host/inspiration-service.js';
import { createHostUploadService } from './host/upload-service.js';
import { createLlmConfigService } from './host/llm-config-service.js';
import { createOnboardingAnalyzerService } from './host/onboarding-analyzer-service.js';
import { createOnboardingAdjudicationService, type OnboardingLayerSource } from './host/onboarding-adjudication-service.js';
import { createWorkbenchSettingsService } from './host/workbench-settings-service.js';
import { SettingsIndex, A2_SETTINGS_FILE, resolveA2GenerationConfig } from './core/settings-index/index.js';
import type { GenerationSettings } from './llm/port/index.js';
import type { LlmConfigSaveInput } from './core/schema/llm-config.js';
import type { WorkbenchSettingsSaveInput } from './core/schema/workbench-settings.js';
import type { OnboardingAdjudicateInput, OnboardingAnalysisStartInput, OnboardingFinalApplyInput } from './core/schema/onboarding.js';
import type { Timeline } from './core/timeline/schema.js';
import type { RuleInput, RulePatch } from './core/schema/rules.js';
import type { StyleProfileInput } from './core/schema/style.js';
import type { ArchiveMode } from './core/export/index.js';
import type { ReviewAdjudicateInputShape } from './host/remote/review.js';
import { defineRemote } from './host/remote/shared.js';
import { NOVEL_PROBE_NAMESPACE, probeData, NOVEL_WORKSPACE_NAMESPACE, hostContribution, createWorkspaceEditorService } from './remote.js';
import { createNovelAgentService, registerNovelAgentTools } from './agents/agent-tools.js';

/**
 * I1 Host plugin extended by I2 (design §0.1.3 I2): proves the ordinary
 * out-of-tree Cordis package contract with a Host service, and now also
 * registers the gate-only public Remote probe.
 *
 * - `novelCreation` (I1): minimal read-only status service, removed on dispose.
 * - `novelProject` (I3) / `novelState` (I4) / `novelCanon` (I5): Host facades over
 *   the project, C2 state, and C4 canon stores respectively.
 * - `novelText` (I6): Host facade over controlled C5 chapter/scene text storage.
 * - `novelRule` (I7): Host facade over the B1 hard-constraint rule store.
 * - `novelWorldview` (I8): Host facade over the B2 worldview (WorldEntry) store.
 * - `novelCharacter` (I9): Host facade over the B3 character-core (CharacterCore)
 *   store, explicitly separated from the C2 mutable state layer (R1-B3).
 * - `novelStyle` (I10): Host facade over the one global B4 StyleProfile,
 *   including independently queryable forbidden expressions (R1-B4).
 * - `novelConfirmation` (I11): Host facade over the persistent, idempotent
 *   proposal→accept/reject gate shared by all later user-confirmed writes.
 * - `novelOutline` (I14/I15): Host facade over B5 outline/detail-beat storage and
 *   C6 progress/navigation; C6 never rewrites the B5 source.
 * - `novelKnowledge` (I18): Host facade over the C3 knowledge store and POV filter;
 *   C3 never derives visibility from C1 relationship publicity.
 * - `novelGeneration` (I17): Host-only ctx.llm candidate collection.
 * - `novelSettings` (I31): Host-only persisted A2 template/preset/route settings;
 *   it resolves SecretRefs through the Host seam and delegates through the existing ctx.llm adapter.
 * - `novelExtension` (I32): Fiber-owned internal Provider/Injector/Validator/
 *   Parser/relationship-rule/backend-strategy registry; it grants no independent
 *   file, credential, LLM, UI, or composition ownership (design §11.1).
 * - `novelStoryGeneration` (I19): full navigation/context/history candidate path;
 *   it deliberately has no parser or writeback operation.
 * - `novelConsistencyDetection` (I21): Host-only B1 immutable/C4 semantic
 *   detector using the injected `ctx.llm` route; it returns I20 adjudication
 *   but has no parser or writeback operation.
 * - `novelKnowledgeLeakDetection` (I22): Host-only C3 POV leak detector.
 *   It derives the allowed view through I18, returns I20 adjudication, and
 *   has no C3 write, parser, or Client operation.
 * - `novelRelationshipStyleDetection` (I24): Host-only C1/B4 semantic soft
 *   detector. It returns I20 warnings only and has no parser or writeback.
 * - `novelStateParser` (I25): Host-only C2 recognition through `ctx.llm`; it
 *   returns strict ops only, leaving StateEngine and I11 Gate write authority intact.
 * - `novelRelationshipParser` (I27): Host-only C1 recognition through `ctx.llm`.
 *   It returns strict operations only; its parser path is the default C1
 *   automatic writer, while RelationshipRepository persists validated C1 state.
 * - `novelKnowledgeParser` (I28): Host-only C3 recognition through `ctx.llm`.
 *   It returns strict forward operations only; KnowledgeRepository retains C3
 *   graph validation and persistence while I11 owns low-confidence confirmation.
 * - `novelWorldviewParser` (I29): Host-only B2 recognition through `ctx.llm`.
 *   It returns supersede proposals only; every B2 rewrite remains confirmation-first
 *   and WorldRepository retains the rewritten-history persistence contract.
 * - `novelImport` (I37): Host-only controlled text import and pending candidates.
 * - `novelSplitAgent` (I38): Host-routed B5/B2/detail-beat candidates; every
 *   result remains confirmation-first and never writes C1/C2/C3/C4.
 * - `novelOnboardingAnalyzer` (I52): Host-only six-layer B3/B2/B5/C1/C2/C4
 *   candidate-package analyzer with start/status/cancel/regenerate lifecycle;
 *   it returns candidates only, never writes a layer, and forbids C3/
 *   items/factions/globalFlags inference.
 * - `novelProbe` (I2): plain Host service backing the `novelProbe/probe` Remote.
 *   Its Typert contribution is registered only when the DSH Typert registry
 *   (`ctx.typert`, key `typert`) is present, so the plugin still boots in the
 *   minimal I1 loader smoke where that registry is absent. Registration runs
 *   through `ctx.effect`, so Fiber dispose withdraws it (H0-6).
 */
export const name = 'novel-creation-tool';

/** Minimal I1 status service, read-only and versioned for smoke assertions. */
export interface NovelCreationStatus {
  readonly version: '2.0.0';
  readonly ready: true;
}

export interface NovelCreationConfig {
  projectsRoot?: string;
  /** Host-only location for A2 settings; it is not a project/export data path. */
  settingsRoot?: string;
  /** 是否注册对话创作 Agent 工具（novel_open/status/context/continue/inspire），默认 true。 */
  agentTools?: boolean;
}

export function apply(ctx: Context, config: NovelCreationConfig = {}): void {
  const status: NovelCreationStatus = { version: '2.0.0', ready: true };
  // Services are owned by the current Fiber and removed on dispose.
  ctx.provide('novelCreation', status);
  // I75：把 dispose 回调归属到当前 Fiber 的单一钩子，收敛原 27 处
  // `(dispose) => ctx.effect(...)` 重复闭包（见架构审查 §8#3 / §9#1）。
  const onFiberDispose = (dispose: () => void): void => { ctx.effect(() => dispose); };
  const projectsRoot = config.projectsRoot;
  const characterService = createCharacterService(projectsRoot);
  const worldviewService = createWorldviewService(projectsRoot);
  const outlineService = createOutlineService(projectsRoot);
  const relationshipService = createRelationshipService(projectsRoot);
  const stateService = createStateService(projectsRoot);
  const canonService = createCanonService(projectsRoot);
  const confirmationService = createConfirmationService(projectsRoot);
  const projectService = createProjectService(projectsRoot, {
    characters: characterService,
    worldview: worldviewService,
    outline: outlineService,
    relationship: relationshipService,
    state: stateService,
    canon: canonService,
    confirmation: confirmationService,
  });
  ctx.provide('novelProject', projectService);
  ctx.provide('novelState', stateService);
  ctx.provide('novelCanon', canonService);
  const textService = createTextService(projectsRoot);
  ctx.provide('novelText', textService);
  const ruleService = createRuleService(projectsRoot);
  ctx.provide('novelRule', ruleService);
  ctx.provide('novelWorldview', worldviewService);
  ctx.provide('novelCharacter', characterService);
  const styleService = createStyleService(projectsRoot);
  ctx.provide('novelStyle', styleService);
  ctx.provide('novelConfirmation', confirmationService);
  ctx.provide('novelOutline', outlineService);
  ctx.provide('novelRelationship', relationshipService);
  const knowledgeService = createKnowledgeService(projectsRoot);
  ctx.provide('novelKnowledge', knowledgeService);
  const llm = ctx.get('llm', false);
  const credentials = ctx.get('credentials', false);
  ctx.provide('novelGeneration', createGenerationService(llm, onFiberDispose));
  ctx.provide('novelSettings', createSettingsService(llm, config.settingsRoot, credentials, onFiberDispose));
  ctx.provide('novelExtension', createExtensionService(llm, projectsRoot, onFiberDispose));
  ctx.provide('novelStoryGeneration', createStoryGenerationService(llm, onFiberDispose));
  ctx.provide('novelStoryLifecycle', createStoryLifecycleService(llm, projectsRoot, onFiberDispose));
  // I75：探测器先绑定局部变量再 provide，写作/审校编排直接引用局部变量，
  // 消除 6 处 `ctx.get(...) as never`（含审查 §3.3 的 3 处零成本项）。
  const consistencyDetectionService = createConsistencyDetectionService(llm, onFiberDispose);
  ctx.provide('novelConsistencyDetection', consistencyDetectionService);
  const knowledgeLeakDetectionService = createKnowledgeLeakDetectionService(llm, onFiberDispose);
  ctx.provide('novelKnowledgeLeakDetection', knowledgeLeakDetectionService);
  const relationshipStyleDetectionService = createRelationshipStyleDetectionService(llm, onFiberDispose);
  ctx.provide('novelRelationshipStyleDetection', relationshipStyleDetectionService);
  ctx.provide('novelStateParser', createStateParserService(llm, onFiberDispose));
  ctx.provide('novelRelationshipParser', createRelationshipParserService(llm, onFiberDispose));
  ctx.provide('novelKnowledgeParser', createKnowledgeParserService(llm, onFiberDispose));
  ctx.provide('novelWorldviewParser', createWorldviewParserService(llm, onFiberDispose));
  ctx.provide('novelImport', createHostImportService());
  ctx.provide('novelSplitAgent', createSplitAgentService(llm, onFiberDispose));
  ctx.provide('novelExport', createExportService());
  ctx.provide('novelClassifier', createClassifierService(llm, projectsRoot, onFiberDispose));
  ctx.provide('novelLocalizedEdit', createLocalizedEditService(llm, projectsRoot, onFiberDispose));
  ctx.provide('novelChapterWriting', createChapterWritingService(llm, projectsRoot, onFiberDispose));
  const inspirationService = createInspirationService(llm, onFiberDispose);
  ctx.provide('novelInspiration', inspirationService);
  const uploadService = createHostUploadService(onFiberDispose);
  const llmConfigService = createLlmConfigService(undefined, config.settingsRoot);
  ctx.provide('novelLlmConfig', defineRemote('novelLlmConfig', 'novelLlmConfig', llmConfigService, [
    { method: 'load', call: () => llmConfigService.load() },
    { method: 'save', call: (input: LlmConfigSaveInput) => llmConfigService.save(input) },
  ]));
  // 创作台通用设置：目标字数 + 内容不足时是否询问 + 打开作品落地文件夹（Host 侧持久化）。
  const workbenchSettingsService = createWorkbenchSettingsService(config.settingsRoot, projectsRoot);
  ctx.provide('novelWorkbenchSettings', defineRemote('novelWorkbenchSettings', 'novelWorkbenchSettings', workbenchSettingsService, [
    { method: 'load', call: () => workbenchSettingsService.load() },
    { method: 'save', call: (input: WorkbenchSettingsSaveInput) => workbenchSettingsService.save(input) },
    { method: 'openProjectFolder', call: (projectId: string) => workbenchSettingsService.openProjectFolder(projectId) },
  ]));
  const analyzerService = createOnboardingAnalyzerService(llm, onFiberDispose);
  // The wire marks `settings` optional (`acceptsUndefined`), and the Client has
  // no generation settings of its own — so when the caller omits them, resolve
  // them from the plugin's persisted A2 config (I31 `novelSettings` owner).
  const settingsIndex = new SettingsIndex(config.settingsRoot);
  // I75：`resolveA2GenerationConfig(await settingsIndex.load()).settings` 收敛为单一
  // 闭包（原 6 次重复，见架构审查 §8#3）；analyzer 的包装负责缺失配置的可操作报错。
  const resolveGenerationSettings = async (): Promise<GenerationSettings> => {
    const a2Config = await settingsIndex.load();
    return resolveA2GenerationConfig(a2Config).settings;
  };
  const resolveAnalyzerSettings = async (settings: unknown): Promise<unknown> => {
    if (settings !== undefined) return settings;
    try {
      return await resolveGenerationSettings();
    } catch (cause) {
      throw new Error(
        `生成设置未配置：缺少 generation settings（modelRef/credentialRef），且 ${settingsIndex.root}/${A2_SETTINGS_FILE} 不存在或无效`,
        { cause },
      );
    }
  };
  // The analyzer is frozen by its constructor. The small mutable Remote carrier
  // delegates to that single owner under the same canonical service key. I57:
  // `begin` resolves settings once, then hands the resolved settings to the
  // background job so the client can poll `status`/`cancel` without a second
  // resolution path.
  ctx.provide('novelOnboardingAnalyzer', defineRemote('novelOnboardingAnalyzer', 'novelOnboardingAnalyzer', analyzerService, [
    { method: 'begin', call: async (input: OnboardingAnalysisStartInput, settings?: unknown) => analyzerService.begin(input, await resolveAnalyzerSettings(settings)) },
    { method: 'start', call: async (input: OnboardingAnalysisStartInput, settings?: unknown) => analyzerService.start(input, await resolveAnalyzerSettings(settings)) },
    { method: 'status', call: (onboardingSessionId: string) => analyzerService.status(onboardingSessionId) },
    { method: 'cancel', call: (onboardingSessionId: string) => analyzerService.cancel(onboardingSessionId) },
    { method: 'result', call: (onboardingSessionId: string) => analyzerService.result(onboardingSessionId) },
  ]));
  // I53: adjudication builds on the analyzer's bound results. The layer source
  // adapts `getResult`/`regenerate` so the adjudication facade stays independent
  // of the analyzer's job lifecycle internals.
  const layerSource: OnboardingLayerSource = {
    getResult(onboardingSessionId) { return analyzerService.getResult(onboardingSessionId); },
    async regenerate(onboardingSessionId, layer, settings) {
      const result = await analyzerService.regenerate(onboardingSessionId, layer, await resolveAnalyzerSettings(settings));
      return { layers: result.layers };
    },
  };
  const adjudicationService = createOnboardingAdjudicationService({
    characters: characterService,
    worldview: worldviewService,
    outline: outlineService,
    relationship: relationshipService,
    state: stateService,
    canon: canonService,
    confirmation: confirmationService,
  }, layerSource);
  // 剧情时间线（方案 A 时间线层）：从 B5 大纲自建有序骨架，支撑关系注入按
  // 「当前时间线节点」过滤（design §8 相关角色对）。onboarding finalApply 成功
  // 落地 B5 后自建；写作上下文/面板可继续手动编辑保存。
  const timelineService = createTimelineService(outlineService, projectsRoot);
  ctx.provide('novelTimeline', defineRemote('novelTimeline', 'novelTimeline', timelineService, [
    { method: 'read', call: (projectId: string) => timelineService.read(projectId) },
    { method: 'ensureFromOutline', call: (projectId: string) => timelineService.ensureFromOutline(projectId) },
    // wire 层 nodeId 可选（string | undefined）；undefined/null 都归一为 null（恢复自动锚定）。
    { method: 'setCurrentNode', call: (projectId: string, nodeId: string | null | undefined) => timelineService.setCurrentNode(projectId, nodeId ?? null) },
    { method: 'save', call: (projectId: string, input: Timeline) => timelineService.save(projectId, input) },
  ]));
  // The service is immutable; expose the same owner through a mutable Remote carrier.
  ctx.provide('novelOnboarding', defineRemote('novelOnboarding', 'novelOnboarding', adjudicationService, [
    { method: 'adjudicate', call: (input: OnboardingAdjudicateInput, settings?: unknown) => adjudicationService.adjudicate(input, settings) },
    { method: 'acceptedLayers', call: (onboardingSessionId: string) => adjudicationService.acceptedLayers(onboardingSessionId) },
    // B5 落地成功（无 blocked/retryable 且已应用 outline）后自建时间线骨架；
    // 自建失败不阻断 onboarding 结果（时间线是可重建的派生视图）。
    {
      method: 'finalApply',
      call: async (input: OnboardingFinalApplyInput) => {
        const result = await adjudicationService.finalApply(input);
        if (result.blockedLayers.length === 0 && result.retryable === false && result.appliedLayers.includes('outline')) {
          const projectId = result.projectId;
          await timelineService.ensureFromOutline(projectId).catch(() => undefined);
        }
        return result;
      },
    },
  ]));

  // I2 public Remote probe: provide the service, then register its Typert
  // contribution when the registry is available (full DSH Host composition).
  ctx.provide(NOVEL_PROBE_NAMESPACE, { probe: probeData });
  // I61 C5 正文编辑与可选 reparse（design §5.12 / §14.9 / R13-2）：I42 编辑服务 +
  // 真实 I25–I29 parser fan-out + 既有 Domain Service writers + I11 Gate。设置解析
  // 惰性执行（accept 时才需要），与 analyzer 共用同一 A2 generation settings owner。
  const textEditService = createTextEditService({
    llm,
    projectsRoot,
    state: stateService,
    relationship: relationshipService,
    knowledge: knowledgeService,
    canon: canonService,
    worldview: worldviewService,
    confirmation: confirmationService,
    resolveSettings: resolveGenerationSettings,
    onDispose: onFiberDispose,
  });
  ctx.provide('novelTextEdit', textEditService);
  // I62 统一写作候选命令（design §14.9 / R13-3）：生成/续写/按场景卡写作/局部重写
  // 共用同一 Host 候选命令，只产生绑定 project/chapter/scene/sourceHash 的候选，
  // 不预先接受或写任何层；取消/错误/过期语义在 core/candidate 冻结。候选不持久化
  // （I65 队列 owner）；I63 裁决 UI 复用本服务并消费 assertCandidateFresh。
  const writingCandidateService = createWritingCandidateService({ llm, projectsRoot, onDispose: onFiberDispose });
  ctx.provide('novelWritingCandidate', writingCandidateService);
  // I63 候选审阅与生成后裁决（design §14.9 / R13-4）：共享上下文装配 + 既有 Domain
  // Service 写回 + I21/I22/I24 校验 + I30 标准生命周期。退役 novel_continue 预先
  // accept 产品路径 —— agent 工具与 GUI 审阅面板共用同一 owner（novelWritingAdjudication）。
  const nextSceneContext = createNextSceneContextBuilder({
    outline: outlineService,
    characters: characterService,
    worldview: worldviewService,
    relationship: relationshipService,
    state: stateService,
    canon: canonService,
    style: styleService,
    rules: ruleService,
    knowledge: knowledgeService,
    text: textService,
    timeline: timelineService,
    workbenchSettings: workbenchSettingsService,
  });
  const writingAdjudicationService = createWritingAdjudicationService({
    llm,
    projectsRoot,
    context: nextSceneContext,
    state: stateService,
    relationship: relationshipService,
    knowledge: knowledgeService,
    canon: canonService,
    worldview: worldviewService,
    confirmation: confirmationService,
    rules: ruleService,
    style: styleService,
    consistency: consistencyDetectionService,
    knowledgeLeak: knowledgeLeakDetectionService,
    relationshipStyle: relationshipStyleDetectionService,
    resolveSettings: resolveGenerationSettings,
    onDispose: onFiberDispose,
  });
  // wire 面 namespace 是 `novelWriting`（writing.ts descriptor 的 service/namespace），
  // 组合根 provide 键是 `novelWritingAdjudication`（I63 单一 owner 契约，见 agent-tools 注释）。
  ctx.provide('novelWritingAdjudication', defineRemote('novelWritingAdjudication', 'novelWriting', writingAdjudicationService, [
    { method: 'propose', call: (projectId: string, input: WritingProposeInput, settings?: unknown) => writingAdjudicationService.propose(projectId, input, settings) },
    { method: 'preview', call: (candidateId: string) => writingAdjudicationService.preview(candidateId) },
    { method: 'adjudicate', call: (candidateId: string, decision: 'accept' | 'reject' | 'rewrite', settings?: unknown) => writingAdjudicationService.adjudicate(candidateId, decision, settings) },
  ]));
  // I64 一致性审校中心（design §14.9 / R13-5）：统一投影规则/正史/知情/关系/风格
  // 五类问题及正文定位；复用 I21/I22/I24 探测器与 I20 判定（不新增第二裁决器）；
  // 软警告必须显式 continue / rewrite-requested 并记录到持久审计账本，硬冲突
  // 阻止 continue/accept。settings 惰性解析与 analyzer/writing 共用同一 owner。
  const reviewService = createReviewService({
    llm,
    projectsRoot,
    text: textService,
    rules: ruleService,
    canon: canonService,
    knowledge: knowledgeService,
    relationship: relationshipService,
    style: styleService,
    consistency: consistencyDetectionService,
    knowledgeLeak: knowledgeLeakDetectionService,
    relationshipStyle: relationshipStyleDetectionService,
    resolveSettings: resolveGenerationSettings,
    onDispose: onFiberDispose,
  });
  ctx.provide('novelReview', defineRemote('novelReview', 'novelReview', reviewService, [
    { method: 'scan', call: (projectId: string, settings?: unknown) => reviewService.scan(projectId, settings) },
    { method: 'adjudicate', call: (projectId: string, input: ReviewAdjudicateInputShape) => reviewService.adjudicate(projectId, input.decision, input.issueIds) },
    // 服务层 `records()` 返回裸数组（I64 smoke 的 service 级消费者夹具契约）；
    // wire 契约（host/remote/review.ts reviewRecordsInvocation）声明 envelope
    // `{ records: [...] }`，网关按 descriptor.result strict codec 校验业务结果，
    // 因此适配层必须在此整形，否则 bare array 触发 boundary validation 失败。
    // （I77 在 wire 派生层修复该组合根补丁。）
    { method: 'records', call: async (projectId: string) => ({ records: await reviewService.records(projectId) }) },
  ]));
  // I65 可恢复自动生成队列（design §14.9 / R13-6）：Host 持有按场景卡范围执行的
  // 生成队列，支持暂停/继续/取消、重试、预算与停止策略。队列只编排生成——候选经
  // I62（零写）产生并注册进 I63（registerRecoveredCandidate，作者在裁决面板
  // accept/reject/rewrite），绝不自动接受、绝不静默改 B5/C6。任务状态 + 候选正文
  // 持久化到 queue-journal.yaml，重启后 recover 对账 + rehydrate（无重复正文）。
  const queueService = createQueueService({
    projectsRoot,
    candidate: writingCandidateService,
    writing: writingAdjudicationService,
    text: textService,
    outline: outlineService,
    resolveSettings: resolveGenerationSettings,
    onDispose: onFiberDispose,
  });
  ctx.provide('novelQueue', defineRemote('novelQueue', 'novelQueue', queueService, [
    { method: 'status', call: (projectId: string) => queueService.status(projectId) },
    { method: 'start', call: (projectId: string, input?: QueueStartInput) => queueService.start(projectId, input) },
    { method: 'pause', call: (projectId: string) => queueService.pause(projectId) },
    { method: 'resume', call: (projectId: string) => queueService.resume(projectId) },
    { method: 'cancel', call: (projectId: string) => queueService.cancel(projectId) },
    { method: 'retry', call: (projectId: string, taskId: string) => queueService.retry(projectId, taskId) },
    { method: 'cancelTask', call: (projectId: string, taskId: string) => queueService.cancelTask(projectId, taskId) },
    { method: 'recover', call: (projectId: string) => queueService.recover(projectId) },
  ]));
  // I66 C3 知情与揭示管理面（design §14.10 / R14-1）：作者按事实与角色查看
  // holders/revealPlan/status 并受控执行揭示或 holder 变更。复用 I18 领域服务
  // （KnowledgeRepository 唯一 C3 写 owner）+ I11 ConfirmationGate（propose→accept/
  // reject，未确认零写）+ 既有知情不倒退约束（assertKnowledgeOnlyAdvances）。
  // 管理投影只读全量 C3 文档（作者全知面），绝不调用单角色 POV 过滤入口。
  const knowledgeManagerService = createKnowledgeManagerService({
    knowledge: knowledgeService,
    characters: characterService,
    confirmation: confirmationService,
    onDispose: onFiberDispose,
  });
  ctx.provide('novelKnowledgeManager', defineRemote('novelKnowledgeManager', 'novelKnowledgeManager', knowledgeManagerService, [
    { method: 'list', call: (projectId: string) => knowledgeManagerService.list(projectId) },
    { method: 'read', call: (projectId: string, entryId: string) => knowledgeManagerService.read(projectId, entryId) },
    { method: 'propose', call: (projectId: string, input: KnowledgeChangeInput) => knowledgeManagerService.propose(projectId, input) },
    { method: 'accept', call: (projectId: string, proposalId: string) => knowledgeManagerService.accept(projectId, proposalId) },
    { method: 'reject', call: (projectId: string, proposalId: string) => knowledgeManagerService.reject(projectId, proposalId) },
    // 服务层 `pending()` 返回裸数组（I66 smoke 的 service 级消费者夹具契约）；wire
    // 契约（host/remote/knowledge.ts knowledgePendingInvocation）声明 envelope
    // `{ projectId, proposals: [...] }`，网关按 descriptor.result strict codec 校验，
    // 适配层必须在此整形（与 novelReview/records 同缺陷类，见 §14.10/R14-1；I77 修复）。
    { method: 'pending', call: async (projectId: string) => ({ projectId, proposals: await knowledgeManagerService.pending(projectId) }) },
  ]));
  // I67 B1 规则与 B4 文风控制面（design §14.10「B1/B4 控制面」/ R14-2）：作者编辑
  // 规则优先级/immutable 与风格人称/时态/POV/禁用表达表单。复用 I7/I10 领域服务
  // （RuleRepository/StyleRepository 仍是 B1/B4 唯一写 owner，本服务只转发最小
  // owned JSON）；非法枚举/越界优先级在 wire 层与服务端双重拒绝，immutable 规则
  // 改写由 RuleRepository 拒绝（零写）。保存后生成与检测消费的正是同一批存储。
  const ruleStyleManagerService = createRuleStyleManagerService({
    rules: ruleService,
    style: styleService,
    projectsRoot,
    onDispose: onFiberDispose,
  });
  ctx.provide('novelRuleStyleManager', defineRemote('novelRuleStyleManager', 'novelRuleStyleManager', ruleStyleManagerService, [
    { method: 'list', call: (projectId: string) => ruleStyleManagerService.list(projectId) },
    { method: 'readRule', call: (projectId: string, ruleId: string) => ruleStyleManagerService.readRule(projectId, ruleId) },
    { method: 'createRule', call: (projectId: string, input: RuleInput) => ruleStyleManagerService.createRule(projectId, input) },
    { method: 'updateRule', call: (projectId: string, ruleId: string, patch: RulePatch) => ruleStyleManagerService.updateRule(projectId, ruleId, patch) },
    { method: 'readStyle', call: (projectId: string) => ruleStyleManagerService.readStyle(projectId) },
    { method: 'saveStyle', call: (projectId: string, input: Omit<StyleProfileInput, 'id'>) => ruleStyleManagerService.saveStyle(projectId, input) },
  ]));
  // I68 C6 进度与灵感方向落地（design §14.10「C6 与灵感落地」/ R14-3）：进度/
  // 偏差投影 + 导航/完成状态 + 灵感 select→propose→apply + 刷新与审计记录。
  // 复用 I14/I15 outlineService（B5/C6 唯一写 owner）、I11 ConfirmationGate 与
  // I45 灵感 agent；灵感默认只读，选定并确认后才允许改授权的 B5/C6（N-5：
  // 偏差先记录、不自动选方向、不强制改大纲）。重复 apply 由 C6 偏差标记幂等。
  const progressInspirationService = createProgressInspirationService({
    outline: outlineService,
    confirmation: confirmationService,
    inspiration: inspirationService,
    projectsRoot,
    onDispose: onFiberDispose,
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
  ]));
  // I69 导入导出与备份 UI（design §14.10「导入、导出与备份」/ R14-4）：受控
  // import/export Remote —— I39 可移植档案/纯文本导出下载、round-trip 备份恢复
  // （N-7 非空作品 fail closed + 空壳事务写盘）与 I37 确定性导入预览。复用
  // `core/export` 与 `import` 既有 owner；Client 只接收下载载荷/命令，不持有路径。
  const importExportService = createImportExportService(projectsRoot);
  ctx.provide('novelImportExport', defineRemote('novelImportExport', 'novelImportExport', importExportService, [
    { method: 'exportArchive', call: (projectId: string, mode: ArchiveMode) => importExportService.exportArchive(projectId, mode) },
    { method: 'exportText', call: (projectId: string, format: 'txt' | 'md') => importExportService.exportText(projectId, format) },
    { method: 'restore', call: (projectId: string, raw: string) => importExportService.restore(projectId, raw) },
    { method: 'importPreview', call: (projectId: string, input: ImportPreviewInput) => importExportService.importPreview(projectId, input) },
  ]));
  // I70 C5 正文版本与分支（design §14.10「正文版本与分支」/ R14-5）：Host-owned
  // 分支/版本模型 —— 候选可保留为分支、比较并选择唯一 chosen。复用 TextRepository
  // （C5 唯一存储 owner；legacy 单版本文档兼容迁移 + fail closed 在 open 内完成）；
  // choose 只写 C5，结构化同步仍必须显式 reparse/Gate。Client 分支面板只提交受控
  // 命令，不持有版本真相。
  const branchService = createBranchService(projectsRoot);
  ctx.provide('novelBranches', defineRemote('novelBranches', 'novelBranches', branchService, [
    { method: 'list', call: (projectId: string, chapterId: string, sceneId: string) => branchService.listBranches(projectId, chapterId, sceneId) },
    { method: 'read', call: (projectId: string, chapterId: string, sceneId: string, branchId: string) => branchService.readBranch(projectId, chapterId, sceneId, branchId) },
    { method: 'save', call: (projectId: string, chapterId: string, sceneId: string, label: string) => branchService.saveBranch(projectId, chapterId, sceneId, label) },
    { method: 'choose', call: (projectId: string, chapterId: string, sceneId: string, branchId: string) => branchService.chooseBranch(projectId, chapterId, sceneId, branchId) },
    { method: 'diff', call: (projectId: string, chapterId: string, sceneId: string, fromBranchId: string, toBranchId?: string) => branchService.diffBranches(projectId, chapterId, sceneId, fromBranchId, toBranchId) },
  ]));
  // I71 全局搜索与上下文追踪（design §14.10「搜索与上下文追踪」/ R14-6）：可重建
  // 搜索投影 + 实体交叉引用 + 结果跳转 + 生成注入解释（trace）。搜索索引是派生视图
  // （core/search，可 drop/rebuild，不成为第二真相）；POV 边界在查询时用 live C3
  // knows 过滤；trace 由 writing 路径（novelWriting.preview）返回，本服务只负责
  // 检索/引用/索引生命周期，不持有生成路径。
  const searchService = createSearchService({
    projectsRoot,
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
  ]));
  // I72 写作进度面板（design §14.10「写作进度」/ R14-7）：以可重建派生统计展示
  // 章节字数、目标完成度、场景卡状态、POV 分布和任务历史。统计是派生视图
  // （core/statistics，可 drop/rebuild，不成为第二份作品进度真相）；口径复用
  // 既有 owner —— 字数 = countProseUnits（I65 队列同一写作单位）、场景卡联动 =
  // stableSceneId（I65 同一确定性派生）、任务记录只经 I65 队列 status() 读取
  // （零写账本）；概览/筛选/详情全部有界，空作品 empty 标记（无假进度）。
  const statisticsService = createStatisticsService({
    projectsRoot,
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
    // wire 层 sceneCards/tasks 的可选筛选参数（string/number）聚合为 domain filter 对象。
    {
      method: 'sceneCards',
      call: (projectId: string, actId?: string, beatId?: string, status?: string, limit?: number): Promise<unknown> => statisticsService.sceneCards(projectId, {
        ...(actId !== undefined && actId !== null ? { actId: String(actId) } : {}),
        ...(beatId !== undefined && beatId !== null ? { beatId: String(beatId) } : {}),
        ...(status !== undefined && status !== null ? { status: String(status) as 'planned' | 'writing' | 'done' } : {}),
        ...(limit !== undefined && limit !== null ? { limit: Number(limit) } : {}),
      } satisfies StatisticsSceneCardFilter),
    },
    {
      method: 'tasks',
      call: (projectId: string, status?: string, limit?: number): Promise<unknown> => statisticsService.tasks(projectId, {
        ...(status !== undefined && status !== null ? { status: String(status) as 'queued' | 'running' | 'candidate-ready' | 'failed' | 'cancelled' | 'completed' } : {}),
        ...(limit !== undefined && limit !== null ? { limit: Number(limit) } : {}),
      } satisfies StatisticsTaskFilter),
    },
  ]));
  const workspaceService = createWorkspaceEditorService(
    characterService, worldviewService, outlineService, relationshipService,
    stateService, canonService, confirmationService, projectService, uploadService, textService, textEditService,
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
    inspiration: inspirationService,
    confirmation: confirmationService,
    resolveSettings: resolveGenerationSettings,
    workbenchSettings: workbenchSettingsService,
  });
  ctx.provide('novelAgent', agentService);
  if (config.agentTools !== false) {
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
