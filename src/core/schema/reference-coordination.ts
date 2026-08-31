import { z } from 'zod';
import { canonEventSchema, canonKindSchema } from './canon.js';
import { entityIdSchema } from './base.js';
import { knowledgeEntrySchema, knowledgeStateSchema } from './knowledge.js';
import { relationshipSchema } from './relationship.js';

/**
 * R18-5a field policy.  The matrix is a contract, not a hint for a model:
 * only deterministic-derived fields may be changed by the coordinator.
 */
export const referenceDispositionSchema = z.enum([
  'deterministic-derived',
  'author-semantic-candidate',
  'forbidden-automatic',
]);
export type ReferenceDisposition = z.infer<typeof referenceDispositionSchema>;

export const referenceOwnerSchema = z.enum(['c1', 'c3', 'c4', 'b5', 'timeline', 'c5']);
export type ReferenceOwner = z.infer<typeof referenceOwnerSchema>;

export const referenceMatrixEntrySchema = z.object({
  owner: referenceOwnerSchema,
  field: z.string().trim().min(1).max(80),
  disposition: referenceDispositionSchema,
  invariant: z.string().trim().min(1).max(240),
}).strict();
export type ReferenceMatrixEntry = z.infer<typeof referenceMatrixEntrySchema>;

/**
 * Frozen one-field policy for the R18-5 family.  B5 and timeline remain
 * owners of their documents; listing them here prevents a reference updater
 * from silently becoming a second outline/timeline writer (design §14.14.2).
 */
export const CROSS_LAYER_REFERENCE_MATRIX: readonly ReferenceMatrixEntry[] = Object.freeze([
  { owner: 'c1', field: 'relationship.id', disposition: 'forbidden-automatic', invariant: 'Identity is stable; never replace or delete through reference apply.' },
  { owner: 'c1', field: 'relationship.from/to', disposition: 'forbidden-automatic', invariant: 'Endpoints are stable character references and must remain unchanged.' },
  { owner: 'c1', field: 'relationship.type', disposition: 'author-semantic-candidate', invariant: 'A semantic relationship change requires an author decision.' },
  { owner: 'c1', field: 'relationship.affinity/trust/status', disposition: 'author-semantic-candidate', invariant: 'Values are not a monotonic relationship signal; versions are the linear chain.' },
  { owner: 'c1', field: 'relationship.milestones', disposition: 'author-semantic-candidate', invariant: 'Canon-event references need semantic interpretation and are not inferred silently.' },
  { owner: 'c1', field: 'relationship.knownTo', disposition: 'author-semantic-candidate', invariant: 'Publicity is distinct from C3 knowledge and needs author review.' },
  { owner: 'c3', field: 'knowledge.entry.holders/status', disposition: 'author-semantic-candidate', invariant: 'Only an accepted outcome may advance knowledge.' },
  { owner: 'c3', field: 'knowledge.entry.revealPlan.revealTo', disposition: 'deterministic-derived', invariant: 'Removing a newly revealed holder from pending targets mirrors the accepted advance.' },
  { owner: 'c3', field: 'knowledge.state.knows', disposition: 'deterministic-derived', invariant: 'The holder/state index must remain bidirectional.' },
  { owner: 'c3', field: 'knowledge.entry.fact/kind/revealAt', disposition: 'forbidden-automatic', invariant: 'The fact definition and schedule are not rewritten by reference maintenance.' },
  { owner: 'c3', field: 'knowledge.entry/state deletion', disposition: 'forbidden-automatic', invariant: 'C3 is add-only; existing knowledge cannot be forgotten or deleted.' },
  { owner: 'c4', field: 'canon.append', disposition: 'deterministic-derived', invariant: 'Accepted new facts append as immutable events only.' },
  { owner: 'c4', field: 'canon.participants/consequences', disposition: 'author-semantic-candidate', invariant: 'Event meaning and its cross-layer consequences require semantic review.' },
  { owner: 'c4', field: 'canon.supersede/delete/reorder', disposition: 'forbidden-automatic', invariant: 'Retained lines are immutable and corrections use the separate Gate path.' },
  { owner: 'b5', field: 'outline.charactersInvolved', disposition: 'author-semantic-candidate', invariant: 'Future-card character meaning is resolved by the outline workflow.' },
  { owner: 'b5', field: 'detailBeat.pov', disposition: 'author-semantic-candidate', invariant: 'POV changes are author choices, never a reference side effect.' },
  { owner: 'b5', field: 'act/beat/detailBeat.id/order/status', disposition: 'forbidden-automatic', invariant: 'B5 identity, structure, order and progress remain Outline/C6-owned.' },
  { owner: 'timeline', field: 'node.beatId/detailBeatId', disposition: 'deterministic-derived', invariant: 'Bindings mirror stable B5 structure and never invent a node.' },
  { owner: 'timeline', field: 'node.reveals/relationships/storyTime', disposition: 'author-semantic-candidate', invariant: 'Narrative scheduling is an author arrangement.' },
  { owner: 'timeline', field: 'node.id/order/currentNodeId', disposition: 'forbidden-automatic', invariant: 'Timeline navigation and ordering are not automatic reference writes.' },
  { owner: 'c5', field: 'scene.beats/canonEvents', disposition: 'deterministic-derived', invariant: 'Scene metadata mirrors accepted binding/append results in the landing UoW.' },
  { owner: 'c5', field: 'scene.content/index/branches', disposition: 'forbidden-automatic', invariant: '正文与版本由 C5 写入 owner 管理，不由引用维护改写。' },
] as const).map((entry) => referenceMatrixEntrySchema.parse(entry));

export const referenceAuthorizationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('candidate-accept'), candidateId: entityIdSchema, status: z.literal('accepted') }).strict(),
  z.object({ kind: z.literal('reparse-accept'), proposalId: entityIdSchema, status: z.literal('accepted') }).strict(),
  z.object({ kind: z.literal('reference-correction'), proposalId: entityIdSchema, status: z.literal('accepted') }).strict(),
]);
export type ReferenceAuthorization = z.infer<typeof referenceAuthorizationSchema>;

const fingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/);
export { fingerprintSchema as referenceFingerprintSchema };

export const referenceBaseOwnerSchema = z.object({
  version: z.number().int().nonnegative(),
  fingerprint: fingerprintSchema,
}).strict();
export type ReferenceBaseOwner = z.infer<typeof referenceBaseOwnerSchema>;

export const referenceBaseSchema = z.object({
  c1: referenceBaseOwnerSchema,
  c3: referenceBaseOwnerSchema,
  c4: referenceBaseOwnerSchema,
}).strict();
export type ReferenceBase = z.infer<typeof referenceBaseSchema>;

export const referenceCanonAppendInputSchema = canonEventSchema.omit({ seq: true, immutable: true, supersedes: true }).extend({
  kind: canonKindSchema.exclude(['correction']),
});
export type ReferenceCanonAppendInput = z.infer<typeof referenceCanonAppendInputSchema>;

export const referenceKnowledgeDocumentSchema = z.object({
  entries: knowledgeEntrySchema.array().max(512),
  states: knowledgeStateSchema.array().max(512),
}).strict();
export type ReferenceKnowledgeDocument = z.infer<typeof referenceKnowledgeDocumentSchema>;

/**
 * Strict Host-only UoW input.  Full next documents are intentional: the
 * coordinator can compare every owner against its captured base before the
 * first write, so partial/parallel versions fail closed without caller-side
 * patch merging or a second owner.
 */
export const referenceChangeSetSchema = z.object({
  operationId: entityIdSchema,
  projectId: entityIdSchema,
  authorization: referenceAuthorizationSchema,
  base: referenceBaseSchema,
  relationships: relationshipSchema.array().max(512),
  knowledge: referenceKnowledgeDocumentSchema,
  canonAppends: referenceCanonAppendInputSchema.array().max(128),
}).strict();
export type ReferenceChangeSet = z.infer<typeof referenceChangeSetSchema>;

export const referenceApplyResultSchema = z.object({
  operationId: entityIdSchema,
  projectId: entityIdSchema,
  status: z.enum(['applied', 'already-applied']),
  changedOwners: z.array(z.enum(['c1', 'c3', 'c4'])),
}).strict();
export type ReferenceApplyResult = z.infer<typeof referenceApplyResultSchema>;

export const referenceMatrixSchema = referenceMatrixEntrySchema.array().length(CROSS_LAYER_REFERENCE_MATRIX.length);

export function assertReferenceMatrix(): void {
  referenceMatrixSchema.parse(CROSS_LAYER_REFERENCE_MATRIX);
}
