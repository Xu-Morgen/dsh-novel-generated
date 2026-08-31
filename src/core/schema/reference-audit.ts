import { z } from 'zod';
import { entityIdSchema } from './base.js';
import {
  referenceAuthorizationSchema,
  referenceFingerprintSchema,
  referenceOwnerSchema,
} from './reference-coordination.js';

/** I116 bounded mechanism evidence; this is never a narrative-layer value. */
export const REFERENCE_AUDIT_MAX_TARGETS = 256;
export const REFERENCE_AUDIT_MAX_PAGE_SIZE = 100;
export const REFERENCE_AUDIT_DEFAULT_PAGE_SIZE = 50;

const auditOwnerSchema = referenceOwnerSchema.extract(['c1', 'c3', 'c4']);
export type ReferenceAuditOwner = z.infer<typeof auditOwnerSchema>;

export const referenceAuditStatusSchema = z.enum(['pending', 'applied', 'failed']);
export type ReferenceAuditStatus = z.infer<typeof referenceAuditStatusSchema>;

/** One bounded owner/field delta. Hashes avoid copying live narrative objects. */
export const referenceAuditTargetSchema = z.object({
  owner: auditOwnerSchema,
  entityId: entityIdSchema,
  field: z.string().trim().min(1).max(80),
  beforeHash: referenceFingerprintSchema.optional(),
  afterHash: referenceFingerprintSchema.optional(),
}).strict().superRefine((target, context) => {
  if (target.beforeHash === undefined && target.afterHash === undefined) {
    context.addIssue({ code: 'custom', path: ['beforeHash'], message: 'Reference audit target needs beforeHash or afterHash' });
  }
});
export type ReferenceAuditTarget = z.infer<typeof referenceAuditTargetSchema>;

/** Input shared by the coordinator and its Host-owned operational journal. */
export const referenceAuditRecordInputSchema = z.object({
  projectId: entityIdSchema,
  operationId: entityIdSchema,
  source: referenceAuthorizationSchema,
  targets: referenceAuditTargetSchema.array().max(REFERENCE_AUDIT_MAX_TARGETS),
}).strict();
export type ReferenceAuditRecordInput = z.infer<typeof referenceAuditRecordInputSchema>;

/** Persisted operational record. It contains no text, layer object, or file path. */
export const referenceAuditRecordSchema = referenceAuditRecordInputSchema.extend({
  recordId: entityIdSchema,
  status: referenceAuditStatusSchema,
  attempt: z.number().int().positive(),
  error: z.string().trim().min(1).max(2_000).optional(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
}).strict().superRefine((record, context) => {
  if (record.status === 'failed' && record.error === undefined) {
    context.addIssue({ code: 'custom', path: ['error'], message: 'Failed reference audit record needs error' });
  }
  if (record.status !== 'failed' && record.error !== undefined) {
    context.addIssue({ code: 'custom', path: ['error'], message: 'Only failed reference audit records may contain error' });
  }
});
export type ReferenceAuditRecord = z.infer<typeof referenceAuditRecordSchema>;

/** Strict, offset-based page request. Cursor is an internal decimal record offset. */
export const referenceAuditListInputSchema = z.object({
  owner: auditOwnerSchema.optional(),
  status: referenceAuditStatusSchema.optional(),
  cursor: z.string().regex(/^(0|[1-9][0-9]*)$/).optional(),
  // Optional on the wire so callers can request the default page size without
  // manufacturing an internal pagination field; the Host normalizes it to 50.
  limit: z.number().int().min(1).max(REFERENCE_AUDIT_MAX_PAGE_SIZE).optional(),
}).strict();
export type ReferenceAuditListInput = z.input<typeof referenceAuditListInputSchema>;
export type ReferenceAuditListOptions = z.output<typeof referenceAuditListInputSchema>;

export const referenceAuditListResultSchema = z.object({
  projectId: entityIdSchema,
  records: referenceAuditRecordSchema.array().max(REFERENCE_AUDIT_MAX_PAGE_SIZE),
  nextCursor: z.string().regex(/^(0|[1-9][0-9]*)$/).nullable(),
}).strict();
export type ReferenceAuditListResult = z.infer<typeof referenceAuditListResultSchema>;
