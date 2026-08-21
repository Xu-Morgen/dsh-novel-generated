import { mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { readYaml, writeYaml } from '../io/yaml.js';
import {
  assertKnowledgeOnlyAdvances,
  assertKnowledgeStructure,
  knowledgeEntrySchema,
  knowledgeStateSchema,
  type KnowledgeDocument,
  type KnowledgeEntry,
  type KnowledgeEntryInput,
  type KnowledgeState,
} from '../schema/knowledge.js';

const KNOWLEDGE_FILE = 'knowledge.yaml';

/**
 * Host-owned C3 repository. The YAML document is authoritative; every mutation
 * validates the complete bidirectional holders/knows graph before replacing it.
 */
export class KnowledgeRepository {
  private readonly knowledgePath: string;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(projectDirectory: string) { this.knowledgePath = join(projectDirectory, KNOWLEDGE_FILE); }

  async open(): Promise<void> { await mkdir(join(this.knowledgePath, '..'), { recursive: true }); }

  async saveAll(entries: readonly KnowledgeEntry[], states: readonly KnowledgeState[]): Promise<KnowledgeDocument> {
    return this.enqueue(async () => {
      const next = this.parseDocument(entries, states);
      const previous = await this.readOptional();
      if (previous) assertKnowledgeOnlyAdvances(previous, next);
      await this.writeDocument(next);
      return cloneDocument(next);
    });
  }

  async saveEntry(input: KnowledgeEntryInput, states: readonly KnowledgeState[]): Promise<KnowledgeEntry> {
    return this.enqueue(async () => {
      const entry = knowledgeEntrySchema.parse({ ...input, version: input.version ?? 1 });
      const current = await this.readOptional();
      const entries = (current?.entries ?? []).filter((item) => item.id !== entry.id).concat(entry);
      const next = this.parseDocument(entries, states);
      if (current) assertKnowledgeOnlyAdvances(current, next);
      await this.writeDocument(next);
      return structuredClone(entry);
    });
  }

  async read(): Promise<KnowledgeDocument> {
    return this.enqueue(async () => {
      const raw = await readYaml<unknown>(this.knowledgePath);
      try {
        return cloneDocument(this.parseRaw(raw));
      } catch (error) {
        throw new Error('Invalid knowledge document', { cause: error });
      }
    });
  }

  private async readOptional(): Promise<KnowledgeDocument | undefined> {
    try { return this.parseRaw(await readYaml<unknown>(this.knowledgePath)); }
    catch (error) {
      if (error instanceof Error && /ENOENT/.test(String(error.cause))) return undefined;
      throw error;
    }
  }

  private parseDocument(entries: readonly KnowledgeEntry[], states: readonly KnowledgeState[]): KnowledgeDocument {
    const parsedEntries = entries.map((entry) => knowledgeEntrySchema.parse(entry));
    const parsedStates = states.map((state) => knowledgeStateSchema.parse(state));
    assertKnowledgeStructure(parsedEntries, parsedStates);
    return { entries: parsedEntries, states: parsedStates };
  }

  private parseRaw(raw: unknown): KnowledgeDocument {
    if (!raw || typeof raw !== 'object') throw new Error('Knowledge document must be an object');
    const value = raw as { entries?: unknown; states?: unknown };
    return this.parseDocument(
      knowledgeEntrySchema.array().parse(value.entries),
      knowledgeStateSchema.array().parse(value.states),
    );
  }

  private async writeDocument(document: KnowledgeDocument): Promise<void> {
    const temporaryPath = `${this.knowledgePath}.tmp`;
    await writeYaml(temporaryPath, document);
    await rename(temporaryPath, this.knowledgePath);
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.tail.then(operation, operation);
    this.tail = run.catch(() => undefined);
    return run;
  }
}

function cloneDocument(document: KnowledgeDocument): KnowledgeDocument {
  return structuredClone(document);
}

export type {
  KnowledgeDocument,
  KnowledgeEntry,
  KnowledgeEntryInput,
  KnowledgeKind,
  KnowledgeState,
  KnowledgeStatus,
  RevealPlan,
} from '../schema/knowledge.js';
export {
  assertKnowledgeOnlyAdvances,
  assertKnowledgeStructure,
  knowledgeEntrySchema,
  knowledgeKindSchema,
  knowledgeStateSchema,
  knowledgeStatusSchema,
  revealPlanSchema,
} from '../schema/knowledge.js';
