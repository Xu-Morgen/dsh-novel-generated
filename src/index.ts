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
import { createWritingAdjudicationService } from './host/writing-adjudication-service.js';
import { createReviewService } from './host/review-service.js';
import { createQueueService } from './host/queue-service.js';
import { createKnowledgeManagerService } from './host/knowledge-manager-service.js';
import { createRuleStyleManagerService } from './host/rule-style-manager-service.js';
import { createProgressInspirationService } from './host/progress-inspiration-service.js';
import { createImportExportService } from './host/import-export-service.js';
import { createBranchService } from './host/branch-service.js';
import { createSearchService } from './host/search-service.js';
import { createStatisticsService } from './host/statistics-service.js';
import { createNextSceneContextBuilder } from './host/writing-context.js';
import { createInspirationService } from './host/inspiration-service.js';
import { createHostUploadService } from './host/upload-service.js';
import { createLlmConfigService } from './host/llm-config-service.js';
import { createOnboardingAnalyzerService } from './host/onboarding-analyzer-service.js';
import { createOnboardingAdjudicationService, type OnboardingLayerSource } from './host/onboarding-adjudication-service.js';
import { createWorkbenchSettingsService } from './host/workbench-settings-service.js';
import { workbenchSettingsRemoteContribution } from './host/remote/workbench-settings.js';
import { SettingsIndex, A2_SETTINGS_FILE, resolveA2GenerationConfig } from './core/settings-index/index.js';
import { NOVEL_PROBE_NAMESPACE, probeData, NOVEL_WORKSPACE_NAMESPACE, hostContribution, bindRemote, createWorkspaceEditorService } from './remote.js';
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
  ctx.provide('novelGeneration', createGenerationService(llm, (dispose) => ctx.effect(() => dispose)));
  ctx.provide('novelSettings', createSettingsService(llm, config.settingsRoot, credentials, (dispose) => ctx.effect(() => dispose)));
  ctx.provide('novelExtension', createExtensionService(llm, projectsRoot, (dispose) => ctx.effect(() => dispose)));
  ctx.provide('novelStoryGeneration', createStoryGenerationService(llm, (dispose) => ctx.effect(() => dispose)));
  ctx.provide('novelStoryLifecycle', createStoryLifecycleService(llm, projectsRoot, (dispose) => ctx.effect(() => dispose)));
  ctx.provide('novelConsistencyDetection', createConsistencyDetectionService(llm, (dispose) => ctx.effect(() => dispose)));
  ctx.provide('novelKnowledgeLeakDetection', createKnowledgeLeakDetectionService(llm, (dispose) => ctx.effect(() => dispose)));
  ctx.provide('novelRelationshipStyleDetection', createRelationshipStyleDetectionService(llm, (dispose) => ctx.effect(() => dispose)));
  ctx.provide('novelStateParser', createStateParserService(llm, (dispose) => ctx.effect(() => dispose)));
  ctx.provide('novelRelationshipParser', createRelationshipParserService(llm, (dispose) => ctx.effect(() => dispose)));
  ctx.provide('novelKnowledgeParser', createKnowledgeParserService(llm, (dispose) => ctx.effect(() => dispose)));
  ctx.provide('novelWorldviewParser', createWorldviewParserService(llm, (dispose) => ctx.effect(() => dispose)));
  ctx.provide('novelImport', createHostImportService());
  ctx.provide('novelSplitAgent', createSplitAgentService(llm, (dispose) => ctx.effect(() => dispose)));
  ctx.provide('novelExport', createExportService());
  ctx.provide('novelClassifier', createClassifierService(llm, projectsRoot, (dispose) => ctx.effect(() => dispose)));
  ctx.provide('novelLocalizedEdit', createLocalizedEditService(llm, projectsRoot, (dispose) => ctx.effect(() => dispose)));
   ctx.provide('novelChapterWriting', createChapterWritingService(llm, projectsRoot, (dispose) => ctx.effect(() => dispose)));
   const inspirationService = createInspirationService(llm, (dispose) => ctx.effect(() => dispose));
   ctx.provide('novelInspiration', inspirationService);
  const uploadService = createHostUploadService((dispose) => ctx.effect(() => dispose));
  const llmConfigService = createLlmConfigService(undefined, config.settingsRoot);
  ctx.provide('novelLlmConfig', bindRemote({
    load: () => llmConfigService.load(),
    save: (input: unknown) => llmConfigService.save(input as Parameters<typeof llmConfigService.save>[0]),
  }, 'novelLlmConfig', 'novelLlmConfig'));
  // 创作台通用设置：目标字数 + 内容不足时是否询问 + 打开作品落地文件夹（Host 侧持久化）。
  const workbenchSettingsService = createWorkbenchSettingsService(config.settingsRoot, projectsRoot);
  ctx.provide('novelWorkbenchSettings', bindRemote({
    load: () => workbenchSettingsService.load(),
    save: (input: unknown) => workbenchSettingsService.save(input as Parameters<typeof workbenchSettingsService.save>[0]),
    openProjectFolder: (projectId: unknown) => workbenchSettingsService.openProjectFolder(String(projectId)),
  }, 'novelWorkbenchSettings', 'novelWorkbenchSettings'));
  const analyzerService = createOnboardingAnalyzerService(llm, (dispose) => ctx.effect(() => dispose));
  // The wire marks `settings` optional (`acceptsUndefined`), and the Client has
  // no generation settings of its own — so when the caller omits them, resolve
  // them from the plugin's persisted A2 config (I31 `novelSettings` owner).
  const settingsIndex = new SettingsIndex(config.settingsRoot);
  const resolveAnalyzerSettings = async (settings: unknown): Promise<unknown> => {
    if (settings !== undefined) return settings;
    try {
      return resolveA2GenerationConfig(await settingsIndex.load()).settings;
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
  const analyzerRemote = bindRemote({
    begin: async (input: unknown, settings: unknown) => analyzerService.begin(input as Parameters<typeof analyzerService.begin>[0], await resolveAnalyzerSettings(settings)),
    start: async (input: unknown, settings: unknown) => analyzerService.start(input as Parameters<typeof analyzerService.start>[0], await resolveAnalyzerSettings(settings)),
    status: (onboardingSessionId: string) => analyzerService.status(onboardingSessionId),
    cancel: (onboardingSessionId: string) => analyzerService.cancel(onboardingSessionId),
    result: (onboardingSessionId: string) => analyzerService.result(onboardingSessionId),
  }, 'novelOnboardingAnalyzer', 'novelOnboardingAnalyzer');
  ctx.provide('novelOnboardingAnalyzer', analyzerRemote);
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
  // The service is immutable; expose the same owner through a mutable Remote carrier.
  ctx.provide('novelOnboarding', bindRemote({
    adjudicate: (input: unknown, settings: unknown) => adjudicationService.adjudicate(input as Parameters<typeof adjudicationService.adjudicate>[0], settings),
    acceptedLayers: (onboardingSessionId: string) => adjudicationService.acceptedLayers(onboardingSessionId),
    finalApply: (input: unknown) => adjudicationService.finalApply(input as Parameters<typeof adjudicationService.finalApply>[0]),
  }, 'novelOnboarding', 'novelOnboarding'));

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
    resolveSettings: async () => resolveA2GenerationConfig(await settingsIndex.load()).settings,
    onDispose: (dispose) => ctx.effect(() => dispose),
  });
  ctx.provide('novelTextEdit', textEditService);
  // I62 统一写作候选命令（design §14.9 / R13-3）：生成/续写/按场景卡写作/局部重写
  // 共用同一 Host 候选命令，只产生绑定 project/chapter/scene/sourceHash 的候选，
  // 不预先接受或写任何层；取消/错误/过期语义在 core/candidate 冻结。候选不持久化
  // （I65 队列 owner）；I63 裁决 UI 复用本服务并消费 assertCandidateFresh。
  const writingCandidateService = createWritingCandidateService({ llm, projectsRoot, onDispose: (dispose) => ctx.effect(() => dispose) });
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
    consistency: ctx.get('novelConsistencyDetection') as never,
    knowledgeLeak: ctx.get('novelKnowledgeLeakDetection') as never,
    relationshipStyle: ctx.get('novelRelationshipStyleDetection') as never,
    resolveSettings: async () => resolveA2GenerationConfig(await settingsIndex.load()).settings,
    onDispose: (dispose) => ctx.effect(() => dispose),
  });
  ctx.provide('novelWritingAdjudication', bindRemote({
    propose: (projectId: unknown, input: unknown, settings?: unknown) => writingAdjudicationService.propose(String(projectId), input as Parameters<typeof writingAdjudicationService.propose>[1], settings),
    preview: (candidateId: unknown) => writingAdjudicationService.preview(String(candidateId)),
    adjudicate: (candidateId: unknown, decision: unknown, settings?: unknown) => writingAdjudicationService.adjudicate(String(candidateId), decision as 'accept' | 'reject' | 'rewrite', settings),
  }, 'novelWritingAdjudication', 'novelWriting'));
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
    consistency: ctx.get('novelConsistencyDetection') as never,
    knowledgeLeak: ctx.get('novelKnowledgeLeakDetection') as never,
    relationshipStyle: ctx.get('novelRelationshipStyleDetection') as never,
    resolveSettings: async () => resolveA2GenerationConfig(await settingsIndex.load()).settings,
    onDispose: (dispose) => ctx.effect(() => dispose),
  });
  ctx.provide('novelReview', bindRemote({
    scan: (projectId: unknown, settings?: unknown) => reviewService.scan(String(projectId), settings),
    adjudicate: (projectId: unknown, input: unknown) => reviewService.adjudicate(
      String(projectId),
      (input as { decision: 'continue' | 'rewrite-requested' }).decision,
      (input as { issueIds: string[] }).issueIds,
    ),
    // 服务层 `records()` 返回裸数组（I64 smoke 的 service 级消费者夹具契约）；
    // wire 契约（host/remote/review.ts reviewRecordsInvocation）声明 envelope
    // `{ records: [...] }`，网关按 descriptor.result strict codec 校验业务结果，
    // 因此适配层必须在此整形，否则 bare array 触发 boundary validation 失败。
    records: async (projectId: unknown) => ({ records: await reviewService.records(String(projectId)) }),
  }, 'novelReview', 'novelReview'));
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
    resolveSettings: async () => resolveA2GenerationConfig(await settingsIndex.load()).settings,
    onDispose: (dispose) => ctx.effect(() => dispose),
  });
  ctx.provide('novelQueue', bindRemote({
    status: (projectId: unknown) => queueService.status(String(projectId)),
    start: (projectId: unknown, input?: unknown) => queueService.start(String(projectId), input as Parameters<typeof queueService.start>[1]),
    pause: (projectId: unknown) => queueService.pause(String(projectId)),
    resume: (projectId: unknown) => queueService.resume(String(projectId)),
    cancel: (projectId: unknown) => queueService.cancel(String(projectId)),
    retry: (projectId: unknown, taskId: unknown) => queueService.retry(String(projectId), String(taskId)),
    cancelTask: (projectId: unknown, taskId: unknown) => queueService.cancelTask(String(projectId), String(taskId)),
    recover: (projectId: unknown) => queueService.recover(String(projectId)),
  }, 'novelQueue', 'novelQueue'));
  // I66 C3 知情与揭示管理面（design §14.10 / R14-1）：作者按事实与角色查看
  // holders/revealPlan/status 并受控执行揭示或 holder 变更。复用 I18 领域服务
  // （KnowledgeRepository 唯一 C3 写 owner）+ I11 ConfirmationGate（propose→accept/
  // reject，未确认零写）+ 既有知情不倒退约束（assertKnowledgeOnlyAdvances）。
  // 管理投影只读全量 C3 文档（作者全知面），绝不调用单角色 POV 过滤入口。
  const knowledgeManagerService = createKnowledgeManagerService({
    knowledge: knowledgeService,
    characters: characterService,
    confirmation: confirmationService,
    onDispose: (dispose) => ctx.effect(() => dispose),
  });
  ctx.provide('novelKnowledgeManager', bindRemote({
    list: (projectId: unknown) => knowledgeManagerService.list(String(projectId)),
    read: (projectId: unknown, entryId: unknown) => knowledgeManagerService.read(String(projectId), String(entryId)),
    propose: (projectId: unknown, input: unknown) => knowledgeManagerService.propose(String(projectId), input as Parameters<typeof knowledgeManagerService.propose>[1]),
    accept: (projectId: unknown, proposalId: unknown) => knowledgeManagerService.accept(String(projectId), String(proposalId)),
    reject: (projectId: unknown, proposalId: unknown) => knowledgeManagerService.reject(String(projectId), String(proposalId)),
    pending: (projectId: unknown) => knowledgeManagerService.pending(String(projectId)),
  }, 'novelKnowledgeManager', 'novelKnowledgeManager'));
  // I67 B1 规则与 B4 文风控制面（design §14.10「B1/B4 控制面」/ R14-2）：作者编辑
  // 规则优先级/immutable 与风格人称/时态/POV/禁用表达表单。复用 I7/I10 领域服务
  // （RuleRepository/StyleRepository 仍是 B1/B4 唯一写 owner，本服务只转发最小
  // owned JSON）；非法枚举/越界优先级在 wire 层与服务端双重拒绝，immutable 规则
  // 改写由 RuleRepository 拒绝（零写）。保存后生成与检测消费的正是同一批存储。
  const ruleStyleManagerService = createRuleStyleManagerService({
    rules: ruleService,
    style: styleService,
    projectsRoot,
    onDispose: (dispose) => ctx.effect(() => dispose),
  });
  ctx.provide('novelRuleStyleManager', bindRemote({
    list: (projectId: unknown) => ruleStyleManagerService.list(String(projectId)),
    readRule: (projectId: unknown, ruleId: unknown) => ruleStyleManagerService.readRule(String(projectId), String(ruleId)),
    createRule: (projectId: unknown, input: unknown) => ruleStyleManagerService.createRule(String(projectId), input as Parameters<typeof ruleStyleManagerService.createRule>[1]),
    updateRule: (projectId: unknown, ruleId: unknown, patch: unknown) => ruleStyleManagerService.updateRule(String(projectId), String(ruleId), patch as Parameters<typeof ruleStyleManagerService.updateRule>[2]),
    readStyle: (projectId: unknown) => ruleStyleManagerService.readStyle(String(projectId)),
    saveStyle: (projectId: unknown, input: unknown) => ruleStyleManagerService.saveStyle(String(projectId), input as Parameters<typeof ruleStyleManagerService.saveStyle>[1]),
  }, 'novelRuleStyleManager', 'novelRuleStyleManager'));
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
    onDispose: (dispose) => ctx.effect(() => dispose),
  });
  ctx.provide('novelOutlineProgress', bindRemote({
    projection: (projectId: unknown) => progressInspirationService.projection(String(projectId)),
    recordDeviation: (projectId: unknown, input: unknown) => progressInspirationService.recordDeviation(String(projectId), input as Parameters<typeof progressInspirationService.recordDeviation>[1]),
    reconcileDeviation: (projectId: unknown, deviationId: unknown) => progressInspirationService.reconcileDeviation(String(projectId), String(deviationId)),
    inspire: (projectId: unknown, prompt?: unknown) => progressInspirationService.inspire(String(projectId), prompt === undefined ? undefined : String(prompt)),
    select: (projectId: unknown, input: unknown) => progressInspirationService.select(String(projectId), input as Parameters<typeof progressInspirationService.select>[1]),
    apply: (projectId: unknown, proposalId: unknown) => progressInspirationService.apply(String(projectId), String(proposalId)),
    reject: (projectId: unknown, proposalId: unknown) => progressInspirationService.reject(String(projectId), String(proposalId)),
    pending: (projectId: unknown) => progressInspirationService.pending(String(projectId)),
    audit: (projectId: unknown) => progressInspirationService.audit(String(projectId)),
  }, 'novelOutlineProgress', 'novelOutlineProgress'));
  // I69 导入导出与备份 UI（design §14.10「导入、导出与备份」/ R14-4）：受控
  // import/export Remote —— I39 可移植档案/纯文本导出下载、round-trip 备份恢复
  // （N-7 非空作品 fail closed + 空壳事务写盘）与 I37 确定性导入预览。复用
  // `core/export` 与 `import` 既有 owner；Client 只接收下载载荷/命令，不持有路径。
  const importExportService = createImportExportService(projectsRoot);
  ctx.provide('novelImportExport', bindRemote({
    exportArchive: (projectId: unknown, mode: unknown) => importExportService.exportArchive(String(projectId), mode as Parameters<typeof importExportService.exportArchive>[1]),
    exportText: (projectId: unknown, format: unknown) => importExportService.exportText(String(projectId), format as Parameters<typeof importExportService.exportText>[1]),
    restore: (projectId: unknown, raw: unknown) => importExportService.restore(String(projectId), String(raw)),
    importPreview: (projectId: unknown, input: unknown) => importExportService.importPreview(String(projectId), input as Parameters<typeof importExportService.importPreview>[1]),
  }, 'novelImportExport', 'novelImportExport'));
  // I70 C5 正文版本与分支（design §14.10「正文版本与分支」/ R14-5）：Host-owned
  // 分支/版本模型 —— 候选可保留为分支、比较并选择唯一 chosen。复用 TextRepository
  // （C5 唯一存储 owner；legacy 单版本文档兼容迁移 + fail closed 在 open 内完成）；
  // choose 只写 C5，结构化同步仍必须显式 reparse/Gate。Client 分支面板只提交受控
  // 命令，不持有版本真相。
  const branchService = createBranchService(projectsRoot);
  ctx.provide('novelBranches', bindRemote({
    list: (projectId: unknown, chapterId: unknown, sceneId: unknown) => branchService.listBranches(String(projectId), String(chapterId), String(sceneId)),
    read: (projectId: unknown, chapterId: unknown, sceneId: unknown, branchId: unknown) => branchService.readBranch(String(projectId), String(chapterId), String(sceneId), String(branchId)),
    save: (projectId: unknown, chapterId: unknown, sceneId: unknown, label: unknown) => branchService.saveBranch(String(projectId), String(chapterId), String(sceneId), String(label)),
    choose: (projectId: unknown, chapterId: unknown, sceneId: unknown, branchId: unknown) => branchService.chooseBranch(String(projectId), String(chapterId), String(sceneId), String(branchId)),
    diff: (projectId: unknown, chapterId: unknown, sceneId: unknown, fromBranchId: unknown, toBranchId?: unknown) => branchService.diffBranches(String(projectId), String(chapterId), String(sceneId), String(fromBranchId), toBranchId === undefined ? undefined : String(toBranchId)),
  }, 'novelBranches', 'novelBranches'));
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
  ctx.provide('novelSearch', bindRemote({
    build: (projectId: unknown) => searchService.build(String(projectId)),
    drop: (projectId: unknown) => searchService.drop(String(projectId)),
    stats: (projectId: unknown) => searchService.stats(String(projectId)),
    search: (projectId: unknown, query: unknown, pov?: unknown) => searchService.search(String(projectId), String(query), pov === undefined || pov === null ? undefined : String(pov)),
    references: (projectId: unknown, key: unknown, pov?: unknown) => searchService.references(String(projectId), String(key), pov === undefined || pov === null ? undefined : String(pov)),
  }, 'novelSearch', 'novelSearch'));
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
  ctx.provide('novelStatistics', bindRemote({
    rebuild: (projectId: unknown) => statisticsService.build(String(projectId)),
    drop: (projectId: unknown) => statisticsService.drop(String(projectId)),
    stats: (projectId: unknown) => statisticsService.stats(String(projectId)),
    overview: (projectId: unknown) => statisticsService.overview(String(projectId)),
    chapterDetail: (projectId: unknown, chapterId: unknown) => statisticsService.chapterDetail(String(projectId), String(chapterId)),
    sceneCards: (projectId: unknown, actId?: unknown, beatId?: unknown, status?: unknown, limit?: unknown) => statisticsService.sceneCards(String(projectId), {
      ...(actId !== undefined && actId !== null ? { actId: String(actId) } : {}),
      ...(beatId !== undefined && beatId !== null ? { beatId: String(beatId) } : {}),
      ...(status !== undefined && status !== null ? { status: String(status) as 'planned' | 'writing' | 'done' } : {}),
      ...(limit !== undefined && limit !== null ? { limit: Number(limit) } : {}),
    }),
    tasks: (projectId: unknown, status?: unknown, limit?: unknown) => statisticsService.tasks(String(projectId), {
      ...(status !== undefined && status !== null ? { status: String(status) as 'queued' | 'running' | 'candidate-ready' | 'failed' | 'cancelled' | 'completed' } : {}),
      ...(limit !== undefined && limit !== null ? { limit: Number(limit) } : {}),
    }),
  }, 'novelStatistics', 'novelStatistics'));
  const workspaceService = createWorkspaceEditorService(
    characterService, worldviewService, outlineService, relationshipService,
    stateService, canonService, confirmationService, projectService, uploadService, textService, textEditService,
  );
  // The DSH gateway dispatches strict descriptors only to services carrying the
  // `typertRemote` binding; attach it before providing (design §0.1.2).
  ctx.provide(NOVEL_WORKSPACE_NAMESPACE, bindRemote(workspaceService, NOVEL_WORKSPACE_NAMESPACE, NOVEL_WORKSPACE_NAMESPACE));
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
    resolveSettings: async () => resolveA2GenerationConfig(await settingsIndex.load()).settings,
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
