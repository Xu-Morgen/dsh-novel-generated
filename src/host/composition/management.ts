import { createOnboardingAnalyzerService } from '../onboarding-analyzer-service.js';
import { createOnboardingAdjudicationService, type OnboardingLayerSource } from '../onboarding-adjudication-service.js';
import { createTimelineService } from '../timeline-service.js';
import { createNextSceneContextBuilder } from '../writing-context.js';
import { createTextEditService as createControlledTextEditService } from '../text-edit-service.js';
import { createWritingCandidateService } from '../candidate-service.js';
import { createWritingAdjudicationService, type WritingProposeAtInput, type WritingProposeInput } from '../writing-adjudication-service.js';
import { createReviewService } from '../review-service.js';
import { createReviewRepairWorkflow, type ReviewRepairWorkflow } from '../review-repair-workflow.js';
import { createQueueService, type QueueStartAtInput, type QueueStartInput } from '../queue-service.js';
import { createTextDeletionService } from '../text-deletion-service.js';
import { createTextDeletionRemote } from '../text-deletion-adapter.js';
import { createTextChangeImpactService } from '../text-change-impact-service.js';
import { createOutlineReconciliationPlannerService } from '../outline-reconciliation-planner-service.js';
import { createOutlineReconciliationService } from '../outline-reconciliation-service.js';
import { createReferenceAuditService } from '../reference-audit-service.js';
import { createReferenceCorrectionService } from '../reference-correction-service.js';
import { createLongDraftWorkflowCoordinator } from '../long-draft-workflow-coordinator.js';
import { createOutlineDetailGenerationService } from '../outline-detail-generation-service.js';
import { createOutlineDetailGenerationRemote } from '../outline-detail-generation-adapter.js';
import { createFinalizationPlanBuilder } from '../finalization-plan-builder.js';
import { createFinalizationCoordinator } from '../finalization-coordinator.js';
import { createBookCompletionService } from '../book-completion-service.js';
import { createImportInterpretationSessionService } from '../import-interpretation-session-service.js';
import { createImportInterpretationAnalysisService } from '../import-interpretation-analysis-service.js';
import { createNarrativeAdaptationService } from '../narrative-adaptation-service.js';
import { createNarrativeRevealPlanner } from '../narrative-reveal-planner-service.js';
import { createNarrativeImportPlanCoordinator } from '../narrative-import-plan-coordinator.js';
import { createRuleStyleImportInitializationService } from '../rule-style-import-initialization-service.js';
import type { OnboardingAdjudicateInput, OnboardingAnalysisStartInput, OnboardingFinalApplyInput } from '../../core/schema/onboarding.js';
import type {
  ImportInterpretationSessionConfirmInput,
  ImportInterpretationSessionCreateInput,
  ImportInterpretationSessionDiscardInput,
  ImportInterpretationSessionReadInput,
} from '../../core/schema/import-interpretation-session.js';
import type {
  ImportInterpretationAnalysisIdentity,
  ImportInterpretationInput,
} from '../../core/schema/import-interpretation-analysis.js';
import type { NarrativeAdaptationIdentity, NarrativeAdaptationInput } from '../../core/schema/narrative-adaptation.js';
import type { NarrativeRevealIdentity, NarrativeRevealInput } from '../../core/schema/narrative-reveal.js';
import type { NarrativeImportPlanIdentity, NarrativeImportPlanInput } from '../../core/schema/narrative-import-plan.js';
import type { RuleStyleImportDecisionInput, RuleStyleImportIdentity, RuleStyleImportProposeInput } from '../../core/schema/rule-style-import-initialization.js';
import type { Timeline } from '../../core/timeline/schema.js';
import type { ReviewAdjudicateInputShape } from '../remote/review.js';
import type { ReviewRepairInput } from '../../core/schema/review-repair.js';
import type { BookReadinessPageInput } from '../../core/schema/book-readiness.js';
import { defineRemote } from '../remote/shared.js';
import { onboardingAnalyzerInvocations } from '../remote/onboarding-analyzer.js';
import { importInterpretationInvocations } from '../remote/import-interpretation.js';
import { importInterpretationAnalysisInvocations } from '../remote/import-interpretation-analysis.js';
import { narrativeAdaptationInvocations } from '../remote/narrative-adaptation.js';
import { narrativeRevealInvocations } from '../remote/narrative-reveal.js';
import { narrativeImportPlanInvocations } from '../remote/narrative-import-plan.js';
import { ruleStyleImportInitializationInvocations } from '../remote/rule-style-import-initialization.js';
import { timelineInvocations } from '../remote/timeline.js';
import { onboardingInvocations } from '../remote/onboarding.js';
import { writingInvocations } from '../remote/writing.js';
import { reviewInvocations } from '../remote/review.js';
import { reviewRepairInvocations } from '../remote/review-repair.js';
import { queueInvocations } from '../remote/queue.js';
import { textChangeImpactInvocations } from '../remote/text-change-impact.js';
import { outlineReconciliationInvocations } from '../remote/outline-reconciliation.js';
import { referenceAuditInvocations } from '../remote/reference-audit.js';
import { referenceCorrectionInvocations } from '../remote/reference-correction.js';
import { longDraftInvocations } from '../remote/long-draft.js';
import { resolveGenerationSettings as validateGenerationSettings, type GenerationSettings } from '../../llm/port/index.js';
import type { BaseServices, CompositionBase, ManagementServices } from './types.js';

/**
 * I89 组合根分段（二）：管理面（review v2.0 §3.4 / 计划 §18 I89）。
 *
 * 装配 onboarding analyzer/adjudication、方案 A 时间线、C5 受控编辑、写作候选与
 * 裁决、一致性审校与生成队列，并注册其 Remote。
 *
 * 跨域副作用（I89 修复）：onboarding finalApply 成功后自建时间线骨架不再是
 * `.catch(() => undefined)` 静默吞错 —— 显式 `ensureTimelineAfterOnboarding`
 * 钩子记录失败（时间线是可重建派生视图，失败不阻断 onboarding 结果）。
 */
export function assembleManagementSurface(base: CompositionBase, baseServices: BaseServices): ManagementServices {
  const { ctx, projectsRoot, onFiberDispose } = base;
  const {
    logger,
    resolveGenerationSettings,
    resolveAnalyzerSettings,
    characterService,
    worldviewService,
    outlineService,
    relationshipService,
    stateService,
    canonService,
    confirmationService,
    textService,
    sceneOutlineBindingService,
    outlineGenerationBaselineService,
    outlineGenerationScopeService,
    ruleService,
    styleService,
    knowledgeService,
    llm,
    workbenchSettingsService,
    consistencyDetectionService,
    knowledgeLeakDetectionService,
    relationshipStyleDetectionService,
    projectService,
  } = baseServices;
  const analyzerService = createOnboardingAnalyzerService(llm, onFiberDispose, (error, onboardingSessionId) => {
    logger.error('Background onboarding analysis %s failed: %o', onboardingSessionId, error);
  });
  // The analyzer is frozen by its constructor. The small mutable Remote carrier
  // delegates to that single owner under the same canonical service key. I57:
  // `begin` resolves settings once, then hands the resolved settings to the
  // background job so the client can poll `status`/`cancel` without a second
  // resolution path.
  // I91：defineRemote 第 5 参传 descriptor（仅类型面）—— call 闭包与 descriptor
  // 派生形状逐位对齐，方法签名变更在接线层即报编译错（review v2.0 §3.1）。
  ctx.provide('novelOnboardingAnalyzer', defineRemote('novelOnboardingAnalyzer', 'novelOnboardingAnalyzer', analyzerService, [
    { method: 'begin', call: async (input: OnboardingAnalysisStartInput, settings?: unknown) => analyzerService.begin(input, await resolveAnalyzerSettings(settings)) },
    { method: 'start', call: async (input: OnboardingAnalysisStartInput, settings?: unknown) => analyzerService.start(input, await resolveAnalyzerSettings(settings)) },
    { method: 'status', call: (onboardingSessionId: string) => analyzerService.status(onboardingSessionId) },
    { method: 'cancel', call: async (onboardingSessionId: string) => {
      await analyzerService.cancel(onboardingSessionId);
      return undefined;
    } },
    { method: 'result', call: (onboardingSessionId: string) => analyzerService.result(onboardingSessionId) },
  ], onboardingAnalyzerInvocations));
  // I142：来源解释只保存 operational checkpoint；它不分类来源、不写层，也不
  // 复用 onboarding 的 session，避免把新语义悄悄放进旧 Remote lock。
  const importInterpretationService = createImportInterpretationSessionService(projectsRoot, onFiberDispose);
  ctx.provide('novelImportInterpretation', defineRemote('novelImportInterpretation', 'novelImportInterpretation', importInterpretationService, [
    { method: 'create', call: (input: ImportInterpretationSessionCreateInput) => importInterpretationService.create(input) },
    { method: 'read', call: (input: ImportInterpretationSessionReadInput) => importInterpretationService.read(input) },
    { method: 'confirm', call: (input: ImportInterpretationSessionConfirmInput) => importInterpretationService.confirm(input) },
    { method: 'discard', call: (input: ImportInterpretationSessionDiscardInput) => importInterpretationService.discard(input) },
  ], importInterpretationInvocations));
  // I143：分类器只生成来源解释 evidence，所有 paragraph range 仍由 Host 输入
  // 绑定；分类完成前不进入任何 B/C 层，也不替作者确认 treatment/POV。
  const importInterpretationAnalysisService = createImportInterpretationAnalysisService(llm, onFiberDispose, (error, importSessionId) => {
    logger.error('Background import interpretation analysis %s failed: %o', importSessionId, error);
  });
  ctx.provide('novelImportInterpretationAnalysis', defineRemote('novelImportInterpretationAnalysis', 'novelImportInterpretationAnalysis', importInterpretationAnalysisService, [
    { method: 'begin', call: async (input: ImportInterpretationInput, settings?: unknown) => importInterpretationAnalysisService.begin(input, validateGenerationSettings(await resolveAnalyzerSettings(settings))) },
    { method: 'status', call: (input: ImportInterpretationAnalysisIdentity) => importInterpretationAnalysisService.status(input) },
    { method: 'cancel', call: (input: ImportInterpretationAnalysisIdentity) => importInterpretationAnalysisService.cancel(input) },
    { method: 'result', call: (input: ImportInterpretationAnalysisIdentity) => importInterpretationAnalysisService.result(input) },
  ], importInterpretationAnalysisInvocations));
  // I151：只有已确认的首个受控导入 session 能建立 one-shot checkpoint；
  // app/open/空文件路径没有调用本服务的接线，B1/B4 写回仍归既有 owner。
  const ruleStyleImportInitialization = createRuleStyleImportInitializationService(llm, projectsRoot, {
    sessions: importInterpretationService,
    analysis: importInterpretationAnalysisService,
    confirmation: confirmationService,
    rules: ruleService,
    style: styleService,
    async isProjectEmpty(projectId) {
      const readKnowledge = async () => {
        // Project lifecycle readiness opens the original six onboarding layers,
        // but C3 is owned outside that projection. I151 explicitly inspects C3,
        // so this consumer must open its owner before the first-import emptiness
        // check instead of relying on an unrelated Knowledge UI having run first.
        await knowledgeService.open(projectId);
        try { return await knowledgeService.read(projectId); }
        catch (error) { if ((error as Error).cause && ((error as Error).cause as NodeJS.ErrnoException).code === 'ENOENT') return { entries: [], states: [] }; throw error; }
      };
      const [characters, worldview, relationships, outline, canon, knowledge] = await Promise.all([
        characterService.list(projectId), worldviewService.list(projectId), relationshipService.read(projectId),
        outlineService.readiness(projectId), Promise.resolve(canonService.query(projectId)), readKnowledge(),
      ]);
      return characters.length === 0 && worldview.length === 0 && relationships.length === 0 && outline === 'uninitialized' && canon.length === 0 && knowledge.entries.length === 0;
    },
  }, onFiberDispose, (error, importSessionId) => logger.error('Background rule/style import initialization %s failed: %o', importSessionId, error));
  ctx.provide('novelRuleStyleImportInitialization', defineRemote('novelRuleStyleImportInitialization', 'novelRuleStyleImportInitialization', ruleStyleImportInitialization, [
    { method: 'begin', call: async (input: RuleStyleImportIdentity, settings?: unknown) => ruleStyleImportInitialization.begin(input, validateGenerationSettings(await resolveAnalyzerSettings(settings))) },
    { method: 'status', call: (input: RuleStyleImportIdentity) => ruleStyleImportInitialization.status(input) },
    { method: 'result', call: (input: RuleStyleImportIdentity) => ruleStyleImportInitialization.result(input) },
    { method: 'propose', call: (input: RuleStyleImportProposeInput) => ruleStyleImportInitialization.propose(input) },
    { method: 'accept', call: (input: RuleStyleImportDecisionInput) => ruleStyleImportInitialization.accept(input) },
    { method: 'reject', call: (input: RuleStyleImportDecisionInput) => ruleStyleImportInitialization.reject(input) },
    { method: 'cancel', call: (input: RuleStyleImportIdentity) => ruleStyleImportInitialization.cancel(input) },
  ], ruleStyleImportInitializationInvocations));
  // I145：只把作者已确认的背景/混合证据与 POV 意图交给专用 B5 候选服务；
  // 不复用 I119 拆纲 prompt，也不暴露任何 C3/C4/C5 写入方法。
  const narrativeAdaptationService = createNarrativeAdaptationService(llm, onFiberDispose, (error, adaptationId) => {
    logger.error('Background narrative adaptation %s failed: %o', adaptationId, error);
  });
  ctx.provide('novelNarrativeAdaptation', defineRemote('novelNarrativeAdaptation', 'novelNarrativeAdaptation', narrativeAdaptationService, [
    { method: 'begin', call: async (input: NarrativeAdaptationInput, settings?: unknown) => narrativeAdaptationService.begin(input, validateGenerationSettings(await resolveAnalyzerSettings(settings))) },
    { method: 'status', call: (input: NarrativeAdaptationIdentity) => narrativeAdaptationService.status(input) },
    { method: 'cancel', call: (input: NarrativeAdaptationIdentity) => narrativeAdaptationService.cancel(input) },
    { method: 'result', call: (input: NarrativeAdaptationIdentity) => narrativeAdaptationService.result(input) },
  ], narrativeAdaptationInvocations));
  // I146：C3 只生成绑定 I145 B5 anchor 的候选；KnowledgeRepository、C3
  // writeback 与 ConfirmationGate 由 I148 统一应用，当前 planner 不可达。
  const narrativeRevealPlanner = createNarrativeRevealPlanner(llm, onFiberDispose, (error, revealId) => {
    logger.error('Background narrative reveal %s failed: %o', revealId, error);
  });
  ctx.provide('novelNarrativeReveal', defineRemote('novelNarrativeReveal', 'novelNarrativeReveal', narrativeRevealPlanner, [
    { method: 'begin', call: async (input: NarrativeRevealInput, settings?: unknown) => narrativeRevealPlanner.begin(input, validateGenerationSettings(await resolveAnalyzerSettings(settings))) },
    { method: 'status', call: (input: NarrativeRevealIdentity) => narrativeRevealPlanner.status(input) },
    { method: 'cancel', call: (input: NarrativeRevealIdentity) => narrativeRevealPlanner.cancel(input) },
    { method: 'result', call: (input: NarrativeRevealIdentity) => narrativeRevealPlanner.result(input) },
  ], narrativeRevealInvocations));
  // I148：一次预览/一次 I11 确认统一组合 I52 地基与 Stage 19 B5/C3/C4
  // 候选；Coordinator 复用既有六层 owner，checkpoint 记录 committedStages，
  // 不提供 C5 写入口，也不承诺跨 owner 全回滚。
  const narrativeImportPlan = createNarrativeImportPlanCoordinator(projectsRoot, {
    characters: characterService,
    worldview: worldviewService,
    outline: outlineService,
    relationship: relationshipService,
    state: stateService,
    canon: canonService,
    knowledge: knowledgeService,
    confirmation: confirmationService,
  }, onFiberDispose);
  ctx.provide('novelNarrativeImportPlan', defineRemote('novelNarrativeImportPlan', 'novelNarrativeImportPlan', narrativeImportPlan, [
    { method: 'propose', call: (input: NarrativeImportPlanInput) => narrativeImportPlan.propose(input) },
    { method: 'read', call: (input: NarrativeImportPlanIdentity) => narrativeImportPlan.read(input) },
    { method: 'accept', call: (input: NarrativeImportPlanIdentity) => narrativeImportPlan.accept(input) },
    { method: 'reject', call: (input: NarrativeImportPlanIdentity) => narrativeImportPlan.reject(input) },
    { method: 'recover', call: (input: NarrativeImportPlanIdentity) => narrativeImportPlan.recover(input) },
  ], narrativeImportPlanInvocations));
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
  ], timelineInvocations));
  // I89 跨域副作用显式钩子：B5 落地成功后自建时间线骨架。失败仅记录（时间线是
  // 可重建派生视图），绝不静默吞错、绝不阻断 onboarding 结果。
  const ensureTimelineAfterOnboarding = async (projectId: string): Promise<void> => {
    try {
      await timelineService.ensureFromOutline(projectId);
    } catch (cause) {
      logger.warn('Onboarding 落地后自建时间线骨架失败（派生视图可重建，不阻断 onboarding）: %o', cause);
    }
  };
  // The service is immutable; expose the same owner through a mutable Remote carrier.
  ctx.provide('novelOnboarding', defineRemote('novelOnboarding', 'novelOnboarding', adjudicationService, [
    { method: 'adjudicate', call: (input: OnboardingAdjudicateInput, settings?: unknown) => adjudicationService.adjudicate(input, settings) },
    { method: 'acceptedLayers', call: (onboardingSessionId: string) => adjudicationService.acceptedLayers(onboardingSessionId) },
    // B5 落地成功（无 blocked/retryable 且已应用 outline）后自建时间线骨架。
    {
      method: 'finalApply',
      call: async (input: OnboardingFinalApplyInput) => {
        const result = await adjudicationService.finalApply(input);
        if (result.blockedLayers.length === 0 && result.retryable === false && result.appliedLayers.includes('outline')) {
          await ensureTimelineAfterOnboarding(result.projectId);
        }
        return result;
      },
    },
  ], onboardingInvocations));
  // I61 C5 正文编辑与可选 reparse（design §5.12 / §14.9 / R13-2）：I42 编辑服务 +
  // 真实 I25–I29 parser fan-out + 既有 Domain Service writers + I11 Gate。设置解析
  // 惰性执行（accept 时才需要），与 analyzer 共用同一 A2 generation settings owner。
  const controlledTextEditService = createControlledTextEditService({
    llm,
    projectsRoot,
    state: stateService,
    relationship: relationshipService,
    knowledge: knowledgeService,
    canon: canonService,
    worldview: worldviewService,
    confirmation: confirmationService,
    sceneOutlineBinding: sceneOutlineBindingService,
    outlineGenerationBaseline: outlineGenerationBaselineService,
    resolveSettings: resolveGenerationSettings,
    onDispose: onFiberDispose,
  });
  ctx.provide('novelTextEdit', controlledTextEditService);
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
    textFingerprint: (projectId) => textService.projectFingerprint(projectId),
    sceneOutlineBinding: sceneOutlineBindingService,
    outlineGenerationBaseline: outlineGenerationBaselineService,
    timeline: timelineService,
    workbenchSettings: workbenchSettingsService,
  });
  const writingAdjudicationService = createWritingAdjudicationService({
    llm,
    projectsRoot,
    context: nextSceneContext,
    sceneOutlineBinding: sceneOutlineBindingService,
    textMutation: textService,
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
    outlineGenerationBaseline: baseServices.outlineGenerationBaselineService,
    resolveSettings: resolveGenerationSettings,
    onDispose: onFiberDispose,
  });
  // Domain owner remains `novelWritingAdjudication`; the strict gateway receiver
  // must use descriptor.service `novelWriting` or the real Typert gateway cannot
  // resolve either legacy methods or I105 proposeAt. Both keys delegate to the
  // same owner; no second candidate/adjudication state is created.
  ctx.provide('novelWritingAdjudication', writingAdjudicationService);
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
  const bookCompletionService = createBookCompletionService({
    text: textService,
    outline: outlineService,
    binding: sceneOutlineBindingService,
    confirmation: confirmationService,
    review: reviewService,
    writing: writingAdjudicationService,
  });
  ctx.provide('novelReview', defineRemote('novelReview', 'novelReview', reviewService, [
    { method: 'scan', call: (projectId: string, settings?: unknown) => reviewService.scan(projectId, settings) },
    { method: 'adjudicate', call: (projectId: string, input: ReviewAdjudicateInputShape) => reviewService.adjudicate(projectId, input.decision, input.issueIds) },
    // I77：wire 契约与领域服务返回语义一致 —— records() 返回裸数组，descriptor
    // result schema 即 z.array(...)（host/remote/review.ts），组合根不再整形
    // envelope；契约漂移不再被接线层掩盖，网关 strict codec 在边界直接暴露
    // （架构审查 §8#1）。
    { method: 'records', call: (projectId: string) => reviewService.records(projectId) },
    { method: 'bookReadiness', call: (projectId: string, page?: BookReadinessPageInput) => bookCompletionService.readiness(projectId, page) },
    { method: 'bookScan', call: async (projectId: string, page?: BookReadinessPageInput, settings?: unknown) => bookCompletionService.scan(projectId, page, validateGenerationSettings(await resolveAnalyzerSettings(settings))) },
  ], reviewInvocations));
  // I128 R18-3a：修复只读取最近一次 Host scan 并委托既有 writing owner 生成
  // rewrite candidate；没有 resolved ledger，也没有直接写入 C5 的旁路。
  const reviewRepairService = createReviewRepairWorkflow({
    review: reviewService,
    text: textService,
    writing: writingAdjudicationService,
  });
  ctx.provide('novelReviewRepair', defineRemote('novelReviewRepair', 'novelReviewRepair', reviewRepairService, [
    {
      method: 'propose',
      call: async (projectId: string, input: ReviewRepairInput, settings?: GenerationSettings) =>
        reviewRepairService.propose(projectId, input, validateGenerationSettings(await resolveAnalyzerSettings(settings))),
    },
  ], reviewRepairInvocations));
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
    sceneOutlineBinding: sceneOutlineBindingService,
    resolveSettings: resolveGenerationSettings,
    onDispose: onFiberDispose,
  });
  ctx.provide('novelQueue', defineRemote('novelQueue', 'novelQueue', queueService, [
    { method: 'status', call: (projectId: string) => queueService.status(projectId) },
    { method: 'start', call: (projectId: string, input?: QueueStartInput) => queueService.start(projectId, input) },
    { method: 'startAt', call: (projectId: string, input: QueueStartAtInput) => queueService.startAt(projectId, input) },
    { method: 'pause', call: (projectId: string) => queueService.pause(projectId) },
    { method: 'resume', call: (projectId: string) => queueService.resume(projectId) },
    { method: 'cancel', call: (projectId: string) => queueService.cancel(projectId) },
    { method: 'retry', call: (projectId: string, taskId: string) => queueService.retry(projectId, taskId) },
    { method: 'cancelTask', call: (projectId: string, taskId: string) => queueService.cancelTask(projectId, taskId) },
    { method: 'recover', call: (projectId: string) => queueService.recover(projectId) },
  ], queueInvocations));
  const textDeletionService = createTextDeletionService({
    text: textService,
    binding: sceneOutlineBindingService,
    confirmation: confirmationService,
    queue: queueService,
    writing: writingAdjudicationService,
  });
  ctx.provide('novelTextDeletion', createTextDeletionRemote(textDeletionService));
  const textChangeImpactService = createTextChangeImpactService({
    llm,
    text: textService,
    outline: outlineService,
    binding: sceneOutlineBindingService,
    baseline: outlineGenerationBaselineService,
    onDispose: onFiberDispose,
  });
  ctx.provide('novelTextChangeImpact', defineRemote('novelTextChangeImpact', 'novelTextChangeImpact', textChangeImpactService, [
    { method: 'prepare', call: async (projectId: string, input: Parameters<typeof textChangeImpactService.prepare>[1], settings?: GenerationSettings) => textChangeImpactService.prepare(projectId, input, validateGenerationSettings(await resolveAnalyzerSettings(settings))) },
    { method: 'read', call: (projectId: string, impactId: string) => textChangeImpactService.read(projectId, impactId) },
    { method: 'cancel', call: (projectId: string, impactId: string) => textChangeImpactService.cancel(projectId, impactId) },
  ], textChangeImpactInvocations));
  const outlineReconciliationPlannerService = createOutlineReconciliationPlannerService({
    llm,
    text: textService,
    outline: outlineService,
    binding: sceneOutlineBindingService,
    baseline: outlineGenerationBaselineService,
    onDispose: onFiberDispose,
  });
  const outlineReconciliationService = createOutlineReconciliationService({
    planner: outlineReconciliationPlannerService,
    text: textService,
    outline: outlineService,
    binding: sceneOutlineBindingService,
    baseline: outlineGenerationBaselineService,
    confirmation: confirmationService,
    onDispose: onFiberDispose,
  });
  // I116 exposes only a bounded read projection. The journal remains a Host
  // operational owner and is also available to future reference UoW wiring;
  // no audit record enters any narrative layer or export.
  const referenceAuditService = createReferenceAuditService(projectsRoot, onFiberDispose);
  ctx.provide('novelReferenceAudit', defineRemote('novelReferenceAudit', 'novelReferenceAudit', referenceAuditService, [
    { method: 'list', call: (projectId: string, input?: Parameters<typeof referenceAuditService.list>[1]) => referenceAuditService.list(projectId, input) },
  ], referenceAuditInvocations));
  const referenceCorrectionService = createReferenceCorrectionService({
    llm,
    characters: characterService,
    relationship: relationshipService,
    knowledge: knowledgeService,
    canon: canonService,
    confirmation: confirmationService,
    audit: referenceAuditService,
    onDispose: onFiberDispose,
  });
  ctx.provide('novelReferenceCorrection', defineRemote('novelReferenceCorrection', 'novelReferenceCorrection', referenceCorrectionService, [
    { method: 'propose', call: async (projectId: string, input: Parameters<typeof referenceCorrectionService.propose>[1], settings?: GenerationSettings) => referenceCorrectionService.propose(projectId, input, validateGenerationSettings(await resolveAnalyzerSettings(settings))) },
    { method: 'accept', call: (projectId: string, proposalId: string) => referenceCorrectionService.accept(projectId, proposalId) },
    { method: 'reject', call: (projectId: string, proposalId: string) => referenceCorrectionService.reject(projectId, proposalId) },
    { method: 'pending', call: (projectId: string) => referenceCorrectionService.pending(projectId) },
  ], referenceCorrectionInvocations));
  const longDraftWorkflowCoordinator = createLongDraftWorkflowCoordinator({
    project: projectService,
    characters: characterService,
    worldview: worldviewService,
    outline: outlineService,
    relationship: relationshipService,
    state: stateService,
    canon: canonService,
    text: textService,
    confirmation: confirmationService,
    projectsRoot,
    llm,
    onDispose: onFiberDispose,
  });
  ctx.provide('novelLongDraft', defineRemote('novelLongDraft', 'novelLongDraft', longDraftWorkflowCoordinator, [
    { method: 'preflight', call: (projectId: string) => longDraftWorkflowCoordinator.preflight(projectId) },
    { method: 'begin', call: async (projectId: string, input: Parameters<typeof longDraftWorkflowCoordinator.propose>[1], settings?: GenerationSettings) => longDraftWorkflowCoordinator.begin(projectId, input, validateGenerationSettings(await resolveAnalyzerSettings(settings))) },
    { method: 'status', call: (workflowId: string) => longDraftWorkflowCoordinator.status(workflowId) },
    { method: 'cancel', call: async (workflowId: string) => { await longDraftWorkflowCoordinator.cancel(workflowId); return { workflowId, status: 'cancelled' as const }; } },
    { method: 'result', call: (workflowId: string) => longDraftWorkflowCoordinator.result(workflowId) },
    { method: 'proposeApply', call: (projectId: string, candidate: Parameters<typeof longDraftWorkflowCoordinator.proposeApply>[1]) => longDraftWorkflowCoordinator.proposeApply(projectId, candidate) },
    { method: 'accept', call: (projectId: string, proposalId: string, sourceHash?: string) => longDraftWorkflowCoordinator.accept(projectId, proposalId, sourceHash) },
    { method: 'reject', call: (projectId: string, proposalId: string) => longDraftWorkflowCoordinator.reject(projectId, proposalId) },
    { method: 'recover', call: (projectId: string) => longDraftWorkflowCoordinator.recover(projectId) },
  ], longDraftInvocations));
  // I134：细纲生成只产生范围内候选；Host 保留原卡身份/顺序，唯一写回仍经 I11 Gate。
  const outlineDetailGenerationService = createOutlineDetailGenerationService({
    llm,
    scope: outlineGenerationScopeService,
    outline: outlineService,
    confirmation: confirmationService,
    onDispose: onFiberDispose,
  });
  ctx.provide('novelOutlineDetailGeneration', createOutlineDetailGenerationRemote(outlineDetailGenerationService, async (settings) => validateGenerationSettings(await resolveAnalyzerSettings(settings))));
  // I113 planner + I114 application share one public namespace and one Host
  // owner key; only the five application methods can cross into writers.
  ctx.provide('novelOutlineReconciliation', defineRemote('novelOutlineReconciliation', 'novelOutlineReconciliation', { ...outlineReconciliationPlannerService, ...outlineReconciliationService }, [
    { method: 'prepare', call: async (projectId: string, input: Parameters<typeof outlineReconciliationPlannerService.prepare>[1], settings?: GenerationSettings) => outlineReconciliationPlannerService.prepare(projectId, input, validateGenerationSettings(await resolveAnalyzerSettings(settings))) },
    { method: 'regenerateOne', call: async (projectId: string, input: Parameters<typeof outlineReconciliationPlannerService.regenerateOne>[1], settings?: GenerationSettings) => outlineReconciliationPlannerService.regenerateOne(projectId, input, validateGenerationSettings(await resolveAnalyzerSettings(settings))) },
    { method: 'read', call: (projectId: string, planId: string) => outlineReconciliationPlannerService.read(projectId, planId) },
    { method: 'cancel', call: (projectId: string, planId: string) => outlineReconciliationPlannerService.cancel(projectId, planId) },
    { method: 'propose', call: (projectId: string, input: Parameters<typeof outlineReconciliationService.propose>[1]) => outlineReconciliationService.propose(projectId, input) },
    { method: 'accept', call: (projectId: string, proposalId: string) => outlineReconciliationService.accept(projectId, proposalId) },
    { method: 'reject', call: (projectId: string, proposalId: string) => outlineReconciliationService.reject(projectId, proposalId) },
    { method: 'finalize', call: (projectId: string, input: Parameters<typeof outlineReconciliationService.finalize>[1]) => outlineReconciliationService.finalize(projectId, input) },
    { method: 'continue', call: (projectId: string, input: Parameters<typeof outlineReconciliationService.continue>[1]) => outlineReconciliationService.continue(projectId, input) },
  ], outlineReconciliationInvocations));
  const finalizationPlanBuilder = createFinalizationPlanBuilder({
    writing: {
      adoptedDraft: (candidateId) => writingAdjudicationService.adoptedDraft!(candidateId),
      prepareFinalizationStructuralPreview: (candidateId, text, sourceHash, generationBaseline, settings, signal) => writingAdjudicationService.prepareFinalizationStructuralPreview!(candidateId, text, sourceHash, generationBaseline, settings, signal),
    },
    text: textService,
    outline: outlineService,
    binding: sceneOutlineBindingService,
    baseline: outlineGenerationBaselineService,
    impact: textChangeImpactService,
    reconciliation: outlineReconciliationPlannerService,
    onDispose: onFiberDispose,
  });
  const finalizationCoordinator = createFinalizationCoordinator({
    planBuilder: finalizationPlanBuilder,
    text: textService,
    state: stateService,
    relationship: relationshipService,
    knowledge: knowledgeService,
    canon: canonService,
    worldview: worldviewService,
    outline: outlineService,
    binding: sceneOutlineBindingService,
    baseline: outlineGenerationBaselineService,
    reconciliation: outlineReconciliationService,
    confirmation: confirmationService,
    onDispose: onFiberDispose,
  });
  // I135 keeps legacy candidate.adjudicate intact while making draft adoption
  // and the zero-write finalization summary additive methods on one namespace.
  ctx.provide('novelWriting', defineRemote('novelWriting', 'novelWriting', writingAdjudicationService, [
    { method: 'propose', call: (projectId: string, input: WritingProposeInput, settings?: unknown) => writingAdjudicationService.propose(projectId, input, settings) },
    { method: 'preview', call: (candidateId: string) => writingAdjudicationService.preview(candidateId) },
    { method: 'adjudicate', call: (candidateId: string, decision: 'accept' | 'reject' | 'rewrite', settings?: unknown) => writingAdjudicationService.adjudicate(candidateId, decision, settings) },
    { method: 'proposeAt', call: (projectId: string, input: WritingProposeAtInput, settings?: unknown) => writingAdjudicationService.proposeAt(projectId, input, settings) },
    { method: 'previewLayers', call: (candidateId: string) => writingAdjudicationService.previewLayers(candidateId) },
    { method: 'adoptDraft', call: (candidateId: string) => writingAdjudicationService.adoptDraft!(candidateId) },
    { method: 'prepareFinalizationPlan', call: async (projectId: string, input: Parameters<typeof finalizationPlanBuilder.prepare>[1], settings?: unknown) => finalizationPlanBuilder.prepare(projectId, input, validateGenerationSettings(await resolveAnalyzerSettings(settings))) },
    { method: 'readFinalizationPlan', call: (projectId: string, planId: string) => finalizationPlanBuilder.read(projectId, planId) },
    { method: 'cancelFinalizationPlan', call: (projectId: string, planId: string) => finalizationPlanBuilder.cancel(projectId, planId) },
    { method: 'proposeFinalization', call: (projectId: string, input: Parameters<typeof finalizationCoordinator.propose>[1]) => finalizationCoordinator.propose(projectId, input) },
    { method: 'acceptFinalization', call: (projectId: string, proposalId: string) => finalizationCoordinator.accept(projectId, proposalId) },
    { method: 'rejectFinalization', call: (projectId: string, proposalId: string) => finalizationCoordinator.reject(projectId, proposalId) },
  ], writingInvocations));
  return {
    timelineService,
    controlledTextEditService,
    writingAdjudicationService,
    nextSceneContext,
    queueService,
    textDeletionService,
    textChangeImpactService,
    outlineReconciliationPlannerService,
    outlineReconciliationService,
    referenceAuditService,
    referenceCorrectionService,
    longDraftWorkflowCoordinator,
    outlineDetailGenerationService,
    reviewRepairService,
    bookCompletionService,
    finalizationPlanBuilder,
    finalizationCoordinator,
  };
}
