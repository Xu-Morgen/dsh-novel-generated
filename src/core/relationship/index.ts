import { mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { readYaml, writeYaml } from '../io/yaml.js';
import {
  assertRelationshipStructure,
  relationshipSchema,
  type Relationship,
  type RelationshipInput,
} from '../schema/relationship.js';

const RELATIONSHIPS_FILE = 'relationships.yaml';

/**
 * C1 file repository. The complete relationship list is one canonical YAML
 * document; each read validates strict schema and graph invariants. I16 does
 * not calculate changes or expose a parser writer.
 */
export class RelationshipRepository {
  private readonly relationshipsPath: string;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(projectDirectory: string) {
    this.relationshipsPath = join(projectDirectory, RELATIONSHIPS_FILE);
  }

  async open(): Promise<void> {
    await mkdir(join(this.relationshipsPath, '..'), { recursive: true });
  }

  async save(input: RelationshipInput): Promise<Relationship> {
    return this.enqueue(async () => {
      const relationship = relationshipSchema.parse({ ...input, version: input.version ?? 1 });
      const existing = await this.readOptional();
      const relationships = existing.filter((item) => item.id !== relationship.id).concat(relationship);
      assertRelationshipStructure(relationships);
      await this.writeDocument(relationships);
      return structuredClone(relationship);
    });
  }

  async saveAll(inputs: readonly RelationshipInput[]): Promise<Relationship[]> {
    return this.enqueue(async () => {
      const relationships = inputs.map((input) => relationshipSchema.parse({ ...input, version: input.version ?? 1 }));
      assertRelationshipStructure(relationships);
      await this.writeDocument(relationships);
      return structuredClone(relationships);
    });
  }

  async read(): Promise<Relationship[]> {
    return this.enqueue(async () => {
      const raw = await readYaml<unknown>(this.relationshipsPath);
      try {
        const relationships = relationshipListSchema.parse(raw);
        assertRelationshipStructure(relationships);
        return structuredClone(relationships);
      } catch (error) {
        throw new Error('Invalid relationships document', { cause: error });
      }
    });
  }

  private async readOptional(): Promise<Relationship[]> {
    try {
      const raw = await readYaml<unknown>(this.relationshipsPath);
      const relationships = relationshipListSchema.parse(raw);
      assertRelationshipStructure(relationships);
      return relationships;
    } catch (error) {
      if (error instanceof Error && /ENOENT/.test(String(error.cause))) return [];
      throw error;
    }
  }

  private async writeDocument(relationships: readonly Relationship[]): Promise<void> {
    const temporaryPath = `${this.relationshipsPath}.tmp`;
    await writeYaml(temporaryPath, relationships);
    await rename(temporaryPath, this.relationshipsPath);
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.tail.then(operation, operation);
    this.tail = run.catch(() => undefined);
    return run;
  }
}

const relationshipListSchema = relationshipSchema.array();

export { assertRelationshipStructure } from '../schema/relationship.js';
export type { Relationship, RelationshipInput, RelationshipSummary, RelationshipSummarySource } from '../schema/relationship.js';
export { relationshipSummary } from '../schema/relationship.js';
