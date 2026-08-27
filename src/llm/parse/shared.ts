import { z } from 'zod';

// Re-export the single canonical confidence enum so every parser consumes one
// definition (I76; review §9 #2). The zod definition lives in the core leaf
// `core/schema/base.ts` — `core/schema/onboarding.ts` is the 7th consumer and
// core must not depend on llm (review §8#4).
export { confidenceSchema, type Confidence } from '../../core/schema/base.js';

/**
 * Parse one JSON-only LLM response at the fail-closed model boundary and
 * validate it against the given strict output schema.
 *
 * Contract: `text` must be a non-empty string (else a zod parse error), valid
 * JSON (else an `${label} must be valid JSON` error carrying the parse cause),
 * and must satisfy `schema` exactly — the strict output schemas reject unknown
 * fields so extra model output cannot silently pass (plan I25–I38/I21–I24).
 * This is the single parse-JSON-or-throw implementation: each domain parser
 * keeps only its op-shape schema, assert function and prompt (I76; review §9
 * #2 / §5.4).
 */
export function parseJsonObject<T extends z.ZodTypeAny>(text: unknown, schema: T, label: string): z.infer<T> {
  const response = z.string().trim().min(1).parse(text);
  let json: unknown;
  try {
    json = JSON.parse(response);
  } catch (cause) {
    throw new Error(`${label} must be valid JSON`, { cause });
  }
  return schema.parse(json);
}
