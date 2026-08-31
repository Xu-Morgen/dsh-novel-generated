import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  outlineGenerationBaselineAttachGeneratedInputSchema,
  outlineGenerationBaselineEventSchema,
  outlineGenerationBaselineFinalizeEventSchema,
  outlineGenerationBaselineSchema,
  outlineGenerationBaselineSupersedeEventSchema,
  type OutlineGenerationBaseline,
  type OutlineGenerationBaselineAttachGeneratedInput,
  type OutlineGenerationBaselineEvent,
} from '../core/schema/outline-generation-baseline.js';

export const OUTLINE_GENERATION_BASELINE_EVENTS_FILE = 'outline-generation-baselines.jsonl';

interface BaselineCoordinator { tail: Promise<unknown> }
const coordinators = new Map<string, BaselineCoordinator>();

function coordinatorFor(filePath: string): BaselineCoordinator {
  const resolved = resolve(filePath);
  const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  const existing = coordinators.get(key);
  if (existing !== undefined) return existing;
  const created: BaselineCoordinator = { tail: Promise.resolve() };
  coordinators.set(key, created);
  return created;
}

function eventId(kind: string, baselineId: string, sequence: number): string {
  const digest = createHash('sha256').update(`${kind}|${baselineId}|${sequence}`).digest('hex').slice(0, 24);
  return `evt-${sequence}-${digest}`;
}

export type OutlineGenerationBaselineCreateRecord = Omit<OutlineGenerationBaseline, 'revision'>;

export interface OutlineGenerationBaselineRepositoryOptions {
  /** Focused append-fault seam; production leaves it undefined. */
  readonly beforeAppend?: (event: OutlineGenerationBaselineEvent) => void | Promise<void>;
}

/**
 * Project-local append-only owner for I108 generation-intent evidence.
 * Replaying the JSONL event stream reconstructs the same aggregate after a
 * restart; no B5/C5 document is read or rewritten by this repository.
 */
export class OutlineGenerationBaselineRepository {
  private readonly filePath: string;
  private readonly coordinator: BaselineCoordinator;
  private opened = false;
  private sequence = 0;
  private readonly baselines = new Map<string, OutlineGenerationBaseline>();

  constructor(projectDirectory: string, private readonly options: OutlineGenerationBaselineRepositoryOptions = {}) {
    this.filePath = join(resolve(projectDirectory), OUTLINE_GENERATION_BASELINE_EVENTS_FILE);
    this.coordinator = coordinatorFor(this.filePath);
  }

  async open(): Promise<void> {
    return this.schedule(async () => {
      if (this.opened) return;
      await mkdir(join(this.filePath, '..'), { recursive: true });
      await this.replay();
      this.opened = true;
    });
  }

  async read(baselineId: string): Promise<OutlineGenerationBaseline> {
    return this.schedule(async () => {
      this.requireOpen();
      const baseline = this.baselines.get(baselineId);
      if (baseline === undefined) throw new Error(`Unknown outline generation baseline: ${baselineId}`);
      return structuredClone(baseline);
    });
  }

  async list(): Promise<OutlineGenerationBaseline[]> {
    return this.schedule(async () => {
      this.requireOpen();
      return [...this.baselines.values()].sort((left, right) => left.revision - right.revision).map((item) => structuredClone(item));
    });
  }

  async create(input: OutlineGenerationBaselineCreateRecord, replaceCurrentBaselineId?: string): Promise<OutlineGenerationBaseline> {
    return this.schedule(async () => {
      this.requireOpen();
      const existing = this.baselines.get(input.baselineId);
      if (existing !== undefined) {
        const immutable = (baseline: OutlineGenerationBaselineCreateRecord | OutlineGenerationBaseline) => JSON.stringify({
          baselineId: baseline.baselineId,
          projectId: baseline.projectId,
          chapterId: baseline.chapterId,
          sceneId: baseline.sceneId,
          detailBeatId: baseline.detailBeatId,
          b5ContentFingerprint: baseline.b5ContentFingerprint,
          bindingFingerprint: baseline.bindingFingerprint,
          sceneCard: baseline.sceneCard,
          authoringBase: baseline.authoringBase,
          createdAt: baseline.createdAt,
        });
        if (immutable(existing) !== immutable(input)) throw new Error(`Outline generation baseline ID collision: ${input.baselineId}`);
        return structuredClone(existing);
      }
      const candidate = outlineGenerationBaselineSchema.parse({ ...input, revision: this.sequence + 1 });
      const current = [...this.baselines.values()].find((item) => item.status === 'current'
        && item.projectId === candidate.projectId
        && item.chapterId === candidate.chapterId
        && item.sceneId === candidate.sceneId
        && item.detailBeatId === candidate.detailBeatId);
      if (current !== undefined && current.baselineId !== replaceCurrentBaselineId) {
        throw new Error(`Current outline generation baseline already exists: ${current.baselineId}`);
      }
      if (replaceCurrentBaselineId !== undefined && current?.baselineId !== replaceCurrentBaselineId) {
        throw new Error(`Replacement baseline is not the current baseline for target: ${replaceCurrentBaselineId}`);
      }
      const event = outlineGenerationBaselineEventSchema.parse({
        kind: 'create', eventId: eventId('create', candidate.baselineId, candidate.revision),
        projectId: candidate.projectId, sequence: candidate.revision, recordedAt: candidate.createdAt, baseline: candidate,
      });
      await this.append(event);
      this.apply(event);
      if (replaceCurrentBaselineId !== undefined) {
        const supersedeSequence = this.sequence + 1;
        const supersedeEvent = outlineGenerationBaselineEventSchema.parse({
          kind: 'supersede', eventId: eventId('supersede', replaceCurrentBaselineId, supersedeSequence),
          projectId: candidate.projectId, sequence: supersedeSequence, recordedAt: new Date().toISOString(),
          baselineId: replaceCurrentBaselineId, supersededBy: candidate.baselineId,
        });
        await this.append(supersedeEvent);
        this.apply(supersedeEvent);
      }
      return structuredClone(candidate);
    });
  }

  async attachGenerated(input: OutlineGenerationBaselineAttachGeneratedInput): Promise<OutlineGenerationBaseline> {
    const command = outlineGenerationBaselineAttachGeneratedInputSchema.parse(input);
    return this.schedule(async () => {
      this.requireOpen();
      const baseline = this.requireBaseline(command.baselineId);
      if (baseline.status !== 'current') throw new Error(`Cannot attach generated candidate to ${baseline.status} baseline: ${baseline.baselineId}`);
      if (baseline.generatedCandidateIds.includes(command.candidateId)) return structuredClone(baseline);
      const sequence = this.sequence + 1;
      const event = outlineGenerationBaselineEventSchema.parse({
        kind: 'attach-generated', eventId: eventId('attach-generated', command.baselineId, sequence),
        projectId: baseline.projectId, sequence, recordedAt: new Date().toISOString(), ...command,
      });
      await this.append(event);
      this.apply(event);
      return structuredClone(this.requireBaseline(command.baselineId));
    });
  }

  /** Host-only lifecycle event used by later finalize/reconciliation iterations. */
  async finalize(projectId: string, baselineId: string, finalSourceHash: string): Promise<OutlineGenerationBaseline> {
    return this.schedule(async () => {
      this.requireOpen();
      const baseline = this.requireProjectBaseline(projectId, baselineId);
      if (baseline.status === 'finalized') return structuredClone(baseline);
      if (baseline.status !== 'current') throw new Error(`Cannot finalize ${baseline.status} baseline: ${baselineId}`);
      const sequence = this.sequence + 1;
      const event = outlineGenerationBaselineFinalizeEventSchema.parse({
        kind: 'finalize', eventId: eventId('finalize', baselineId, sequence), projectId, sequence,
        recordedAt: new Date().toISOString(), baselineId, finalSourceHash,
      });
      await this.append(event);
      this.apply(event);
      return structuredClone(this.requireBaseline(baselineId));
    });
  }

  /** Host-only lifecycle event used to retire a stale/previous baseline. */
  async supersede(projectId: string, baselineId: string, supersededBy: string): Promise<OutlineGenerationBaseline> {
    return this.schedule(async () => {
      this.requireOpen();
      const baseline = this.requireProjectBaseline(projectId, baselineId);
      const replacement = this.requireProjectBaseline(projectId, supersededBy);
      if (replacement.chapterId !== baseline.chapterId || replacement.sceneId !== baseline.sceneId || replacement.detailBeatId !== baseline.detailBeatId) {
        throw new Error('Cannot supersede a baseline with a different generation target');
      }
      if (baseline.status === 'superseded') {
        if (baseline.supersededBy !== supersededBy) throw new Error(`Baseline already superseded by another baseline: ${baselineId}`);
        return structuredClone(baseline);
      }
      const sequence = this.sequence + 1;
      const event = outlineGenerationBaselineSupersedeEventSchema.parse({
        kind: 'supersede', eventId: eventId('supersede', baselineId, sequence), projectId, sequence,
        recordedAt: new Date().toISOString(), baselineId, supersededBy,
      });
      await this.append(event);
      this.apply(event);
      return structuredClone(this.requireBaseline(baselineId));
    });
  }

  private async replay(): Promise<void> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    for (const line of raw.split('\n')) {
      if (line.trim() === '') continue;
      const event = outlineGenerationBaselineEventSchema.parse(JSON.parse(line));
      if (event.sequence !== this.sequence + 1) throw new Error(`Invalid outline generation baseline event sequence: ${event.sequence}`);
      this.apply(event);
    }
  }

  private async append(event: OutlineGenerationBaselineEvent): Promise<void> {
    await this.options.beforeAppend?.(event);
    await appendFile(this.filePath, `${JSON.stringify(event)}\n`, 'utf8');
  }

  private apply(event: OutlineGenerationBaselineEvent): void {
    if (event.sequence !== this.sequence + 1) throw new Error(`Invalid outline generation baseline event sequence: ${event.sequence}`);
    if (event.kind === 'create') {
      if (event.baseline.revision !== event.sequence) throw new Error('Baseline revision must equal create event sequence');
      if (this.baselines.has(event.baseline.baselineId)) throw new Error(`Duplicate outline generation baseline: ${event.baseline.baselineId}`);
      this.baselines.set(event.baseline.baselineId, structuredClone(event.baseline));
    } else if (event.kind === 'attach-generated') {
      const baseline = this.requireBaseline(event.baselineId);
      if (baseline.projectId !== event.projectId) throw new Error('Cross-project baseline event');
      if (!baseline.generatedCandidateIds.includes(event.candidateId)) {
        if (baseline.generatedCandidateIds.length >= 32) throw new Error('Generated candidate attachment limit exceeded');
        this.baselines.set(event.baselineId, { ...baseline, generatedCandidateIds: [...baseline.generatedCandidateIds, event.candidateId] });
      }
    } else if (event.kind === 'finalize') {
      const baseline = this.requireBaseline(event.baselineId);
      if (baseline.projectId !== event.projectId) throw new Error('Cross-project baseline event');
      this.baselines.set(event.baselineId, { ...baseline, status: 'finalized', finalizedAt: event.recordedAt });
    } else {
      const baseline = this.requireBaseline(event.baselineId);
      const replacement = this.requireBaseline(event.supersededBy);
      if (baseline.projectId !== event.projectId || replacement.projectId !== event.projectId) throw new Error('Cross-project baseline event');
      this.baselines.set(event.baselineId, { ...baseline, status: 'superseded', supersededBy: event.supersededBy });
    }
    this.sequence = event.sequence;
  }

  private requireOpen(): void {
    if (!this.opened) throw new Error('Outline generation baseline repository is not open');
  }

  private requireBaseline(baselineId: string): OutlineGenerationBaseline {
    const baseline = this.baselines.get(baselineId);
    if (baseline === undefined) throw new Error(`Unknown outline generation baseline: ${baselineId}`);
    return baseline;
  }

  private requireProjectBaseline(projectId: string, baselineId: string): OutlineGenerationBaseline {
    const baseline = this.requireBaseline(baselineId);
    if (baseline.projectId !== projectId) throw new Error(`Baseline belongs to another project: ${baselineId}`);
    return baseline;
  }

  private schedule<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.coordinator.tail.then(operation, operation);
    this.coordinator.tail = run.catch(() => undefined);
    return run;
  }
}
