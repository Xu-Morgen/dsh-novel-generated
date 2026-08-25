import { Unzip, UnzipInflate, UnzipPassThrough } from 'fflate';
import type { AsyncFlateStreamHandler } from 'fflate';

/**
 * Mature ZIP/XML DOCX reader (design §14.7.2 / D18, requirement R11-2 / N-3).
 *
 * Replaces the hand-written minimal ZIP parser (I37) with a maintained decompression
 * library (`fflate`). The adapter is the single owner of every safety invariant for
 * decoding an uploaded DOCX package, enforced before any bytes are returned:
 *
 * - a local-file-header magic check (ZIP not honored as DOCX otherwise);
 * - a bounded entry count;
 * - path-traversal / absolute / unsupported entry-name rejection;
 * - per-entry decompression caps;
 * - an aggregate decompression cap (zip-bomb protection);
 * - a compression-ratio cap (compressed tiny vs. expanded huge);
 * - strict XML decoding of `word/document.xml` only (no other OOXML surface read).
 *
 * The final product is normalized text; the adapter never hands raw bytes back to
 * the caller and never persists anything.
 */

/** All numeric caps are host-owned constants; no caller override (design §14.7.2). */
export const DOCX_LIMITS = Object.freeze({
  /** Compressed package byte cap (design default 10 MiB). */
  maxCompressedBytes: 10 * 1024 * 1024,
  /** Maximum number of entries in the ZIP central directory. */
  maxEntries: 4096,
  /** Maximum inflated size of a single entry. */
  maxEntryUncompressedBytes: 64 * 1024 * 1024,
  /** Maximum total inflated bytes across all entries (zip-bomb guard). */
  maxTotalUncompressedBytes: 256 * 1024 * 1024,
  /** Compressed:uncompressed ratio above which an entry is treated as a bomb. */
  maxCompressionRatio: 1000,
});

function fail(message: string): never {
  throw new Error(`DOCX rejected: ${message}`);
}

/** A zip entry name must be a safe relative path without traversal or drive syntax. */
function assertSafeEntryName(name: string): void {
  const normalized = name.replaceAll('\\', '/');
  if (
    normalized.length === 0 ||
    normalized.startsWith('/') ||
    normalized.split('/').some((part) => part === '..') ||
    /^[a-zA-Z]:/.test(normalized) ||
    normalized.includes('\u0000')
  ) {
    fail(`unsafe zip entry name: ${name}`);
  }
}

/** Collect the (name -> inflate-limits) view of a DOCX package stream. */
function collectEntries(buffer: Uint8Array): Map<string, Uint8Array> {
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) fail('not a docx package');
  if (buffer.length > DOCX_LIMITS.maxCompressedBytes) fail('compressed package exceeds size limit');

  const entries = new Map<string, Uint8Array>();
  let entryCount = 0;
  let totalUncompressed = 0;

  const unzip = new Unzip((file) => {
    entryCount += 1;
    if (entryCount > DOCX_LIMITS.maxEntries) {
      file.terminate();
      fail('zip entry count exceeds limit');
    }
    assertSafeEntryName(file.name);
    if (file.originalSize !== undefined && file.originalSize > DOCX_LIMITS.maxEntryUncompressedBytes) {
      fail(`entry ${file.name} exceeds decompressed size limit`);
    }
    const compressed = file.size ?? 0;
    const original = file.originalSize ?? 0;
    if (original > 0 && compressed > 0) {
      const ratio = original / compressed;
      if (ratio > DOCX_LIMITS.maxCompressionRatio) fail(`entry ${file.name} exceeds compression ratio limit`);
    }
    const chunks: Uint8Array[] = [];
    let length = 0;
    const ondata: AsyncFlateStreamHandler = (err, data, final) => {
      if (err) { file.terminate(); fail(`decompression error in entry ${file.name}`); }
      if (data) {
        length += data.length;
        totalUncompressed += data.length;
        if (length > DOCX_LIMITS.maxEntryUncompressedBytes) { file.terminate(); fail(`entry ${file.name} inflates past size limit`); }
        if (totalUncompressed > DOCX_LIMITS.maxTotalUncompressedBytes) { file.terminate(); fail('zip total decompressed size exceeds limit'); }
        chunks.push(data);
      }
      if (final) {
        const merged = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
        entries.set(file.name, merged);
      }
    };
    file.ondata = ondata;
    file.start();
  });
  unzip.register(UnzipInflate);
  unzip.register(UnzipPassThrough);
  unzip.push(buffer, true);
  return entries;
}

/** Strip OOXML run markup into plain text, preserving tabs and paragraph breaks. */
function xmlText(xml: string): string {
  return xml
    .replace(/<w:tab\s*\/?\s*>/g, '\t')
    .replace(/<w:br\s*\/?\s*>/g, '\n')
    .replace(/<w:cr\s*\/?\s*>/g, '\n')
    .replace(/<w:p[^>]*>/g, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Decode a real DOCX ZIP package into normalized text. Only `word/document.xml`
 * is read and decoded; every other entry is parsed for safety limits but ignored.
 */
export function readDocxText(buffer: Uint8Array): string {
  const entries = collectEntries(buffer);
  const document = entries.get('word/document.xml');
  if (!document) fail('word/document.xml is missing');
  let xml: string;
  try {
    xml = new TextDecoder('utf-8', { fatal: true }).decode(document);
  } catch {
    fail('word/document.xml is not valid UTF-8');
  }
  if (xml.includes('\u0000')) fail('word/document.xml contains NUL');
  return xmlText(xml);
}
