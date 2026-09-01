import { asLlmBackend, type GenerationSettings, type LlmBackend } from '../llm/port/index.js';
import {
  narrativeRevealCandidateSchema,
  narrativeRevealIdentitySchema,
  narrativeRevealInputSchema,
  narrativeRevealResultSchema,
  narrativeRevealStatusResultSchema,
  type NarrativeRevealCandidate,
  type NarrativeRevealIdentity,
  type NarrativeRevealInput,
  type NarrativeRevealResult,
  type NarrativeRevealStatus,
} from '../core/schema/narrative-reveal.js';
import { planNarrativeReveal } from '../llm/analyze/narrative-reveal.js';

interface RevealJob {
  readonly input: NarrativeRevealInput;
  readonly controller: AbortController;
  readonly revealId: string;
  status: NarrativeRevealStatus;
  candidate?: NarrativeRevealCandidate;
  error?: unknown;
}

/**
 * I146 Host-only C3 reveal planner. It owns an in-memory candidate lifecycle;
 * KnowledgeRepository and ConfirmationGate remain unreachable until I148.
 */
export interface NarrativeRevealPlanner {
  begin(input: NarrativeRevealInput, settings: GenerationSettings): NarrativeRevealIdentity;
  status(input: NarrativeRevealIdentity): ReturnType<typeof narrativeRevealStatusResultSchema.parse>;
  cancel(input: NarrativeRevealIdentity): Promise<ReturnType<typeof narrativeRevealStatusResultSchema.parse>>;
  result(input: NarrativeRevealIdentity): NarrativeRevealResult;
  dispose(): void;
}

export function createNarrativeRevealPlanner(
  llm: unknown,
  onDispose?: (dispose: () => void) => void,
  onBackgroundError: (error: unknown, revealId: string) => void = (error, revealId) => {
    console.error(`Narrative reveal ${revealId} failed`, error);
  },
): NarrativeRevealPlanner {
  const backend: LlmBackend | undefined = asLlmBackend(llm);
  const jobs = new Map<string, RevealJob>();
  let nextId = 1;
  let disposed = false;
  const ensureActive = (): void => { if (disposed) throw new Error('Narrative reveal planner is disposed'); };
  const jobFor = (raw: NarrativeRevealIdentity): RevealJob => {
    const identity = narrativeRevealIdentitySchema.parse(raw);
    const job = jobs.get(identity.revealId);
    if (job === undefined) throw new Error(`Unknown narrative reveal: ${identity.revealId}`);
    if (job.input.projectId !== identity.projectId || job.input.importSessionId !== identity.importSessionId) throw new Error('Narrative reveal belongs to another import session');
    if (job.input.sourceHash !== identity.sourceHash) throw new Error('Narrative reveal source hash mismatch');
    return job;
  };
  const identityOf = (job: RevealJob): NarrativeRevealIdentity => narrativeRevealIdentitySchema.parse({ projectId: job.input.projectId, importSessionId: job.input.importSessionId, sourceHash: job.input.sourceHash, revealId: job.revealId });
  const statusOf = (job: RevealJob) => narrativeRevealStatusResultSchema.parse({ ...identityOf(job), status: job.status });
  const run = async (job: RevealJob, settings: GenerationSettings): Promise<void> => {
    job.status = 'running';
    try {
      const output = await planNarrativeReveal(backend, job.input, settings, job.controller.signal);
      job.candidate = narrativeRevealCandidateSchema.parse({
        candidateId: `narrative-reveal-candidate-${job.revealId.split('-').at(-1) ?? '1'}`,
        projectId: job.input.projectId,
        importSessionId: job.input.importSessionId,
        sourceHash: job.input.sourceHash,
        sourceRole: job.input.sourceRole,
        treatment: job.input.treatment,
        narrativeIntent: job.input.narrativeIntent,
        b5CandidateId: job.input.b5CandidateId,
        ...output,
      });
      job.status = 'succeeded';
    } catch (error) {
      job.error = error;
      job.status = job.controller.signal.aborted ? 'cancelled' : 'failed';
      if (!job.controller.signal.aborted) onBackgroundError(error, job.revealId);
    }
  };
  const service: NarrativeRevealPlanner = {
    begin(rawInput, settings) {
      ensureActive();
      const input = narrativeRevealInputSchema.parse(rawInput);
      const revealId = `narrative-reveal-${nextId++}`;
      const job: RevealJob = { input, revealId, controller: new AbortController(), status: 'queued' };
      jobs.set(revealId, job);
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
      if (job.status === 'succeeded' && job.candidate !== undefined) return narrativeRevealResultSchema.parse({ ...identityOf(job), candidate: job.candidate });
      if (job.status === 'failed') throw job.error instanceof Error ? job.error : new Error('Narrative reveal failed');
      if (job.status === 'cancelled') throw new Error('Narrative reveal cancelled');
      throw new Error(`Narrative reveal is not complete: ${job.status}`);
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
