import { z } from 'zod';
import { baseEntitySchema, entityIdSchema } from './base.js';

/** C3 knowledge kinds from design §5.10. */
export const knowledgeKindSchema = z.enum(['secret', 'foreshadow', 'plotpoint', 'backstory']);
export type KnowledgeKind = z.infer<typeof knowledgeKindSchema>;

/** Revelation status is monotonic: hidden -> partially-revealed -> revealed. */
export const knowledgeStatusSchema = z.enum(['hidden', 'partially-revealed', 'revealed']);
export type KnowledgeStatus = z.infer<typeof knowledgeStatusSchema>;

export const revealPlanSchema = z.object({
  revealTo: z.array(entityIdSchema),
  revealAt: z.string().trim().min(1),
}).strict();
export type RevealPlan = z.infer<typeof revealPlanSchema>;

/** A canonical C3 fact. `holders` is the source-side index of current knowers. */
export const knowledgeEntrySchema = baseEntitySchema.extend({
  fact: z.string().trim().min(1),
  kind: knowledgeKindSchema,
  holders: z.array(entityIdSchema),
  revealPlan: revealPlanSchema,
  status: knowledgeStatusSchema,
}).strict();
export type KnowledgeEntry = z.infer<typeof knowledgeEntrySchema>;
export type KnowledgeEntryInput = Omit<KnowledgeEntry, 'version'> & { version?: number };

/** Per-character C3 state. `knows` must mirror the entry holders index. */
export const knowledgeStateSchema = z.object({
  characterId: entityIdSchema,
  knows: z.array(entityIdSchema),
}).strict();
export type KnowledgeState = z.infer<typeof knowledgeStateSchema>;

export interface KnowledgeDocument {
  readonly entries: readonly KnowledgeEntry[];
  readonly states: readonly KnowledgeState[];
}

/** Monotonic revelation rank (§5.10)：status 只增不退，由 assertKnowledgeOnlyAdvances 与 I66 手动揭示共用。 */
export const knowledgeStatusRank: Record<KnowledgeStatus, number> = {
  hidden: 0,
  'partially-revealed': 1,
  revealed: 2,
};

/** Validate cross-references and the C3 holder/knows bidirectional invariant. */
export function assertKnowledgeStructure(entries: readonly KnowledgeEntry[], states: readonly KnowledgeState[]): void {
  const entryIds = new Set<string>();
  for (const entry of entries) {
    if (entryIds.has(entry.id)) throw new Error(`Duplicate knowledge entry id: ${entry.id}`);
    entryIds.add(entry.id);
    assertUnique(entry.holders, `holder entry: ${entry.id}`);
    assertUnique(entry.revealPlan.revealTo, `reveal target entry: ${entry.id}`);
    if (entry.revealPlan.revealTo.some((id) => entry.holders.includes(id))) {
      throw new Error(`Reveal target is already a holder: ${entry.id}`);
    }
  }
  const stateByCharacter = new Map<string, KnowledgeState>();
  for (const state of states) {
    if (stateByCharacter.has(state.characterId)) throw new Error(`Duplicate knowledge state: ${state.characterId}`);
    assertUnique(state.knows, `knowledge state: ${state.characterId}`);
    for (const id of state.knows) {
      if (!entryIds.has(id)) throw new Error(`Unknown knowledge entry reference: ${id}`);
    }
    stateByCharacter.set(state.characterId, state);
  }
  for (const entry of entries) {
    for (const holder of entry.holders) {
      if (!stateByCharacter.get(holder)?.knows.includes(entry.id)) {
        throw new Error(`Knowledge holder/state mismatch: ${entry.id}/${holder}`);
      }
    }
  }
  for (const state of states) {
    for (const id of state.knows) {
      if (!entries.find((entry) => entry.id === id)?.holders.includes(state.characterId)) {
        throw new Error(`Knowledge state/holder mismatch: ${state.characterId}/${id}`);
      }
    }
  }
}

/** Reject a write that removes knowledge or moves a revelation backwards. */
export function assertKnowledgeOnlyAdvances(
  previous: KnowledgeDocument,
  next: KnowledgeDocument,
): void {
  const nextEntries = new Map(next.entries.map((entry) => [entry.id, entry]));
  for (const oldEntry of previous.entries) {
    const updated = nextEntries.get(oldEntry.id);
    if (!updated) throw new Error(`Knowledge entry cannot be deleted: ${oldEntry.id}`);
    if (!updated.holders.every((id) => oldEntry.holders.includes(id)) && updated.holders.length < oldEntry.holders.length) {
      throw new Error(`Knowledge holders cannot be removed: ${oldEntry.id}`);
    }
    for (const holder of oldEntry.holders) {
      if (!updated.holders.includes(holder)) throw new Error(`Knowledge holder cannot be removed: ${oldEntry.id}/${holder}`);
    }
    if (knowledgeStatusRank[updated.status] < knowledgeStatusRank[oldEntry.status]) {
      throw new Error(`Knowledge status cannot regress: ${oldEntry.id}`);
    }
  }
  const nextStates = new Map(next.states.map((state) => [state.characterId, state]));
  for (const oldState of previous.states) {
    const updated = nextStates.get(oldState.characterId);
    if (!updated) throw new Error(`Knowledge state cannot be deleted: ${oldState.characterId}`);
    for (const id of oldState.knows) {
      if (!updated.knows.includes(id)) throw new Error(`Knowledge cannot be forgotten: ${oldState.characterId}/${id}`);
    }
  }
}

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate knowledge reference in ${label}`);
}
