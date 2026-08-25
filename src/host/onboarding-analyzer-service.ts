import { randomUUID } from 'node:crypto';
import {
  assertFreeText,
  layerHash,
} from '../core/onboarding/analyzer.js';
import { chunkText } from '../core/upload/index.js';
import { asLlmBackend } from '../llm/port/index.js';
import { analyzeOnboardingText, regenerateOnboardingLayer } from '../llm/analyze/onboarding.js';
import type {
  OnboardingAnalysisInput,
  OnboardingAnalysisResult,
  OnboardingAnalysisStartInput,
  OnboardingAnalysisStatus,
  OnboardingLayerKey,
} from '../core/schema/onboarding.js';

/**
 * I52 Host-only six-layer initialization analyzer facade (design §14.8 / R11-3).
 *
 * It owns the analysis job lifecycle — start / status / cancel / regenerate —
 * and binds every request to the immutable `projectId` / `onboardingSessionId`
 * / `sourceHash` triple. Each `start` opens a Fiber-cancellable Job: `status`
 * reflects progress, `cancel` aborts it, and `regenerate` re-runs exactly one
 * layer while the other five remain byte-identical.
 *
 * No layer is written here; results are candidate packages only (I53 owns the
 * Gate-backed apply). Free-text input is guarded before any LLM call.
 */
export interface NovelOnboardingAnalyzerService {
  start(input: OnboardingAnalysisStartInput, settings: unknown, signal?: AbortSignal): Promise<OnboardingAnalysisResult>;
  status(onboardingSessionId: string): OnboardingAnalysisStatus;
  cancel(onboardingSessionId: string): Promise<void>;
  regenerate(onboardingSessionId: string, layer: OnboardingLayerKey, settings: unknown, signal?: AbortSignal): Promise<OnboardingAnalysisResult>;
  /** Read the bound result for a session (I53 adjudication needs the candidate layers). */
  getResult(onboardingSessionId: string): OnboardingAnalysisResult | undefined;
}

interface Job {
  readonly projectId: string;
  readonly onboardingSessionId: string;
  readonly sourceHash: string;
  readonly input: OnboardingAnalysisInput;
  readonly controller: AbortController;
  status: OnboardingAnalysisStatus;
  result?: OnboardingAnalysisResult;
  error?: unknown;
}

export function createOnboardingAnalyzerService(
  llm: unknown,
  onDispose?: (dispose: () => void) => void,
): NovelOnboardingAnalyzerService {
  const backend = asLlmBackend(llm);
  const jobs = new Map<string, Job>();
  onDispose?.(() => {
    for (const job of jobs.values()) job.controller.abort();
    jobs.clear();
  });

  const job = (onboardingSessionId: string): Job => {
    const found = jobs.get(onboardingSessionId);
    if (!found) throw new Error(`Unknown onboarding session: ${onboardingSessionId}`);
    return found;
  };

  function startJob(input: OnboardingAnalysisStartInput): Job {
    const text = assertFreeText(input.text);
    const onboardingSessionId = randomUUID();
    const chunks = chunkText(text, 4000);
    const analysisInput: OnboardingAnalysisInput = {
      projectId: input.projectId,
      onboardingSessionId,
      sourceHash: input.sourceHash,
      chunks,
    };
    const current: Job = {
      projectId: input.projectId,
      onboardingSessionId,
      sourceHash: input.sourceHash,
      input: analysisInput,
      controller: new AbortController(),
      status: 'queued',
    };
    jobs.set(onboardingSessionId, current);
    return current;
  }

  return Object.freeze({
    async start(input: OnboardingAnalysisStartInput, settings: unknown, signal?: AbortSignal) {
      const current = startJob(input);
      const forwardAbort = () => current.controller.abort();
      signal?.addEventListener('abort', forwardAbort, { once: true });
      current.status = 'running';
      try {
        const result = await analyzeOnboardingText(backend, current.input, settings, current.controller.signal);
        current.result = result;
        current.status = 'succeeded';
        return result;
      } catch (error) {
        current.error = error;
        current.status = current.controller.signal.aborted ? 'cancelled' : 'failed';
        throw error;
      } finally {
        signal?.removeEventListener('abort', forwardAbort);
      }
    },
    status(onboardingSessionId: string) {
      return job(onboardingSessionId).status;
    },
    getResult(onboardingSessionId: string) {
      const found = jobs.get(onboardingSessionId);
      return found?.result;
    },
    async cancel(onboardingSessionId: string) {
      const current = job(onboardingSessionId);
      current.controller.abort();
      current.status = 'cancelled';
    },
    async regenerate(onboardingSessionId: string, layer: OnboardingLayerKey, settings: unknown, signal?: AbortSignal) {
      const current = job(onboardingSessionId);
      if (current.status !== 'succeeded' || !current.result) {
        throw new Error(`Onboarding session is not analyzable for regeneration: ${current.status}`);
      }
      const prior = current.result;
      const priorHashes = Object.fromEntries(
        (Object.keys(prior.layers) as OnboardingLayerKey[]).map((key) => [key, layerHash(prior.layers, key)]),
      ) as Record<OnboardingLayerKey, string>;
      const forwardAbort = () => current.controller.abort();
      signal?.addEventListener('abort', forwardAbort, { once: true });
      try {
        const next = await regenerateOnboardingLayer(backend, current.input, prior, layer, settings, current.controller.signal);
        for (const key of (Object.keys(prior.layers) as OnboardingLayerKey[])) {
          if (key !== layer && layerHash(next.layers, key) !== priorHashes[key]) {
            throw new Error(`Regenerate mutated an unrelated layer: ${key}`);
          }
        }
        current.result = next;
        return next;
      } finally {
        signal?.removeEventListener('abort', forwardAbort);
      }
    },
  });
}
