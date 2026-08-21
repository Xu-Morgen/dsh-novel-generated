import {
  assertKnowledgeStructure,
  knowledgeEntrySchema,
  knowledgeStateSchema,
  type KnowledgeEntry,
  type KnowledgeState,
} from '../schema/knowledge.js';

/** Deterministic C3 view supplied to a prompt assembler for one POV. */
export interface FilteredKnowledge {
  readonly pov: string;
  readonly entries: readonly KnowledgeEntry[];
  readonly state: KnowledgeState;
}

/**
 * Filter C3 exclusively through `KnowledgeState.knows` for the requested POV.
 * C1 relationship publicity (`knownTo`) is intentionally not accepted here.
 */
export function filterKnowledge(
  pov: string,
  entries: readonly KnowledgeEntry[],
  states: readonly KnowledgeState[],
): FilteredKnowledge {
  const parsedEntries = entries.map((entry) => knowledgeEntrySchema.parse(entry));
  const parsedStates = states.map((candidate) => knowledgeStateSchema.parse(candidate));
  const state = parsedStates.find((candidate) => candidate.characterId === pov);
  if (!state) throw new Error(`Knowledge state is missing for POV: ${pov}`);
  assertKnowledgeStructure(parsedEntries, parsedStates);
  const byId = new Map(parsedEntries.map((entry) => [entry.id, entry]));
  const visible = state.knows.map((id) => byId.get(id)!).sort((left, right) => left.id.localeCompare(right.id));
  return Object.freeze({ pov, entries: Object.freeze(structuredClone(visible)), state: structuredClone(state) });
}
