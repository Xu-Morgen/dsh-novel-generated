import { z } from 'zod';
import { entityIdSchema } from './base.js';
import { characterArcSchema, characterKindSchema } from './characters.js';
import { triggerModeSchema, worldKindSchema } from './worldview.js';
import { actSchema, endingSchema, foreshadowingSchema, outlineStructureSchema } from './outline.js';
import { relationshipTypeSchema } from './relationship.js';
import { characterStateSchema, sceneStateSchema } from './state.js';
import { canonKindSchema } from './canon.js';

/**
 * I52 six-layer initialization analyzer contract (design §14.8 / R11-3).
 *
 * One analysis run turns normalized input chunks (from a controlled DOCX
 * upload or free text) into a *candidate package* for exactly six layers —
 * B3 characters, B2 worldview, B5 outline, C1 relationship, C2 state, C4 canon.
 * The package is bound to `projectId` / `onboardingSessionId` / `sourceHash`
 * by the Host service (`onboarding.ts`), never by the schema itself.
 *
 * Hard boundaries enforced at this schema layer:
 * - Every candidate reuses an existing Domain Schema minus Host-owned
 *   persistence fields (version / seq / status / supersededBy / immutable),
 *   then adds `confidence`, `source` evidence references and `warnings`.
 * - B3 `relationships` / `knowledgeIds` / `arc.keyBeats` are FORBIDDEN: the
 *   analyzer must leave them empty (R11-3).
 * - C2 is the input-end / story-start snapshot: only `scene` + `characters`,
 *   each character limited to the current C2 subset.
 * - C4 is only text-explicit events and may be empty.
 * - No C3 / items / factions / globalFlags fields may appear anywhere.
 * 
 * The evidence map is shared across layers and reduced per-layer: candidates
 * reference `evidenceIds`, so regenerating one layer cannot mutate the other
 * five (their serialized candidates hash is invariant).
 */

const confidenceSchema = z.enum(['low', 'medium', 'high']);
export type CandidateConfidence = z.infer<typeof confidenceSchema>;

/** Shared evidence atom: a quoted excerpt plus its source chunk index. */
export const evidenceAtomSchema = z.object({
  sourceChunkIndex: z.number().int().nonnegative(),
  quote: z.string().trim().min(1),
}).strict();
export type EvidenceAtom = z.infer<typeof evidenceAtomSchema>;

/** The shared evidence map keyed by evidence id, reduced per layer. */
export const evidenceMapSchema = z.record(z.string().min(1), evidenceAtomSchema);
export type EvidenceMap = z.infer<typeof evidenceMapSchema>;

/** B3 character candidate: CharacterCore minus version, with C1/C3/C2 arcs emptied. */
export const onboardingCharacterSchema = z.object({
  id: entityIdSchema,
  name: z.string().trim().min(1),
  aliases: z.array(z.string()),
  kind: characterKindSchema,
  personality: z.string(),
  background: z.string(),
  motivation: z.string(),
  goals: z.array(z.string()),
  flaws: z.array(z.string()),
  abilities: z.array(z.string()),
  speechStyle: z.string(),
  staticTraits: z.array(z.string()),
  arc: characterArcSchema,
  /** Forced empty: the analyzer never infers C1/C3 forward references. */
  relationships: z.array(entityIdSchema),
  knowledgeIds: z.array(entityIdSchema),
}).strict();
export type OnboardingCharacter = z.infer<typeof onboardingCharacterSchema>;

/** B2 worldview candidate: WorldEntry minus version/status/supersededBy. */
export const onboardingWorldviewSchema = z.object({
  id: entityIdSchema,
  kind: worldKindSchema,
  title: z.string().trim().min(1),
  content: z.string().trim().min(1),
  keywords: z.array(z.string()),
  triggerMode: triggerModeSchema,
  weight: z.number().int(),
  parent: entityIdSchema.nullable(),
  mutable: z.boolean(),
}).strict();
export type OnboardingWorldview = z.infer<typeof onboardingWorldviewSchema>;

/** B5 outline candidate: Outline minus version. */
export const onboardingOutlineSchema = z.object({
  id: entityIdSchema,
  structure: outlineStructureSchema,
  logline: z.string().trim().min(1),
  themes: z.array(z.string().trim().min(1)),
  acts: z.array(actSchema),
  foreshadowing: z.array(foreshadowingSchema),
  endings: z.array(endingSchema),
}).strict();
export type OnboardingOutline = z.infer<typeof onboardingOutlineSchema>;

/** C1 relationship candidate: Relationship minus version. */
export const onboardingRelationshipSchema = z.object({
  id: entityIdSchema,
  from: entityIdSchema,
  to: entityIdSchema,
  type: relationshipTypeSchema,
  affinity: z.number().int().min(-100).max(100),
  trust: z.number().int().min(0).max(100),
  status: z.string().trim().min(1),
  milestones: z.array(entityIdSchema),
  knownTo: z.array(entityIdSchema),
}).strict();
export type OnboardingRelationship = z.infer<typeof onboardingRelationshipSchema>;

/** C2 state candidate: the input-end story-start snapshot, scene+characters only. */
export const onboardingStateSchema = z.object({
  id: entityIdSchema,
  storyTime: z.string(),
  scene: sceneStateSchema,
  characters: z.array(characterStateSchema),
}).strict();
export type OnboardingState = z.infer<typeof onboardingStateSchema>;

/** C4 canon candidate: CanonEvent minus seq/immutable; text-explicit events only. */
export const onboardingCanonSchema = z.object({
  id: entityIdSchema,
  storyTime: z.string(),
  kind: canonKindSchema,
  summary: z.string().min(1),
  detail: z.string(),
  participants: z.array(entityIdSchema),
  location: z.string(),
  consequences: z.array(entityIdSchema),
  affectedLayers: z.array(z.string()),
}).strict();
export type OnboardingCanon = z.infer<typeof onboardingCanonSchema>;

/** A per-layer candidate list with its own evidence references and warnings. */
export const layerCandidatesSchema = <T extends z.ZodTypeAny>(value: T) => z.object({
  candidates: z.array(value),
  confidence: confidenceSchema,
  warnings: z.array(z.string()),
  evidenceIds: z.array(z.string().min(1)),
}).strict();

export const onboardingCharacterLayerSchema = layerCandidatesSchema(onboardingCharacterSchema);
export const onboardingWorldviewLayerSchema = layerCandidatesSchema(onboardingWorldviewSchema);
export const onboardingOutlineLayerSchema = layerCandidatesSchema(onboardingOutlineSchema);
export const onboardingRelationshipLayerSchema = layerCandidatesSchema(onboardingRelationshipSchema);
export const onboardingStateLayerSchema = layerCandidatesSchema(onboardingStateSchema);
export const onboardingCanonLayerSchema = layerCandidatesSchema(onboardingCanonSchema);

/** The six-layer candidate package (model output before reduce/binding). */
export const onboardingLayersSchema = z.object({
  characters: onboardingCharacterLayerSchema,
  worldview: onboardingWorldviewLayerSchema,
  outline: onboardingOutlineLayerSchema,
  relationship: onboardingRelationshipLayerSchema,
  state: onboardingStateLayerSchema,
  canon: onboardingCanonLayerSchema,
}).strict();
export type OnboardingLayers = z.infer<typeof onboardingLayersSchema>;

/** Raw model envelope: a shared evidence map plus the six layers. */
export const onboardingAnalysisOutputSchema = z.object({
  evidence: evidenceMapSchema,
  layers: onboardingLayersSchema,
}).strict();
export type OnboardingAnalysisOutput = z.infer<typeof onboardingAnalysisOutputSchema>;

/**
 * Host-bound analysis result: the reduced candidate package plus the immutable
 * binding triple that every later operation must match exactly.
 */
export const onboardingSessionSchema = z.object({
  projectId: z.string().min(1).max(64),
  onboardingSessionId: z.string().min(1),
  sourceHash: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();
export type OnboardingSession = z.infer<typeof onboardingSessionSchema>;

export const onboardingAnalysisResultSchema = onboardingSessionSchema.extend({
  evidence: evidenceMapSchema,
  layers: onboardingLayersSchema,
}).strict();
export type OnboardingAnalysisResult = z.infer<typeof onboardingAnalysisResultSchema>;

/** Analysis lifecycle status for the Host-owned job. */
export const onboardingAnalysisStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']);
export type OnboardingAnalysisStatus = z.infer<typeof onboardingAnalysisStatusSchema>;

export type OnboardingLayerKey = keyof OnboardingLayers;
export const ONBOARDING_LAYER_KEYS: readonly OnboardingLayerKey[] = ['characters', 'worldview', 'outline', 'relationship', 'state', 'canon'];

/** Free-text / chunked input bound to a session before the LLM is entered. */
export const onboardingAnalysisInputSchema = z.object({
  projectId: z.string().min(1).max(64),
  onboardingSessionId: z.string().min(1),
  sourceHash: z.string().regex(/^[0-9a-f]{64}$/),
  chunks: z.array(z.object({
    index: z.number().int().nonnegative(),
    text: z.string().trim().min(1),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().positive(),
  }).strict()).min(1),
}).strict();
export type OnboardingAnalysisInput = z.infer<typeof onboardingAnalysisInputSchema>;

/** Client-visible start contract: the caller supplies binding + text, Host owns the session. */
export const onboardingAnalysisStartInputSchema = z.object({
  projectId: z.string().min(1).max(64),
  sourceHash: z.string().regex(/^[0-9a-f]{64}$/),
  text: z.string().min(1),
}).strict();
export type OnboardingAnalysisStartInput = z.infer<typeof onboardingAnalysisStartInputSchema>;

/* --------------------------------------------------------------------------
 * I53 six-layer review / per-layer adjudication / idempotent landing
 * (design §14.7.4 / R11-4).
 *
 * The Gate remains the opaque I11 proposal→accept/reject primitive: it records
 * the final three-state decision and never executes a domain side effect. What
 * I53 adds is a *convention on the opaque proposal `payload`* plus a Host facade
 * that maps each of the four user verdicts onto that state machine:
 *
 *   - 直接接受 (accept)        → keep the current proposal, resolve it to `accepted`.
 *   - 手动修改后接受 (edit)    → reject the current proposal, then propose a
 *                                  successor carrying `replacesId` + `mode:'edited'`.
 *   - 整层打回重生成 (regenerate)→ reject current, then `replacesId` + `mode:'regenerated'`
 *                                  (the successor value comes from the analyzer, not the user).
 *   - 显式跳过 (skip)          → reject current, build NO successor.
 *
 * `pending` never equals skip, and `finalApply` refuses to run while any layer
 * still has an active pending proposal. `replacesId` + `mode` live inside the
 * proposal payload so the Gate schema itself is unchanged (R11-4: I11 three
 * states are not modified).
 */

/** How a successor proposal came to replace its predecessor. */
export const onboardingProposalModeSchema = z.enum(['edited', 'regenerated']);
export type OnboardingProposalMode = z.infer<typeof onboardingProposalModeSchema>;

/** The provenance of one candidate value inside a Gate proposal payload. */
export const onboardingCandidateProvenanceSchema = z.object({
  projectId: z.string().min(1).max(64),
  onboardingSessionId: z.string().min(1),
  sourceHash: z.string().regex(/^[0-9a-f]{64}$/),
  layer: z.enum(['characters', 'worldview', 'outline', 'relationship', 'state', 'canon']),
  schemaVersion: z.number().int().positive(),
}).strict();
export type OnboardingCandidateProvenance = z.infer<typeof onboardingCandidateProvenanceSchema>;

/** Gate proposal payload for one layer: the bound candidate value plus lineage. */
export const onboardingLayerProposalPayloadSchema = z.object({
  version: z.number().int().positive(),
  provenance: onboardingCandidateProvenanceSchema,
  /** The raw per-layer candidate value (the serialized `OnboardingLayers[layer]`). */
  value: z.json(),
}).strict();
export type OnboardingLayerProposalPayload = z.infer<typeof onboardingLayerProposalPayloadSchema>;

/**
 * Sufficient evidence of an accepted layer: the exact candidate the user (or
 * edit/regenerate) authorized, bound to the immutable binding triple, so a
 * later `finalApply` retry can re-fingerprint and compare instead of re-running.
 */
export const onboardingAcceptedLayerSchema = z.object({
  layer: z.enum(['characters', 'worldview', 'outline', 'relationship', 'state', 'canon']),
  proposalId: z.string().min(1),
  confidence: confidenceSchema,
  candidates: z.array(z.json()),
}).strict();
export type OnboardingAcceptedLayer = z.infer<typeof onboardingAcceptedLayerSchema>;

/** Per-layer adjudication verb, bundled for the client from an existing session. */
export const onboardingLayerDecisionRequirementSchema = z.enum(['accept', 'edit', 'regenerate', 'skip']);
export type OnboardingLayerDecision = z.infer<typeof onboardingLayerDecisionRequirementSchema>;

/** Client → Host: a decision for one layer, plus an optional edited candidate value. */
export const onboardingAdjudicateInputSchema = z.object({
  projectId: z.string().min(1).max(64),
  onboardingSessionId: z.string().min(1),
  sourceHash: z.string().regex(/^[0-9a-f]{64}$/),
  layer: z.enum(['characters', 'worldview', 'outline', 'relationship', 'state', 'canon']),
  decision: onboardingLayerDecisionRequirementSchema,
  /** The user-validated candidate value, REQUIRED for `decision === 'edit'` (I56 / R12-3). */
  editedValue: z.json().optional(),
  /** Optional free-text feedback forwarded on `regenerate` (single-layer re-run). */
  feedback: z.string().max(4000).optional(),
}).strict().superRefine((input, ctx) => {
  // 「修改后接受」必须提交真实 editedValue，Host 不得回退写原候选（R12-3）。
  if (input.decision === 'edit' && input.editedValue === undefined) {
    ctx.addIssue({ code: 'custom', path: ['editedValue'], message: 'decision "edit" requires editedValue' });
  }
});
export type OnboardingAdjudicateInput = z.infer<typeof onboardingAdjudicateInputSchema>;

export const onboardingFinalApplyInputSchema = z.object({
  projectId: z.string().min(1).max(64),
  onboardingSessionId: z.string().min(1),
  sourceHash: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();
export type OnboardingFinalApplyInput = z.infer<typeof onboardingFinalApplyInputSchema>;

/** The minimal structured result contract for I53 final apply (design §14.7.4). */
export const onboardingApplyResultSchema = z.object({
  projectId: z.string().min(1).max(64),
  onboardingSessionId: z.string().min(1),
  appliedLayers: z.array(z.enum(['characters', 'worldview', 'outline', 'relationship', 'state', 'canon'])),
  skippedLayers: z.array(z.enum(['characters', 'worldview', 'outline', 'relationship', 'state', 'canon'])),
  blockedLayers: z.array(z.enum(['characters', 'worldview', 'outline', 'relationship', 'state', 'canon'])),
  pendingLayers: z.array(z.enum(['characters', 'worldview', 'outline', 'relationship', 'state', 'canon'])),
  retryable: z.boolean(),
  errors: z.array(z.string()),
}).strict();
export type OnboardingApplyResult = z.infer<typeof onboardingApplyResultSchema>;
