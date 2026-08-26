import { z } from 'zod';
import {
  assertOnboardingOutput,
  buildOnboardingPrompt,
  buildRegeneratePrompt,
  formatContractViolation,
  parseOnboardingOutput,
  reduceOnboardingResult,
} from '../../core/onboarding/analyzer.js';
import {
  onboardingAnalysisResultSchema,
  onboardingCharacterLayerSchema,
  onboardingWorldviewLayerSchema,
  onboardingOutlineLayerSchema,
  onboardingRelationshipLayerSchema,
  onboardingStateLayerSchema,
  onboardingCanonLayerSchema,
  ONBOARDING_LAYER_KEYS,
  type OnboardingAnalysisInput,
  type OnboardingAnalysisResult,
  type OnboardingLayerKey,
  type OnboardingLayers,
  type OnboardingSession,
} from '../../core/schema/onboarding.js';
import { collectCandidate, resolveGenerationSettings, type GenerationSettings, type LlmBackend } from '../port/index.js';

/**
 * I52 Host-routed six-layer analyzer (design §14.8 / R11-3).
 *
 * `analyzeOnboardingText` runs a single full-package LLM pass and reduces it
 * to a bound result; `regenerateOnboardingLayer` re-runs exactly one layer and
 * splices it into the frozen result, keeping the other five layers byte-identical.
 * Neither writes any layer: this module only returns candidates.
 *
 * Output robustness: weak/fast models intermittently drift on one layer's shape
 * (wrong types, invented enums, non-id references) or return empty/reasoning-only
 * completions. Both are fail-closed by the strict parse (zero writes), but to
 * avoid forcing the user to re-run the whole analysis, each LLM pass gets ONE
 * corrective retry with a hint naming the first failing fields. If the retry
 * also fails, the original contract error is rethrown unchanged.
 */

/** Output failures worth one corrective retry: shape drift or empty/invalid JSON. */
function isRetryableOutputError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.includes('不符合六层候选契约') || error.message.includes('must be valid JSON');
}

/** Build the corrective retry hint from the previous failure's Zod issues. */
function retryHint(cause: unknown): string {
  const issues = ((cause as { issues?: Array<{ path?: Array<string | number>; message?: string }> } | null)?.issues ?? [])
    .filter((issue) => issue.message !== undefined)
    .slice(0, 3)
    .map((issue) => `${(issue.path ?? []).join('.') || '(root)'}: ${issue.message}`);
  const detail = issues.length > 0 ? `（${issues.join('；')}）` : '';
  return `上次输出未通过字段契约校验${detail}。请严格按契约与完整示例的字段名、字段类型（数字不带引号）、枚举选项与 id 引用规范重新输出，不要省略任何字段。`;
}

/**
 * Run one LLM pass with a strict parse, and on a retryable output failure run
 * ONE corrective retry with the failure hint appended. Both passes are zero-write;
 * a failing retry rethrows the original failure class (design §14.7.3).
 */
async function withOutputRetry<T>(
  backend: LlmBackend | undefined,
  firstPrompt: string,
  settings: GenerationSettings,
  signal: AbortSignal | undefined,
  parse: (text: string) => T,
): Promise<T> {
  const pass = async (prompt: string): Promise<T> => {
    const candidate = await collectCandidate(backend, { prompt, settings, signal });
    return parse(candidate.text);
  };
  try {
    return await pass(firstPrompt);
  } catch (error) {
    if (!isRetryableOutputError(error)) throw error;
    return pass(`${firstPrompt}\n${retryHint((error as Error & { cause?: unknown }).cause)}`);
  }
}

/** Run the full six-layer analysis for an onboarding session. */
export async function analyzeOnboardingText(
  backend: LlmBackend | undefined,
  input: OnboardingAnalysisInput,
  settings: unknown,
  signal?: AbortSignal,
): Promise<OnboardingAnalysisResult> {
  const output = await withOutputRetry(
    backend,
    buildOnboardingPrompt(input),
    resolveGenerationSettings(settings),
    signal,
    (text) => {
      const parsed = parseOnboardingOutput(text);
      assertOnboardingOutput(parsed);
      return parsed;
    },
  );
  return reduceOnboardingResult(toSession(input), output);
}

/** Re-run a single layer and splice it onto a frozen prior result. */
export async function regenerateOnboardingLayer(
  backend: LlmBackend | undefined,
  input: OnboardingAnalysisInput,
  prior: OnboardingAnalysisResult,
  layer: OnboardingLayerKey,
  settings: unknown,
  signal?: AbortSignal,
): Promise<OnboardingAnalysisResult> {
  const parsed = await withOutputRetry(
    backend,
    buildRegeneratePrompt(input, layer),
    resolveGenerationSettings(settings),
    signal,
    (text) => parseLayer(layer, parseLayerJson(text)),
  );
  const nextLayers: OnboardingLayers = structuredClone(prior.layers);
  (nextLayers as Record<OnboardingLayerKey, unknown>)[layer] = parsed;
  // Re-run the full cross-layer invariant pass (evidence reachability, B3
  // empty forward refs, no C3/items/factions/globalFlags) on the spliced package.
  assertOnboardingOutput({ evidence: prior.evidence, layers: nextLayers });
  return onboardingAnalysisResultSchema.parse({ ...prior, layers: nextLayers });
}

function toSession(input: OnboardingAnalysisInput): OnboardingSession {
  return { projectId: input.projectId, onboardingSessionId: input.onboardingSessionId, sourceHash: input.sourceHash };
}

function parseLayer(layer: OnboardingLayerKey, value: unknown): OnboardingLayers[OnboardingLayerKey] {
  try {
    switch (layer) {
      case 'characters': return onboardingCharacterLayerSchema.parse(value);
      case 'worldview': return onboardingWorldviewLayerSchema.parse(value);
      case 'outline': return onboardingOutlineLayerSchema.parse(value);
      case 'relationship': return onboardingRelationshipLayerSchema.parse(value);
      case 'state': return onboardingStateLayerSchema.parse(value);
      case 'canon': return onboardingCanonLayerSchema.parse(value);
    }
  } catch (cause) {
    throw formatContractViolation(
      `「${layer}」层重生成结果`,
      '该层候选已被拒绝且未写入任何层；请对不合格层重新发起整层重生成。',
      cause,
    );
  }
}

/** Parse a single-layer JSON string strictly; no markdown, no extra fields. */
export function parseLayerJson(text: unknown): unknown {
  let raw: string;
  try {
    raw = z.string().trim().min(1).parse(text);
  } catch (cause) {
    throw new Error('Layer output must be valid JSON', { cause });
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (cause) {
    throw new Error('Layer output must be valid JSON', { cause });
  }
  return json;
}

export { ONBOARDING_LAYER_KEYS };
export type { OnboardingLayerKey };
