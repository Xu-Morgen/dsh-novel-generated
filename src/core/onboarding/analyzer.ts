import { createHash } from 'node:crypto';
import type {
  OnboardingAnalysisOutput,
  OnboardingAnalysisResult,
  OnboardingLayers,
  OnboardingLayerKey,
  OnboardingSession,
} from '../schema/onboarding.js';
import { ONBOARDING_LAYER_KEYS, onboardingAnalysisResultSchema } from '../schema/onboarding.js';
import { LAYER_KEY_TO_NAME } from './prompt.js';

/**
 * I52 six-layer initialization analyzer —— **兼容组合面**（design §14.8 / R11-3；
 * 架构审查 §4.1 拆分：校验段在 validate.ts、prompt 构建在 prompt.ts、few-shot
 * 字面量在 example.ts；本文件保留绑定/指纹这类「reduce」职责并 re-export 三切片，
 * 既有消费方（onboarding-analyzer-service、llm/analyze/onboarding 等）的导入面不变）。
 *
 * 本模块的四个机械阶段（输入守卫 → 严格解码 → 跨层校验 → 绑定归约）分布在切片上，
 * 全部 fail-closed，不拥有 LLM 传输与持久化。
 */
export { assertFreeText, assertOnboardingOutput, byteLength, formatContractViolation, FREE_TEXT_MAX_BYTES, parseOnboardingOutput } from './validate.js';
export { buildOnboardingPrompt, buildRegeneratePrompt } from './prompt.js';
export { ONBOARDING_PROMPT_EXAMPLE } from './example.js';

/**
 * Reduce the parsed envelope into a Host-bound result: attach the binding triple
 * and return only the six layer projections plus the shared evidence map.
 */
export function reduceOnboardingResult(
  session: OnboardingSession,
  output: OnboardingAnalysisOutput,
): OnboardingAnalysisResult {
  const result = {
    projectId: session.projectId,
    onboardingSessionId: session.onboardingSessionId,
    sourceHash: session.sourceHash,
    evidence: output.evidence,
    layers: output.layers,
  };
  return onboardingAnalysisResultSchema.parse(result);
}

/** Deterministic candidate fingerprint for one layer (cross-layer isolation). */
export function layerHash(layers: OnboardingLayers, key: OnboardingLayerKey): string {
  const canonical = JSON.stringify({
    label: LAYER_KEY_TO_NAME[key],
    layer: layers[key],
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/** All six layer hashes, keyed by layer, for regenerate isolation assertions. */
export function layerHashes(layers: OnboardingLayers): Record<OnboardingLayerKey, string> {
  const result = {} as Record<OnboardingLayerKey, string>;
  for (const key of ONBOARDING_LAYER_KEYS) result[key] = layerHash(layers, key);
  return result;
}
