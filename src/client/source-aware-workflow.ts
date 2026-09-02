import type {
  ImportSourceRole,
  ImportTreatment,
} from '../core/schema/import-interpretation.js';
import type { NarrativeImportPlanStatus } from '../core/schema/narrative-import-plan.js';
import type { ImportInterpretationReviewState } from './import-interpretation-review.js';
import type { WorkflowStageId } from './workflow.js';

/**
 * I149 来源感知路由的最小输入面（设计 §14.15.4 / R19-5b）。
 *
 * 该投影只回答“作者下一步应回到哪一个既有 workflow 阶段”，不复制
 * NarrativeImportPlan，也不把 B/C 层候选变成 Client 真相。Plan 状态由 Host
 * 返回；来源审阅仍由 I144 controller 持有。这样 source-aware route 可以在
 * workflow 壳中消费，而不会创建第二个导入入口或新的领域状态机。
 */
export interface SourceAwareWorkflowInput {
  readonly review?: Pick<
    ImportInterpretationReviewState,
    'analysisStatus' | 'selectedSourceRole' | 'treatment' | 'paragraphs' | 'confirmed'
  >;
  /** I148 plan 的 Host 状态；没有 plan 时表示尚未生成/装载计划。 */
  readonly planStatus?: NarrativeImportPlanStatus;
}

export type SourceAwareWorkflowRoute =
  | 'awaiting-source-confirmation'
  | 'ordinary-outline'
  | 'narrative-adaptation'
  | 'existing-prose-outline'
  | 'blocked';

export interface SourceAwareWorkflowProjection {
  readonly route: SourceAwareWorkflowRoute;
  readonly sourceRole?: ImportSourceRole;
  readonly treatment?: ImportTreatment;
  /** 来源尚未确认或混合段未决时，唯一合法落点是既有导入步骤。 */
  readonly targetStage: WorkflowStageId;
  /** 当前 source-aware gate 允许作者进入的下一既有阶段。 */
  readonly nextStage: WorkflowStageId;
  readonly canEnterOutline: boolean;
  readonly canProceedToDetail: boolean;
  readonly requiresNarrativePlan: boolean;
  /** Stage 19 明确不提供已有正文保真导入能力。 */
  readonly fidelityImportAvailable: false;
  readonly unresolvedParagraphIds: readonly string[];
  readonly planStatus?: NarrativeImportPlanStatus;
  readonly message: string;
}

function unresolvedParagraphIds(review: SourceAwareWorkflowInput['review']): string[] {
  return review?.paragraphs
    .filter((paragraph) => paragraph.decision === 'pending')
    .map((paragraph) => paragraph.paragraphId) ?? [];
}

function blockedPlanMessage(status: NarrativeImportPlanStatus | undefined): string {
  if (status === 'stale') return '叙事计划已过期，请回到步骤 2 重新生成。';
  if (status === 'partial-failure' || status === 'pending-recovery') return '叙事计划尚未完成，请先恢复同一计划。';
  if (status === 'rejected') return '叙事计划已被拒绝，请回到步骤 2 重新审阅。';
  return '幕后素材已确认，请在步骤 2 审阅读者体验与揭示计划。';
}

/**
 * 将来源确认结果投影到 I140 已有的 import → outline → detail 路由。
 * 不调用 Remote、不写文件；所有候选应用仍由 I148 Host coordinator + I11
 * 负责。尤其是 `existing-prose` 永远只会得到拆纲路径，不能伪装成正文导入。
 */
export function projectSourceAwareWorkflow(input: SourceAwareWorkflowInput): SourceAwareWorkflowProjection {
  const review = input.review;
  const unresolved = unresolvedParagraphIds(review);
  const base = {
    sourceRole: review?.selectedSourceRole,
    treatment: review?.treatment,
    fidelityImportAvailable: false as const,
    unresolvedParagraphIds: unresolved,
    planStatus: input.planStatus,
  };

  if (review === undefined || review.confirmed === false || unresolved.length > 0 || review.selectedSourceRole === undefined || review.treatment === undefined) {
    return {
      ...base,
      route: 'awaiting-source-confirmation',
      targetStage: 'import',
      nextStage: 'import',
      canEnterOutline: false,
      canProceedToDetail: false,
      requiresNarrativePlan: false,
      message: unresolved.length > 0 ? '混合来源仍有段落待裁决，确认前不会写入任何叙事层。' : '请在步骤 1 确认来源角色、处理目标与适用叙事意图。',
    };
  }

  const common = {
    ...base,
    targetStage: 'outline' as const,
    canEnterOutline: true,
  };

  if (review.selectedSourceRole === 'existing-prose') {
    if (review.treatment !== 'expand-outline') {
      return {
        ...common,
        route: 'blocked',
        nextStage: 'outline',
        canProceedToDetail: false,
        requiresNarrativePlan: false,
        message: '已有正文在当前阶段只能进入拆纲；正文保真导入尚未开放。',
      };
    }
    return {
      ...common,
      route: 'existing-prose-outline',
      nextStage: 'detail',
      canProceedToDetail: true,
      requiresNarrativePlan: false,
      message: '已有正文已确认，将进入既有拆纲流程；原文不会直接写入正文。',
    };
  }

  if (review.treatment === 'adapt-pov') {
    if (review.selectedSourceRole !== 'idea' && review.selectedSourceRole !== 'background-material' && review.selectedSourceRole !== 'hybrid') {
      return {
        ...common,
        route: 'blocked',
        nextStage: 'outline',
        canProceedToDetail: false,
        requiresNarrativePlan: true,
        message: '按视角重构目前只适用于创作想法、背景素材或混合来源，请改选扩展为大纲。',
      };
    }
    const applied = input.planStatus === 'applied';
    return {
      ...common,
      route: 'narrative-adaptation',
      nextStage: applied ? 'detail' : 'outline',
      canProceedToDetail: applied,
      requiresNarrativePlan: true,
      message: applied ? '读者体验大纲与揭示计划已确认，将汇入既有细纲步骤。' : blockedPlanMessage(input.planStatus),
    };
  }

  return {
    ...common,
    route: 'ordinary-outline',
    nextStage: 'detail',
    canProceedToDetail: true,
    requiresNarrativePlan: false,
    message: '来源已确认，将进入既有大纲与细纲流程。',
  };
}

/**
 * workflow 面板的唯一路由动作。它只发出既有阶段 ID；调用方仍通过已有
 * `openWorkflowStage` 写入 Client 恢复投影，不在此处增加 route 或副作用。
 */
export function routeSourceAwareWorkflow(
  input: SourceAwareWorkflowInput,
  openStage: (stage: WorkflowStageId) => void,
): SourceAwareWorkflowProjection {
  const projection = projectSourceAwareWorkflow(input);
  openStage(projection.nextStage);
  return projection;
}
