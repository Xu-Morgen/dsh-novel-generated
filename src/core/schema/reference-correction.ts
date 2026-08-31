import { z } from 'zod';
import { confidenceSchema, entityIdSchema } from './base.js';
import {
  referenceBaseSchema,
  referenceCanonAppendInputSchema,
  referenceChangeSetSchema,
} from './reference-coordination.js';

/** I118 bounded semantic correction input; record IDs are resolved by the Host journal. */
export const referenceCorrectionProposeInputSchema = z.object({
  recordIds: entityIdSchema.array().min(1).max(32),
  instruction: z.string().trim().min(1).max(2_000),
}).strict().superRefine((input, context) => {
  if (new Set(input.recordIds).size !== input.recordIds.length) {
    context.addIssue({ code: 'custom', path: ['recordIds'], message: 'recordIds must be unique' });
  }
});
export type ReferenceCorrectionProposeInput = z.infer<typeof referenceCorrectionProposeInputSchema>;

const correctionOwnerSchema = z.enum(['c1', 'c3', 'c4']);
const c1FieldSchema = z.enum(['type', 'affinity', 'trust', 'status', 'milestones', 'knownTo']);
const c3FieldSchema = z.enum(['holders', 'status']);

/**
 * Model-facing operation vocabulary. Values stay JSON at this boundary so the
 * parser can remain a transport/schema module; the Host narrows each value
 * against the owner field before constructing a full change set.
 */
export const referenceCorrectionOperationSchema = z.discriminatedUnion('owner', [
  z.object({
    owner: z.literal('c1'),
    entityId: entityIdSchema,
    field: c1FieldSchema,
    action: z.enum(['set', 'add']),
    value: z.json(),
  }).strict(),
  z.object({
    owner: z.literal('c3'),
    entityId: entityIdSchema,
    field: c3FieldSchema,
    action: z.enum(['set', 'add']),
    value: z.json(),
  }).strict(),
  z.object({
    owner: z.literal('c4'),
    entityId: entityIdSchema,
    field: z.literal('canon.append'),
    action: z.literal('append'),
    value: referenceCanonAppendInputSchema,
  }).strict(),
]);
export type ReferenceCorrectionOperation = z.infer<typeof referenceCorrectionOperationSchema>;

export const referenceCorrectionMarkedTargetSchema = z.object({
  recordId: entityIdSchema,
  owner: correctionOwnerSchema,
  entityId: entityIdSchema,
  field: z.string().trim().min(1).max(80),
}).strict();
export type ReferenceCorrectionMarkedTarget = z.infer<typeof referenceCorrectionMarkedTargetSchema>;

export const referenceCorrectionParserInputSchema = z.object({
  instruction: z.string().trim().min(1).max(2_000),
  markedTargets: referenceCorrectionMarkedTargetSchema.array().min(1).max(32),
  /** Bounded current projections are context, never model-owned write state. */
  relationships: z.array(z.json()).max(512),
  knowledge: z.object({ entries: z.array(z.json()).max(512), states: z.array(z.json()).max(512) }).strict(),
  canon: z.array(z.json()).max(512),
}).strict();
export type ReferenceCorrectionParserInput = z.infer<typeof referenceCorrectionParserInputSchema>;

export const referenceCorrectionParserOutputSchema = z.object({
  confidence: confidenceSchema,
  operations: referenceCorrectionOperationSchema.array().min(1).max(32),
  rationale: z.string().trim().max(2_000),
}).strict();
export type ReferenceCorrectionParserOutput = z.infer<typeof referenceCorrectionParserOutputSchema>;

export const referenceCorrectionPreviewItemSchema = z.object({
  owner: correctionOwnerSchema,
  entityId: entityIdSchema,
  field: z.string().trim().min(1).max(80),
  before: z.json(),
  after: z.json(),
}).strict();
export type ReferenceCorrectionPreviewItem = z.infer<typeof referenceCorrectionPreviewItemSchema>;

/** Durable candidate shown before I11; it carries the stale-base tokens needed for replay. */
export const referenceCorrectionCandidateSchema = z.object({
  candidateId: entityIdSchema,
  projectId: entityIdSchema,
  sourceRecordIds: entityIdSchema.array().min(1).max(32),
  instruction: z.string().trim().min(1).max(2_000),
  base: referenceBaseSchema,
  confidence: confidenceSchema,
  operations: referenceCorrectionOperationSchema.array().min(1).max(32),
  preview: referenceCorrectionPreviewItemSchema.array().min(1).max(32),
  rationale: z.string().trim().max(2_000),
}).strict();
export type ReferenceCorrectionCandidate = z.infer<typeof referenceCorrectionCandidateSchema>;

/** I11 payload is strict and self-contained so accepted replay survives reload. */
export const referenceCorrectionGatePayloadSchema = z.object({
  candidate: referenceCorrectionCandidateSchema,
  changeSet: referenceChangeSetSchema,
}).strict().superRefine((payload, context) => {
  const authorization = payload.changeSet.authorization;
  if (authorization.kind !== 'reference-correction' || authorization.proposalId !== payload.candidate.candidateId) {
    context.addIssue({ code: 'custom', path: ['changeSet', 'authorization'], message: 'Gate payload authorization must name its candidate' });
  }
  if (payload.changeSet.projectId !== payload.candidate.projectId) {
    context.addIssue({ code: 'custom', path: ['changeSet', 'projectId'], message: 'Gate payload project mismatch' });
  }
});
export type ReferenceCorrectionGatePayload = z.infer<typeof referenceCorrectionGatePayloadSchema>;

export const referenceCorrectionProposeResultSchema = z.object({
  projectId: entityIdSchema,
  proposalId: entityIdSchema,
  status: z.literal('pending'),
  candidate: referenceCorrectionCandidateSchema,
}).strict();
export type ReferenceCorrectionProposeResult = z.infer<typeof referenceCorrectionProposeResultSchema>;

export const referenceCorrectionAcceptResultSchema = z.object({
  projectId: entityIdSchema,
  proposalId: entityIdSchema,
  status: z.enum(['applied', 'already-applied']),
  changedOwners: z.array(z.enum(['c1', 'c3', 'c4'])),
}).strict();
export type ReferenceCorrectionAcceptResult = z.infer<typeof referenceCorrectionAcceptResultSchema>;

export const referenceCorrectionRejectResultSchema = z.object({
  projectId: entityIdSchema,
  proposalId: entityIdSchema,
  status: z.literal('rejected'),
}).strict();
export type ReferenceCorrectionRejectResult = z.infer<typeof referenceCorrectionRejectResultSchema>;

export const referenceCorrectionPendingItemSchema = z.object({
  projectId: entityIdSchema,
  proposalId: entityIdSchema,
  status: z.literal('pending'),
  candidate: referenceCorrectionCandidateSchema,
}).strict();
export type ReferenceCorrectionPendingItem = z.infer<typeof referenceCorrectionPendingItemSchema>;

export const referenceCorrectionPendingResultSchema = referenceCorrectionPendingItemSchema.array().max(32);
