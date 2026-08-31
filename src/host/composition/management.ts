import { createOnboardingAnalyzerService } from '../onboarding-analyzer-service.js';
import { createOnboardingAdjudicationService, type OnboardingLayerSource } from '../onboarding-adjudication-service.js';
import { createTimelineService } from '../timeline-service.js';
import { createNextSceneContextBuilder } from '../writing-context.js';
import { createTextEditService as createControlledTextEditService } from '../text-edit-service.js';
import { createWritingCandidateService } from '../candidate-service.js';
import { createWritingAdjudicationService, type WritingProposeAtInput, type WritingProposeInput } from '../writing-adjudication-service.js';
import { createReviewService } from '../review-service.js';
import { createQueueService, type QueueStartAtInput, type QueueStartInput } from '../queue-service.js';
import { createTextDeletionService } from '../text-deletion-service.js';
import { createTextDeletionRemote } from '../text-deletion-adapter.js';
import type { OnboardingAdjudicateInput, OnboardingAnalysisStartInput, OnboardingFinalApplyInput } from '../../core/schema/onboarding.js';
import type { Timeline } from '../../core/timeline/schema.js';
import type { ReviewAdjudicateInputShape } from '../remote/review.js';
import { defineRemote } from '../remote/shared.js';
import { onboardingAnalyzerInvocations } from '../remote/onboarding-analyzer.js';
import { timelineInvocations } from '../remote/timeline.js';
import { onboardingInvocations } from '../remote/onboarding.js';
import { writingInvocations } from '../remote/writing.js';
import { reviewInvocations } from '../remote/review.js';
import { queueInvocations } from '../remote/queue.js';
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
    ruleService,
    styleService,
    knowledgeService,
    llm,
    workbenchSettingsService,
    consistencyDetectionService,
    knowledgeLeakDetectionService,
    relationshipStyleDetectionService,
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
    resolveSettings: resolveGenerationSettings,
    onDispose: onFiberDispose,
  });
  // Domain owner remains `novelWritingAdjudication`; the strict gateway receiver
  // must use descriptor.service `novelWriting` or the real Typert gateway cannot
  // resolve either legacy methods or I105 proposeAt. Both keys delegate to the
  // same owner; no second candidate/adjudication state is created.
  ctx.provide('novelWritingAdjudication', writingAdjudicationService);
  ctx.provide('novelWriting', defineRemote('novelWriting', 'novelWriting', writingAdjudicationService, [
    { method: 'propose', call: (projectId: string, input: WritingProposeInput, settings?: unknown) => writingAdjudicationService.propose(projectId, input, settings) },
    { method: 'preview', call: (candidateId: string) => writingAdjudicationService.preview(candidateId) },
    { method: 'adjudicate', call: (candidateId: string, decision: 'accept' | 'reject' | 'rewrite', settings?: unknown) => writingAdjudicationService.adjudicate(candidateId, decision, settings) },
    { method: 'proposeAt', call: (projectId: string, input: WritingProposeAtInput, settings?: unknown) => writingAdjudicationService.proposeAt(projectId, input, settings) },
  ], writingInvocations));
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
    // I77：wire 契约与领域服务返回语义一致 —— records() 返回裸数组，descriptor
    // result schema 即 z.array(...)（host/remote/review.ts），组合根不再整形
    // envelope；契约漂移不再被接线层掩盖，网关 strict codec 在边界直接暴露
    // （架构审查 §8#1）。
    { method: 'records', call: (projectId: string) => reviewService.records(projectId) },
  ], reviewInvocations));
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
  return {
    timelineService,
    controlledTextEditService,
    writingAdjudicationService,
    nextSceneContext,
    queueService,
    textDeletionService,
  };
}
