import { filterKnowledge } from '../knowledge/filter.js';
import {
  povContextInputSchema,
  povContextSchema,
  publicAtStartProjectionInputSchema,
  type PovContext,
  type PovContextInput,
  type PovLeakViolation,
  type PublicAtStartCanonCandidate,
  type PublicAtStartProjectionInput,
} from '../schema/narrative-visibility.js';

/**
 * Project only explicitly public-at-start source evidence into C4 candidates.
 * Background facts, future plans, presentation notes and author instructions
 * fail closed before any CanonLedger owner can receive them (design §14.15.3).
 */
export function projectPublicAtStart(input: PublicAtStartProjectionInput): readonly PublicAtStartCanonCandidate[] {
  const parsed = publicAtStartProjectionInputSchema.parse(input);
  const evidenceById = new Map(parsed.evidence.map((item) => [item.paragraphId, item]));
  const seen = new Set<string>();
  for (const event of parsed.events) {
    if (seen.has(event.id)) throw new Error(`Duplicate public-at-start C4 event: ${event.id}`);
    seen.add(event.id);
    if (event.evidenceParagraphIds.some((id) => !evidenceById.has(id))) throw new Error(`Unknown public-at-start evidence: ${event.id}`);
    for (const paragraphId of event.evidenceParagraphIds) {
      const evidence = evidenceById.get(paragraphId)!;
      if (evidence.visibility !== 'public-at-start' || evidence.role !== 'prose') {
        throw new Error(`C4 public-at-start guard rejected evidence: ${paragraphId}`);
      }
    }
  }
  return structuredClone(parsed.events);
}

/** Build the exact deterministic context visible to one POV consumer. */
export function buildSafePovContext(rawInput: PovContextInput): PovContext {
  const input = povContextInputSchema.parse(rawInput);
  const knowledge = filterKnowledge(input.pov, input.c3Entries, input.c3States);
  const context = povContextSchema.parse({
    pov: input.pov,
    b5: input.b5,
    b2Triggers: input.b2Triggers,
    knowledge,
    c4Events: input.c4Events,
  });
  assertPovContextNoLeak(input, context);
  return structuredClone(context);
}

/**
 * Hard, deterministic leak detector for the assembled POV context. It checks
 * B5, B2 triggers and public C4 together with the filtered C3 view; no LLM is
 * called and hidden facts cannot be made visible by prompt wording.
 */
export function detectPovContextLeaks(input: PovContextInput, context: PovContext): readonly PovLeakViolation[] {
  const parsedInput = povContextInputSchema.parse(input);
  const parsedContext = povContextSchema.parse(context);
  const visibleIds = new Set(parsedContext.knowledge.entries.map((entry) => entry.id));
  const searchableContext = JSON.stringify({ b5: parsedContext.b5, b2Triggers: parsedContext.b2Triggers, c4Events: parsedContext.c4Events });
  const violations: PovLeakViolation[] = [];
  for (const entry of parsedInput.c3Entries) {
    if (visibleIds.has(entry.id)) continue;
    if (searchableContext.includes(entry.id) || searchableContext.includes(entry.fact)) {
      violations.push({ kind: 'knowledge-leak', severity: 'hard', knowledgeId: entry.id, message: `${parsedContext.pov} context exposes hidden C3 fact ${entry.id}` });
    }
  }
  return Object.freeze(violations.map((violation) => Object.freeze(violation)));
}

/** Throw on any hidden fact appearing before its reveal. */
export function assertPovContextNoLeak(input: PovContextInput, context: PovContext): void {
  const violations = detectPovContextLeaks(input, context);
  if (violations.length > 0) throw new Error(`POV context knowledge leak: ${violations.map((violation) => violation.knowledgeId).join(', ')}`);
}
