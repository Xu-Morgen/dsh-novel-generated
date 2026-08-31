import { createHash } from 'node:crypto';
import { validateProjectId } from '../core/io/path.js';
import {
  assertKnowledgeOnlyAdvances,
  assertKnowledgeStructure,
  type KnowledgeDocument,
} from '../core/knowledge/index.js';
import {
  assertRelationshipStructure,
  type Relationship,
} from '../core/relationship/index.js';
import type { CanonEventView } from '../core/canon/index.js';
import type {
  ReferenceApplyResult,
  ReferenceAuthorization,
  ReferenceBase,
  ReferenceChangeSet,
} from '../core/schema/reference-coordination.js';
import {
  referenceApplyResultSchema,
  referenceChangeSetSchema,
} from '../core/schema/reference-coordination.js';
import type { NovelCanonService } from './canon-service.js';
import type { NovelCharacterService } from './character-service.js';
import type { NovelKnowledgeService } from './knowledge-service.js';
import type { NovelRelationshipService } from './relationship-service.js';

export interface ReferenceSnapshot {
  readonly projectId: string;
  readonly base: ReferenceBase;
  readonly relationships: readonly Relationship[];
  readonly knowledge: KnowledgeDocument;
  readonly canon: readonly CanonEventView[];
}

export interface ReferenceChangeSetDraft {
  readonly operationId: string;
  readonly authorization: ReferenceAuthorization;
  readonly relationships: readonly Relationship[];
  readonly knowledge: KnowledgeDocument;
  readonly canonAppends: ReferenceChangeSet['canonAppends'];
}

export interface CrossLayerReferenceCoordinatorDeps {
  /** B3 is read only here; it supplies the project-local character ID set. */
  readonly characters: Pick<NovelCharacterService, 'list'>;
  readonly relationship: Pick<NovelRelationshipService, 'read' | 'saveAll' | 'restoreForCompensation'>;
  readonly knowledge: Pick<NovelKnowledgeService, 'read' | 'saveAll' | 'restoreForCompensation'>;
  readonly canon: Pick<NovelCanonService, 'query' | 'appendBatch'>;
  /** Candidate/reparse authorization is checked before any owner write. */
  readonly isAuthorized: (projectId: string, authorization: ReferenceAuthorization) => Promise<boolean>;
  readonly onDispose?: (dispose: () => void) => void;
}

export interface CrossLayerReferenceCoordinator {
  /** Capture all three narrative-owner snapshots and their strict base tokens. */
  snapshot(projectId: string): Promise<ReferenceSnapshot>;
  /** Apply one accepted change set in the project lane, or report an idempotent replay. */
  apply(changeSet: ReferenceChangeSet): Promise<ReferenceApplyResult>;
}

/**
 * Build a strict change set from one Host snapshot. Callers must supply the
 * complete desired C1/C3 documents; this prevents a second patch-merging owner
 * and makes parallel-version rejection deterministic (design §14.14.2).
 */
export function createReferenceChangeSet(
  snapshot: ReferenceSnapshot,
  draft: ReferenceChangeSetDraft,
): ReferenceChangeSet {
  return referenceChangeSetSchema.parse({
    operationId: draft.operationId,
    projectId: snapshot.projectId,
    authorization: draft.authorization,
    base: snapshot.base,
    relationships: draft.relationships,
    knowledge: draft.knowledge,
    canonAppends: draft.canonAppends,
  });
}

export function createCrossLayerReferenceCoordinator(
  deps: CrossLayerReferenceCoordinatorDeps,
): CrossLayerReferenceCoordinator {
  const projectLanes = new Map<string, Promise<void>>();
  const operationFingerprints = new Map<string, string>();
  let disposed = false;

  const dispose = (): void => {
    disposed = true;
    projectLanes.clear();
    operationFingerprints.clear();
  };
  deps.onDispose?.(dispose);

  const snapshot = async (projectId: string): Promise<ReferenceSnapshot> => {
    validateProjectId(projectId);
    if (disposed) throw new Error('Cross-layer reference coordinator is disposed');
    const [relationships, knowledge, canon] = await Promise.all([
      deps.relationship.read(projectId),
      deps.knowledge.read(projectId),
      Promise.resolve(deps.canon.query(projectId)),
    ]);
    return Object.freeze({
      projectId,
      base: baseFor(relationships, knowledge, canon),
      relationships: structuredClone(relationships),
      knowledge: structuredClone(knowledge),
      canon: structuredClone(canon),
    });
  };

  const applyInLane = async (changeSet: ReferenceChangeSet): Promise<ReferenceApplyResult> => {
    const key = `${changeSet.projectId}/${changeSet.operationId}`;
    const operationFingerprint = fingerprint(changeSet);
    const previousFingerprint = operationFingerprints.get(key);
    if (previousFingerprint !== undefined && previousFingerprint !== operationFingerprint) {
      throw new Error(`Reference operation id was reused with a different change set: ${changeSet.operationId}`);
    }

    const current = await snapshot(changeSet.projectId);
    const characterIds = new Set((await deps.characters.list(changeSet.projectId)).map((character) => character.id));
    assertProjectReferences(changeSet, current.canon, characterIds);
    assertReferenceTransition(current, changeSet);

    const relationshipSatisfied = same(current.relationships, changeSet.relationships);
    const knowledgeSatisfied = same(current.knowledge, changeSet.knowledge);
    const canonSatisfied = canonAppendsSatisfied(current.canon, changeSet.canonAppends);
    const relationshipChanged = !relationshipSatisfied;
    const knowledgeChanged = !knowledgeSatisfied;
    const canonChanged = !canonSatisfied;
    if (!relationshipChanged && !knowledgeChanged && !canonChanged) {
      const result = resultFor(changeSet, 'already-applied', []);
      operationFingerprints.set(key, operationFingerprint);
      return result;
    }

    assertOwnerFreshness('c1', current.base.c1, changeSet.base.c1, relationshipSatisfied);
    assertOwnerFreshness('c3', current.base.c3, changeSet.base.c3, knowledgeSatisfied);
    assertOwnerFreshness('c4', current.base.c4, changeSet.base.c4, canonSatisfied);

    let relationshipAttempted = false;
    let knowledgeAttempted = false;
    try {
      // C4 is last: CanonLedger.appendBatch validates and writes the whole
      // append set atomically, so a failure cannot leave a partial ledger.
      if (relationshipChanged) {
        relationshipAttempted = true;
        await deps.relationship.saveAll(changeSet.projectId, changeSet.relationships);
      }
      if (knowledgeChanged) {
        knowledgeAttempted = true;
        await deps.knowledge.saveAll(changeSet.projectId, changeSet.knowledge.entries, changeSet.knowledge.states);
      }
      if (canonChanged) await deps.canon.appendBatch(changeSet.projectId, changeSet.canonAppends);
    } catch (cause) {
      const compensationErrors: Error[] = [];
      if (knowledgeAttempted) {
        try {
          await deps.knowledge.restoreForCompensation(changeSet.projectId, current.knowledge.entries, current.knowledge.states);
        } catch (error) {
          compensationErrors.push(asError(error));
        }
      }
      if (relationshipAttempted) {
        try {
          await deps.relationship.restoreForCompensation(changeSet.projectId, current.relationships);
        } catch (error) {
          compensationErrors.push(asError(error));
        }
      }
      if (compensationErrors.length > 0) {
        throw new AggregateError([asError(cause), ...compensationErrors], 'Cross-layer reference apply failed; compensation is pending');
      }
      throw new Error('Cross-layer reference apply failed and was compensated', { cause });
    }

    const changedOwners = [
      ...(relationshipChanged ? ['c1' as const] : []),
      ...(knowledgeChanged ? ['c3' as const] : []),
      ...(canonChanged ? ['c4' as const] : []),
    ];
    const result = resultFor(changeSet, 'applied', changedOwners);
    operationFingerprints.set(key, operationFingerprint);
    return result;
  };

  const apply = async (input: ReferenceChangeSet): Promise<ReferenceApplyResult> => {
    if (disposed) throw new Error('Cross-layer reference coordinator is disposed');
    const changeSet = referenceChangeSetSchema.parse(input);
    validateProjectId(changeSet.projectId);
    if (!(await deps.isAuthorized(changeSet.projectId, changeSet.authorization))) {
      throw new Error(`Reference change set is not authorized: ${changeSet.operationId}`);
    }
    const previous = projectLanes.get(changeSet.projectId) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(() => applyInLane(changeSet));
    const tail = run.then(() => undefined, () => undefined);
    projectLanes.set(changeSet.projectId, tail);
    void tail.then(() => {
      if (projectLanes.get(changeSet.projectId) === tail) projectLanes.delete(changeSet.projectId);
    });
    return run;
  };

  return Object.freeze({ snapshot, apply });
}

function baseFor(
  relationships: readonly Relationship[],
  knowledge: KnowledgeDocument,
  canon: readonly CanonEventView[],
): ReferenceBase {
  return {
    c1: { version: maxVersion(relationships), fingerprint: fingerprint(relationships) },
    c3: { version: maxVersion(knowledge.entries), fingerprint: fingerprint(knowledge) },
    c4: { version: canon.length, fingerprint: fingerprint(canon) },
  };
}

function maxVersion(values: readonly { readonly version: number }[]): number {
  return values.reduce((maximum, value) => Math.max(maximum, value.version), 0);
}

function assertReferenceTransition(current: ReferenceSnapshot, changeSet: ReferenceChangeSet): void {
  assertRelationshipStructure(changeSet.relationships);
  assertKnowledgeStructure(changeSet.knowledge.entries, changeSet.knowledge.states);
  assertKnowledgeOnlyAdvances(current.knowledge, changeSet.knowledge);
  assertC1VersionChain(current.relationships, changeSet.relationships);
  assertC3VersionChain(current.knowledge, changeSet.knowledge);
  assertCanonAppends(current.canon, changeSet.canonAppends);
}

function assertC1VersionChain(previous: readonly Relationship[], next: readonly Relationship[]): void {
  const previousById = new Map(previous.map((item) => [item.id, item]));
  const nextById = new Map(next.map((item) => [item.id, item]));
  if (previousById.size !== previous.length || nextById.size !== next.length) throw new Error('C1 relationship ids must be unique');
  if (next.length < previous.length || previous.some((item, index) => next[index]?.id !== item.id)) {
    throw new Error('C1 relationship deletion or reorder is forbidden by reference apply');
  }
  for (const oldRelationship of previous) {
    const updated = nextById.get(oldRelationship.id);
    if (updated === undefined) throw new Error(`Unknown C1 relationship target: ${oldRelationship.id}`);
    if (oldRelationship.from !== updated.from || oldRelationship.to !== updated.to) {
      throw new Error(`C1 relationship endpoints are immutable: ${oldRelationship.id}`);
    }
    if (sameWithoutVersion(oldRelationship, updated)) {
      if (oldRelationship.version !== updated.version) throw new Error(`C1 unchanged relationship version drift: ${oldRelationship.id}`);
    } else if (updated.version !== oldRelationship.version + 1) {
      throw new Error(`C1 relationship version must advance exactly once: ${oldRelationship.id}`);
    }
  }
  // New relationship creation is allowed only as version 1 and is append-only.
  for (const updated of next) {
    if (!previousById.has(updated.id) && updated.version !== 1) throw new Error(`New C1 relationship must start at version 1: ${updated.id}`);
  }
}

function assertC3VersionChain(previous: KnowledgeDocument, next: KnowledgeDocument): void {
  const previousById = new Map(previous.entries.map((item) => [item.id, item]));
  for (const entry of next.entries) {
    const oldEntry = previousById.get(entry.id);
    if (oldEntry === undefined) {
      if (entry.version !== 1) throw new Error(`New C3 knowledge entry must start at version 1: ${entry.id}`);
    } else if (sameWithoutVersion(oldEntry, entry)) {
      if (oldEntry.version !== entry.version) throw new Error(`C3 unchanged entry version drift: ${entry.id}`);
    } else if (entry.version !== oldEntry.version + 1) {
      throw new Error(`C3 knowledge version must advance exactly once: ${entry.id}`);
    }
  }
}

function assertCanonAppends(current: readonly CanonEventView[], appends: ReferenceChangeSet['canonAppends']): void {
  const currentById = new Map(current.map((event) => [event.id, event]));
  const seen = new Set<string>();
  for (const input of appends) {
    if (seen.has(input.id)) throw new Error(`Duplicate C4 append id: ${input.id}`);
    seen.add(input.id);
    const existing = currentById.get(input.id);
    if (existing !== undefined && !canonMatchesInput(existing, input)) {
      throw new Error(`C4 event id already exists with different content: ${input.id}`);
    }
  }
}

function assertProjectReferences(
  changeSet: ReferenceChangeSet,
  currentCanon: readonly CanonEventView[],
  characterIds: ReadonlySet<string>,
): void {
  const canonIds = new Set([...currentCanon.map((event) => event.id), ...changeSet.canonAppends.map((event) => event.id)]);
  for (const relationship of changeSet.relationships) {
    if (!characterIds.has(relationship.from) || !characterIds.has(relationship.to)) {
      throw new Error(`Unknown or cross-project C1 relationship endpoint: ${relationship.id}`);
    }
    for (const id of relationship.knownTo) if (!characterIds.has(id)) throw new Error(`Unknown or cross-project C1 knownTo id: ${id}`);
    for (const id of relationship.milestones) if (!canonIds.has(id)) throw new Error(`Unknown C4 milestone reference: ${id}`);
  }
  for (const entry of changeSet.knowledge.entries) {
    for (const id of [...entry.holders, ...entry.revealPlan.revealTo]) {
      if (!characterIds.has(id)) throw new Error(`Unknown or cross-project C3 character reference: ${id}`);
    }
  }
  for (const state of changeSet.knowledge.states) {
    if (!characterIds.has(state.characterId)) throw new Error(`Unknown or cross-project C3 state character: ${state.characterId}`);
  }
  for (const event of changeSet.canonAppends) {
    for (const id of event.participants) if (!characterIds.has(id)) throw new Error(`Unknown or cross-project C4 participant: ${id}`);
  }
}

function assertOwnerFreshness(
  owner: 'c1' | 'c3' | 'c4',
  actual: { readonly version: number; readonly fingerprint: string },
  expected: { readonly version: number; readonly fingerprint: string },
  satisfied: boolean,
): void {
  if (satisfied) return;
  if (actual.version !== expected.version || actual.fingerprint !== expected.fingerprint) {
    throw new Error(`Stale ${owner} reference base: expected ${expected.fingerprint}, actual ${actual.fingerprint}`);
  }
}

function canonAppendsSatisfied(current: readonly CanonEventView[], appends: ReferenceChangeSet['canonAppends']): boolean {
  return appends.every((input) => {
    const event = current.find((candidate) => candidate.id === input.id);
    return event !== undefined && canonMatchesInput(event, input);
  });
}

function canonMatchesInput(event: CanonEventView, input: ReferenceChangeSet['canonAppends'][number]): boolean {
  return same({
    id: event.id,
    storyTime: event.storyTime,
    kind: event.kind,
    summary: event.summary,
    detail: event.detail,
    participants: event.participants,
    location: event.location,
    consequences: event.consequences,
    affectedLayers: event.affectedLayers,
  }, input);
}

function sameWithoutVersion<T extends { readonly version: number }>(left: T, right: T): boolean {
  const { version: _leftVersion, ...leftRest } = left;
  const { version: _rightVersion, ...rightRest } = right;
  return same(leftRest, rightRest);
}

function same(left: object, right: object): boolean {
  return canonical(left) === canonical(right);
}

function fingerprint(value: object): string {
  return createHash('sha256').update(canonical(value), 'utf8').digest('hex');
}

function canonical(value: object): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item as object)).join(',')}]`;
  return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalValue(item)}`).join(',')}}`;
}

function canonicalValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  return canonical(value as object);
}

function resultFor(changeSet: ReferenceChangeSet, status: ReferenceApplyResult['status'], changedOwners: readonly ('c1' | 'c3' | 'c4')[]): ReferenceApplyResult {
  return referenceApplyResultSchema.parse({
    operationId: changeSet.operationId,
    projectId: changeSet.projectId,
    status,
    changedOwners,
  });
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
