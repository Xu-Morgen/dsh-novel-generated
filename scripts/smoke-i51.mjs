import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { zipSync, strToU8 } from 'fflate';

import { Context } from '@deepseek-ai/cordis';
import Loader from '@deepseek-ai/cordis-plugin-loader';
import Include from '@deepseek-ai/cordis-plugin-include';

import { apply } from '../lib/index.js';

const projectsRoot = await mkdtemp(join(tmpdir(), 'novel-smoke-i51-projects-'));
const configRoot = await mkdtemp(join(tmpdir(), 'novel-smoke-i51-config-'));
const baseUrl = new URL(`${configRoot.replace(/\\/g, '/')}/`).href;
const configPath = join(configRoot, 'cordis.yml');
const root = new Context();

const GOLD_TEXT = '第一段\n\n第二段';
const GOLD_XML = '<w:document><w:body><w:p><w:r><w:t>第一段</w:t></w:r></w:p><w:p><w:r><w:t>第二段</w:t></w:r></w:p></w:body></w:document>';
function realDocx() { return Buffer.from(zipSync({ 'word/document.xml': strToU8(GOLD_XML), '[Content_Types].xml': strToU8('<Types/>') })); }

async function run() {
  root.baseUrl = baseUrl;
  await root.plugin(Loader, { baseUrl });
  await root.plugin(Include, {
    path: pathToFileURL(configPath).href,
    initial: [{ id: 'novel-creation-tool', name: new URL('../lib/index.js', import.meta.url).href, config: { projectsRoot } }],
    enableLogs: false,
  });
  await root.loader.await();

  const workspace = root.get('novelWorkspace', false);
  if (!workspace) throw new Error('novelWorkspace service missing after boot');

  const bytes = new Uint8Array(realDocx());
  const sha = createHash('sha256').update(bytes).digest('hex');
  const chunkSize = 64 * 1024;

  const started = await workspace.uploadStart({ fileName: 'book.docx', size: bytes.length, sha256: sha });
  assert.ok(started.uploadId, 'uploadStart returned no session id');
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    await workspace.uploadChunk(started.uploadId, i / chunkSize, Buffer.from(slice).toString('base64'));
  }
  const finalized = await workspace.uploadFinalize(started.uploadId);
  assert.equal(finalized.sourceHash, sha, 'finalize sourceHash mismatch');
  assert.equal(finalized.text, GOLD_TEXT, 'finalized text does not match gold');
  assert.deepEqual(finalized.chunks, [{ index: 0, text: GOLD_TEXT, startOffset: 0, endOffset: GOLD_TEXT.length }]);

  // Negative: path-traversal name and declared-size overflow are rejected at start.
  await assert.rejects(() => workspace.uploadStart({ fileName: '../evil.docx', size: 10, sha256: sha }), /file name|Invalid|upload/i);
  await assert.rejects(() => workspace.uploadStart({ fileName: 'big.docx', size: 11 * 1024 * 1024, sha256: sha }), /size/i);

  // Cancel cleans the temp session.
  const cancelable = await workspace.uploadStart({ fileName: 'cancel.docx', size: bytes.length, sha256: sha });
  await workspace.uploadChunk(cancelable.uploadId, 0, Buffer.from(bytes.subarray(0, chunkSize)).toString('base64'));
  await workspace.uploadCancel(cancelable.uploadId);
  await assert.rejects(() => workspace.uploadFinalize(cancelable.uploadId), /Unknown upload session/);

  await root.fiber.dispose();
  if (root.get('novelWorkspace', false) !== undefined) throw new Error('novelWorkspace survived Fiber dispose');
  console.log('I51 composition smoke: controlled DOCX upload → SHA-256/extraction + cancel + dispose passed');
}

try {
  await run();
} finally {
  try { await root.fiber.dispose(); } catch {}
  try { await rm(configRoot, { recursive: true, force: true }); } catch {}
  try { await rm(projectsRoot, { recursive: true, force: true }); } catch {}
}
