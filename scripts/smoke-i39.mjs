import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfirmationGate } from '../lib/core/confirm/index.js';
import { exportProject, importProject, parseArchive, proposePortableImport, serializeArchive } from '../lib/core/export/index.js';

const root = await mkdtemp(join(tmpdir(), 'novel-smoke-i39-'));
const target = await mkdtemp(join(tmpdir(), 'novel-smoke-i39-target-'));
try {
  await writeFile(join(root, 'project.yaml'), 'id: smoke\nversion: 1\nname: Smoke\n');
  await mkdir(join(root, 'text'), { recursive: true });
  await writeFile(join(root, 'text', 'chapter.json'), JSON.stringify({ id: 'chapter', version: 1, title: '一', scenes: [{ id: 'scene', index: 0, content: '开头\n结尾' }] }));
  const archive = await exportProject(root);
  const parsed = parseArchive(serializeArchive(archive));
  const gate = await ConfirmationGate.open(target);
  await mkdir(join(target, 'text'), { recursive: true });
  await writeFile(join(target, 'text', 'chapter.json'), 'conflict');
  const proposal = await proposePortableImport(gate, 'portable-smoke', parsed, ['text/chapter.json']);
  const pending = await importProject(parsed, target, { gate, proposalId: proposal.id });
  if (pending.status !== 'pending') throw new Error('I39 conflict was not gated');
  await gate.accept(proposal.id);
  const imported = await importProject(parsed, target, { gate, proposalId: proposal.id });
  if (imported.status !== 'imported' || !imported.written.includes('text/chapter.json')) throw new Error('I39 accepted import failed');
  console.log('I39 smoke: versioned archive round-trip and conflict Gate passed');
} finally {
  await rm(root, { recursive: true, force: true });
  await rm(target, { recursive: true, force: true });
}
