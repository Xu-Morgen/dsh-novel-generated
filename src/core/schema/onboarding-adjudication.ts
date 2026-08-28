import { z } from 'zod';
import { confidenceSchema } from './base.js';
import {
  onboardingBindingSchema,
  onboardingLayerSchema,
  onboardingProjectIdSchema,
  onboardingSessionIdSchema,
  sourceHashSchema,
} from './onboarding-binding.js';

/* --------------------------------------------------------------------------
 * I53 six-layer review / per-layer adjudication / idempotent landing
 * (design §14.7.4 / R11-4；I102 拆分 adjudication 片，计划 §18 I102)。
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

/** The provenance of one candidate value inside a Gate proposal payload（I102 复用 binding）。 */
export const onboardingCandidateProvenanceSchema = onboardingBindingSchema.extend({
  layer: onboardingLayerSchema,
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
  layer: onboardingLayerSchema,
  proposalId: z.string().min(1),
  confidence: confidenceSchema,
  candidates: z.array(z.json()),
}).strict();
export type OnboardingAcceptedLayer = z.infer<typeof onboardingAcceptedLayerSchema>;

/** Per-layer adjudication verb, bundled for the client from an existing session. */
export const onboardingLayerDecisionRequirementSchema = z.enum(['accept', 'edit', 'regenerate', 'skip']);
export type OnboardingLayerDecision = z.infer<typeof onboardingLayerDecisionRequirementSchema>;

/** Client → Host: a decision for one layer, plus an optional edited candidate value. */
export const onboardingAdjudicateInputSchema = onboardingBindingSchema.extend({
  layer: onboardingLayerSchema,
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

export const onboardingFinalApplyInputSchema = onboardingBindingSchema;
export type OnboardingFinalApplyInput = z.infer<typeof onboardingFinalApplyInputSchema>;

/** The minimal structured result contract for I53 final apply (design §14.7.4；I102 复用 layer enum）。 */
export const onboardingApplyResultSchema = z.object({
  projectId: onboardingProjectIdSchema,
  onboardingSessionId: onboardingSessionIdSchema,
  appliedLayers: z.array(onboardingLayerSchema),
  skippedLayers: z.array(onboardingLayerSchema),
  blockedLayers: z.array(onboardingLayerSchema),
  pendingLayers: z.array(onboardingLayerSchema),
  retryable: z.boolean(),
  errors: z.array(z.string()),
}).strict();
export type OnboardingApplyResult = z.infer<typeof onboardingApplyResultSchema>;
