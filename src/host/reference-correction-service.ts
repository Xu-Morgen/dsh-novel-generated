import { createHash } from 'node:crypto';
import {
  assertReferenceCorrectionOutput,
  classifyReferenceCorrection,
} from '../llm/analyze/reference-correction.js';
import { asLlmBackend, type GenerationSettings } from '../llm/port/index.js';
import {
  knowledgeStatusRank,
  knowledgeStatusSchema,
  type KnowledgeDocument,
  type KnowledgeEntry,
  type KnowledgeState,
} from '../core/schema/knowledge.js';
import { relationshipTypeSchema, type Relationship } from '../core/schema/relationship.js';
import { entityIdSchema } from '../core/schema/base.js';
import {
  referenceCorrectionAcceptResultSchema,
  referenceCorrectionCandidateSchema,
  referenceCorrectionGatePayloadSchema,
  referenceCorrectionParserInputSchema,
  referenceCorrectionPendingResultSchema,
  referenceCorrectionProposeInputSchema,
  referenceCorrectionProposeResultSchema,
  referenceCorrectionRejectResultSchema,
  type ReferenceCorrectionAcceptResult,
  type ReferenceCorrectionGatePayload,
  type ReferenceCorrectionOperation,
  type ReferenceCorrectionPendingItem,
  type ReferenceCorrectionProposeInput,
  type ReferenceCorrectionProposeResult,
  type ReferenceCorrectionRejectResult,
} from '../core/schema/reference-correction.js';
import { createCrossLayerReferenceCoordinator, createReferenceChangeSet, type CrossLayerReferenceCoordinator } from './cross-layer-reference-coordinator.js';
import type { ReferenceChangeSet } from '../core/schema/reference-coordination.js';
import type { NovelCharacterService } from './character-service.js';
import type { NovelCanonService } from './canon-service.js';
import type { NovelConfirmationService } from './confirmation-service.js';
import type { NovelKnowledgeService } from './knowledge-service.js';
import type { NovelReferenceAuditService } from './reference-audit-service.js';
import type { NovelRelationshipService } from './relationship-service.js';

const REFERENCE_CORRECTION_KIND = 'reference-correction';

export interface NovelReferenceCorrectionService {
  propose(projectId: string, input: ReferenceCorrectionProposeInput, settings: GenerationSettings, signal?: AbortSignal): Promise<ReferenceCorrectionProposeResult>;
  accept(projectId: string, proposalId: string): Promise<ReferenceCorrectionAcceptResult>;
  reject(projectId: string, proposalId: string): Promise<ReferenceCorrectionRejectResult>;
  pending(projectId: string): Promise<readonly ReferenceCorrectionPendingItem[]>;
}

export interface ReferenceCorrectionServiceDeps {
  readonly llm: unknown;
  readonly characters: Pick<NovelCharacterService, 'open' | 'list'>;
  readonly relationship: Pick<NovelRelationshipService, 'open' | 'read' | 'saveAll' | 'restoreForCompensation'>;
  readonly knowledge: Pick<NovelKnowledgeService, 'open' | 'read' | 'saveAll' | 'restoreForCompensation'>;
  readonly canon: Pick<NovelCanonService, 'open' | 'query' | 'appendBatch'>;
  readonly confirmation: NovelConfirmationService;
  readonly audit: Pick<NovelReferenceAuditService, 'journalFor'>;
  readonly onDispose?: (dispose: () => void) => void;
}

/**
 * I118 Host owner. LLM output is narrowed into a complete C1/C3/C4 change set,
 * then stored as an opaque I11 proposal. Only an accepted proposal reaches the
 * existing cross-layer coordinator; no free-form text is ever a write command.
 */
export function createReferenceCorrectionService(deps: ReferenceCorrectionServiceDeps): NovelReferenceCorrectionService {
  const backend = asLlmBackend(deps.llm);
  const opened = new Set<string>();
  const coordinators = new Map<string, Promise<CrossLayerReferenceCoordinator>>();
  let disposed = false;

  deps.onDispose?.(() => {
    disposed = true;
    opened.clear();
    coordinators.clear();
  });

  const ensureOpen = async (projectId: string): Promise<void> => {
    if (disposed) throw new Error('Reference correction service is disposed');
    entityIdSchema.parse(projectId);
    if (opened.has(projectId)) return;
    await Promise.all([
      deps.characters.open(projectId),
      deps.relationship.open(projectId),
      deps.knowledge.open(projectId),
      deps.canon.open(projectId),
      deps.confirmation.open(projectId),
    ]);
    opened.add(projectId);
  };

  const coordinatorFor = async (projectId: string): Promise<CrossLayerReferenceCoordinator> => {
    await ensureOpen(projectId);
    const existing = coordinators.get(projectId);
    if (existing !== undefined) return existing;
    const opening = deps.audit.journalFor(projectId).then((operationalJournal) => createCrossLayerReferenceCoordinator({
      characters: deps.characters,
      relationship: deps.relationship,
      knowledge: deps.knowledge,
      canon: deps.canon,
      operationalJournal,
      isAuthorized: async (candidateProjectId, authorization) => {
        if (authorization.kind !== 'reference-correction') return false;
        try {
          const record = deps.confirmation.get(candidateProjectId, authorization.proposalId);
          return record.kind === REFERENCE_CORRECTION_KIND && record.status === 'accepted';
        } catch {
          return false;
        }
      },
    }));
    coordinators.set(projectId, opening);
    try {
      return await opening;
    } catch (error) {
      if (coordinators.get(projectId) === opening) coordinators.delete(projectId);
      throw error;
    }
  };

  const readMarkedTargets = async (projectId: string, recordIds: readonly string[]) => {
    const journal = await deps.audit.journalFor(projectId);
    const records = recordIds.map((recordId) => {
      const record = journal.find(projectId, recordId);
      if (record === undefined) throw new Error(`Unknown reference audit record: ${recordId}`);
      return record;
    });
    const markedTargets = records.flatMap((record) => record.targets
      .filter((target) => target.owner === 'c1' || target.owner === 'c3' || target.owner === 'c4')
      .map((target) => ({ recordId: record.recordId, owner: target.owner, entityId: target.entityId, field: target.field })));
    if (markedTargets.length === 0) throw new Error('Reference correction requires a C1/C3/C4 audit target');
    return { records, markedTargets };
  };

  const propose = async (projectId: string, rawInput: ReferenceCorrectionProposeInput, settings: GenerationSettings, signal?: AbortSignal): Promise<ReferenceCorrectionProposeResult> => {
    await ensureOpen(projectId);
    const input = referenceCorrectionProposeInputSchema.parse(rawInput);
    const { markedTargets } = await readMarkedTargets(projectId, input.recordIds);
    const coordinator = await coordinatorFor(projectId);
    const snapshot = await coordinator.snapshot(projectId);
    const parsed = await classifyReferenceCorrection(backend, referenceCorrectionParserInputSchema.parse({
      instruction: input.instruction,
      markedTargets,
      relationships: snapshot.relationships,
      knowledge: snapshot.knowledge,
      canon: snapshot.canon,
    }), settings, signal);
    const candidateId = correctionId(projectId, input, snapshot.base, parsed.operations);
    const next = buildNextDocuments(snapshot.relationships, snapshot.knowledge, snapshot.canon, parsed.operations, await deps.characters.list(projectId));
    const preview = buildPreview(snapshot.relationships, snapshot.knowledge, snapshot.canon, parsed.operations, next);
    const candidate = referenceCorrectionCandidateSchema.parse({
      candidateId,
      projectId,
      sourceRecordIds: input.recordIds,
      instruction: input.instruction,
      base: snapshot.base,
      confidence: parsed.confidence,
      operations: parsed.operations,
      preview,
      rationale: parsed.rationale,
    });
    const changeSet = createReferenceChangeSet(snapshot, {
      operationId: candidateId,
      authorization: { kind: 'reference-correction', proposalId: candidateId, status: 'accepted' },
      relationships: next.relationships,
      knowledge: next.knowledge,
      canonAppends: next.canonAppends,
    });
    const payload = referenceCorrectionGatePayloadSchema.parse({ candidate, changeSet });
    await deps.confirmation.propose(projectId, { id: candidateId, kind: REFERENCE_CORRECTION_KIND, payload });
    return referenceCorrectionProposeResultSchema.parse({ projectId, proposalId: candidateId, status: 'pending', candidate });
  };

  const readPayload = (projectId: string, proposalId: string): ReferenceCorrectionGatePayload => {
    const record = deps.confirmation.get(projectId, proposalId);
    if (record.kind !== REFERENCE_CORRECTION_KIND) throw new Error(`Invalid reference-correction proposal kind: ${record.kind}`);
    const payload = referenceCorrectionGatePayloadSchema.parse(record.payload);
    if (payload.candidate.projectId !== projectId || payload.candidate.candidateId !== proposalId) {
      throw new Error(`Reference correction proposal belongs to another project: ${proposalId}`);
    }
    return payload;
  };

  const service: NovelReferenceCorrectionService = {
    propose,
    async accept(projectId, proposalId) {
      await ensureOpen(projectId);
      const record = await deps.confirmation.accept(projectId, proposalId);
      if (record.kind !== REFERENCE_CORRECTION_KIND) throw new Error(`Invalid reference-correction proposal kind: ${record.kind}`);
      const payload = readPayload(projectId, proposalId);
      const result = await (await coordinatorFor(projectId)).apply(payload.changeSet);
      return referenceCorrectionAcceptResultSchema.parse({
        projectId,
        proposalId,
        status: result.status,
        changedOwners: result.changedOwners,
      });
    },
    async reject(projectId, proposalId) {
      await ensureOpen(projectId);
      const record = await deps.confirmation.reject(projectId, proposalId);
      if (record.kind !== REFERENCE_CORRECTION_KIND) throw new Error(`Invalid reference-correction proposal kind: ${record.kind}`);
      return referenceCorrectionRejectResultSchema.parse({ projectId, proposalId, status: 'rejected' });
    },
    async pending(projectId) {
      await ensureOpen(projectId);
      const items = (await deps.confirmation.pending(projectId))
        .filter((record) => record.kind === REFERENCE_CORRECTION_KIND)
        .map((record) => {
          const payload = readPayload(projectId, record.id);
          return { projectId, proposalId: record.id, status: 'pending' as const, candidate: payload.candidate };
        });
      return referenceCorrectionPendingResultSchema.parse(items);
    },
  };
  return Object.freeze(service);
}

function correctionId(projectId: string, input: ReferenceCorrectionProposeInput, base: object, operations: readonly ReferenceCorrectionOperation[]): string {
  const digest = createHash('sha256').update(canonical({ projectId, recordIds: input.recordIds, instruction: input.instruction, base, operations }), 'utf8').digest('hex');
  return `ref-correction-${digest.slice(0, 48)}`;
}

function buildNextDocuments(
  relationships: readonly Relationship[],
  knowledge: KnowledgeDocument,
  canon: readonly { id: string; storyTime: string; kind: string; summary: string; detail: string; participants: string[]; location: string; consequences: string[]; affectedLayers: string[]; supersededBy: string | null }[],
  operations: readonly ReferenceCorrectionOperation[],
  characters: readonly { id: string }[],
): { relationships: Relationship[]; knowledge: KnowledgeDocument; canonAppends: ReferenceChangeSet['canonAppends'] } {
  const characterIds = new Set(characters.map((character) => character.id));
  const nextRelationships: Relationship[] = relationships.map((item) => structuredClone(item));
  const nextEntries: KnowledgeEntry[] = knowledge.entries.map((item) => structuredClone(item));
  const nextStates: KnowledgeState[] = knowledge.states.map((item) => structuredClone(item));
  const canonIds = new Set(canon.map((event) => event.id));
  const canonAppends: ReferenceChangeSet['canonAppends'] = [];
  const changedRelationships = new Set<string>();
  const changedEntries = new Set<string>();

  for (const operation of operations) {
    if (operation.owner === 'c1') {
      const relationship = nextRelationships.find((item) => item.id === operation.entityId);
      if (relationship === undefined) throw new Error(`Unknown C1 correction target: ${operation.entityId}`);
      if (operation.field === 'type') relationship.type = relationshipTypeSchema.parse(operation.value);
      else if (operation.field === 'affinity') relationship.affinity = numberInRange(operation.value, -100, 100, 'affinity');
      else if (operation.field === 'trust') relationship.trust = numberInRange(operation.value, 0, 100, 'trust');
      else if (operation.field === 'status') relationship.status = stringValue(operation.value, 'status');
      else if (operation.field === 'milestones' || operation.field === 'knownTo') {
        const id = entityIdSchema.parse(operation.value);
        if (operation.field === 'knownTo' && !characterIds.has(id)) throw new Error(`Unknown C1 knownTo id: ${id}`);
        if (operation.field === 'milestones' && !canonIds.has(id) && !operations.some((candidate) => candidate.owner === 'c4' && candidate.action === 'append' && candidate.value.id === id)) {
          throw new Error(`Unknown C4 milestone reference: ${id}`);
        }
        const values = operation.field === 'knownTo' ? relationship.knownTo : relationship.milestones;
        if (!values.includes(id)) values.push(id);
      }
      changedRelationships.add(relationship.id);
      continue;
    }
    if (operation.owner === 'c3') {
      const entry = nextEntries.find((item) => item.id === operation.entityId);
      if (entry === undefined) throw new Error(`Unknown C3 correction target: ${operation.entityId}`);
      if (operation.field === 'holders') {
        const characterId = entityIdSchema.parse(operation.value);
        if (!characterIds.has(characterId)) throw new Error(`Unknown C3 holder id: ${characterId}`);
        if (!entry.holders.includes(characterId)) entry.holders.push(characterId);
        const state = nextStates.find((item) => item.characterId === characterId);
        if (state === undefined) nextStates.push({ characterId, knows: [entry.id] });
        else if (!state.knows.includes(entry.id)) state.knows.push(entry.id);
      } else {
        const status = knowledgeStatusSchema.parse(operation.value);
        if (knowledgeStatusRank[status] < knowledgeStatusRank[entry.status]) throw new Error(`C3 knowledge status cannot regress: ${entry.id}`);
        entry.status = status;
      }
      changedEntries.add(entry.id);
      continue;
    }
    if (operation.value.id !== operation.entityId) throw new Error(`C4 append id must match its target: ${operation.entityId}`);
    if (canonAppends.some((event) => event.id === operation.value.id)) throw new Error(`Duplicate C4 append id: ${operation.value.id}`);
    const existing = canon.find((event) => event.id === operation.value.id);
    if (existing !== undefined && !sameCanon(existing, operation.value)) throw new Error(`C4 event id already exists with different content: ${operation.value.id}`);
    if (existing === undefined) canonAppends.push(operation.value);
    canonIds.add(operation.value.id);
  }

  for (const relationship of nextRelationships) {
    const previous = relationships.find((item) => item.id === relationship.id);
    if (previous !== undefined && changedRelationships.has(relationship.id) && !sameWithoutVersion(previous, relationship)) relationship.version = previous.version + 1;
  }
  for (const entry of nextEntries) {
    const previous = knowledge.entries.find((item) => item.id === entry.id);
    if (previous !== undefined && changedEntries.has(entry.id) && !sameWithoutVersion(previous, entry)) entry.version = previous.version + 1;
  }
  return { relationships: nextRelationships, knowledge: { entries: nextEntries, states: nextStates }, canonAppends };
}

function buildPreview(
  relationships: readonly Relationship[],
  knowledge: KnowledgeDocument,
  canon: readonly { id: string; storyTime: string; kind: string; summary: string; detail: string; participants: string[]; location: string; consequences: string[]; affectedLayers: string[]; supersededBy: string | null }[],
  operations: readonly ReferenceCorrectionOperation[],
  next: { relationships: readonly Relationship[]; knowledge: KnowledgeDocument; canonAppends: ReferenceChangeSet['canonAppends'] },
) {
  return operations.map((operation) => {
    if (operation.owner === 'c1') {
      const before = relationships.find((item) => item.id === operation.entityId);
      const after = next.relationships.find((item) => item.id === operation.entityId);
      if (!before || !after) throw new Error(`Missing C1 preview target: ${operation.entityId}`);
      return { owner: operation.owner, entityId: operation.entityId, field: operation.field, before: before[operation.field], after: after[operation.field] };
    }
    if (operation.owner === 'c3') {
      const before = knowledge.entries.find((item) => item.id === operation.entityId);
      const after = next.knowledge.entries.find((item) => item.id === operation.entityId);
      if (!before || !after) throw new Error(`Missing C3 preview target: ${operation.entityId}`);
      return { owner: operation.owner, entityId: operation.entityId, field: operation.field, before: before[operation.field], after: after[operation.field] };
    }
    const before = canon.find((event) => event.id === operation.entityId);
    return { owner: operation.owner, entityId: operation.entityId, field: operation.field, before: before ?? null, after: operation.value };
  });
}

function numberInRange(value: unknown, minimum: number, maximum: number, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`Invalid C1 ${field} value`);
  return value;
}

function stringValue(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 200) throw new Error(`Invalid C1 ${field} value`);
  return value;
}

function sameWithoutVersion(left: { version: number }, right: { version: number }): boolean {
  const { version: _left, ...leftRest } = left;
  const { version: _right, ...rightRest } = right;
  return canonical(leftRest) === canonical(rightRest);
}

function sameCanon(left: { id: string; storyTime: string; kind: string; summary: string; detail: string; participants: string[]; location: string; consequences: string[]; affectedLayers: string[] }, right: { id: string; storyTime: string; kind: string; summary: string; detail: string; participants: string[]; location: string; consequences: string[]; affectedLayers: string[] }): boolean {
  const project = (event: typeof left) => ({
    id: event.id,
    storyTime: event.storyTime,
    kind: event.kind,
    summary: event.summary,
    detail: event.detail,
    participants: event.participants,
    location: event.location,
    consequences: event.consequences,
    affectedLayers: event.affectedLayers,
  });
  return canonical(project(left)) === canonical(project(right));
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
}
