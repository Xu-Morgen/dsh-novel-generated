import { access, appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  canonEventSchema,
  type CanonCorrectionInput,
  type CanonEvent,
  type CanonEventInput,
  type CanonKind,
} from '../schema/canon.js';

export interface CanonQuery {
  /** Return only events listing this participant id. */
  participant?: string;
  /** Return only events at this exact location. */
  location?: string;
  /** Return only events at this exact storyTime. */
  storyTime?: string;
  /** Return only events whose summary, detail, or location contains the case-insensitive keyword. */
  keyword?: string;
  /** Return only events of this kind. */
  kind?: CanonKind;
  /** `all` (default), `active` (not corrected), or `superseded` (corrected). */
  superseded?: 'all' | 'active' | 'superseded';
}

/** A stored event plus its derived correction marker (`null` when still active). */
export interface CanonEventView extends CanonEvent {
  supersededBy: string | null;
}

/**
 * C4 CanonLedger (design §6.2): append-only `canon.jsonl` canonical fact ledger.
 *
 * Contract / invariants:
 * - Stored lines are never rewritten; `append` and `supersede` only add lines.
 * - `seq` is globally monotonic, starts at 0, and is assigned by the ledger.
 * - Corrections append a `kind: 'correction'` event whose `supersedes` points at
 *   the corrected event; the corrected line is retained and reported as
 *   `supersededBy`. Confirmation gating is wired by I11, not here.
 * - Appends are serialized internally so concurrent callers cannot interleave
 *   two lines and corrupt the monotonic sequence.
 */
export class CanonLedger {
  private readonly filePath: string;
  private readonly events: CanonEvent[] = [];
  private readonly ids = new Set<string>();
  private readonly supersededBy = new Map<string, string>();
  private nextSeq = 0;
  private tail: Promise<unknown> = Promise.resolve();

  private constructor(filePath: string) {
    this.filePath = filePath;
  }

  static async open(canonDirectory: string): Promise<CanonLedger> {
    const filePath = join(canonDirectory, 'canon.jsonl');
    const ledger = new CanonLedger(filePath);
    try {
      await access(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      // Lazily create the ledger directory so a Host service can open a
      // project whose canon dir was never touched (StateEngine does the same).
      await mkdir(canonDirectory, { recursive: true });
      return ledger;
    }
    await ledger.load();
    return ledger;
  }

  private async load(): Promise<void> {
    const content = await readFile(this.filePath, 'utf8');
    const lines = content.split('\n').filter((line) => line.trim() !== '');
    for (const line of lines) {
      let event: CanonEvent;
      try {
        event = canonEventSchema.parse(JSON.parse(line));
      } catch (error) {
        throw new Error(`Invalid canon line: ${line.slice(0, 80)}`, { cause: error });
      }
      this.commit(event);
    }
  }

  /** Validate one event against the in-memory ledger invariants and record it. */
  private commit(event: CanonEvent): void {
    if (this.ids.has(event.id)) throw new Error(`Duplicate canon event id: ${event.id}`);
    if (event.seq !== this.nextSeq) {
      throw new Error(`Canon seq out of order: expected ${this.nextSeq}, got ${event.seq}`);
    }
    if (event.supersedes !== undefined) {
      if (!this.ids.has(event.supersedes)) throw new Error(`supersedes references unknown event: ${event.supersedes}`);
      if (this.supersededBy.has(event.supersedes)) throw new Error(`Event already superseded: ${event.supersedes}`);
      this.supersededBy.set(event.supersedes, event.id);
    }
    this.ids.add(event.id);
    this.events.push(event);
    this.nextSeq = event.seq + 1;
  }

  /** Append one canonical fact and return it with its assigned monotonic seq. */
  append(input: CanonEventInput): Promise<CanonEvent> {
    return this.enqueue(() => this.doAppend(input));
  }

  /**
   * I93 batch append（review v2.0 §8#6 / 计划 §18 I93）：全部校验通过后以
   * 单次 appendFile 写入整批行，再整体内存提交——任何准备/写入失败都不产生
   * 可见部分落库（append-only 语义保持，行为与逐条 append 等价）。
   */
  appendBatch(inputs: readonly CanonEventInput[]): Promise<CanonEvent[]> {
    return this.enqueue(async () => {
      const events = this.prepareAppendBatch(inputs);
      if (events.length === 0) return [];
      await appendFile(this.filePath, events.map((event) => `${JSON.stringify(event)}\n`).join(''), 'utf8');
      for (const event of events) this.commit(event);
      return events.map((event) => ({ ...event }));
    });
  }

  /** Pure preparation: build seq-contiguous events and reject any invalid input before a single write. */
  private prepareAppendBatch(inputs: readonly CanonEventInput[]): CanonEvent[] {
    const events: CanonEvent[] = [];
    for (const input of inputs) {
      if (input.kind === 'correction') throw new Error('Use supersede() to append a correction event');
      if (this.ids.has(input.id) || events.some((event) => event.id === input.id)) {
        throw new Error(`Duplicate canon event id: ${input.id}`);
      }
      events.push(canonEventSchema.parse({ ...input, seq: this.nextSeq + events.length, immutable: true }));
    }
    return events;
  }

  /** Append a correction that supersedes an existing event without rewriting it. */
  supersede(targetId: string, correction: CanonCorrectionInput): Promise<CanonEvent> {
    return this.enqueue(() => this.doSupersede(targetId, correction));
  }

  private async doAppend(input: CanonEventInput): Promise<CanonEvent> {
    if (input.kind === 'correction') throw new Error('Use supersede() to append a correction event');
    if (this.ids.has(input.id)) throw new Error(`Duplicate canon event id: ${input.id}`);
    const event = canonEventSchema.parse({ ...input, seq: this.nextSeq, immutable: true });
    await this.appendLine(event);
    this.commit(event);
    return { ...event };
  }

  private async doSupersede(targetId: string, correction: CanonCorrectionInput): Promise<CanonEvent> {
    if (!this.ids.has(targetId)) throw new Error(`Unknown canon event: ${targetId}`);
    if (this.supersededBy.has(targetId)) throw new Error(`Event already superseded: ${targetId}`);
    if (this.ids.has(correction.id)) throw new Error(`Duplicate canon event id: ${correction.id}`);
    const event = canonEventSchema.parse({
      ...correction, seq: this.nextSeq, kind: 'correction', supersedes: targetId, immutable: true,
    });
    await this.appendLine(event);
    this.commit(event);
    return { ...event };
  }

  /** Deterministic, seq-ordered query over the retained ledger. */
  query(filter: CanonQuery = {}): CanonEventView[] {
    const superseded = filter.superseded ?? 'all';
    return this.events
      .filter((event) => {
        if (filter.participant !== undefined && !event.participants.includes(filter.participant)) return false;
        if (filter.location !== undefined && event.location !== filter.location) return false;
        if (filter.storyTime !== undefined && event.storyTime !== filter.storyTime) return false;
        if (filter.kind !== undefined && event.kind !== filter.kind) return false;
        if (filter.keyword !== undefined) {
          const needle = filter.keyword.toLowerCase();
          const haystack = `${event.summary}\n${event.detail}\n${event.location}`.toLowerCase();
          if (!haystack.includes(needle)) return false;
        }
        return true;
      })
      .filter((event) => {
        const marker = this.supersededBy.get(event.id) ?? null;
        if (superseded === 'active' && marker !== null) return false;
        if (superseded === 'superseded' && marker === null) return false;
        return true;
      })
      .map((event) => ({ ...event, supersededBy: this.supersededBy.get(event.id) ?? null }));
  }

  /** Fetch one event by seq; seq equals its index because seq is contiguous from 0. */
  get(seq: number): CanonEventView {
    if (!Number.isInteger(seq) || seq < 0 || seq >= this.nextSeq) throw new Error(`Unknown canon seq: ${seq}`);
    const event = this.events[seq];
    return { ...event, supersededBy: this.supersededBy.get(event.id) ?? null };
  }

  count(): number {
    return this.events.length;
  }

  /** Serialize appends so concurrent callers cannot corrupt the monotonic sequence. */
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.tail.then(operation, operation);
    this.tail = run.catch(() => undefined);
    return run;
  }

  private async appendLine(event: CanonEvent): Promise<void> {
    await appendFile(this.filePath, `${JSON.stringify(event)}\n`, 'utf8');
  }
}
