import type { NamespaceOf } from './remote-namespace.js';
import { onboardingRemoteContribution, onboardingAnalyzerRemoteContribution } from '../remote.js';

/**
 * I53 六层候选审阅与逐层裁决 Client 类型（design §14.7.4 / R11-4，计划 §18
 * I95 拆分：onboarding 的 types 片）。Client 只把四种裁决与最终 apply 指令送往
 * Host `novelOnboarding` Remote；Client 不拥有领域校验、不直接写文件、不解析
 * 候选语义（H0-5 / N-3）。
 */

export type OnboardingDecision = 'accept' | 'edit' | 'regenerate' | 'skip';
export type OnboardingLayerId = 'characters' | 'worldview' | 'outline' | 'relationship' | 'state' | 'canon';

export interface OnboardingAdjudicationRecord {
  id: string;
  status: 'pending' | 'accepted' | 'rejected';
}
export interface OnboardingApplyResultShape {
  projectId: string;
  onboardingSessionId: string;
  appliedLayers: OnboardingLayerId[];
  skippedLayers: OnboardingLayerId[];
  blockedLayers: OnboardingLayerId[];
  pendingLayers: OnboardingLayerId[];
  retryable: boolean;
  errors: string[];
}

/**
 * I91：namespace 类型从 host contribution 派生（见 remote-namespace.ts）——
 * 参数/返回类型随 descriptor 流动，方法签名变更在 Client 消费处即报编译错
 * （review v2.0 §3.1 / 计划 §18 I91）。
 */
export type OnboardingNamespace = NamespaceOf<typeof onboardingRemoteContribution>;

/** Mounted `remote.novelOnboardingAnalyzer` namespace surface (I57 session-first)。 */
export type OnboardingAnalyzerNamespace = NamespaceOf<typeof onboardingAnalyzerRemoteContribution>;

export const ONBOARDING_LAYERS: readonly { id: OnboardingLayerId; label: string }[] = [
  { id: 'characters', label: '角色（B3）' },
  { id: 'worldview', label: '世界观（B2）' },
  { id: 'outline', label: '大纲（B5）' },
  { id: 'relationship', label: '关系（C1）' },
  { id: 'state', label: '状态（C2）' },
  { id: 'canon', label: '正史（C4）' },
];

/** I57 analysis lifecycle: the client mirrors the Host job status while
 * showing busy/progress, and surfaces failure/cancel with a retry entry. */
export type OnboardingAnalysisStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export interface OnboardingAnalysisState {
  status: OnboardingAnalysisStatus;
  /** Session id once the Host `begin` returned it. */
  sessionId?: string;
  /** User-facing failure message (failed) or '分析已取消' (cancelled). */
  error?: string;
  /** 触发本次分析的原文（失败/取消后重试复用，R12-4）。 */
  sourceText?: string;
}

export interface OnboardingState {
  projectId: string;
  onboardingSessionId: string;
  sourceHash: string;
  decisions: Partial<Record<OnboardingLayerId, OnboardingDecision>>;
  /** The six-layer candidate package returned by the analyzer (plain JSON). */
  layers?: unknown;
  applyResult?: OnboardingApplyResultShape;
  error?: string;
  /** I56 逐层裁决草稿：编辑候选的 JSON 文本（经 store 持久化，重渲染不丢）。 */
  editTexts?: Partial<Record<OnboardingLayerId, string>>;
  /** I56 重生成反馈草稿文本。 */
  feedbackTexts?: Partial<Record<OnboardingLayerId, string>>;
  /** I56 当前打开的裁决面板（edit 或 regenerate），同一层同一时刻至多一个。 */
  openPanel?: Partial<Record<OnboardingLayerId, 'edit' | 'regenerate'>>;
  /** I57 分析生命周期（busy/progress/cancel/retry，R12-4）。 */
  analysis?: OnboardingAnalysisState;
  /** I59 apply 进行中（R12-6）：apply/重试按钮忙碌并防重复提交。 */
  applying?: boolean;
}

/** I56 裁决附带载荷：edit 必须携带用户编辑后的整层候选值；regenerate 可带反馈。 */
export interface OnboardingAdjudicationExtra {
  /** I91：类型随 wire adjudicate 入参的 editedValue（z.json 输出 JSONType）派生。 */
  editedValue?: NonNullable<Parameters<OnboardingNamespace['adjudicate']>[0]['editedValue']>;
  feedback?: string;
}
