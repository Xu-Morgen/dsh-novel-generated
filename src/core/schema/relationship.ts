/** C1 relationship types and persisted contract (design §5.8 / requirements R1-C1). */
import { z } from 'zod';
import { baseEntitySchema, entityIdSchema } from './base.js';

export const relationshipTypeSchema = z.enum([
  'kin',
  'romantic',
  'friendship',
  'rivalry',
  'enmity',
  'allegiance',
  'mentor',
  'subordinate',
]);
export type RelationshipType = z.infer<typeof relationshipTypeSchema>;

/**
 * C1 only models relationship publicity. It is intentionally not a C3
 * knowledge/holder field; POV knowledge filtering belongs to KnowledgeFilter.
 */
export const relationshipSchema = baseEntitySchema.extend({
  from: entityIdSchema,
  to: entityIdSchema,
  type: relationshipTypeSchema,
  affinity: z.number().int().min(-100).max(100),
  trust: z.number().int().min(0).max(100),
  status: z.string().trim().min(1),
  milestones: z.array(entityIdSchema),
  knownTo: z.array(entityIdSchema),
}).strict();
export type Relationship = z.infer<typeof relationshipSchema>;
export type RelationshipInput = Omit<Relationship, 'version'> & { version?: number };

export interface RelationshipSummarySource {
  readonly relationships: readonly Relationship[];
  /** Scene character IDs; only pairs with both endpoints in this slice are injected. */
  readonly characterIds: readonly string[];
}

export interface RelationshipSummary {
  readonly relationship: Relationship;
  readonly from: string;
  readonly to: string;
}

export function relationshipSummary(
  source: RelationshipSummarySource,
): RelationshipSummary[] {
  const ids = new Set(source.characterIds);
  return source.relationships
    .filter((item) => ids.has(item.from) && ids.has(item.to))
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((relationship) => ({ relationship, from: relationship.from, to: relationship.to }));
}

export function assertRelationshipStructure(relationships: readonly Relationship[]): void {
  const ids = new Set<string>();
  for (const relationship of relationships) {
    if (ids.has(relationship.id)) throw new Error(`Duplicate relationship id: ${relationship.id}`);
    ids.add(relationship.id);
    if (relationship.from === relationship.to) {
      throw new Error(`Relationship endpoints must differ: ${relationship.id}`);
    }
    if (new Set(relationship.knownTo).size !== relationship.knownTo.length) {
      throw new Error(`Duplicate knownTo entry: ${relationship.id}`);
    }
    if (new Set(relationship.milestones).size !== relationship.milestones.length) {
      throw new Error(`Duplicate milestone entry: ${relationship.id}`);
    }
  }
}
