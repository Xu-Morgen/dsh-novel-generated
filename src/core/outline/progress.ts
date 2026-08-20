import { mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { readYaml, writeYaml } from '../io/yaml.js';
import { outlineProgressSchema, type OutlineDeviation, type OutlineProgress, type OutlineProgressInput } from '../schema/outline-progress.js';
import type { Beat, Outline } from '../schema/outline.js';

const PROGRESS_FILE = 'outline-progress.yaml';

/** Host-owned C6 progress repository. B5 remains the canonical plan and is never rewritten here. */
export class OutlineProgressRepository {
  private readonly progressPath: string;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(projectDirectory: string) {
    this.progressPath = join(projectDirectory, PROGRESS_FILE);
  }

  async open(): Promise<void> {
    await mkdir(join(this.progressPath, '..'), { recursive: true });
  }

  async save(input: OutlineProgressInput, outline: Outline): Promise<OutlineProgress> {
    return this.enqueue(async () => {
      const progress = outlineProgressSchema.parse(input);
      assertProgressReferences(progress, outline);
      await writeYaml(`${this.progressPath}.tmp`, progress);
      await rename(`${this.progressPath}.tmp`, this.progressPath);
      return structuredClone(progress);
    });
  }

  async read(outline: Outline): Promise<OutlineProgress> {
    return this.enqueue(async () => {
      try {
        const progress = outlineProgressSchema.parse(await readYaml<unknown>(this.progressPath));
        assertProgressReferences(progress, outline);
        return progress;
      } catch (error) {
        throw new Error('Invalid outline progress document', { cause: error });
      }
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.tail.then(operation, operation);
    this.tail = run.catch(() => undefined);
    return run;
  }
}

/** Validate all C6 ids against the current B5 outline and reject duplicate state entries. */
export function assertProgressReferences(progress: OutlineProgress, outline: Outline): void {
  if (progress.outlineId !== outline.id) throw new Error(`Outline progress ID mismatch: ${progress.outlineId}`);
  const acts = new Map<string, { beats: Map<string, Beat> }>();
  const beats = new Map<string, { actId: string; beat: Beat }>();
  for (const act of outline.acts) {
    if (acts.has(act.id)) throw new Error(`Duplicate act id: ${act.id}`);
    const actBeats = new Map<string, Beat>();
    acts.set(act.id, { beats: actBeats });
    for (const beat of act.beats) {
      if (beats.has(beat.id)) throw new Error(`Duplicate beat id: ${beat.id}`);
      actBeats.set(beat.id, beat);
      beats.set(beat.id, { actId: act.id, beat });
    }
  }
  const current = beats.get(progress.currentBeat);
  if (!current || current.actId !== progress.currentAct) throw new Error(`Unknown current beat: ${progress.currentBeat}`);
  const completed = new Set<string>();
  for (const id of progress.completedBeats) {
    if (!beats.has(id)) throw new Error(`Unknown completed beat: ${id}`);
    if (completed.has(id)) throw new Error(`Duplicate completed beat: ${id}`);
    completed.add(id);
  }
  const deviations = new Set<string>();
  for (const deviation of progress.deviations) {
    if (deviations.has(deviation.id)) throw new Error(`Duplicate deviation id: ${deviation.id}`);
    deviations.add(deviation.id);
  }
}

export function appendDeviation(progress: OutlineProgress, deviation: OutlineDeviation): OutlineProgress {
  if (progress.deviations.some((item) => item.id === deviation.id)) throw new Error(`Duplicate deviation id: ${deviation.id}`);
  return outlineProgressSchema.parse({ ...progress, deviations: [...progress.deviations, deviation] });
}

export function reconcileDeviation(progress: OutlineProgress, deviationId: string): OutlineProgress {
  const found = progress.deviations.some((deviation) => deviation.id === deviationId);
  if (!found) throw new Error(`Unknown deviation: ${deviationId}`);
  return outlineProgressSchema.parse({
    ...progress,
    deviations: progress.deviations.map((deviation) => deviation.id === deviationId
      ? { ...deviation, reconciled: true }
      : deviation),
  });
}
