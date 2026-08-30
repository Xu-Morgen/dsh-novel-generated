import { createHash } from 'node:crypto';
import { outlineSchema, type Outline } from '../schema/outline.js';

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
}

/** SHA-256 of canonical parsed B5 content; YAML formatting never affects it. */
export function outlineContentFingerprint(outline: Outline): string {
  const parsed = outlineSchema.parse(outline);
  return createHash('sha256').update(canonical(parsed), 'utf8').digest('hex');
}
