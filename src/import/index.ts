import { readFile, lstat, realpath } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import { readDocxText } from '../core/docx/index.js';
import { chunkText, normalizeText, textChunkSchema, type ImportedChunk } from '../core/text/pipeline.js';

export type { ImportedChunk } from '../core/text/pipeline.js';

export const importFormatSchema = z.enum(['txt', 'md', 'docx']);
export type ImportFormat = z.infer<typeof importFormatSchema>;

/** Compatibility export; canonical shape owner is core/text/pipeline. */
export const importedChunkSchema = textChunkSchema;

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

/**
 * I69 文本化导入入口：对已解码文本跑 I37 同一套规范化 + 确定性分块（零写）。
 * 供作品设置「导入预览」Remote 复用文件导入的同一 normalize/chunk 不变式，
 * 使 txt/md round-trip 与文件导入走同一契约。
 */
export function normalizeTextInput(
  raw: string,
  format: ImportFormat,
  options: Pick<ImportOptions, 'chunkSize'> = {},
): { readonly format: ImportFormat; readonly text: string; readonly chunks: readonly ImportedChunk[] } {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) fail('chunkSize must be positive');
  const text = normalizeText(raw);
  if (!text) fail('normalized text is empty');
  return Object.freeze({ format, text, chunks: chunkText(text, chunkSize).map((chunk) => importedChunkSchema.parse(chunk)) });
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
  if (format === 'docx') {
    try {
      raw = readDocxText(new Uint8Array(buffer));
    } catch (error) {
      // Re-wrap with the import facade's single rejection prefix so every
      // consumer observes one consistent failure contract (I51 code-retirement).
      fail((error as Error).message.replace(/^DOCX rejected: /, ''));
    }
  } else {
    raw = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    if (raw.includes('\u0000')) fail('binary text is not supported');
  }
  const text = normalizeText(raw);
  if (!text) fail('normalized text is empty');
  return Object.freeze({ format, sourcePath: target, text, chunks: chunkText(text, chunkSize).map((chunk) => importedChunkSchema.parse(chunk)) });
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
