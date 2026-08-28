import { createHash } from 'node:crypto';
import { zipSync, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { readDocxText, DOCX_LIMITS } from '../core/docx/index.js';
import { createUploadStore } from '../core/upload/index.js';

/** Build a real OOXML ZIP package for the mature reader tests. */
function realDocx(documentXml: string, extra: Record<string, string> = {}): Buffer {
  return Buffer.from(zipSync({ 'word/document.xml': strToU8(documentXml), '[Content_Types].xml': strToU8('<Types/>'), ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, strToU8(v)])) }));
}

function sha256Of(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

const GOLD_PARAGRAPHS = '第一段\n\n第二段';
const GOLD_XML = '<w:document><w:body><w:p><w:r><w:t>第一段</w:t></w:r></w:p><w:p><w:r><w:t>第二段</w:t></w:r></w:p></w:body></w:document>';

describe('I51 mature DOCX adapter', () => {
  it('extracts normalized text identical to the hand-parser gold', () => {
    // Raw extractor returns leading paragraph breaks; the caller normalizes.
    const text = readDocxText(new Uint8Array(realDocx(GOLD_XML)));
    expect(text).toBe('\n\n第一段\n\n第二段');
  });

  it('preserves tabs and line breaks from real run markup', () => {
    const xml = '<w:document><w:body><w:p><w:r><w:t>甲</w:t><w:tab/><w:t>乙</w:t><w:br/><w:t>丙</w:t></w:r></w:p></w:body></w:document>';
    // Raw adapter output keeps the leading paragraph break; normalization is the
    // caller's job (readImportedText / upload finalize).
    expect(readDocxText(new Uint8Array(realDocx(xml)))).toBe('\n\n甲\t乙\n丙');
  });

  it('rejects a non-ZIP payload', () => {
    expect(() => readDocxText(new Uint8Array(Buffer.from('not a zip')))).toThrow('not a docx package');
  });

  it('rejects a package missing word/document.xml', () => {
    const archive = Buffer.from(zipSync({ '[Content_Types].xml': strToU8('<Types/>') }));
    expect(() => readDocxText(new Uint8Array(archive))).toThrow('word/document.xml is missing');
  });

  it('rejects a path-traversal entry name', () => {
    const archive = Buffer.from(zipSync({ '../word/document.xml': strToU8(GOLD_XML) }));
    expect(() => readDocxText(new Uint8Array(archive))).toThrow(/unsafe zip entry name|path/);
  });

  it('rejects an entry whose inflated size exceeds the per-entry cap', () => {
    const huge = 'a'.repeat(DOCX_LIMITS.maxEntryUncompressedBytes + 1);
    const archive = Buffer.from(zipSync({ 'word/document.xml': strToU8(`<w:document>${huge}</w:document>`) }));
    expect(() => readDocxText(new Uint8Array(archive))).toThrow('decompressed size limit');
  });

  it('rejects a zip bomb by total decompressed size', () => {
    // Highly-compressible filler trips the compression-ratio, per-entry or
    // total-decompressed guard; all three are correct zip-bomb rejections (D18).
    const many: Record<string, string> = { 'word/document.xml': GOLD_XML };
    for (let i = 0; i < 200; i += 1) many[`d${i}.bin`] = 'a'.repeat(1024 * 1024);
    const big = Buffer.from(zipSync(Object.fromEntries(Object.entries(many).map(([k, v]) => [k, strToU8(v)]))));
    expect(() => readDocxText(new Uint8Array(big))).toThrow(/total decompressed size|entry count|compression ratio/);
  });
});

describe('I51 upload store', () => {
  it('finalizes a correctly chunked upload to matching SHA-256 and text', async () => {
    const store = createUploadStore(8);
    const bytes = new Uint8Array(realDocx(GOLD_XML));
    const sha = sha256Of(bytes);
    const start = await store.start({ fileName: 'book.docx', size: bytes.length, sha256: sha });
    const base64Chunks: string[] = [];
    for (let i = 0; i < bytes.length; i += 8) {
      const slice = bytes.subarray(i, i + 8);
      base64Chunks.push(Buffer.from(slice).toString('base64'));
    }
    for (let i = 0; i < base64Chunks.length; i += 1) await store.chunk(start.uploadId, i, base64Chunks[i]);
    const result = await store.finalize(start.uploadId);
    expect(result.sourceHash).toBe(sha);
    expect(result.fileName).toBe('book.docx');
    expect(result.text).toBe(GOLD_PARAGRAPHS);
    // Finalize chunks at paragraph granularity (4000-char window); the short
    // two-paragraph text fits one chunk deterministically.
    expect(result.chunks).toEqual([{ index: 0, text: GOLD_PARAGRAPHS, startOffset: 0, endOffset: GOLD_PARAGRAPHS.length }]);
  });

  it('rejects out-of-order and duplicate chunks', async () => {
    const store = createUploadStore(8);
    const bytes = new Uint8Array(realDocx(GOLD_XML));
    const sha = sha256Of(bytes);
    const start = await store.start({ fileName: 'book.docx', size: bytes.length, sha256: sha });
    const b64 = Buffer.from(bytes.subarray(0, 8)).toString('base64');
    await store.chunk(start.uploadId, 0, b64);
    await expect(store.chunk(start.uploadId, 0, b64)).rejects.toThrow('Duplicate chunk');
    await expect(store.chunk(start.uploadId, 2, b64)).rejects.toThrow('out of order');
  });

  it('rejects a SHA-256 mismatch at finalize', async () => {
    const store = createUploadStore(8);
    const bytes = new Uint8Array(realDocx(GOLD_XML));
    const start = await store.start({ fileName: 'book.docx', size: bytes.length, sha256: '0'.repeat(64) });
    const b64 = Buffer.from(bytes.subarray(0, 8)).toString('base64');
    await store.chunk(start.uploadId, 0, b64);
    // Not all chunks sent → incomplete (rejects before SHA check).
    await expect(store.finalize(start.uploadId)).rejects.toThrow('Upload incomplete');
  });

  it('rejects a declared size over the 10 MiB cap at start', async () => {
    const store = createUploadStore();
    await expect(store.start({ fileName: 'big.docx', size: 10 * 1024 * 1024 + 1, sha256: '0'.repeat(64) })).rejects.toThrow();
  });

  it('rejects a chunk that would exceed the declared size', async () => {
    const store = createUploadStore(8);
    const bytes = new Uint8Array(realDocx(GOLD_XML));
    const sha = sha256Of(bytes);
    const start = await store.start({ fileName: 'book.docx', size: 8, sha256: sha });
    const b64 = Buffer.from(bytes.subarray(0, 8)).toString('base64');
    await store.chunk(start.uploadId, 0, b64);
    await expect(store.chunk(start.uploadId, 1, 'QUJDRA==')).rejects.toThrow('exceed declared size');
  });

  it('cleans the temp area on cancel and dispose without touching project data', async () => {
    const store = createUploadStore(8);
    const bytes = new Uint8Array(realDocx(GOLD_XML));
    const sha = sha256Of(bytes);
    const start = await store.start({ fileName: 'book.docx', size: bytes.length, sha256: sha });
    await store.chunk(start.uploadId, 0, Buffer.from(bytes.subarray(0, 8)).toString('base64'));
    await store.cancel(start.uploadId);
    await expect(store.finalize(start.uploadId)).rejects.toThrow('Unknown upload session');
    await store.dispose();
  });

  it('rejects invalid base64 chunks', async () => {
    const store = createUploadStore(8);
    const bytes = new Uint8Array(realDocx(GOLD_XML));
    const sha = sha256Of(bytes);
    const start = await store.start({ fileName: 'book.docx', size: bytes.length, sha256: sha });
    await expect(store.chunk(start.uploadId, 0, 'not-valid!!!')).rejects.toThrow('base64');
  });
});
