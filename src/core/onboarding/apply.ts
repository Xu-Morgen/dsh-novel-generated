import type { OnboardingLayers, OnboardingLayerKey, OnboardingWorldview } from '../schema/onboarding.js';
import type { OnboardingAcceptedLayer } from '../schema/onboarding.js';

/**
 * I53 six-layer landing orchestrator core (design §14.7.4 / R11-4).
 *
 * This module owns pure, deterministic adjudication math shared by the Host
 * facade: it has no persistence and no LLM. Its two responsibilities are:
 *
 * 1. `topologicalWorldviewOrder` — order B2 candidates parent-first with a
 *    stable tiebreak, rejecting cycles and missing parents (both are fail-closed
 *    *before* any create is attempted).
 * 2. `collectAcceptedLayers` / `activeProposalLayers` — derive, from a set of
 *    accepted layer candidates, exactly which layers will be applied and which
 *    references may legally be satisfied.
 *
 * The Host facade consumes these helpers and drives the existing Domain
 * Services (B3 → B2 → B5 → C2 → C4 → C1); it is the only place a layer write
 * happens, and it treats every layer as its own failure domain.
 */

/** B2 candidate ids present in this onboarding session's candidate set. */
export function worldviewCandidateIds(layers: OnboardingLayers): Set<string> {
  return new Set(layers.worldview.candidates.map((entry) => entry.id));
}

/**
 * Order a set of B2 candidates parent-first (children after parents) using a
 * deterministic algorithm. Returns the ids in creation order and throws on any
 * cycle or on a parent that is neither a candidate in `active` nor an existing
 * project entry (both fail closed before any write — design §14.7.4).
 */
export function topologicalWorldviewOrder(
  candidates: readonly OnboardingWorldview[],
  existingIds: ReadonlySet<string>,
): string[] {
  const byId = new Map(candidates.map((entry) => [entry.id, entry]));
  // A valid parent is either another active candidate or an already-existing id.
  const known = new Set<string>([...byId.keys(), ...existingIds]);
  for (const entry of candidates) {
    if (entry.parent !== null && !known.has(entry.parent)) {
      throw new Error(`B2 parent reference is missing: ${entry.parent}`);
    }
  }

  const order: string[] = [];
  const visited = new Set<string>(); // finished
  const visiting = new Set<string>(); // on the current DFS stack
  const sortedIds = [...byId.keys()].sort();

  const visit = (id: string): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error(`B2 parent cycle detected at: ${id}`);
    visiting.add(id);
    const parent = byId.get(id)?.parent ?? null;
    if (parent !== null && byId.has(parent)) visit(parent);
    visiting.delete(id);
    visited.add(id);
    order.push(id);
  };

  for (const id of sortedIds) visit(id);
  return order;
}

/** The exact six layer keys in apply order (design §14.7.4). */
export const APPLY_ORDER: readonly OnboardingLayerKey[] = ['characters', 'worldview', 'outline', 'state', 'canon', 'relationship'];

/**
 * Collect the accepted layers a final apply may consume.
 *
 * `accepted` is a map of layer → accepted candidate value. It is the caller's
 * responsibility (the Host facade) to ensure each accepted candidate was
 * authorized by an `accepted` Gate record; this core only does geometry.
 */
export function collectAcceptedLayers(
  accepted: Readonly<Partial<Record<OnboardingLayerKey, OnboardingAcceptedLayer>>>,
): OnboardingLayerKey[] {
  return APPLY_ORDER.filter((key) => accepted[key] !== undefined);
}

/**
 * Reference-preflight geometry: given the ids the apply will make available
 * (accepted B3 candidate ids + already-existing B3 ids) and the already-applied
 * C4 ids, report the id sets a validator may consult.
 *
 * The actual per-layer schema/reference validation lives in the Host facade
 * (it owns the Domain Schemas); this extractor just normalizes the inputs.
 */
export function referenceIdSets(
  accepted: Readonly<Partial<Record<OnboardingLayerKey, OnboardingAcceptedLayer>>>,
  layers: OnboardingLayers,
  existingCharacterIds: ReadonlySet<string>,
): { characterIds: Set<string>; canonIds: Set<string> } {
  const characterIds = new Set<string>(existingCharacterIds);
  const layer = accepted.characters;
  if (layer) {
    for (const raw of layer.candidates) {
      const candidate = raw as { id?: unknown };
      if (typeof candidate.id === 'string') characterIds.add(candidate.id);
    }
  }
  const canonIds = new Set<string>();
  const canon = accepted.canon;
  if (canon) {
    for (const raw of canon.candidates) {
      const candidate = raw as { id?: unknown };
      if (typeof candidate.id === 'string') canonIds.add(candidate.id);
    }
  }
  return { characterIds, canonIds };
}

export type { OnboardingLayerKey };
