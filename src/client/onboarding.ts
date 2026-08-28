import { unwrap } from './shared.js';
import type {
  OnboardingAdjudicationExtra,
  OnboardingAdjudicationRecord,
  OnboardingApplyResultShape,
  OnboardingAnalyzerNamespace,
  OnboardingDecision,
  OnboardingLayerId,
  OnboardingNamespace,
  OnboardingState,
} from './onboarding-types.js';

/**
 * I53 六层候选审阅与逐层裁决 Client 模块组合根（design §14.7.4 / R11-4）。
 *
 * I95 拆分（计划 §18 I95）：类型/常量（onboarding-types.ts）、面板渲染
 * （onboarding-panels.ts）、Host 交互（本文件：begin/result/adjudicate/finalApply
 * 调用与轮询间隔）三片；外部符号经本文件兼容重导出。
 *
 * Client 只把四种裁决（直接接受 / 修改后接受 / 打回重生成 / 显式跳过）与最终
 * apply 指令送往 Host `novelOnboarding` Remote；Client 不拥有领域校验、不直接
 * 写文件、不解析候选语义（H0-5 / N-3）。裁决结果与 partial-retryable apply 结果
 * 都由 Host 逐层返回并在此展示。
 */

/** 触发 Host session-first `begin`，返回会话 id（I57/R12-4）。 */
export async function beginAnalysis(namespace: OnboardingAnalyzerNamespace, state: { projectId: string; sourceHash: string; text: string }): Promise<string> {
  // I91：派生 namespace 已携带 result 类型，unwrap 直接得到 begin 结果，无需强转。
  const begun = await unwrap(namespace.begin({ projectId: state.projectId, sourceHash: state.sourceHash, text: state.text }, undefined));
  if (!begun?.onboardingSessionId) throw new Error('分析未返回会话 id');
  return begun.onboardingSessionId;
}

/** 读取已完成的候选包（I57：`status` 报告 succeeded 后调用）。 */
export async function analysisResult(namespace: OnboardingAnalyzerNamespace, onboardingSessionId: string): Promise<unknown> {
  return unwrap(namespace.result(onboardingSessionId));
}

/** I57 轮询间隔：分析状态查询节流（毫秒）。 */
export const ANALYSIS_POLL_INTERVAL_MS = 800;

/** 裁决一条层（I53 契约）：`edit` 必须携带真实 editedValue，`regenerate` 携带反馈。 */
export async function adjudicateOne(
  namespace: OnboardingNamespace,
  state: OnboardingState,
  layer: OnboardingLayerId,
  decision: OnboardingDecision,
  extra?: OnboardingAdjudicationExtra,
): Promise<OnboardingAdjudicationRecord> {
  // I91：wire 入参形状随 descriptor 派生（editedValue 的 z.json 输出类型随契约流动）。
  const input: Parameters<OnboardingNamespace['adjudicate']>[0] = {
    projectId: state.projectId,
    onboardingSessionId: state.onboardingSessionId,
    sourceHash: state.sourceHash,
    layer,
    decision,
  };
  if (decision === 'edit') {
    if (extra?.editedValue === undefined) throw new Error('「修改后接受」必须提供编辑后的候选值');
    input.editedValue = extra.editedValue;
  }
  if (decision === 'regenerate' && extra?.feedback !== undefined) {
    const feedback = extra.feedback.trim();
    if (feedback.length > 0) input.feedback = feedback;
  }
  // I91：派生 namespace 已携带 result 类型（ConfirmationRecord ⊇ 本模块
  // OnboardingAdjudicationRecord 结构），unwrap 直接得到记录，无需强转。
  return unwrap(namespace.adjudicate(input, undefined));
}

/** 触发 Host final apply 并解析为结构化结果。 */
export async function applyAccepted(namespace: OnboardingNamespace, state: OnboardingState): Promise<OnboardingApplyResultShape> {
  // I91：派生 namespace 已携带 result 类型（与 OnboardingApplyResultShape 同构），
  // unwrap 直接得到结构化结果，无需强转。
  return unwrap(namespace.finalApply({ projectId: state.projectId, onboardingSessionId: state.onboardingSessionId, sourceHash: state.sourceHash }));
}

// I95 兼容重导出（拆分后外部符号入口不变）。
export { analysisPanel, onboardingReview } from './onboarding-panels.js';
export {
  ONBOARDING_LAYERS,
  type OnboardingAdjudicationExtra,
  type OnboardingAdjudicationRecord,
  type OnboardingAnalysisState,
  type OnboardingAnalysisStatus,
  type OnboardingAnalyzerNamespace,
  type OnboardingApplyResultShape,
  type OnboardingDecision,
  type OnboardingLayerId,
  type OnboardingNamespace,
  type OnboardingState,
} from './onboarding-types.js';
export { onboardingRemoteContribution, onboardingAnalyzerRemoteContribution } from '../remote.js';
