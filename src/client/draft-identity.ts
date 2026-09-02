/** Entity kinds whose canonical identity is created by the Client draft seam. */
export type DraftEntityKind = 'chapter' | 'scene' | 'rule' | 'act' | 'beat' | 'detail';

const PREFIX: Readonly<Record<DraftEntityKind, string>> = {
  chapter: 'chapter', scene: 'scene', rule: 'rule', act: 'act', beat: 'beat', detail: 'detail',
};

/**
 * Create an opaque, stable draft identity without exposing it as an author field.
 * The hash is deterministic for the same semantic seed; collision suffixes are
 * selected only from the supplied live projection (design §14.27 / R30-2).
 */
export function draftEntityId(kind: DraftEntityKind, seed: string, occupied: readonly string[]): string {
  let hash = 0x811c9dc5;
  const input = `${kind}:${seed.trim() || 'untitled'}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const base = `${PREFIX[kind]}-${hash.toString(36)}`;
  const used = new Set(occupied);
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}
