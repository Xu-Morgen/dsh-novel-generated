import { createHash } from 'node:crypto';
import { z } from 'zod';
import { entityIdSchema } from '../../core/schema/base.js';
import { canonEventSchema } from '../../core/schema/canon.js';
import { knowledgeEntrySchema, knowledgeStateSchema } from '../../core/schema/knowledge.js';
import { relationshipSchema } from '../../core/schema/relationship.js';
import { assertRelationshipStructure } from '../../core/relationship/index.js';
import { worldStateSchema } from '../../core/schema/state.js';
import type { StateDraft } from '../../core/state/index.js';
import { worldEntrySchema } from '../../core/schema/worldview.js';
import { assertKnowledgeStructure, type KnowledgeDocument } from '../../core/knowledge/index.js';
import { applyC2StateOperationsToDraft, assertC2StateOperations, c2StateParserOutputSchema, type C2StateParserOutput } from '../../llm/parse/state.js';
import { materializeC1RelationshipOperations, c1RelationshipParserOutputSchema, type C1RelationshipParserOutput } from '../../llm/parse/relationship.js';
import { materializeC3KnowledgeOperations, c3KnowledgeParserOutputSchema, type C3KnowledgeParserOutput } from '../../llm/parse/knowledge.js';
import { assertC4CanonOperations, c4CanonParserOutputSchema, type C4CanonParserOutput } from '../../llm/parse/canon.js';
import { assertB2WorldviewSupersedeOperations, b2WorldviewParserOutputSchema, type B2WorldviewParserOutput } from '../../llm/parse/worldview.js';

export const STRUCTURAL_PREVIEW_MAX_OPERATIONS = 128;
export const STRUCTURAL_PREVIEW_MAX_ENTITIES_PER_LAYER = 256;
export const STRUCTURAL_PREVIEW_MAX_CHANGES = 512;
export const STRUCTURAL_PREVIEW_MAX_BYTES = 200_000;

const fingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/);
const layerSchema = z.enum(['c2', 'c1', 'c3', 'c4', 'b2']);
export type StructuralPreviewLayer = z.infer<typeof layerSchema>;

/** Explicitly marks whether a candidate was generated from an I108 baseline. */
export const structuralPreviewOutlineBaselineSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('baseline'), generationBaselineId: entityIdSchema, baselineRevision: z.number().int().positive(),
    detailBeatId: entityIdSchema, b5ContentFingerprint: fingerprintSchema, bindingFingerprint: fingerprintSchema,
  }).strict(),
  z.object({ kind: z.literal('no-outline-baseline') }).strict(),
]);
export type StructuralPreviewOutlineBaseline = z.infer<typeof structuralPreviewOutlineBaselineSchema>;

const c3SnapshotSchema = z.object({
  entries: knowledgeEntrySchema.array().max(STRUCTURAL_PREVIEW_MAX_ENTITIES_PER_LAYER),
  states: knowledgeStateSchema.array().max(STRUCTURAL_PREVIEW_MAX_ENTITIES_PER_LAYER),
}).strict();
const c4SnapshotSchema = canonEventSchema.extend({ supersededBy: entityIdSchema.nullable() }).strict()
  .array().max(STRUCTURAL_PREVIEW_MAX_ENTITIES_PER_LAYER);
const c1SnapshotSchema = relationshipSchema.array().max(STRUCTURAL_PREVIEW_MAX_ENTITIES_PER_LAYER);
const b2SnapshotSchema = worldEntrySchema.array().max(STRUCTURAL_PREVIEW_MAX_ENTITIES_PER_LAYER);

const c2BaselineSchema = z.object({ layer: z.literal('c2'), fingerprint: fingerprintSchema, snapshot: worldStateSchema }).strict();
const c1BaselineSchema = z.object({ layer: z.literal('c1'), fingerprint: fingerprintSchema, snapshot: c1SnapshotSchema }).strict();
const c3BaselineSchema = z.object({ layer: z.literal('c3'), fingerprint: fingerprintSchema, snapshot: c3SnapshotSchema }).strict();
const c4BaselineSchema = z.object({ layer: z.literal('c4'), fingerprint: fingerprintSchema, snapshot: c4SnapshotSchema }).strict();
const b2BaselineSchema = z.object({ layer: z.literal('b2'), fingerprint: fingerprintSchema, snapshot: b2SnapshotSchema }).strict();

/** Typed layer snapshots prevent a plan from retaining C5 prose or live service objects. */
export const structuralPreviewLayerBaselineSchema = z.discriminatedUnion('layer', [
  c2BaselineSchema, c1BaselineSchema, c3BaselineSchema, c4BaselineSchema, b2BaselineSchema,
]);
export type StructuralPreviewLayerBaseline = z.infer<typeof structuralPreviewLayerBaselineSchema>;

export const structuralPreviewParserOutputsSchema = z.object({
  c2: c2StateParserOutputSchema.extend({ ops: c2StateParserOutputSchema.shape.ops.max(STRUCTURAL_PREVIEW_MAX_OPERATIONS) }),
  c1: c1RelationshipParserOutputSchema.extend({ ops: c1RelationshipParserOutputSchema.shape.ops.max(STRUCTURAL_PREVIEW_MAX_OPERATIONS) }),
  c3: c3KnowledgeParserOutputSchema.extend({ ops: c3KnowledgeParserOutputSchema.shape.ops.max(STRUCTURAL_PREVIEW_MAX_OPERATIONS) }),
  c4: c4CanonParserOutputSchema.extend({ ops: c4CanonParserOutputSchema.shape.ops.max(STRUCTURAL_PREVIEW_MAX_OPERATIONS) }),
  b2: b2WorldviewParserOutputSchema.extend({ ops: b2WorldviewParserOutputSchema.shape.ops.max(STRUCTURAL_PREVIEW_MAX_OPERATIONS) }),
}).strict();
export type StructuralPreviewParserOutputs = z.infer<typeof structuralPreviewParserOutputsSchema>;

export const structuralPreviewChangeKindSchema = z.enum(['add', 'update', 'remove']);
export const structuralPreviewEntityTypeSchema = z.enum([
  'state', 'scene', 'character', 'relationship', 'knowledge-entry', 'knowledge-state', 'canon-event', 'world-entry',
]);

/** Hash-only change projection; values remain in the validated parser outputs/baselines. */
export const structuralPreviewChangeSchema = z.object({
  layer: layerSchema,
  kind: structuralPreviewChangeKindSchema,
  entityType: structuralPreviewEntityTypeSchema,
  entityId: entityIdSchema,
  beforeHash: fingerprintSchema.optional(),
  afterHash: fingerprintSchema.optional(),
  beforeIndex: z.number().int().nonnegative().optional(),
  afterIndex: z.number().int().nonnegative().optional(),
  changedFields: z.array(z.string().min(1).max(100)).max(40),
}).strict().superRefine((change, context) => {
  if ((change.kind === 'remove' || change.kind === 'update') && change.beforeHash === undefined) {
    context.addIssue({ code: 'custom', path: ['beforeHash'], message: 'Removal/update requires beforeHash' });
  }
  if ((change.kind === 'add' || change.kind === 'update') && change.afterHash === undefined) {
    context.addIssue({ code: 'custom', path: ['afterHash'], message: 'Addition/update requires afterHash' });
  }
  if (change.kind === 'add' && change.beforeHash !== undefined) context.addIssue({ code: 'custom', path: ['beforeHash'], message: 'Addition cannot have beforeHash' });
  if (change.kind === 'remove' && change.afterHash !== undefined) context.addIssue({ code: 'custom', path: ['afterHash'], message: 'Removal cannot have afterHash' });
});
export type StructuralPreviewChange = z.infer<typeof structuralPreviewChangeSchema>;

export const structuralPreviewPlanSchema = z.object({
  planId: entityIdSchema,
  projectId: entityIdSchema,
  candidateId: entityIdSchema,
  sourceHash: fingerprintSchema,
  generationBaseline: structuralPreviewOutlineBaselineSchema,
  layerBaselines: z.array(structuralPreviewLayerBaselineSchema).length(5),
  parserOutputs: structuralPreviewParserOutputsSchema,
  changes: structuralPreviewChangeSchema.array().max(STRUCTURAL_PREVIEW_MAX_CHANGES),
  createdAt: z.string().datetime({ offset: true }),
}).strict().superRefine((plan, context) => {
  const layers = plan.layerBaselines.map((baseline) => baseline.layer);
  if (new Set(layers).size !== layers.length || layers.some((layer) => !layerSchema.options.includes(layer))) {
    context.addIssue({ code: 'custom', path: ['layerBaselines'], message: 'Plan must contain one baseline for each structural layer' });
  }
});
export type StructuralPreviewPlan = z.infer<typeof structuralPreviewPlanSchema>;

export const structuralPreviewFreshnessInputSchema = z.object({
  sourceHash: fingerprintSchema,
  generationBaseline: structuralPreviewOutlineBaselineSchema,
  layerFingerprints: z.object({ c2: fingerprintSchema, c1: fingerprintSchema, c3: fingerprintSchema, c4: fingerprintSchema, b2: fingerprintSchema }).strict(),
}).strict();
export type StructuralPreviewFreshnessInput = z.infer<typeof structuralPreviewFreshnessInputSchema>;

export interface StructuralPreviewPrepareInput {
  readonly planId: string;
  readonly projectId: string;
  readonly candidateId: string;
  readonly sourceHash: string;
  readonly generationBaseline: StructuralPreviewOutlineBaseline;
  readonly layerBaselines: readonly StructuralPreviewLayerBaseline[];
  readonly parserOutputs: StructuralPreviewParserOutputs;
  readonly createdAt?: string;
}

export interface StructuralPreviewWriters {
  readonly c2: (output: C2StateParserOutput) => Promise<void>;
  readonly c1: (output: C1RelationshipParserOutput) => Promise<void>;
  readonly c3: (output: C3KnowledgeParserOutput) => Promise<void>;
  readonly c4: (output: C4CanonParserOutput) => Promise<void>;
  readonly b2: (output: B2WorldviewParserOutput) => Promise<void>;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(canonical(value), 'utf8').digest('hex');
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function same(left: unknown, right: unknown): boolean { return canonical(left) === canonical(right); }

function assertBounded(plan: StructuralPreviewPlan): void {
  if (Buffer.byteLength(JSON.stringify(plan), 'utf8') > STRUCTURAL_PREVIEW_MAX_BYTES) throw new Error(`Structural preview plan exceeds ${STRUCTURAL_PREVIEW_MAX_BYTES} bytes`);
}

type DiffEntry = { readonly entityType: z.infer<typeof structuralPreviewEntityTypeSchema>; readonly entityId: string; readonly value: Record<string, unknown>; readonly index: number };

function arrayEntries(entityType: DiffEntry['entityType'], values: readonly Record<string, unknown>[]): DiffEntry[] {
  return values.map((value, index) => ({ entityType, entityId: String(value.id ?? value.characterId), value, index }));
}

function diffLayer(layer: StructuralPreviewLayer, before: readonly DiffEntry[], after: readonly DiffEntry[]): StructuralPreviewChange[] {
  const oldByKey = new Map(before.map((entry) => [`${entry.entityType}/${entry.entityId}`, entry]));
  const newByKey = new Map(after.map((entry) => [`${entry.entityType}/${entry.entityId}`, entry]));
  const changes: StructuralPreviewChange[] = [];
  for (const entry of before) {
    const key = `${entry.entityType}/${entry.entityId}`;
    const next = newByKey.get(key);
    if (next === undefined) {
      changes.push({ layer, kind: 'remove', entityType: entry.entityType, entityId: entry.entityId, beforeHash: fingerprint(entry.value), beforeIndex: entry.index, changedFields: Object.keys(entry.value).sort() });
      continue;
    }
    const changedFields = Object.keys({ ...entry.value, ...next.value }).filter((field) => !same(entry.value[field], next.value[field])).sort();
    if (entry.index !== next.index) changedFields.push('__order__');
    if (changedFields.length > 0) {
      changes.push({ layer, kind: 'update', entityType: entry.entityType, entityId: entry.entityId, beforeHash: fingerprint(entry.value), afterHash: fingerprint(next.value), beforeIndex: entry.index, afterIndex: next.index, changedFields: [...new Set(changedFields)] });
    }
  }
  for (const entry of after) {
    const key = `${entry.entityType}/${entry.entityId}`;
    if (!oldByKey.has(key)) {
      changes.push({ layer, kind: 'add', entityType: entry.entityType, entityId: entry.entityId, afterHash: fingerprint(entry.value), afterIndex: entry.index, changedFields: Object.keys(entry.value).sort() });
    }
  }
  return changes;
}

function baselineFor(layer: StructuralPreviewLayer, baselines: readonly StructuralPreviewLayerBaseline[]): StructuralPreviewLayerBaseline {
  const baseline = baselines.find((item) => item.layer === layer);
  if (baseline === undefined) throw new Error(`Missing ${layer} structural preview baseline`);
  return baseline;
}

function assertUniqueIds(values: readonly { readonly id: string }[], layer: string): void {
  const ids = new Set<string>();
  for (const value of values) {
    if (ids.has(value.id)) throw new Error(`Duplicate ${layer} entity id: ${value.id}`);
    ids.add(value.id);
  }
}

function assertLayerBaselineIntegrity(baseline: StructuralPreviewLayerBaseline): void {
  if (baseline.layer === 'c2') {
    assertUniqueIds(baseline.snapshot.characters.map((character) => ({ id: character.characterId })), 'c2 character');
    return;
  }
  if (baseline.layer === 'c1') {
    assertRelationshipStructure(baseline.snapshot);
    return;
  }
  if (baseline.layer === 'c3') {
    assertKnowledgeStructure(baseline.snapshot.entries, baseline.snapshot.states);
    return;
  }
  assertUniqueIds(baseline.snapshot, baseline.layer);
}

function c2Projection(snapshot: z.infer<typeof worldStateSchema>, output: C2StateParserOutput): z.infer<typeof worldStateSchema> {
  assertC2StateOperations(snapshot, output.ops);
  const draft = structuredClone(snapshot) as StateDraft;
  applyC2StateOperationsToDraft(draft, output.ops);
  return worldStateSchema.parse(draft);
}

function c4Projection(snapshot: z.infer<typeof c4SnapshotSchema>, output: C4CanonParserOutput): z.infer<typeof c4SnapshotSchema> {
  assertC4CanonOperations(snapshot, output.ops);
  const next = structuredClone(snapshot);
  let sequence = Math.max(-1, ...next.map((event) => event.seq)) + 1;
  for (const operation of output.ops) {
    if (operation.op === 'append') {
      next.push({ ...operation.event, seq: sequence++, immutable: true, supersededBy: null });
    } else {
      const target = next.find((event) => event.id === operation.targetId);
      if (target === undefined) throw new Error(`Unknown C4 target in structural preview: ${operation.targetId}`);
      const correction = { ...operation.correction, kind: 'correction' as const, seq: sequence++, immutable: true as const, supersedes: operation.targetId, supersededBy: null };
      target.supersededBy = correction.id;
      next.push(correction);
    }
  }
  return c4SnapshotSchema.parse(next);
}

function b2Projection(snapshot: z.infer<typeof b2SnapshotSchema>, output: B2WorldviewParserOutput): z.infer<typeof b2SnapshotSchema> {
  assertB2WorldviewSupersedeOperations(snapshot, output.ops);
  const next = structuredClone(snapshot);
  for (const operation of output.ops) {
    const index = next.findIndex((entry) => entry.id === operation.targetId);
    if (index < 0) throw new Error(`Unknown B2 target in structural preview: ${operation.targetId}`);
    const target = next[index];
    const replacement = { ...operation.replacement, version: target.version + 1, status: 'active' as const, supersededBy: null };
    next[index] = { ...target, status: 'rewritten', supersededBy: replacement.id };
    next.push(replacement);
  }
  return b2SnapshotSchema.parse(next);
}

function changesFor(layer: StructuralPreviewLayer, baseline: StructuralPreviewLayerBaseline, output: StructuralPreviewParserOutputs): StructuralPreviewChange[] {
  if (layer === 'c2' && baseline.layer === 'c2') {
    const next = c2Projection(baseline.snapshot, output.c2);
    const before = [{ ...baseline.snapshot, id: 'state' }, { ...baseline.snapshot.scene, id: 'scene' }, ...baseline.snapshot.characters].map((value) => value as Record<string, unknown>);
    const after = [{ ...next, id: 'state' }, { ...next.scene, id: 'scene' }, ...next.characters].map((value) => value as Record<string, unknown>);
    return diffLayer(layer, [arrayEntries('state', before)[0], arrayEntries('scene', before.slice(1, 2))[0], ...arrayEntries('character', before.slice(2))], [arrayEntries('state', after)[0], arrayEntries('scene', after.slice(1, 2))[0], ...arrayEntries('character', after.slice(2))]);
  }
  if (layer === 'c1' && baseline.layer === 'c1') {
    const next = materializeC1RelationshipOperations(baseline.snapshot, output.c1.ops);
    return diffLayer(layer, arrayEntries('relationship', baseline.snapshot as unknown as Record<string, unknown>[]), arrayEntries('relationship', next as unknown as Record<string, unknown>[]));
  }
  if (layer === 'c3' && baseline.layer === 'c3') {
    const current: KnowledgeDocument = baseline.snapshot;
    assertKnowledgeStructure(current.entries, current.states);
    const next = materializeC3KnowledgeOperations(current, output.c3.ops);
    return diffLayer(layer,
      [...arrayEntries('knowledge-entry', current.entries as unknown as Record<string, unknown>[]), ...arrayEntries('knowledge-state', current.states as unknown as Record<string, unknown>[])],
      [...arrayEntries('knowledge-entry', next.entries as unknown as Record<string, unknown>[]), ...arrayEntries('knowledge-state', next.states as unknown as Record<string, unknown>[])]);
  }
  if (layer === 'c4' && baseline.layer === 'c4') {
    const next = c4Projection(baseline.snapshot, output.c4);
    return diffLayer(layer, arrayEntries('canon-event', baseline.snapshot as unknown as Record<string, unknown>[]), arrayEntries('canon-event', next as unknown as Record<string, unknown>[]));
  }
  if (layer === 'b2' && baseline.layer === 'b2') {
    const next = b2Projection(baseline.snapshot, output.b2);
    return diffLayer(layer, arrayEntries('world-entry', baseline.snapshot as unknown as Record<string, unknown>[]), arrayEntries('world-entry', next as unknown as Record<string, unknown>[]));
  }
  throw new Error(`Structural preview layer baseline mismatch: ${layer}`);
}

/** Build a deterministic, session-only plan from already validated parser outputs. */
export function prepareStructuralPreviewPlan(input: StructuralPreviewPrepareInput): StructuralPreviewPlan {
  const parsed = structuralPreviewPlanSchema.parse({
    ...input,
    createdAt: input.createdAt ?? new Date().toISOString(),
    changes: [],
  });
  const orderedBaselines = layerSchema.options.map((layer) => baselineFor(layer, parsed.layerBaselines));
  for (const baseline of orderedBaselines) {
    assertLayerBaselineIntegrity(baseline);
    if (baseline.fingerprint !== fingerprint(baseline.snapshot)) throw new Error(`Structural preview ${baseline.layer} baseline fingerprint mismatch`);
  }
  const changes = layerSchema.options.flatMap((layer) => changesFor(layer, orderedBaselines.find((baseline) => baseline.layer === layer)!, parsed.parserOutputs));
  const plan = structuralPreviewPlanSchema.parse({ ...parsed, layerBaselines: orderedBaselines, changes });
  assertBounded(plan);
  return deepFreeze(plan);
}

/** Re-check all frozen owners immediately before a landing writer is allowed to run. */
export function assertStructuralPreviewPlanFresh(plan: StructuralPreviewPlan, current: StructuralPreviewFreshnessInput): void {
  const observed = structuralPreviewFreshnessInputSchema.parse(current);
  if (plan.sourceHash !== observed.sourceHash) throw new Error('Structural preview sourceHash is stale');
  if (!same(plan.generationBaseline, observed.generationBaseline)) throw new Error('Structural preview generation baseline is stale');
  const byLayer = new Map(plan.layerBaselines.map((baseline) => [baseline.layer, baseline.fingerprint]));
  for (const layer of layerSchema.options) if (byLayer.get(layer) !== observed.layerFingerprints[layer]) throw new Error(`Structural preview ${layer} baseline is stale`);
}

/**
 * The session-only consumer seam used by landing-saga. It replays the frozen
 * parser outputs in canonical C2→C1→C3→C4→B2 order and never calls a parser.
 */
export async function consumeStructuralPreviewPlan(
  plan: StructuralPreviewPlan,
  current: StructuralPreviewFreshnessInput,
  writers: StructuralPreviewWriters,
): Promise<readonly StructuralPreviewChange[]> {
  assertStructuralPreviewPlanFresh(plan, current);
  await writers.c2(plan.parserOutputs.c2);
  await writers.c1(plan.parserOutputs.c1);
  await writers.c3(plan.parserOutputs.c3);
  await writers.c4(plan.parserOutputs.c4);
  await writers.b2(plan.parserOutputs.b2);
  return plan.changes;
}

export { fingerprint as structuralPreviewFingerprint };
