import { inflateRawSync } from 'node:zlib';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { z } from 'zod';

export const importFormatSchema = z.enum(['txt', 'md', 'docx']);
export type ImportFormat = z.infer<typeof importFormatSchema>;

export const importedChunkSchema = z.object({
  index: z.number().int().nonnegative(),
  text: z.string().min(1),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().positive(),
}).strict();
export type ImportedChunk = z.infer<typeof importedChunkSchema>;

export const pendingImportCandidateSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['outline', 'worldview', 'detail-beat']),
  status: z.literal('pending'),
  sourceChunkIndex: z.number().int().nonnegative(),
  value: z.unknown(),
}).strict();
export type PendingImportCandidate = z.infer<typeof pendingImportCandidateSchema>;

export interface ImportedText {
  readonly format: ImportFormat;
  readonly sourcePath: string;
  readonly text: string;
  readonly chunks: readonly ImportedChunk[];
}

export interface ImportSplitter {
  split(input: ImportedText): Promise<readonly Omit<PendingImportCandidate, 'status'>[]>;
}

export interface ImportOptions {
  readonly root: string;
  readonly maxBytes?: number;
  readonly chunkSize?: number;
}

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_CHUNK_SIZE = 4000;
const extensions = new Map<string, ImportFormat>([['.txt', 'txt'], ['.md', 'md'], ['.docx', 'docx']]);

function fail(message: string): never {
  throw new Error(`Import rejected: ${message}`);
}

function assertInside(root: string, target: string): void {
  const rel = relative(root, target);
  if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) fail('path escapes import root');
}

function xmlText(xml: string): string {
  const body = xml
    .replace(/<w:tab\s*\/?\s*>/g, '\t')
    .replace(/<w:br\s*\/?\s*>/g, '\n')
    .replace(/<w:p[^>]*>/g, '\n\n')
    .replace(/<w:lastRenderedPageBreak[^>]*>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  return body;
}

/** Decode the minimal DOCX package contract without handing file bytes to Client. */
function readDocx(buffer: Buffer): string {
  if (buffer.readUInt32LE(0) !== 0x04034b50) fail('invalid docx zip');
  let offset = 0;
  const entries = new Map<string, Buffer>();
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    const start = offset + 30 + nameLength + extraLength;
    const end = start + compressedSize;
    if (!name || end > buffer.length || name.includes('..')) fail('invalid docx entry');
    const packed = buffer.subarray(start, end);
    let value: Buffer;
    try {
      value = method === 0 ? packed : method === 8 ? inflateRawSync(packed) : fail('unsupported docx compression');
    } catch (error) {
      fail(`corrupt docx entry: ${name}`);
    }
    entries.set(name, value);
    offset = end;
  }
  const document = entries.get('word/document.xml');
  if (!document) fail('docx document.xml is missing');
  return xmlText(document.toString('utf8'));
}

function normalizeText(input: string): string {
  const normalized = input.replace(/^\uFEFF/, '').normalize('NFC').replace(/\r\n?/g, '\n');
  return normalized.split('\n').map((line) => line.trimEnd()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function chunkText(text: string, size: number): ImportedChunk[] {
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
      chunks.push(importedChunkSchema.parse({ index, text: value, startOffset, endOffset }));
      index += 1;
    }
    cursor = end;
    while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
  }
  return chunks;
}

/**
 * Deterministic Host import primitive (design §14.2 / requirement R8-1).
 * It owns path, byte, format, decoding and chunk invariants; it never writes a layer.
 */
export async function readImportedText(filePath: string, options: ImportOptions): Promise<ImportedText> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) fail('maxBytes must be positive');
  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) fail('chunkSize must be positive');
  const root = await realpath(resolve(options.root)).catch(() => fail('import root does not exist'));
  const target = await realpath(resolve(filePath)).catch(() => fail('file does not exist'));
  assertInside(root, target);
  const stat = await lstat(target);
  if (!stat.isFile()) fail('path is not a regular file');
  if (stat.size === 0) fail('file is empty');
  if (stat.size > maxBytes) fail('file exceeds byte limit');
  const format = extensions.get(extname(target).toLowerCase());
  if (!format) fail('unsupported file type');
  const buffer = await readFile(target);
  let raw: string;
  if (format === 'docx') raw = readDocx(buffer);
  else {
    raw = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    if (raw.includes('\u0000')) fail('binary text is not supported');
  }
  const text = normalizeText(raw);
  if (!text) fail('normalized text is empty');
  return Object.freeze({ format, sourcePath: target, text, chunks: chunkText(text, chunkSize) });
}

/** Run a fake or future splitter while preserving pending-only candidate semantics. */
export async function importForReview(filePath: string, options: ImportOptions, splitter: ImportSplitter): Promise<{ readonly source: ImportedText; readonly candidates: readonly PendingImportCandidate[] }> {
  const source = await readImportedText(filePath, options);
  const raw = await splitter.split(source);
  const candidates = raw.map((candidate, index) => pendingImportCandidateSchema.parse({ ...candidate, id: candidate.id || `import-${index}`, status: 'pending' }));
  return Object.freeze({ source, candidates });
}

export type NovelImportService = {
  read(filePath: string, options: ImportOptions): Promise<ImportedText>;
  review(filePath: string, options: ImportOptions, splitter: ImportSplitter): Promise<{ readonly source: ImportedText; readonly candidates: readonly PendingImportCandidate[] }>;
};

export function createImportService(): NovelImportService {
  return Object.freeze({ read: readImportedText, review: importForReview });
}
