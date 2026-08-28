import { Unzip, UnzipInflate, UnzipPassThrough } from 'fflate';
import type { AsyncFlateStreamHandler } from 'fflate';

/**
 * Canonical pure ZIP/XML DOCX reader (design §14.7.2 / D18, R11-2 / N-3).
 * It is the single owner of package safety limits and returns text without I/O.
 */
export const DOCX_LIMITS = Object.freeze({
  maxCompressedBytes: 10 * 1024 * 1024,
  maxEntries: 4096,
  maxEntryUncompressedBytes: 64 * 1024 * 1024,
  maxTotalUncompressedBytes: 256 * 1024 * 1024,
  maxCompressionRatio: 1000,
});

function fail(message: string): never {
  throw new Error(`DOCX rejected: ${message}`);
}

function assertSafeEntryName(name: string): void {
  const normalized = name.replaceAll('\\', '/');
  if (
    normalized.length === 0 ||
    normalized.startsWith('/') ||
    normalized.split('/').some((part) => part === '..') ||
    /^[a-zA-Z]:/.test(normalized) ||
    normalized.includes('\u0000')
  ) fail(`unsafe zip entry name: ${name}`);
}

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
    if (original > 0 && compressed > 0 && original / compressed > DOCX_LIMITS.maxCompressionRatio) {
      fail(`entry ${file.name} exceeds compression ratio limit`);
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

/** Decode `word/document.xml`; all package entries are still checked for safety. */
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
