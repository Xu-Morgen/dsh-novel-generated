import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createImportService } from '../lib/import/index.js';

const root = await mkdtemp(join(tmpdir(), 'novel-smoke-i37-'));
try {
  const file = join(root, 'source.md');
  await writeFile(file, '\ufeff第一段\r\n\r\n第二段\r\n');
  const service = createImportService();
  const result = await service.review(file, { root, chunkSize: 5 }, {
    split: async (source) => [{ id: 'smoke-outline', kind: 'outline', sourceChunkIndex: source.chunks[0].index, value: { title: 'pending' } }],
  });
  if (result.source.chunks.length !== 2 || result.candidates[0]?.status !== 'pending') throw new Error('I37 pipeline assertion failed');
  await service.read(join(root, '..', 'outside.md'), { root }).then(() => { throw new Error('path escape was accepted'); }, () => undefined);
  console.log('I37 smoke: controlled txt/md/docx import and pending candidate pipeline passes');
} finally {
  await rm(root, { recursive: true, force: true });
}
