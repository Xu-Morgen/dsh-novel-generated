import { z } from 'zod';
import { confidenceSchema } from './base.js';
import { characterCoreSchema } from './characters.js';
import { worldEntrySchema } from './worldview.js';
import { outlineSchema } from './outline.js';
import { relationshipSchema } from './relationship.js';
import { worldStateSchema } from './state.js';
import { canonEventSchema } from './canon.js';
import {
  onboardingBindingSchema,
  onboardingLayerSchema,
  onboardingProjectIdSchema,
  onboardingSessionIdSchema,
  sourceHashSchema,
} from './onboarding-binding.js';

/**
 * I52 six-layer initialization analyzer contract（design §14.8 / R11-3；I102 拆分
 * analysis 片，计划 §18 I102）。
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

// confidenceSchema 为全仓唯一 canonical 定义（见 ./base.js，I76 收敛；review §9 #2），
// 本层从 core 叶子直引，避免 core→llm 反向依赖（review §8#4）。
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

/**
 * B3 character candidate: CharacterCore minus version, with C1/C3/C2 arcs emptied.
 * I81 组合（架构审查 §4.2）：由 `characterCoreSchema.omit(...)` 派生，消除手写逐字段
 * 重列 —— 字段单一来源在 characters.ts，本层只表达「去掉 Host-owned version」。
 */
export const onboardingCharacterSchema = characterCoreSchema.omit({ version: true });
export type OnboardingCharacter = z.infer<typeof onboardingCharacterSchema>;

/** B2 worldview candidate: WorldEntry minus version/status/supersededBy（I81 omit 组合）。 */
export const onboardingWorldviewSchema = worldEntrySchema.omit({ version: true, status: true, supersededBy: true });
export type OnboardingWorldview = z.infer<typeof onboardingWorldviewSchema>;

/** B5 outline candidate: Outline minus version（I81 omit 组合）。 */
export const onboardingOutlineSchema = outlineSchema.omit({ version: true });
export type OnboardingOutline = z.infer<typeof onboardingOutlineSchema>;

/** C1 relationship candidate: Relationship minus version（I81 omit 组合）。 */
export const onboardingRelationshipSchema = relationshipSchema.omit({ version: true });
export type OnboardingRelationship = z.infer<typeof onboardingRelationshipSchema>;

/** C2 state candidate: the input-end story-start snapshot, scene+characters only（I81 omit 组合）。 */
export const onboardingStateSchema = worldStateSchema.omit({ version: true, seq: true });
export type OnboardingState = z.infer<typeof onboardingStateSchema>;

/** C4 canon candidate: CanonEvent minus seq/immutable/supersedes; text-explicit events only（I81 omit 组合）。 */
export const onboardingCanonSchema = canonEventSchema.omit({ seq: true, immutable: true, supersedes: true });
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
 * binding triple that every later operation must match exactly（I102 复用
 * onboardingBindingSchema，消除 projectId/session/sourceHash 重列）。
 */
export const onboardingSessionSchema = onboardingBindingSchema;
export type OnboardingSession = z.infer<typeof onboardingSessionSchema>;

export const onboardingAnalysisResultSchema = onboardingBindingSchema.extend({
  evidence: evidenceMapSchema,
  layers: onboardingLayersSchema,
}).strict();
export type OnboardingAnalysisResult = z.infer<typeof onboardingAnalysisResultSchema>;

/** Analysis lifecycle status for the Host-owned job. */
export const onboardingAnalysisStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']);
export type OnboardingAnalysisStatus = z.infer<typeof onboardingAnalysisStatusSchema>;

export type OnboardingLayerKey = keyof OnboardingLayers;
export const ONBOARDING_LAYER_KEYS: readonly OnboardingLayerKey[] = [...onboardingLayerSchema.options];

/** Free-text / chunked input bound to a session before the LLM is entered. */
export const onboardingAnalysisInputSchema = onboardingBindingSchema.extend({
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
  projectId: onboardingProjectIdSchema,
  sourceHash: sourceHashSchema,
  text: z.string().min(1),
}).strict();
export type OnboardingAnalysisStartInput = z.infer<typeof onboardingAnalysisStartInputSchema>;

/**
 * I57 session-first `begin` result: the Host creates the job and returns the
 * session id immediately so the client can show busy/progress, poll `status`
 * and `cancel` mid-flight (R12-4). The candidate package itself is fetched
 * through `result(onboardingSessionId)` once `status` reports `succeeded`.
 */
export const onboardingAnalysisBeginResultSchema = z.object({
  onboardingSessionId: onboardingSessionIdSchema,
}).strict();
export type OnboardingAnalysisBeginResult = z.infer<typeof onboardingAnalysisBeginResultSchema>;
