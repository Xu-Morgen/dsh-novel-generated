import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Scene } from '../schema/text.js';
import type { TextRange } from '../text/index.js';

export const editRangeSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
}).strict().superRefine((range, context) => {
  if (range.end < range.start) context.addIssue({ code: 'custom', path: ['end'], message: 'Range end must not precede start' });
});
export type EditRange = z.infer<typeof editRangeSchema>;

export interface EditFingerprint {
  readonly before: string;
  readonly after: string;
  readonly unchangedPrefix: string;
  readonly unchangedSuffix: string;
}

/** I42 deterministic evidence for a localized C5 edit; hashes cover only the target scene. */
export function fingerprintEdit(original: string, range: TextRange, replacement: string): EditFingerprint {
  editRangeSchema.parse(range);
  if (range.end > original.length) throw new Error('Edit range exceeds original text');
  const next = original.slice(0, range.start) + replacement + original.slice(range.end);
  return Object.freeze({
    before: hash(original),
    after: hash(next),
    unchangedPrefix: original.slice(0, range.start),
    unchangedSuffix: original.slice(range.end),
  });
}

/** Assert the returned scene changed exactly the requested half-open range. */
export function assertLocalizedEdit(original: string, changed: Scene, range: TextRange, replacement: string): EditFingerprint {
  const evidence = fingerprintEdit(original, range, replacement);
  if (changed.content !== evidence.unchangedPrefix + replacement + evidence.unchangedSuffix) {
    throw new Error('Localized edit changed text outside the requested range');
  }
  return evidence;
}

function hash(value: string): string { return createHash('sha256').update(value, 'utf8').digest('hex'); }
