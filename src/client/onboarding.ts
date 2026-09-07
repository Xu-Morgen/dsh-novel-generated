/** Historical compatibility barrel. Production controllers import the pure actions module. */
export { ANALYSIS_POLL_INTERVAL_MS, beginAnalysis, analysisResult, adjudicateOne, applyAccepted } from './onboarding-actions.js';

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
