import { z } from 'zod';
import { confidenceSchema, entityIdSchema } from './base.js';
import { narrativeIntentSchema } from './import-interpretation.js';
import { onboardingCanonLayerSchema, onboardingCharacterLayerSchema, onboardingOutlineLayerSchema, onboardingRelationshipLayerSchema, onboardingStateLayerSchema, onboardingWorldviewLayerSchema } from './onboarding.js';
import { narrativeAdaptationCandidateSchema } from './narrative-adaptation.js';
import { narrativeRevealCandidateSchema } from './narrative-reveal.js';
import { publicAtStartCanonCandidateSchema } from './narrative-visibility.js';
import { sourceHashSchema } from './onboarding-binding.js';

/** Stable stage order used by the Stage 19 application coordinator. */
export const narrativeImportStageSchema = z.enum(['characters', 'worldview', 'outline', 'state', 'canon', 'relationship', 'knowledge']);
export type NarrativeImportStage = z.infer<typeof narrativeImportStageSchema>;
export const NARRATIVE_IMPORT_APPLY_ORDER: readonly NarrativeImportStage[] = ['characters', 'worldview', 'outline', 'state', 'canon', 'relationship', 'knowledge'];

/** Canon candidate keeps source evidence until the coordinator strips it for the C4 owner. */
export const narrativeImportCanonLayerSchema = z.object({
  candidates: z.array(publicAtStartCanonCandidateSchema),
  confidence: confidenceSchema,
  warnings: z.array(z.string()),
  evidenceIds: z.array(z.string().trim().min(1).max(200)),
}).strict();

/** I52 foundation layers plus Stage 19 B5/C3/C4 candidates in one preview. */
export const narrativeImportPlanPackageSchema = z.object({
  characters: onboardingCharacterLayerSchema,
  worldview: onboardingWorldviewLayerSchema,
  outline: narrativeAdaptationCandidateSchema,
  state: onboardingStateLayerSchema,
  canon: narrativeImportCanonLayerSchema,
  relationship: onboardingRelationshipLayerSchema,
  knowledge: narrativeRevealCandidateSchema,
}).strict();
export type NarrativeImportPlanPackage = z.infer<typeof narrativeImportPlanPackageSchema>;

/** Client/Host input for one new, empty-project plan. */
export const narrativeImportPlanInputSchema = z.object({
  projectId: entityIdSchema,
  importSessionId: entityIdSchema,
  sourceHash: sourceHashSchema,
  sourceRole: z.enum(['idea', 'background-material', 'hybrid']),
  treatment: z.literal('adapt-pov'),
  narrativeIntent: narrativeIntentSchema,
  package: narrativeImportPlanPackageSchema,
}).strict().superRefine((input, context) => {
  const identityChecks = [
    ['outline', input.package.outline.projectId, input.package.outline.importSessionId, input.package.outline.sourceHash],
    ['knowledge', input.package.knowledge.projectId, input.package.knowledge.importSessionId, input.package.knowledge.sourceHash],
  ] as const;
  for (const [name, projectId, importSessionId, sourceHash] of identityChecks) {
    if (projectId !== input.projectId || importSessionId !== input.importSessionId || sourceHash !== input.sourceHash) {
      context.addIssue({ code: 'custom', path: ['package', name], message: `${name} candidate binding does not match plan` });
    }
  }
  if (input.package.outline.sourceRole !== input.sourceRole || input.package.knowledge.sourceRole !== input.sourceRole) context.addIssue({ code: 'custom', path: ['package'], message: 'Stage 19 candidate source roles must match plan' });
  if (JSON.stringify(input.package.outline.narrativeIntent) !== JSON.stringify(input.narrativeIntent) || JSON.stringify(input.package.knowledge.narrativeIntent) !== JSON.stringify(input.narrativeIntent)) context.addIssue({ code: 'custom', path: ['narrativeIntent'], message: 'Stage 19 candidates must preserve the confirmed narrative intent' });
});
export type NarrativeImportPlanInput = z.infer<typeof narrativeImportPlanInputSchema>;

export const narrativeImportPlanStatusSchema = z.enum(['pending', 'accepted', 'rejected', 'partial-failure', 'pending-recovery', 'applied', 'stale']);
export type NarrativeImportPlanStatus = z.infer<typeof narrativeImportPlanStatusSchema>;
export const narrativeImportPlanIdentitySchema = z.object({
  projectId: entityIdSchema,
  importSessionId: entityIdSchema,
  sourceHash: sourceHashSchema,
  planId: entityIdSchema,
}).strict();
export type NarrativeImportPlanIdentity = z.infer<typeof narrativeImportPlanIdentitySchema>;

/** Durable checkpoint; committedStages is the recovery truth, never inferred from status. */
export const narrativeImportPlanSchema = narrativeImportPlanIdentitySchema.extend({
  sourceRole: z.enum(['idea', 'background-material', 'hybrid']),
  treatment: z.literal('adapt-pov'),
  narrativeIntent: narrativeIntentSchema,
  package: narrativeImportPlanPackageSchema,
  confirmationId: entityIdSchema,
  status: narrativeImportPlanStatusSchema,
  committedStages: z.array(narrativeImportStageSchema),
  errors: z.array(z.string()),
}).strict();
export type NarrativeImportPlan = z.infer<typeof narrativeImportPlanSchema>;

export const narrativeImportPlanResultSchema = narrativeImportPlanSchema;
export type NarrativeImportPlanResult = z.infer<typeof narrativeImportPlanResultSchema>;
export const narrativeImportPlanFileSchema = z.object({ plans: z.array(narrativeImportPlanSchema) }).strict();
