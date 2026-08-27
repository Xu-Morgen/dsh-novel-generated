import { z } from 'zod';

/**
 * Build one detector violation shape for the shared I20 fail-closed boundary
 * (I76 convergence; review §5.4 / §9 #2 — previously 3 hand-written copies in
 * `llm/validate/{index,knowledge,relationship-style}.ts`). Each detector keeps
 * only its `kind` enum/literal, assert function and prompt; the
 * message/references/severity envelope is built here once.
 *
 * Contract: severity is frozen to the detector's literal and references must
 * be non-empty, so a finding without an auditable citation can never reach the
 * I20 adjudicator (plan I21/I22/I24). `kind` stays the caller's enum/literal
 * so each detector keeps its exact output shape.
 */
export function violationSchema<T extends z.ZodTypeAny>(kind: T, severity: 'hard' | 'soft') {
  return z.object({
    kind,
    severity: z.literal(severity),
    message: z.string().trim().min(1),
    references: z.array(z.string().trim().min(1)).min(1),
  }).strict();
}
