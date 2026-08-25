import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { describe, expect, it, afterEach } from 'vitest';
import { importForReview, readImportedText } from './index.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'novel-i37-'));
  roots.push(root);
  return root;
}

/** Build a real OOXML ZIP package (with central directory) for the mature reader. */
function storedDocx(xml: string): Buffer {
  const archive = zipSync({
    'word/document.xml': strToU8(xml),
    '[Content_Types].xml': strToU8('<Types/>'),
  });
  return Buffer.from(archive);
}

describe('I37 deterministic import', () => {
  it('normalizes txt, md and docx to equivalent ordered chunks', async () => {
    const root = await fixture();
    const text = '第一段\n\n第二段\n';
    await writeFile(join(root, 'book.txt'), '\uFEFF第一段\r\n\r\n第二段\r\n');
    await writeFile(join(root, 'book.md'), '# 标题\n\n第一段\n\n第二段\n');
    await writeFile(join(root, 'book.docx'), storedDocx('<w:document><w:body><w:p><w:r><w:t>第一段</w:t></w:r></w:p><w:p><w:r><w:t>第二段</w:t></w:r></w:p></w:body></w:document>'));
    const txt = await readImportedText(join(root, 'book.txt'), { root, chunkSize: 5 });
    const docx = await readImportedText(join(root, 'book.docx'), { root, chunkSize: 5 });
    expect(txt.text).toBe('第一段\n\n第二段');
    expect(docx.text).toBe(text.trim());
    expect(txt.chunks.map((chunk) => chunk.text)).toEqual(['第一段', '第二段']);
    expect(txt.chunks.map((chunk) => chunk.index)).toEqual([0, 1]);
    expect(txt.chunks[0].startOffset).toBe(0);
    expect(txt.chunks[1].startOffset).toBeGreaterThan(txt.chunks[0].endOffset);
  });

  it('keeps splitter results pending and does not write layers', async () => {
    const root = await fixture();
    const file = join(root, 'book.txt');
    await writeFile(file, '正文');
    const result = await importForReview(file, { root }, { split: async () => [{ id: 'candidate-1', kind: 'outline', sourceChunkIndex: 0, value: { title: '候选' } }] });
    expect(result.candidates).toEqual([{ id: 'candidate-1', kind: 'outline', status: 'pending', sourceChunkIndex: 0, value: { title: '候选' } }]);
  });

  it.each([
    ['empty', async (root: string) => writeFile(join(root, 'empty.txt'), '')],
    ['pseudo extension', async (root: string) => writeFile(join(root, 'book.txt'), Buffer.from([0, 1, 2]))],
    ['bad docx', async (root: string) => writeFile(join(root, 'book.docx'), 'not zip')],
  ])('rejects %s input', async (_name, create) => {
    const root = await fixture();
    await create(root);
    const name = _name === 'empty' ? 'empty.txt' : 'book.docx';
    if (_name === 'pseudo extension') await expect(readImportedText(join(root, 'book.txt'), { root })).rejects.toThrow('binary');
    else await expect(readImportedText(join(root, name), { root })).rejects.toThrow('Import rejected');
  });

  it('rejects escape and byte overflow before parsing', async () => {
    const root = await fixture();
    const outside = join(root, '..', 'outside.txt');
    await writeFile(outside, 'outside');
    await expect(readImportedText(outside, { root })).rejects.toThrow('escapes');
    const file = join(root, 'large.txt');
    await writeFile(file, '12345');
    await expect(readImportedText(file, { root, maxBytes: 4 })).rejects.toThrow('byte limit');
  });
});

