import { access, mkdir, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { readYaml, writeYaml } from '../io/yaml.js';
import { validateProjectId } from '../io/path.js';
import {
  REFERENCE_AUDIT_MAX_PAGE_SIZE,
  REFERENCE_AUDIT_DEFAULT_PAGE_SIZE,
  referenceAuditListInputSchema,
  referenceAuditListResultSchema,
  referenceAuditRecordInputSchema,
  referenceAuditRecordSchema,
  type ReferenceAuditListOptions,
  type ReferenceAuditListInput,
  type ReferenceAuditListResult,
  type ReferenceAuditRecord,
  type ReferenceAuditRecordInput,
} from '../schema/reference-audit.js';

const referenceAuditFileSchema = z.object({ records: referenceAuditRecordSchema.array() }).strict();

/**
 * I116 Host operational journal. It is an outbox/status mechanism only:
 * C1/C3/C4 repositories remain the narrative owners and this file is never
 * exported as a layer, Markdown, or portable manuscript (design §14.14.2).
 */
export class ReferenceAuditJournal {
  private tail: Promise<unknown> = Promise.resolve();

  private constructor(private readonly path: string, private records: ReferenceAuditRecord[]) {}

  /** Open an existing journal strictly; malformed existing state fails closed. */
  static async open(projectDirectory: string): Promise<ReferenceAuditJournal> {
    const path = join(projectDirectory, 'reference-audit.yaml');
    try {
      await access(path);
      const parsed = referenceAuditFileSchema.safeParse(await readYaml<unknown>(path));
      if (!parsed.success) throw new Error('Reference audit journal schema is invalid', { cause: parsed.error });
      return new ReferenceAuditJournal(path, parsed.data.records.map((record) => structuredClone(record)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Invalid reference audit journal', { cause: error });
      return new ReferenceAuditJournal(path, []);
    }
  }

  /** Synchronous in-memory lookup used by a Host UoW before its next journal step. */
  find(projectId: string, operationId: string): ReferenceAuditRecord | undefined {
    validateProjectId(projectId);
    const record = this.records.find((candidate) => candidate.projectId === projectId && candidate.operationId === operationId);
    return record === undefined ? undefined : structuredClone(record);
  }

  /**
   * Append one pending operation atomically. Reusing an operation ID with a
   * different source/target set is rejected; the same payload is idempotent.
   */
  async ensurePending(input: ReferenceAuditRecordInput, now: () => string = () => new Date().toISOString()): Promise<ReferenceAuditRecord> {
    const normalized = referenceAuditRecordInputSchema.parse(input);
    return this.enqueue(async () => {
      const existing = this.records.find((record) => record.projectId === normalized.projectId && record.operationId === normalized.operationId);
      if (existing !== undefined) {
        if (!samePayload(existing, normalized)) throw new Error(`Reference audit operation was reused with a different payload: ${normalized.operationId}`);
        return structuredClone(existing);
      }
      const timestamp = now();
      const next = referenceAuditRecordSchema.parse({
        ...normalized,
        recordId: normalized.operationId,
        status: 'pending',
        attempt: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      await this.replace([...this.records, next]);
      return structuredClone(next);
    });
  }

  /** Mark an operation complete without duplicating the apply. */
  async markApplied(projectId: string, operationId: string, now: () => string = () => new Date().toISOString()): Promise<ReferenceAuditRecord> {
    validateProjectId(projectId);
    return this.enqueue(async () => {
      const existing = this.require(projectId, operationId);
      if (existing.status === 'applied') return structuredClone(existing);
      if (existing.status === 'failed') throw new Error(`Failed reference audit operation must be retried first: ${operationId}`);
      const next = referenceAuditRecordSchema.parse({ ...existing, status: 'applied', updatedAt: now() });
      await this.replace(this.records.map((record) => record === existing ? next : record));
      return structuredClone(next);
    });
  }

  /** Persist a failed attempt after the Host UoW has compensated its owners. */
  async markFailed(projectId: string, operationId: string, error: string, now: () => string = () => new Date().toISOString()): Promise<ReferenceAuditRecord> {
    validateProjectId(projectId);
    const message = z.string().trim().min(1).max(2_000).parse(error);
    return this.enqueue(async () => {
      const existing = this.require(projectId, operationId);
      if (existing.status === 'applied') return structuredClone(existing);
      const next = referenceAuditRecordSchema.parse({ ...existing, status: 'failed', error: message, updatedAt: now() });
      await this.replace(this.records.map((record) => record === existing ? next : record));
      return structuredClone(next);
    });
  }

  /** Explicit Host retry transition; no narrative owner is touched here. */
  async retry(projectId: string, operationId: string, now: () => string = () => new Date().toISOString()): Promise<ReferenceAuditRecord> {
    validateProjectId(projectId);
    return this.enqueue(async () => {
      const existing = this.require(projectId, operationId);
      if (existing.status === 'pending' || existing.status === 'applied') return structuredClone(existing);
      const { error: _error, ...withoutError } = existing;
      const next = referenceAuditRecordSchema.parse({ ...withoutError, status: 'pending', attempt: existing.attempt + 1, updatedAt: now() });
      await this.replace(this.records.map((record) => record === existing ? next : record));
      return structuredClone(next);
    });
  }

  /** Return deterministic, bounded projection sorted by creation then stable ID. */
  list(projectId: string, input?: ReferenceAuditListOptions | ReferenceAuditListInput): ReferenceAuditListResult {
    validateProjectId(projectId);
    const options = referenceAuditListInputSchema.parse(input ?? {});
    const limit = options.limit ?? REFERENCE_AUDIT_DEFAULT_PAGE_SIZE;
    const start = options.cursor === undefined ? 0 : Number(options.cursor);
    const filtered = this.records
      .filter((record) => record.projectId === projectId)
      .filter((record) => options.owner === undefined || record.targets.some((target) => target.owner === options.owner))
      .filter((record) => options.status === undefined || record.status === options.status)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.recordId.localeCompare(right.recordId));
    const page = filtered.slice(start, start + limit).map((record) => structuredClone(record));
    const nextCursor = start + limit < filtered.length ? String(start + limit) : null;
    return referenceAuditListResultSchema.parse({ projectId, records: page, nextCursor });
  }

  private require(projectId: string, operationId: string): ReferenceAuditRecord {
    const record = this.records.find((candidate) => candidate.projectId === projectId && candidate.operationId === operationId);
    if (record === undefined) throw new Error(`Unknown reference audit operation: ${operationId}`);
    return record;
  }

  private async replace(records: ReferenceAuditRecord[]): Promise<void> {
    const next = referenceAuditFileSchema.parse({ records });
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.tmp`;
    await writeYaml(temporary, next);
    await rename(temporary, this.path);
    this.records = next.records;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.tail.then(operation, operation);
    this.tail = run.catch(() => undefined);
    return run;
  }
}

function samePayload(record: ReferenceAuditRecord, input: ReferenceAuditRecordInput): boolean {
  return JSON.stringify({ projectId: record.projectId, operationId: record.operationId, source: record.source, targets: record.targets })
    === JSON.stringify(input);
}

export { REFERENCE_AUDIT_DEFAULT_PAGE_SIZE, REFERENCE_AUDIT_MAX_PAGE_SIZE };
export type { ReferenceAuditRecord, ReferenceAuditRecordInput };
