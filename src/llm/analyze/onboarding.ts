import { z } from 'zod';
import {
  assertOnboardingOutput,
  buildOnboardingPrompt,
  buildRegeneratePrompt,
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
import { collectCandidate, resolveGenerationSettings, type LlmBackend } from '../port/index.js';

/**
 * I52 Host-routed six-layer analyzer (design §14.8 / R11-3).
 *
 * `analyzeOnboardingText` runs a single full-package LLM pass and reduces it
 * to a bound result; `regenerateOnboardingLayer` re-runs exactly one layer and
 * splices it into the frozen result, keeping the other five layers byte-identical.
 * Neither writes any layer: this module only returns candidates.
 */

/** Run the full six-layer analysis for an onboarding session. */
export async function analyzeOnboardingText(
  backend: LlmBackend | undefined,
  input: OnboardingAnalysisInput,
  settings: unknown,
  signal?: AbortSignal,
): Promise<OnboardingAnalysisResult> {
  const candidate = await collectCandidate(backend, {
    prompt: buildOnboardingPrompt(input),
    settings: resolveGenerationSettings(settings),
    signal,
  });
  const output = parseOnboardingOutput(candidate.text);
  assertOnboardingOutput(output);
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
  const candidate = await collectCandidate(backend, {
    prompt: buildRegeneratePrompt(input, layer),
    settings: resolveGenerationSettings(settings),
    signal,
  });
  const parsed = parseLayer(layer, parseLayerJson(candidate.text));
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
  switch (layer) {
    case 'characters': return onboardingCharacterLayerSchema.parse(value);
    case 'worldview': return onboardingWorldviewLayerSchema.parse(value);
    case 'outline': return onboardingOutlineLayerSchema.parse(value);
    case 'relationship': return onboardingRelationshipLayerSchema.parse(value);
    case 'state': return onboardingStateLayerSchema.parse(value);
    case 'canon': return onboardingCanonLayerSchema.parse(value);
  }
}

/** Parse a single-layer JSON string strictly; no markdown, no extra fields. */
export function parseLayerJson(text: unknown): unknown {
  const raw = z.string().trim().min(1).parse(text);
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
