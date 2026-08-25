import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readDocxText } from '../../import/docx.js';
import {
  uploadChunkInputSchema,
  uploadStartInputSchema,
  type UploadChunkResult,
  type UploadFinalizeResult,
  type UploadStartInput,
  type UploadStartResult,
} from '../schema/upload.js';

/**
 * I51 上传临时区与分块合并 owner（design §14.7.2 / R11-2）。
 *
 * 每个上传会话在一个私有的 mkdtemp 临时目录中累积 chunk 到 `upload.part`，
 * finalize 时校验 SHA-256 后交给成熟 DOCX 适配器提取规范文本。取消、失败或
 * Fiber dispose 后整个临时目录被删除；作品 source of truth 永不触碰。
 *
 * 所有字节只存于 Host 临时区；Client 不拥有文件路径或领域真相。
 */

export const UPLOAD_CHUNK_SIZE = 64 * 1024;

interface UploadSession {
  readonly dir: string;
  readonly expected: UploadStartInput;
  receivedBytes: number;
  /** 已接受的块索引集合（用于拒绝乱序/重复）。 */
  readonly received: Set<number>;
  readonly path: string;
}

function normalizeText(input: string): string {
  const normalized = input.replace(/^\uFEFF/, '').normalize('NFC').replace(/\r\n?/g, '\n');
  return normalized.split('\n').map((line) => line.trimEnd()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function chunkText(text: string, size: number): { index: number; text: string; startOffset: number; endOffset: number }[] {
  const chunks: { index: number; text: string; startOffset: number; endOffset: number }[] = [];
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

export interface NovelUploadStore {
  start(input: UploadStartInput): Promise<UploadStartResult>;
  chunk(uploadId: string, index: number, base64: string): Promise<UploadChunkResult>;
  finalize(uploadId: string): Promise<UploadFinalizeResult>;
  cancel(uploadId: string): Promise<void>;
  dispose(): Promise<void>;
}

export function createUploadStore(chunkSize = UPLOAD_CHUNK_SIZE): NovelUploadStore {
  const sessions = new Map<string, UploadSession>();
  let disposed = false;

  const ensureAlive = (): void => { if (disposed) throw new Error('Upload store is disposed'); };
  const session = (uploadId: string): UploadSession => {
    const found = sessions.get(uploadId);
    if (!found) throw new Error(`Unknown upload session: ${uploadId}`);
    return found;
  };
  const cleanup = async (uploadId: string): Promise<void> => {
    const found = sessions.get(uploadId);
    if (!found) return;
    sessions.delete(uploadId);
    await rm(found.dir, { recursive: true, force: true });
  };

  return {
    async start(input) {
      ensureAlive();
      const parsed = uploadStartInputSchema.parse(input);
      const dir = await mkdtemp(join(tmpdir(), 'novel-upload-'));
      const id = randomUUID();
      sessions.set(id, {
        dir,
        expected: parsed,
        receivedBytes: 0,
        received: new Set(),
        path: join(dir, 'upload.part'),
      });
      return { uploadId: id, chunkSize, nextIndex: 0 };
    },
    async chunk(uploadId, index, base64) {
      ensureAlive();
      const current = session(uploadId);
      const parsed = uploadChunkInputSchema.parse({ index, data: base64 });
      if (current.received.has(index)) throw new Error(`Duplicate chunk: ${index}`);
      if (index !== current.received.size) throw new Error(`Chunk out of order: expected ${current.received.size}, got ${index}`);
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 !== 0) throw new Error('Chunk is not valid base64');
      const bytes = Buffer.from(base64, 'base64');
      if (bytes.toString('base64') !== base64) throw new Error('Chunk is not canonical base64');
      if (bytes.length === 0 || bytes.length > chunkSize) throw new Error(`Chunk size invalid: ${bytes.length}`);
      if (current.receivedBytes + bytes.length > current.expected.size) throw new Error('Chunk would exceed declared size');
      current.received.add(index);
      current.receivedBytes += bytes.length;
      await writeFile(current.path, bytes, { flag: 'a' });
      return { nextIndex: index + 1, received: current.receivedBytes };
    },
    async finalize(uploadId) {
      ensureAlive();
      const current = session(uploadId);
      if (current.receivedBytes !== current.expected.size) throw new Error(`Upload incomplete: ${current.receivedBytes}/${current.expected.size}`);
      // Re-read the concatenated part (append mode guarantees order by index).
      const bytes = await readFile(current.path);
      const actual = createHash('sha256').update(bytes).digest('hex');
      if (actual !== current.expected.sha256) throw new Error('SHA-256 mismatch');
      const text = readDocxText(new Uint8Array(bytes));
      const normalized = normalizeText(text);
      if (!normalized) throw new Error('Extracted text is empty');
      await cleanup(uploadId);
      return {
        sourceHash: actual,
        fileName: current.expected.fileName,
        text: normalized,
        chunks: chunkText(normalized, 4000),
      };
    },
    async cancel(uploadId) {
      ensureAlive();
      await cleanup(uploadId);
    },
    async dispose() {
      disposed = true;
      const dirs = [...sessions.values()].map((session) => session.dir);
      sessions.clear();
      await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true }).catch(() => undefined)));
    },
  };
}
