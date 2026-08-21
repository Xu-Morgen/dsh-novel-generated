import { access, mkdir, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { readYaml, writeYaml } from '../io/yaml.js';
import { adjudicateViolations, type ConsistencyAdjudication } from '../validate/index.js';

export const lifecycleDecisionSchema = z.enum(['accept', 'reject', 'rewrite', 'branch']);
export type LifecycleDecision = z.infer<typeof lifecycleDecisionSchema>;
export const lifecycleStageSchema = z.enum(['c2', 'c1', 'c3', 'c4', 'b2']);
export type LifecycleStage = z.infer<typeof lifecycleStageSchema>;

const lifecycleJournalEntrySchema = z.object({
  id: z.string().min(1),
  status: z.enum(['writing', 'written', 'pending-compensation']),
  committedStages: z.array(lifecycleStageSchema),
  failedStage: lifecycleStageSchema.optional(),
  error: z.string().min(1).optional(),
}).strict();
export type LifecycleJournalEntry = z.infer<typeof lifecycleJournalEntrySchema>;
const lifecycleJournalFileSchema = z.object({ entries: z.array(lifecycleJournalEntrySchema) }).strict();

/**
 * Durable I30 saga receipt owner. It records orchestration progress only: C2,
 * C1, C3, C4 and B2 retain their existing persistence owners (design §6.6).
 * A partial saga is never reported as a successful atomic write.
 */
export class LifecycleJournal {
  private constructor(private readonly path: string, private entries: LifecycleJournalEntry[]) {}

  static async open(projectDirectory: string): Promise<LifecycleJournal> {
    const path = join(projectDirectory, 'lifecycle-journal.yaml');
    try {
      await access(path);
      return new LifecycleJournal(path, lifecycleJournalFileSchema.parse(await readYaml<unknown>(path)).entries);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return new LifecycleJournal(path, []);
    }
  }

  list(): readonly LifecycleJournalEntry[] { return this.entries.map((entry) => structuredClone(entry)); }

  async start(id: string): Promise<void> {
    if (this.entries.some((entry) => entry.id === id)) throw new Error(`Duplicate lifecycle id: ${id}`);
    await this.replace([...this.entries, { id, status: 'writing', committedStages: [] }]);
  }

  async advance(id: string, stage: LifecycleStage): Promise<void> {
    const entry = this.requireWriting(id);
    if (entry.committedStages.includes(stage)) throw new Error(`Lifecycle stage already committed: ${id}/${stage}`);
    await this.update(id, { ...entry, committedStages: [...entry.committedStages, stage] });
  }

  async complete(id: string): Promise<void> {
    const entry = this.requireWriting(id);
    await this.update(id, { ...entry, status: 'written' });
  }

  async compensate(id: string, failedStage: LifecycleStage, cause: unknown): Promise<void> {
    const entry = this.requireWriting(id);
    const error = cause instanceof Error ? cause.message : String(cause);
    await this.update(id, { ...entry, status: 'pending-compensation', failedStage, error });
  }

  private requireWriting(id: string): LifecycleJournalEntry {
    const entry = this.entries.find((item) => item.id === id);
    if (!entry) throw new Error(`Unknown lifecycle id: ${id}`);
    if (entry.status !== 'writing') throw new Error(`Lifecycle is not writable: ${id}`);
    return entry;
  }

  private async update(id: string, next: LifecycleJournalEntry): Promise<void> {
    await this.replace(this.entries.map((entry) => entry.id === id ? next : entry));
  }

  private async replace(entries: LifecycleJournalEntry[]): Promise<void> {
    const next = lifecycleJournalFileSchema.parse({ entries });
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.tmp`;
    await writeYaml(temporary, next);
    await rename(temporary, this.path);
    this.entries = next.entries;
  }
}

export interface LifecycleParsers<T> {
  readonly c2: () => Promise<T>;
  readonly c1: () => Promise<T>;
  readonly c3: () => Promise<T>;
  readonly c4: () => Promise<T>;
  readonly b2: () => Promise<T>;
}

export interface LifecycleWriters<T> {
  readonly c2: (output: T) => Promise<void>;
  readonly c1: (output: T) => Promise<void>;
  readonly c3: (output: T) => Promise<void>;
  readonly c4: (output: T) => Promise<void>;
  /** B2 writes must preserve I11 confirmation-first semantics. */
  readonly b2: (output: T) => Promise<void>;
}

export type LifecycleResult<T> =
  | { readonly status: 'generation-rejected'; readonly afterGeneration: ConsistencyAdjudication }
  | { readonly status: 'decision-rejected'; readonly afterGeneration: ConsistencyAdjudication }
  | { readonly status: 'prewrite-rejected'; readonly afterGeneration: ConsistencyAdjudication; readonly beforeWriteback: ConsistencyAdjudication }
  | { readonly status: 'written'; readonly afterGeneration: ConsistencyAdjudication; readonly beforeWriteback: ConsistencyAdjudication; readonly outputs: Readonly<Record<LifecycleStage, T>> }
  | { readonly status: 'pending-compensation'; readonly afterGeneration: ConsistencyAdjudication; readonly beforeWriteback: ConsistencyAdjudication; readonly outputs: Readonly<Record<LifecycleStage, T>>; readonly failedStage: LifecycleStage };

/**
 * Execute the I30 accepted-prose lifecycle. Recognition may fan out only after
 * an accepted candidate; writes are a serial durable saga in the required
 * C2→C1→C3→C4→B2 order. §9 validation gates run before decision and before
 * the first write. The journal makes any non-atomic failure explicitly pending.
 */
export async function executeLifecycle<T>(input: {
  readonly id: string;
  readonly decision: LifecycleDecision;
  readonly afterGenerationViolations: unknown;
  readonly beforeWritebackViolations: unknown;
  readonly parsers: LifecycleParsers<T>;
  readonly writers: LifecycleWriters<T>;
  readonly journal: LifecycleJournal;
}): Promise<LifecycleResult<T>> {
  const decision = lifecycleDecisionSchema.parse(input.decision);
  const afterGeneration = adjudicateViolations(input.afterGenerationViolations);
  if (afterGeneration.status === 'reject') return { status: 'generation-rejected', afterGeneration };
  if (decision !== 'accept') return { status: 'decision-rejected', afterGeneration };

  const [c2, c1, c3, c4, b2] = await Promise.all([input.parsers.c2(), input.parsers.c1(), input.parsers.c3(), input.parsers.c4(), input.parsers.b2()]);
  const outputs = Object.freeze({ c2, c1, c3, c4, b2 });
  const beforeWriteback = adjudicateViolations(input.beforeWritebackViolations);
  if (beforeWriteback.status === 'reject') return { status: 'prewrite-rejected', afterGeneration, beforeWriteback };

  await input.journal.start(input.id);
  for (const stage of lifecycleStageSchema.options) {
    try {
      await input.writers[stage](outputs[stage]);
      await input.journal.advance(input.id, stage);
    } catch (error) {
      await input.journal.compensate(input.id, stage, error);
      return { status: 'pending-compensation', afterGeneration, beforeWriteback, outputs, failedStage: stage };
    }
  }
  await input.journal.complete(input.id);
  return { status: 'written', afterGeneration, beforeWriteback, outputs };
}
