import { access, mkdir, rename } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { readYaml, writeYaml } from '../io/yaml.js';
import {
  confirmationFileSchema,
  confirmationProposalInputSchema,
  type ConfirmationProposalInput,
  type ConfirmationRecord,
  type ConfirmationStatus,
} from '../schema/confirm.js';
import { entityIdSchema } from '../schema/base.js';

const CONFIRMATION_FILE = 'confirmations.yaml';

interface ConfirmationStore {
  records: ConfirmationRecord[];
  tail: Promise<unknown>;
}

/** Options reserved for deterministic I11 tests; production callers must not enable auto-confirmation. */
export interface ConfirmationGateOptions {
  /** Test-only shortcut that records every valid proposal as accepted. */
  autoConfirmForTests?: boolean;
}

/**
 * Persistent I11 ConfirmationGate (requirements R2-9).
 *
 * Contract / invariants:
 * - A proposal is opaque JSON; this owner never infers or executes its business effect.
 * - A proposal is pending until `accept` or `reject` atomically persists its sole
 *   final Gate decision. Later domain owners must make their own proposal-id-based
 *   business transaction idempotent after observing an accepted decision.
 * - Repeating the same final decision returns the stored record; attempting the
 *   opposite decision fails. Duplicate proposal ids are rejected as replays.
 * - Every in-process Gate for one project shares one serialized store, so no two
 *   instances can race a stale read-modify-write or reuse the temporary file.
 * - Pending records are restored when the project is reopened.
 */
export class ConfirmationGate {
  private static readonly stores = new Map<string, Promise<ConfirmationStore>>();

  private readonly confirmationPath: string;
  private readonly store: ConfirmationStore;
  private readonly autoConfirmForTests: boolean;

  private constructor(confirmationPath: string, store: ConfirmationStore, options: ConfirmationGateOptions) {
    this.confirmationPath = confirmationPath;
    this.store = store;
    this.autoConfirmForTests = options.autoConfirmForTests === true;
  }

  static async open(projectDirectory: string, options: ConfirmationGateOptions = {}): Promise<ConfirmationGate> {
    const confirmationPath = resolve(projectDirectory, CONFIRMATION_FILE);
    let opening = ConfirmationGate.stores.get(confirmationPath);
    if (opening === undefined) {
      opening = ConfirmationGate.loadStore(confirmationPath);
      ConfirmationGate.stores.set(confirmationPath, opening);
      void opening.catch(() => {
        if (ConfirmationGate.stores.get(confirmationPath) === opening) ConfirmationGate.stores.delete(confirmationPath);
      });
    }
    return new ConfirmationGate(confirmationPath, await opening, options);
  }

  /** Propose one opaque operation. Reusing its id is rejected as a replay. */
  propose(input: ConfirmationProposalInput): Promise<ConfirmationRecord> {
    return this.enqueue(async () => {
      const proposal = confirmationProposalInputSchema.parse(input);
      if (this.store.records.some((record) => record.id === proposal.id)) {
        throw new Error(`Duplicate confirmation proposal: ${proposal.id}`);
      }
      const record: ConfirmationRecord = {
        ...proposal,
        version: 1,
        status: this.autoConfirmForTests ? 'accepted' : 'pending',
      };
      await this.persist([...this.store.records, record]);
      this.store.records.push(record);
      return structuredClone(record);
    });
  }

  /** Accept a pending proposal by durably recording the final Gate decision. */
  accept(id: string): Promise<ConfirmationRecord> {
    return this.resolve(id, 'accepted');
  }

  /** Reject a pending proposal by durably recording its final discard decision. */
  reject(id: string): Promise<ConfirmationRecord> {
    return this.resolve(id, 'rejected');
  }

  /** Return one defensive copy of an existing proposal and validate its id. */
  get(id: string): ConfirmationRecord {
    const validatedId = entityIdSchema.parse(id);
    const record = this.store.records.find((item) => item.id === validatedId);
    if (!record) throw new Error(`Unknown confirmation: ${validatedId}`);
    return structuredClone(record);
  }

  /** Return all outstanding proposals in persisted insertion order. */
  pending(): ConfirmationRecord[] {
    return this.store.records.filter((record) => record.status === 'pending').map((record) => structuredClone(record));
  }

  /** Return all persisted decisions in insertion order for auditable consumers. */
  list(): ConfirmationRecord[] {
    return this.store.records.map((record) => structuredClone(record));
  }

  private resolve(id: string, status: Exclude<ConfirmationStatus, 'pending'>): Promise<ConfirmationRecord> {
    return this.enqueue(async () => {
      const validatedId = entityIdSchema.parse(id);
      const index = this.store.records.findIndex((record) => record.id === validatedId);
      if (index === -1) throw new Error(`Unknown confirmation: ${validatedId}`);
      const current = this.store.records[index];
      if (current.status === status) return structuredClone(current);
      if (current.status !== 'pending') {
        throw new Error(`Confirmation already ${current.status}: ${validatedId}`);
      }
      const resolved: ConfirmationRecord = { ...current, status };
      const next = [...this.store.records];
      next[index] = resolved;
      await this.persist(next);
      this.store.records[index] = resolved;
      return structuredClone(resolved);
    });
  }

  private static async loadStore(confirmationPath: string): Promise<ConfirmationStore> {
    try {
      await access(confirmationPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return { records: [], tail: Promise.resolve() };
    }

    try {
      const document = confirmationFileSchema.parse(await readYaml<unknown>(confirmationPath));
      const ids = new Set<string>();
      for (const record of document.confirmations) {
        if (ids.has(record.id)) throw new Error(`Duplicate confirmation id: ${record.id}`);
        ids.add(record.id);
      }
      return { records: document.confirmations, tail: Promise.resolve() };
    } catch (error) {
      throw new Error('Invalid confirmation document', { cause: error });
    }
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.store.tail.then(operation, operation);
    this.store.tail = run.catch(() => undefined);
    return run;
  }

  private async persist(records: ConfirmationRecord[]): Promise<void> {
    await mkdir(dirname(this.confirmationPath), { recursive: true });
    const temporaryPath = `${this.confirmationPath}.tmp`;
    await writeYaml(temporaryPath, { confirmations: records });
    await rename(temporaryPath, this.confirmationPath);
  }
}
