import { access, mkdir, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { readYaml, writeYaml } from '../io/yaml.js';
import { stateSnapshotFileSchema, worldStateSchema, type WorldState } from '../schema/state.js';

export interface StateChange {
  path: string;
  before: unknown;
  after: unknown;
}

export interface StateDiff {
  fromSeq: number;
  toSeq: number;
  changes: StateChange[];
}

export type StateDraft = Omit<WorldState, 'seq'> & { seq?: number };
export type StateMutator = (draft: StateDraft) => void;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function compare(before: unknown, after: unknown, path: string, changes: StateChange[]): void {
  if (Object.is(before, after)) return;
  if (before && after && typeof before === 'object' && typeof after === 'object') {
    if (Array.isArray(before) && Array.isArray(after)) {
      const length = Math.max(before.length, after.length);
      for (let index = 0; index < length; index += 1) {
        compare(before[index], after[index], `${path}[${index}]`, changes);
      }
      return;
    }
    if (!Array.isArray(before) && !Array.isArray(after)) {
      const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
      for (const key of keys) {
        compare((before as Record<string, unknown>)[key], (after as Record<string, unknown>)[key],
          path ? `${path}.${key}` : key, changes);
      }
      return;
    }
  }
  changes.push({ path, before: clone(before), after: clone(after) });
}

/**
 * C2 StateEngine: append-only snapshots with monotonic sequence numbers.
 * A transaction validates a complete candidate before one persistence write.
 */
export class StateEngine {
  private readonly snapshotPath: string;
  private snapshots: WorldState[];

  private constructor(snapshotPath: string, snapshots: WorldState[]) {
    this.snapshotPath = snapshotPath;
    this.snapshots = snapshots;
  }

  static async open(stateDirectory: string, initial: Omit<WorldState, 'seq'>): Promise<StateEngine> {
    const snapshotPath = join(stateDirectory, 'snapshots.yaml');
    try {
      await access(snapshotPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const first = worldStateSchema.parse({ ...initial, seq: 0 });
      const engine = new StateEngine(snapshotPath, [first]);
      await engine.persist();
      return engine;
    }
    const loaded = stateSnapshotFileSchema.parse(await readYaml<unknown>(snapshotPath));
    for (let index = 1; index < loaded.snapshots.length; index += 1) {
      if (loaded.snapshots[index].seq <= loaded.snapshots[index - 1].seq) {
        throw new Error('State snapshot sequence must be strictly increasing');
      }
    }
    return new StateEngine(snapshotPath, loaded.snapshots);
  }

  /** Return a defensive copy of the current snapshot. */
  current(): WorldState { return clone(this.snapshots.at(-1)!); }

  /** Return defensive copies of every retained snapshot for the C2 read panel. */
  snapshotsList(): WorldState[] { return this.snapshots.map((snapshot) => clone(snapshot)); }

  /** Return a defensive copy of a historical snapshot. */
  snapshot(seq: number): WorldState {
    if (!Number.isInteger(seq) || seq < 0) throw new Error('Invalid snapshot sequence');
    const found = this.snapshots.find((item) => item.seq === seq);
    if (!found) throw new Error(`Unknown snapshot sequence: ${seq}`);
    return clone(found);
  }

  /** Apply all draft changes atomically as one new snapshot. */
  async transaction(mutator: StateMutator): Promise<WorldState> {
    const draft = clone(this.current()) as StateDraft;
    delete draft.seq;
    mutator(draft);
    const next = worldStateSchema.parse({ ...draft, seq: this.current().seq + 1 });
    this.snapshots.push(next);
    try {
      await this.persist();
    } catch (error) {
      this.snapshots.pop();
      throw error;
    }
    return clone(next);
  }

  /** Roll back values by creating a new monotonic snapshot from an old one. */
  async rollback(targetSeq: number): Promise<WorldState> {
    const target = this.snapshot(targetSeq);
    return this.transaction((draft) => {
      Object.assign(draft, target);
      delete draft.seq;
    });
  }

  /** Produce a stable, recursively expanded diff between retained snapshots. */
  diff(fromSeq: number, toSeq: number): StateDiff {
    const { seq: _fromSeq, ...before } = this.snapshot(fromSeq);
    const { seq: _toSeq, ...after } = this.snapshot(toSeq);
    const changes: StateChange[] = [];
    compare(before, after, '', changes);
    return { fromSeq, toSeq, changes };
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.snapshotPath), { recursive: true });
    const temporary = `${this.snapshotPath}.tmp`;
    await writeYaml(temporary, { snapshots: this.snapshots });
    await rename(temporary, this.snapshotPath);
  }
}
