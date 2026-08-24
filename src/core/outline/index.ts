import { mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { readYaml, writeYaml } from '../io/yaml.js';
import {
  outlineSchema,
  type DetailBeat,
  type Outline,
  type OutlineBeatCard,
  type OutlineInput,
} from '../schema/outline.js';

const OUTLINE_FILE = 'outline.yaml';

/**
 * B5 outline repository (design §5.7 / §10.1). The one outline.yaml document
 * is the canonical outline source; detail beats remain nested scene cards.
 *
 * Invariants: every read re-validates strict schema data, all ids are portable,
 * and prerequisites reference an existing beat in the same outline. I14 does
 * not own C6 progress, navigation, deviation reconciliation, or UI state.
 */
export class OutlineRepository {
  private readonly outlinePath: string;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(projectDirectory: string) {
    this.outlinePath = join(projectDirectory, OUTLINE_FILE);
  }

  async open(): Promise<void> {
    await mkdir(join(this.outlinePath, '..'), { recursive: true });
  }

  async save(input: OutlineInput): Promise<Outline> {
    return this.enqueue(async () => {
      const outline = outlineSchema.parse({ ...input, version: input.version ?? 1 });
      this.assertValidStructure(outline);
      await this.writeDocument(outline);
      return structuredClone(outline);
    });
  }

  /** Read-only bootstrap classification; never rewrites the outline bytes. */
  async readiness(): Promise<'ready' | 'uninitialized' | 'corrupt'> {
    try {
      const raw = await readYaml<unknown>(this.outlinePath);
      if (raw !== null && typeof raw === 'object' && !Array.isArray(raw) && Object.keys(raw as object).length === 0) return 'uninitialized';
      try {
        const outline = outlineSchema.parse(raw);
        this.assertValidStructure(outline);
        return 'ready';
      } catch {
        return 'corrupt';
      }
    } catch (error) {
      if (error instanceof Error && (error.cause as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') return 'uninitialized';
      throw error;
    }
  }

  async read(): Promise<Outline> {
    return this.enqueue(async () => {
      const raw = await readYaml<unknown>(this.outlinePath);
      try {
        const outline = outlineSchema.parse(raw);
        this.assertValidStructure(outline);
        return outline;
      } catch (error) {
        throw new Error('Invalid outline document', { cause: error });
      }
    });
  }

  /** Enumerate every scene card in act/index, beat/id order for consumers. */
  async beatCards(): Promise<OutlineBeatCard[]> {
    const outline = await this.read();
    return outline.acts
      .slice()
      .sort((left, right) => left.index - right.index || left.id.localeCompare(right.id))
      .flatMap((act) => act.beats
        .slice()
        .sort((left, right) => left.id.localeCompare(right.id))
        .flatMap((beat) => beat.detailBeats.map((detailBeat): OutlineBeatCard => ({
          actId: act.id,
          beatId: beat.id,
          beatTitle: beat.title,
          detailBeat: structuredClone(detailBeat),
        }))));
  }

  private assertValidStructure(outline: Outline): void {
    const acts = new Set<string>();
    const beats = new Set<string>();
    for (const act of outline.acts) {
      if (acts.has(act.id)) throw new Error(`Duplicate act id: ${act.id}`);
      acts.add(act.id);
      for (const beat of act.beats) {
        if (beats.has(beat.id)) throw new Error(`Duplicate beat id: ${beat.id}`);
        beats.add(beat.id);
      }
    }
    for (const act of outline.acts) {
      for (const beat of act.beats) {
        const missing = beat.prerequisites.filter((id) => !beats.has(id));
        if (missing.length > 0) throw new Error(`Unknown beat prerequisite: ${missing.join(', ')}`);
        const detailIds = new Set<string>();
        for (const detailBeat of beat.detailBeats) {
          if (detailIds.has(detailBeat.id)) throw new Error(`Duplicate detail beat id: ${detailBeat.id}`);
          detailIds.add(detailBeat.id);
        }
      }
    }
  }

  private async writeDocument(outline: Outline): Promise<void> {
    const temporaryPath = `${this.outlinePath}.tmp`;
    await writeYaml(temporaryPath, outline);
    await rename(temporaryPath, this.outlinePath);
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.tail.then(operation, operation);
    this.tail = run.catch(() => undefined);
    return run;
  }
}

export { OutlineNavigator } from './navigator.js';
export { OutlineProgressRepository, appendDeviation, assertProgressReferences, reconcileDeviation } from './progress.js';
export type { OutlineNavigation, OutlineDeviation, OutlineProgress, OutlineProgressInput } from '../schema/outline-progress.js';
export type { DetailBeat, Outline, OutlineBeatCard, OutlineInput } from '../schema/outline.js';
