import { asLlmBackend, type GenerationSettings, type LlmBackend } from '../llm/port/index.js';
import {
  narrativeAdaptationCandidateSchema,
  narrativeAdaptationIdentitySchema,
  narrativeAdaptationInputSchema,
  narrativeAdaptationResultSchema,
  narrativeAdaptationStatusResultSchema,
  type NarrativeAdaptationCandidate,
  type NarrativeAdaptationInput,
  type NarrativeAdaptationResult,
  type NarrativeAdaptationStatus,
} from '../core/schema/narrative-adaptation.js';
import { classifyNarrativeAdaptation } from '../llm/analyze/narrative-adaptation.js';

interface AdaptationJob {
  readonly input: NarrativeAdaptationInput;
  readonly controller: AbortController;
  readonly adaptationId: string;
  status: NarrativeAdaptationStatus;
  candidate?: NarrativeAdaptationCandidate;
  error?: unknown;
}

/**
 * I145 Host-only POV adaptation owner. It produces a bounded B5 candidate and
 * optional protagonist candidate in memory; no B3/B5/C3/C4/C5 writer is
 * reachable from this service. I148 owns any later plan/application seam.
 */
export interface NarrativeAdaptationService {
  begin(input: NarrativeAdaptationInput, settings: GenerationSettings): { projectId: string; importSessionId: string; sourceHash: string; adaptationId: string };
  status(input: { projectId: string; importSessionId: string; sourceHash: string; adaptationId: string }): ReturnType<typeof narrativeAdaptationStatusResultSchema.parse>;
  cancel(input: { projectId: string; importSessionId: string; sourceHash: string; adaptationId: string }): Promise<ReturnType<typeof narrativeAdaptationStatusResultSchema.parse>>;
  result(input: { projectId: string; importSessionId: string; sourceHash: string; adaptationId: string }): NarrativeAdaptationResult;
  dispose(): void;
}

export function createNarrativeAdaptationService(
  llm: unknown,
  onDispose?: (dispose: () => void) => void,
  onBackgroundError: (error: unknown, adaptationId: string) => void = (error, adaptationId) => {
    console.error(`Narrative adaptation ${adaptationId} failed`, error);
  },
): NarrativeAdaptationService {
  const backend: LlmBackend | undefined = asLlmBackend(llm);
  const jobs = new Map<string, AdaptationJob>();
  let nextId = 1;
  let disposed = false;
  const ensureActive = (): void => { if (disposed) throw new Error('Narrative adaptation service is disposed'); };
  const jobFor = (raw: { projectId: string; importSessionId: string; sourceHash: string; adaptationId: string }): AdaptationJob => {
    const identity = narrativeAdaptationIdentitySchema.parse(raw);
    const job = jobs.get(identity.adaptationId);
    if (job === undefined) throw new Error(`Unknown narrative adaptation: ${identity.adaptationId}`);
    if (job.input.projectId !== identity.projectId || job.input.importSessionId !== identity.importSessionId) throw new Error('Narrative adaptation belongs to another import session');
    if (job.input.sourceHash !== identity.sourceHash) throw new Error('Narrative adaptation source hash mismatch');
    return job;
  };
  const identityOf = (job: AdaptationJob) => narrativeAdaptationIdentitySchema.parse({ projectId: job.input.projectId, importSessionId: job.input.importSessionId, sourceHash: job.input.sourceHash, adaptationId: job.adaptationId });
  const statusOf = (job: AdaptationJob) => narrativeAdaptationStatusResultSchema.parse({ ...identityOf(job), status: job.status });
  const run = async (job: AdaptationJob, settings: GenerationSettings): Promise<void> => {
    job.status = 'running';
    try {
      const output = await classifyNarrativeAdaptation(backend, job.input, settings, job.controller.signal);
      job.candidate = narrativeAdaptationCandidateSchema.parse({
        candidateId: `narrative-candidate-${job.adaptationId.split('-').at(-1) ?? '1'}`,
        projectId: job.input.projectId,
        importSessionId: job.input.importSessionId,
        sourceHash: job.input.sourceHash,
        sourceRole: job.input.sourceRole,
        treatment: job.input.treatment,
        narrativeIntent: job.input.narrativeIntent,
        ...output,
      });
      job.status = 'succeeded';
    } catch (error) {
      job.error = error;
      job.status = job.controller.signal.aborted ? 'cancelled' : 'failed';
      if (!job.controller.signal.aborted) onBackgroundError(error, job.adaptationId);
    }
  };
  const service: NarrativeAdaptationService = {
    begin(rawInput, settings) {
      ensureActive();
      const input = narrativeAdaptationInputSchema.parse(rawInput);
      const adaptationId = `narrative-adaptation-${nextId++}`;
      const job: AdaptationJob = { input, adaptationId, controller: new AbortController(), status: 'queued' };
      jobs.set(adaptationId, job);
      void run(job, settings);
      return identityOf(job);
    },
    status(rawInput) { ensureActive(); return statusOf(jobFor(rawInput)); },
    async cancel(rawInput) {
      ensureActive();
      const job = jobFor(rawInput);
      if (job.status === 'queued' || job.status === 'running') { job.controller.abort(); job.status = 'cancelled'; }
      return statusOf(job);
    },
    result(rawInput) {
      ensureActive();
      const job = jobFor(rawInput);
      if (job.status === 'succeeded' && job.candidate !== undefined) return narrativeAdaptationResultSchema.parse({ ...identityOf(job), candidate: job.candidate });
      if (job.status === 'failed') throw job.error instanceof Error ? job.error : new Error('Narrative adaptation failed');
      if (job.status === 'cancelled') throw new Error('Narrative adaptation cancelled');
      throw new Error(`Narrative adaptation is not complete: ${job.status}`);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const job of jobs.values()) job.controller.abort();
      jobs.clear();
    },
  };
  onDispose?.(() => service.dispose());
  return Object.freeze(service);
}
