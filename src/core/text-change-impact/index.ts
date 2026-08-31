import { createHash } from 'node:crypto';
import { TEXT_CHANGE_IMPACT_MAX_TEXT, textChangeDeltaSchema, type TextChangeDelta, type TextChangeRange } from '../schema/text-change-impact.js';

/** SHA-256 used by baseline/C5 freshness and evidence sourceHash contracts. */
export function textChangeHash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function changedRange(before: string, after: string): { before: TextChangeRange; after: TextChangeRange } {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start += 1;
  let beforeEnd = before.length;
  let afterEnd = after.length;
  while (beforeEnd > start && afterEnd > start && before[beforeEnd - 1] === after[afterEnd - 1]) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }
  return { before: { start, end: beforeEnd }, after: { start, end: afterEnd } };
}

/**
 * Build the bounded, deterministic baseline→final evidence before any LLM call.
 * Whitespace-only changes are classified as pure formatting here, so they never
 * enter semantic B5 impact analysis (design §14.14.2 / R18-11).
 */
export function buildTextChangeDelta(before: string, after: string): TextChangeDelta {
  if (before.length > TEXT_CHANGE_IMPACT_MAX_TEXT || after.length > TEXT_CHANGE_IMPACT_MAX_TEXT) {
    throw new Error(`Text change impact text exceeds ${TEXT_CHANGE_IMPACT_MAX_TEXT} UTF-16 code units`);
  }
  const ranges = changedRange(before, after);
  return textChangeDeltaSchema.parse({
    beforeHash: textChangeHash(before), afterHash: textChangeHash(after),
    beforeLength: before.length, afterLength: after.length,
    beforeRange: ranges.before, afterRange: ranges.after,
    beforeQuote: before.slice(ranges.before.start, ranges.before.end),
    afterQuote: after.slice(ranges.after.start, ranges.after.end),
    pureFormatting: before.replace(/\s/gu, '') === after.replace(/\s/gu, ''),
  });
}

export function assertTextChangeRange(text: string, range: TextChangeRange, label: string): void {
  if (range.end > text.length) throw new Error(`${label} exceeds text length`);
}

/** Validate model evidence against the two exact strings and the current source hash. */
export function assertTextChangeEvidence(
  before: string,
  after: string,
  afterHash: string,
  evidence: { sourceHash: string; beforeRange: TextChangeRange; afterRange: TextChangeRange; beforeQuote: string; afterQuote: string },
): void {
  assertTextChangeRange(before, evidence.beforeRange, 'Impact before evidence range');
  assertTextChangeRange(after, evidence.afterRange, 'Impact after evidence range');
  if (evidence.sourceHash !== afterHash) throw new Error('Impact evidence sourceHash does not match final text');
  if (before.slice(evidence.beforeRange.start, evidence.beforeRange.end) !== evidence.beforeQuote) throw new Error('Impact before evidence quote does not match range');
  if (after.slice(evidence.afterRange.start, evidence.afterRange.end) !== evidence.afterQuote) throw new Error('Impact after evidence quote does not match range');
}

export { textChangeDeltaSchema };
