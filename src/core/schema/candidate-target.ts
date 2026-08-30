import { z } from 'zod';
import { entityIdSchema } from './base.js';

/** Explicit new-scene selection accepted by Host candidate production. */
export const candidateTargetSelectionSchema = z.object({
  chapterId: entityIdSchema,
  sceneId: entityIdSchema,
}).strict();
export type CandidateTargetSelection = z.infer<typeof candidateTargetSelectionSchema>;

const ownerFingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/);

/**
 * Host-only frozen owner tokens for an unoccupied candidate target.
 * This shape is never embedded in WritingCandidate or returned over Remote.
 */
export const candidateTargetSnapshotSchema = candidateTargetSelectionSchema.extend({
  detailBeatId: entityIdSchema.optional(),
  textFingerprint: ownerFingerprintSchema,
  outlineFingerprint: ownerFingerprintSchema,
  bindingFingerprint: ownerFingerprintSchema,
}).strict();
export type CandidateTargetSnapshot = z.infer<typeof candidateTargetSnapshotSchema>;
