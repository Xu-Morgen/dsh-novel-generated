import { z } from 'zod';

/**
 * Canonical pure text normalization/chunking pipeline (design §14.12 / R16-2).
 *
 * Invariants:
 * - normalization removes one BOM, applies NFC, canonicalizes newlines, trims
 *   trailing line whitespace, collapses 3+ newlines, and trims the document;
 * - chunking is deterministic, prefers a paragraph boundary in the latter half
 *   of the requested window, omits whitespace-only chunks, and reports offsets
 *   into the normalized source text;
 * - this module performs no I/O and owns the sole implementation consumed by
 *   both controlled upload and file/text import.
 */

/** Stable chunk projection shared by upload and import consumers. */
export const textChunkSchema = z.object({
  index: z.number().int().nonnegative(),
  text: z.string().min(1),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().positive(),
}).strict();
export type ImportedChunk = z.infer<typeof textChunkSchema>;

/** Normalize decoded source text without changing the established I37/I51 behavior. */
export function normalizeText(input: string): string {
  const normalized = input.replace(/^\uFEFF/, '').normalize('NFC').replace(/\r\n?/g, '\n');
  return normalized.split('\n').map((line) => line.trimEnd()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Split normalized text into deterministic, source-offset-preserving chunks. */
export function chunkText(text: string, size: number): ImportedChunk[] {
  const chunks: ImportedChunk[] = [];
  let cursor = 0;
  let index = 0;
  while (cursor < text.length) {
    const limit = Math.min(cursor + size, text.length);
    let end = limit;
    if (limit < text.length) {
      const boundary = text.lastIndexOf('\n\n', limit);
      if (boundary > cursor + Math.floor(size / 2)) end = boundary;
    }
    const value = text.slice(cursor, end).trim();
    if (value) {
      const startOffset = cursor + text.slice(cursor, end).search(/\S/);
      const endOffset = startOffset + value.length;
      chunks.push({ index, text: value, startOffset, endOffset });
      index += 1;
    }
    cursor = end;
    while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
  }
  return chunks;
}
