import { z } from 'zod';
import { entityIdSchema } from './base.js';

/**
 * R18-8 link contract (design §14.14.2 / plan I124).
 *
 * Links are rebuildable navigation data, never a C5/Markdown/archive field.
 * Text offsets deliberately use JavaScript string indexes: `start` and `end`
 * are UTF-16 code-unit offsets and therefore round-trip with `slice()`.
 */
export const textAnchorSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  quote: z.string().min(1),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict().superRefine((anchor, context) => {
  if (anchor.end <= anchor.start) {
    context.addIssue({ code: 'custom', path: ['end'], message: 'Text anchor end must be greater than start' });
  }
});

export const entityLinkKindSchema = z.enum([
  'text',
  'character',
  'worldview',
  'relationship',
  'outline',
  'canon',
  'knowledge',
  'review',
  'timeline',
  'search',
  'scene-card',
]);

const linkBase = { projectId: entityIdSchema };

/** A scene-level or range-level link into the Host-owned C5 text. */
export const textEntityLinkSchema = z.object({
  ...linkBase,
  kind: z.literal('text'),
  chapterId: entityIdSchema,
  sceneId: entityIdSchema,
  anchor: textAnchorSchema.optional(),
}).strict();

/** A link to a non-text entity; the target is resolved by Host on open. */
export const entityEntityLinkSchema = z.object({
  ...linkBase,
  kind: entityLinkKindSchema.exclude(['text']),
  entityId: entityIdSchema,
}).strict();

export const entityLinkSchema = z.discriminatedUnion('kind', [textEntityLinkSchema, entityEntityLinkSchema]);

/** A deterministic request used to rebuild a text link from pure C5 prose. */
export const textLinkSourceSchema = z.object({
  id: entityIdSchema,
  chapterId: entityIdSchema,
  sceneId: entityIdSchema,
  quote: z.string().min(1),
}).strict();

/** A resolved anchor kept in the rebuildable derived index. */
export const textLinkRecordSchema = z.object({
  id: entityIdSchema,
  link: textEntityLinkSchema.extend({ anchor: textAnchorSchema }),
  status: z.enum(['ready', 'stale']),
}).strict();

/** Versioned, deletable link index; C5 remains the only prose source of truth. */
export const textLinkIndexSchema = z.object({
  version: z.literal(1),
  projectId: entityIdSchema,
  sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  sources: z.array(textLinkSourceSchema),
  records: z.array(textLinkRecordSchema),
}).strict();

export type TextAnchor = z.infer<typeof textAnchorSchema>;
export type EntityLink = z.infer<typeof entityLinkSchema>;
export type EntityLinkKind = z.infer<typeof entityLinkKindSchema>;
export type TextLinkSource = z.infer<typeof textLinkSourceSchema>;
export type TextLinkRecord = z.infer<typeof textLinkRecordSchema>;
export type TextLinkIndexFile = z.infer<typeof textLinkIndexSchema>;

/**
 * Construct an anchor from the exact text currently shown to the caller.
 * The caller supplies the Host-computed source hash; no offset guessing or
 * relinking is performed here (stale links are a deliberate safe failure).
 */
export function createTextAnchor(text: string, start: number, end: number, sourceHash: string): TextAnchor {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > text.length) {
    throw new Error('Invalid UTF-16 text anchor range');
  }
  const anchor = textAnchorSchema.parse({ start, end, quote: text.slice(start, end), sourceHash });
  return anchor;
}

/** Validate range and quote against the current text without changing it. */
export function assertTextAnchor(text: string, anchor: TextAnchor): void {
  if (anchor.end > text.length || anchor.end <= anchor.start) {
    throw new Error('Text anchor range is outside current text');
  }
  if (text.slice(anchor.start, anchor.end) !== anchor.quote) {
    throw new Error('Text anchor quote does not match current text');
  }
}
