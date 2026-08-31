import { createHash, randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { assertFreeText } from '../core/onboarding/validate.js';
import { chunkText, normalizeText } from '../core/text/pipeline.js';
import {
  LONG_DRAFT_CHUNK_SIZE,
  LONG_DRAFT_MAX_BYTES,
  LONG_DRAFT_MAX_CHUNKS,
  longDraftOutlineCandidateSchema,
  longDraftOutlineAcceptResultSchema,
  longDraftOutlineApplyProposalSchema,
  longDraftOutlineGatePayloadSchema,
  longDraftOutlineInputSchema,
  longDraftOutlineParserInputSchema,
  longDraftOutlineProvenanceSchema,
  longDraftReadinessSchema,
  longDraftOutlineRejectResultSchema,
  longDraftWorkflowCheckpointEntrySchema,
  longDraftWorkflowRecoveryItemSchema,
  longDraftWorkflowRecoverResultSchema,
  longDraftWorkflowBeginResultSchema,
  longDraftWorkflowResultSchema,
  longDraftWorkflowStatusSchema,
  type LongDraftOutlineCandidate,
  type LongDraftOutlineAcceptResult,
  type LongDraftOutlineApplyProposal,
  type LongDraftOutlineInput,
  type LongDraftOutlineRejectResult,
  type LongDraftReadiness,
  type LongDraftWorkflowCheckpointEntry,
  type LongDraftWorkflowRecoverResult,
  type LongDraftWorkflowResult,
  type LongDraftWorkflowStatus,
} from '../core/schema/long-draft.js';
import { classifyLongDraftOutline } from '../llm/analyze/long-draft-outline.js';
import { asLlmBackend, type GenerationSettings } from '../llm/port/index.js';
import { INITIAL_STATE } from '../core/schema/project-lifecycle.js';
import type { NovelCharacterService } from './character-service.js';
import type { NovelCanonService } from './canon-service.js';
import type { NovelConfirmationService } from './confirmation-service.js';
import type { NovelOutlineService } from './outline-service.js';
import type { Outline } from '../core/schema/outline.js';
import type { NovelProjectService } from './project-service.js';
import type { NovelRelationshipService } from './relationship-service.js';
import type { NovelStateService } from './state-service.js';
import type { NovelTextService } from './text-service.js';
import type { NovelWorldviewService } from './worldview-service.js';
import { createLongDraftWorkflowCheckpointStore } from './long-draft-workflow-repository.js';

const LONG_DRAFT_KIND = 'long-draft-outline';

export interface LongDraftWorkflowCoordinator {
  preflight(projectId: string): Promise<LongDraftReadiness>;
  propose(projectId: string, input: LongDraftOutlineInput, settings: GenerationSettings, signal?: AbortSignal): Promise<LongDraftOutlineCandidate>;
  begin(projectId: string, input: LongDraftOutlineInput, settings: GenerationSettings): { workflowId: string };
  status(workflowId: string): LongDraftWorkflowStatus;
  cancel(workflowId: string): Promise<void>;
  result(workflowId: string): LongDraftWorkflowResult;
  proposeApply(projectId: string, candidate: LongDraftOutlineCandidate): Promise<LongDraftOutlineApplyProposal>;
  accept(projectId: string, proposalId: string, sourceHash?: string): Promise<LongDraftOutlineAcceptResult>;
  reject(projectId: string, proposalId: string): Promise<LongDraftOutlineRejectResult>;
  recover(projectId: string): Promise<LongDraftWorkflowRecoverResult>;
}

export interface LongDraftWorkflowCoordinatorDeps {
  readonly project: Pick<NovelProjectService, 'openProject'>;
  readonly characters: Pick<NovelCharacterService, 'list'>;
  readonly worldview: Pick<NovelWorldviewService, 'list'>;
  readonly outline: Pick<NovelOutlineService, 'readiness' | 'read' | 'save'>;
  readonly relationship: Pick<NovelRelationshipService, 'read'>;
  readonly state: Pick<NovelStateService, 'current'>;
  readonly canon: Pick<NovelCanonService, 'query'>;
  readonly text: Pick<NovelTextService, 'open' | 'listChapters'>;
  readonly confirmation: NovelConfirmationService;
  readonly projectsRoot?: string;
  readonly llm: unknown;
  readonly onDispose?: (dispose: () => void) => void;
}

interface PreparedSource {
  readonly input: LongDraftOutlineInput;
  readonly chunks: readonly { index: number; text: string }[];
  readonly provenance: {
    sourceHash: string;
    byteLength: number;
    chunkSize: number;
    chunkCount: number;
    chunkIndices: number[];
  };
}

interface WorkflowJob {
  readonly workflowId: string;
  readonly projectId: string;
  readonly sourceHash: string;
  readonly controller: AbortController;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  candidate?: LongDraftOutlineCandidate;
  error?: unknown;
}

/**
 * I119 candidate-only owner. It performs the N-7 readiness gate before the
 * first LLM byte, preserves every source chunk in deterministic order, and
 * never owns B5/B2/C-layer writes; I120 adds the Gate-backed apply path.
 */
export function createLongDraftWorkflowCoordinator(
  deps: LongDraftWorkflowCoordinatorDeps,
): LongDraftWorkflowCoordinator {
  const backend = asLlmBackend(deps.llm);
  const openings = new Map<string, Promise<void>>();
  const jobs = new Map<string, WorkflowJob>();
  const sourceTexts = new Map<string, string>();
  const checkpoints = createLongDraftWorkflowCheckpointStore(deps.projectsRoot ?? join(homedir(), '.dsh', 'novel-projects'));
  const applyTails = new Map<string, Promise<unknown>>();
  let disposed = false;

  const ensureOpen = (projectId: string): Promise<void> => {
    const existing = openings.get(projectId);
    if (existing !== undefined) return existing;
    const opening = deps.project.openProject(projectId)
      .then(() => Promise.all([deps.text.open(projectId), deps.confirmation.open(projectId)]))
      .then(() => undefined);
    openings.set(projectId, opening);
    return opening.catch((error) => {
      if (openings.get(projectId) === opening) openings.delete(projectId);
      throw error;
    });
  };

  const preflight = async (projectId: string): Promise<LongDraftReadiness> => {
    if (disposed) throw new Error('Long draft workflow coordinator is disposed');
    await ensureOpen(projectId);
    const [characters, worldview, outline, relationships, state, canon, chapters] = await Promise.all([
      deps.characters.list(projectId),
      deps.worldview.list(projectId),
      deps.outline.readiness(projectId),
      deps.relationship.read(projectId),
      Promise.resolve(deps.state.current(projectId)),
      Promise.resolve(deps.canon.query(projectId)),
      deps.text.listChapters(projectId),
    ]);
    const layers = {
      characters: characters.length === 0 ? 'empty' as const : 'ready' as const,
      worldview: worldview.length === 0 ? 'empty' as const : 'ready' as const,
      outline: outline === 'uninitialized' ? 'empty' as const : outline,
      relationship: relationships.length === 0 ? 'empty' as const : 'ready' as const,
      state: isInitialState(state) ? 'empty' as const : 'ready' as const,
      canon: canon.length === 0 ? 'empty' as const : 'ready' as const,
      text: chapters.length === 0 ? 'empty' as const : 'ready' as const,
    };
    const blockers = (Object.keys(layers) as Array<keyof typeof layers>)
      .filter((key) => layers[key] !== 'empty');
    const hasInvalidLayer = Object.values(layers).includes('corrupt');
    return longDraftReadinessSchema.parse({
      projectId,
      status: blockers.length === 0 ? 'ready' : 'blocked',
      ...(blockers.length === 0 ? {} : { reason: hasInvalidLayer ? 'invalid-project-state' : 'non-empty-project' }),
      blockers,
      layers,
    });
  };

  const propose = async (projectId: string, rawInput: LongDraftOutlineInput, settings: GenerationSettings, signal?: AbortSignal): Promise<LongDraftOutlineCandidate> => {
    const prepared = prepareSource(rawInput);
    const readiness = await preflight(projectId);
    if (readiness.status !== 'ready') {
      throw new Error(`Long draft outline requires an empty project (${readiness.reason}): ${readiness.blockers.join(', ')}`);
    }
    const output = await classifyLongDraftOutline(backend, longDraftOutlineParserInputSchema.parse({
      sourceHash: prepared.input.sourceHash,
      chunks: prepared.chunks,
    }), settings, signal);
    const candidateId = stableCandidateId(projectId, prepared, output.outline);
    return longDraftOutlineCandidateSchema.parse({
      candidateId,
      projectId,
      sourceHash: prepared.input.sourceHash,
      provenance: prepared.provenance,
      confidence: output.confidence,
      outline: output.outline,
      rationale: output.rationale,
    });
  };

  const runJob = async (job: WorkflowJob, settings: GenerationSettings): Promise<void> => {
    job.status = 'running';
    try {
      const candidate = await propose(job.projectId, { sourceHash: job.sourceHash, text: jobInputText(job) }, settings, job.controller.signal);
      if (job.controller.signal.aborted) throw new Error('Long draft outline analysis cancelled');
      job.candidate = candidate;
      job.status = 'succeeded';
    } catch (error) {
      job.error = error;
      job.status = job.controller.signal.aborted || error instanceof Error && /cancelled/i.test(error.message) ? 'cancelled' : 'failed';
    }
  };

  const readGatePayload = (projectId: string, proposalId: string): LongDraftOutlineCandidate => {
    const record = deps.confirmation.get(projectId, proposalId);
    if (record.kind !== LONG_DRAFT_KIND) throw new Error(`Invalid long-draft proposal kind: ${record.kind}`);
    const payload = longDraftOutlineGatePayloadSchema.parse(record.payload);
    if (payload.candidate.projectId !== projectId || payload.candidate.candidateId !== proposalId) {
      throw new Error(`Long-draft proposal belongs to another project: ${proposalId}`);
    }
    return payload.candidate;
  };

  const checkpointFor = async (projectId: string, proposalId: string): Promise<LongDraftWorkflowCheckpointEntry | undefined> =>
    (await checkpoints.read(projectId)).find((entry) => entry.proposalId === proposalId);

  const updateCheckpoint = (entry: LongDraftWorkflowCheckpointEntry): Promise<LongDraftWorkflowCheckpointEntry> =>
    checkpoints.upsert(longDraftWorkflowCheckpointEntrySchema.parse(entry));

  const withApplyLock = <T>(projectId: string, proposalId: string, operation: () => Promise<T>): Promise<T> => {
    const key = `${projectId}:${proposalId}`;
    const previous = applyTails.get(key) ?? Promise.resolve();
    const run = previous.then(operation, operation);
    applyTails.set(key, run.then(() => undefined, () => undefined));
    return run;
  };

  const sameOutline = (candidate: LongDraftOutlineCandidate, saved: Outline): boolean => {
    const { version: _version, ...withoutVersion } = saved;
    return JSON.stringify(withoutVersion) === JSON.stringify(candidate.outline);
  };

  const applyAccepted = async (projectId: string, proposalId: string, candidate: LongDraftOutlineCandidate): Promise<LongDraftOutlineAcceptResult> => {
    const existing = await checkpointFor(projectId, proposalId);
    if (existing?.status === 'applied') {
      const saved = await deps.outline.read(projectId);
      if (!sameOutline(candidate, saved)) throw new Error('Applied long-draft checkpoint does not match outline');
      return longDraftOutlineAcceptResultSchema.parse({ projectId, proposalId, status: 'already-applied', outline: saved, checkpoint: existing });
    }

    const readiness = await preflight(projectId);
    if (readiness.status !== 'ready') throw new Error(`Long draft apply requires an empty project (${readiness.reason}): ${readiness.blockers.join(', ')}`);

    const applying = longDraftWorkflowCheckpointEntrySchema.parse({
      projectId,
      proposalId,
      candidateId: candidate.candidateId,
      sourceHash: candidate.sourceHash,
      status: 'applying',
    });
    await updateCheckpoint(applying);
    try {
      const saved = await deps.outline.save(projectId, { ...candidate.outline, version: 1 });
      if (!sameOutline(candidate, saved)) throw new Error('Applied long-draft outline verification failed');
      const applied = await updateCheckpoint({ ...applying, status: 'applied' });
      return longDraftOutlineAcceptResultSchema.parse({ projectId, proposalId, status: 'applied', outline: saved, checkpoint: applied });
    } catch (error) {
      await updateCheckpoint({ ...applying, status: 'failed', error: safeError(error) });
      throw error;
    }
  };

  const service: LongDraftWorkflowCoordinator = {
    preflight,
    propose,
    begin(projectId, rawInput, settings) {
      if (disposed) throw new Error('Long draft workflow coordinator is disposed');
      const input = longDraftOutlineInputSchema.parse(rawInput);
      const workflowId = `${LONG_DRAFT_KIND}-${randomUUID()}`;
      const job: WorkflowJob = {
        workflowId,
        projectId,
        sourceHash: input.sourceHash,
        controller: new AbortController(),
        status: 'queued',
      };
      // Keep source text Host-owned by the job without exposing it in status;
      // the workflow id is the only Remote-side handle until result().
      sourceTexts.set(workflowId, input.text);
      jobs.set(workflowId, job);
      void runJob(job, settings);
      return longDraftWorkflowBeginResultSchema.parse({ workflowId });
    },
    status(workflowId) {
      const job = requireJob(jobs, workflowId);
      return longDraftWorkflowStatusSchema.parse({
        workflowId: job.workflowId,
        projectId: job.projectId,
        sourceHash: job.sourceHash,
        status: job.status,
        ...(job.status === 'failed' ? { error: safeError(job.error) } : {}),
      });
    },
    async cancel(workflowId) {
      const job = requireJob(jobs, workflowId);
      if (job.status === 'queued' || job.status === 'running') {
        job.controller.abort();
        job.status = 'cancelled';
      }
    },
    result(workflowId) {
      const job = requireJob(jobs, workflowId);
      if (job.status !== 'succeeded' || job.candidate === undefined) {
        if (job.status === 'failed') throw job.error instanceof Error ? job.error : new Error(safeError(job.error));
        if (job.status === 'cancelled') throw new Error('Long draft outline analysis cancelled');
        throw new Error(`Long draft outline analysis is not complete: ${job.status}`);
      }
      return longDraftWorkflowResultSchema.parse({ workflowId, candidate: job.candidate });
    },
    async proposeApply(projectId, rawCandidate) {
      await ensureOpen(projectId);
      const candidate = longDraftOutlineCandidateSchema.parse(rawCandidate);
      if (candidate.projectId !== projectId) throw new Error(`Long-draft candidate belongs to another project: ${candidate.projectId}`);
      const readiness = await preflight(projectId);
      if (readiness.status !== 'ready') throw new Error(`Long draft apply requires an empty project (${readiness.reason}): ${readiness.blockers.join(', ')}`);
      const existing = deps.confirmation.list(projectId).find((record) => record.id === candidate.candidateId);
      if (existing !== undefined) {
        const existingCandidate = readGatePayload(projectId, existing.id);
        if (JSON.stringify(existingCandidate) !== JSON.stringify(candidate)) throw new Error(`Long-draft proposal id already binds another candidate: ${candidate.candidateId}`);
        if (existing.status !== 'pending') throw new Error(`Long-draft proposal already ${existing.status}: ${candidate.candidateId}`);
        const checkpoint = await checkpointFor(projectId, candidate.candidateId);
        if (checkpoint !== undefined) return longDraftOutlineApplyProposalSchema.parse({ projectId, proposalId: candidate.candidateId, status: 'pending', candidate });
      }
      if (existing === undefined) {
        await deps.confirmation.propose(projectId, {
          id: candidate.candidateId,
          kind: LONG_DRAFT_KIND,
          payload: longDraftOutlineGatePayloadSchema.parse({ candidate }),
        });
      }
      await updateCheckpoint({ projectId, proposalId: candidate.candidateId, candidateId: candidate.candidateId, sourceHash: candidate.sourceHash, status: 'pending' });
      return longDraftOutlineApplyProposalSchema.parse({ projectId, proposalId: candidate.candidateId, status: 'pending', candidate });
    },
    accept(projectId, proposalId, sourceHash) {
      return withApplyLock(projectId, proposalId, async () => {
        await ensureOpen(projectId);
        const candidate = readGatePayload(projectId, proposalId);
        if (sourceHash !== undefined && sourceHash !== candidate.sourceHash) throw new Error('Long-draft sourceHash changed; proposal is stale');
        const record = deps.confirmation.get(projectId, proposalId);
        if (record.status === 'rejected') throw new Error(`Long-draft proposal already rejected: ${proposalId}`);
        if (record.status === 'pending') {
          const readiness = await preflight(projectId);
          if (readiness.status !== 'ready') throw new Error(`Long draft apply requires an empty project (${readiness.reason}): ${readiness.blockers.join(', ')}`);
          await deps.confirmation.accept(projectId, proposalId);
        }
        return applyAccepted(projectId, proposalId, candidate);
      });
    },
    async reject(projectId, proposalId) {
      await ensureOpen(projectId);
      const candidate = readGatePayload(projectId, proposalId);
      const record = await deps.confirmation.reject(projectId, proposalId);
      const checkpoint = await updateCheckpoint({
        projectId,
        proposalId,
        candidateId: candidate.candidateId,
        sourceHash: candidate.sourceHash,
        status: 'rejected',
      });
      if (record.kind !== LONG_DRAFT_KIND) throw new Error(`Invalid long-draft proposal kind: ${record.kind}`);
      return longDraftOutlineRejectResultSchema.parse({ projectId, proposalId, status: 'rejected', checkpoint });
    },
    async recover(projectId) {
      await ensureOpen(projectId);
      const checkpointEntries = await checkpoints.read(projectId);
      const items = checkpointEntries.map((checkpoint) => longDraftWorkflowRecoveryItemSchema.parse({ ...checkpoint, candidate: readGatePayload(projectId, checkpoint.proposalId) }));
      return longDraftWorkflowRecoverResultSchema.parse({ projectId, items });
    },
  };

  const jobInputText = (job: WorkflowJob): string => {
    const text = sourceTexts.get(job.workflowId);
    if (text === undefined) throw new Error(`Missing long draft source: ${job.workflowId}`);
    return text;
  };
  const requireJob = (jobsMap: Map<string, WorkflowJob>, workflowId: string): WorkflowJob => {
    const job = jobsMap.get(workflowId);
    if (job === undefined) throw new Error(`Unknown long draft workflow: ${workflowId}`);
    return job;
  };
  deps.onDispose?.(() => {
    disposed = true;
    for (const job of jobs.values()) job.controller.abort();
    jobs.clear();
    sourceTexts.clear();
    openings.clear();
  });
  return Object.freeze(service);
}

function prepareSource(rawInput: LongDraftOutlineInput): PreparedSource {
  const input = longDraftOutlineInputSchema.parse(rawInput);
  const normalized = normalizeText(assertFreeText(input.text));
  const byteLength = Buffer.byteLength(normalized, 'utf8');
  if (byteLength > LONG_DRAFT_MAX_BYTES) throw new Error(`Long draft exceeds ${LONG_DRAFT_MAX_BYTES} bytes`);
  const chunks = chunkText(normalized, LONG_DRAFT_CHUNK_SIZE);
  if (chunks.length === 0) throw new Error('Long draft has no readable chunks');
  if (chunks.length > LONG_DRAFT_MAX_CHUNKS) throw new Error(`Long draft has too many chunks: ${chunks.length}`);
  const provenance = longDraftOutlineProvenanceSchema.parse({
    sourceHash: input.sourceHash,
    byteLength,
    chunkSize: LONG_DRAFT_CHUNK_SIZE,
    chunkCount: chunks.length,
    chunkIndices: chunks.map((chunk) => chunk.index),
  });
  return { input: { ...input, text: normalized }, chunks: chunks.map(({ index, text }) => ({ index, text })), provenance };
}

function stableCandidateId(projectId: string, source: PreparedSource, outline: unknown): string {
  const digest = createHash('sha256').update(JSON.stringify({ projectId, sourceHash: source.input.sourceHash, provenance: source.provenance, outline }), 'utf8').digest('hex');
  return `ld-outline-${digest.slice(0, 52)}`;
}

function isInitialState(state: { seq: number; characters: readonly unknown[] }): boolean {
  return state.seq === INITIAL_STATE.version - 1 && state.characters.length === 0;
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500) || 'Long draft outline analysis failed';
}
