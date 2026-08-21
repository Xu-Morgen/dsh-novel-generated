import { z } from 'zod';
import { entityIdSchema } from '../schema/base.js';
import { outlineProgressSchema } from '../schema/outline-progress.js';

/** The only severities detectors may emit; unknown values fail closed. */
export const violationSeveritySchema = z.enum(['hard', 'soft']);
export type ViolationSeverity = z.infer<typeof violationSeveritySchema>;

/**
 * Detector output contract consumed by the I20 adjudicator (design §9.1).
 * Detectors own finding violations; this schema and the adjudicator only own
 * deterministic validation and the pass/warn/reject mapping.
 */
export const consistencyViolationSchema = z.object({
  kind: z.string().trim().min(1),
  severity: violationSeveritySchema,
  message: z.string().trim().min(1),
  references: z.array(z.string().trim().min(1)),
}).strict();
export type ConsistencyViolation = z.infer<typeof consistencyViolationSchema>;

export const consistencyViolationsSchema = z.array(consistencyViolationSchema);

export const consistencyStatusSchema = z.enum(['pass', 'warn', 'reject']);
export type ConsistencyStatus = z.infer<typeof consistencyStatusSchema>;

/** Deep-readonly violation view returned after the adjudication boundary. */
export interface ConsistencyViolationView {
  readonly kind: string;
  readonly severity: ViolationSeverity;
  readonly message: string;
  readonly references: readonly string[];
}

/** Deep-readonly result of applying design §9's hard/soft policy to valid findings. */
export interface ConsistencyAdjudication {
  readonly status: ConsistencyStatus;
  readonly violations: readonly ConsistencyViolationView[];
}

/**
 * Map validated structured violations to the sole consistency decision.
 *
 * Invariants: one hard finding rejects; otherwise any soft finding warns; an
 * empty set passes. Input is parsed at this boundary so malformed detector
 * output cannot be accidentally treated as a pass (plan I20 / R4-1).
 */
export function adjudicateViolations(input: unknown): ConsistencyAdjudication {
  const violations = consistencyViolationsSchema.parse(input);
  const status: ConsistencyStatus = violations.some((violation) => violation.severity === 'hard')
    ? 'reject'
    : violations.length > 0
      ? 'warn'
      : 'pass';
  return Object.freeze({
    status,
    violations: Object.freeze(violations.map((violation) => freezeViolation(violation))),
  });
}

function freezeViolation(violation: ConsistencyViolation): ConsistencyViolationView {
  return Object.freeze({ ...violation, references: Object.freeze([...violation.references]) });
}

/**
 * Deterministically find literal B4 forbidden expressions without assigning
 * semantic meaning. Each match is a structured soft violation for the I20
 * adjudicator; later detectors may add other violation kinds (plan I20/I24).
 */
export function detectForbiddenExpressions(prose: unknown, forbidden: unknown): readonly ConsistencyViolation[] {
  const text = z.string().parse(prose);
  const expressions = z.array(z.string().trim().min(1)).parse(forbidden);
  return Object.freeze(expressions
    .filter((expression) => text.includes(expression))
    .map((expression): ConsistencyViolation => ({
      kind: 'forbidden-expression',
      severity: 'soft',
      message: `Forbidden expression used: ${expression}`,
      references: [expression],
    })));
}

/**
 * Strict structural inputs for I23's deterministic soft checks. Entity
 * references are intentionally supplied as IDs: resolving prose names would
 * be semantic detection and is outside this iteration's contract.
 */
export const structuralSoftCheckInputSchema = z.object({
  progress: outlineProgressSchema,
  entityReferences: z.array(entityIdSchema),
  knownEntityIds: z.array(entityIdSchema),
}).strict();
export type StructuralSoftCheckInput = z.infer<typeof structuralSoftCheckInputSchema>;

/**
 * Find unresolved C6 deviations and explicit references to unknown entities.
 *
 * Every finding is soft by contract: the I20 adjudicator must return `warn`,
 * never `reject`, so a user may accept a story direction that diverges from
 * B5 (design §9 / plan I23). Input parsing fails before inspection to prevent
 * corrupt structural state from being silently treated as no warning.
 */
export function detectStructuralSoftViolations(input: unknown): readonly ConsistencyViolation[] {
  const { progress, entityReferences, knownEntityIds } = structuralSoftCheckInputSchema.parse(input);
  const unresolvedDeviations = progress.deviations
    .filter((deviation) => !deviation.reconciled)
    .map((deviation): ConsistencyViolation => ({
      kind: 'unresolved-outline-deviation',
      severity: 'soft',
      message: `Outline deviation remains unresolved: ${deviation.id}`,
      references: [deviation.id],
    }));
  const known = new Set(knownEntityIds);
  const danglingReferences = [...new Set(entityReferences)]
    .filter((reference) => !known.has(reference))
    .map((reference): ConsistencyViolation => ({
      kind: 'dangling-entity-reference',
      severity: 'soft',
      message: `Entity reference does not resolve: ${reference}`,
      references: [reference],
    }));
  return Object.freeze([...unresolvedDeviations, ...danglingReferences]);
}

/**
 * I20 two-gate fixture seam. Both gates deliberately call the same pure
 * adjudicator so later generation and writeback orchestration cannot diverge
 * in severity handling (design §9.1).
 */
export interface ConsistencyValidator {
  afterGeneration(violations: unknown): ConsistencyAdjudication;
  beforeWriteback(violations: unknown): ConsistencyAdjudication;
}

export function createConsistencyValidator(): ConsistencyValidator {
  return Object.freeze({
    afterGeneration: adjudicateViolations,
    beforeWriteback: adjudicateViolations,
  });
}
