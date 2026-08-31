import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.env.TMPDIR = '/tmp';
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I106 smoke: ${message}`); };
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const lock = JSON.parse(read('contracts/stage18/remote-descriptors.json'));
const deletionIds = [
  'novel-creation-tool/novelTextDeletion/impact',
  'novel-creation-tool/novelTextDeletion/propose',
  'novel-creation-tool/novelTextDeletion/apply',
  'novel-creation-tool/novelTextDeletion/reject',
];
if (lock.descriptorIds.length !== 126 || lock.resultSchemaIds.length !== 32) fail(`contract counts ${lock.descriptorIds.length}/${lock.resultSchemaIds.length}`);
if (JSON.stringify(lock.descriptorIds.slice(-4)) !== JSON.stringify(deletionIds)) fail('deletion descriptors are not the final additive four');
if (JSON.stringify(lock.resultSchemaIds.slice(-4)) !== JSON.stringify(deletionIds)) fail('deletion result schemas are not the final additive four');
for (const id of deletionIds) {
  if (lock.descriptors[id] === undefined || lock.resultSchemas[id] === undefined) fail(`missing locked deletion body: ${id}`);
}
const prefixDescriptorIds = lock.descriptorIds.slice(0, 122);
const prefixResultIds = lock.resultSchemaIds.slice(0, 28);
const prefixDescriptors = Object.fromEntries(prefixDescriptorIds.map((id) => [id, lock.descriptors[id]]));
const prefixResults = Object.fromEntries(prefixResultIds.map((id) => [id, lock.resultSchemas[id]]));
if (sha256(JSON.stringify(prefixDescriptors)) !== 'ece8034fd5dee91c824f28a3443f3d62a1ef18e47da30fb318c061bcfb4da286') fail('I103-I105 descriptor bodies drifted');
if (sha256(JSON.stringify(prefixResults)) !== 'ff99b465b971ac70027c41f0a8b0c606125d99c1b9f763f9e19443b733834fc6') fail('I103-I105 result bodies drifted');

const schema = read('src/core/schema/text-deletion.ts');
for (const token of ['textDeletionTargetSchema', 'textDeletionImpactSchema', 'textDeletionProposeResultSchema', 'textDeletionApplyResultSchema', 'textDeletionRejectResultSchema']) {
  if (!schema.includes(`export const ${token}`)) fail(`missing schema owner ${token}`);
}
for (const forbidden of ['recovery-required', 'compensated', 'aborted', 'reservation', 'journal', 'audit']) {
  if (schema.includes(forbidden)) fail(`forbidden durable deletion concept in schema: ${forbidden}`);
}

const service = read('src/host/text-deletion-service.ts');
for (const token of ['confirmation.propose', 'confirmation.accept', 'confirmation.reject', 'cleanupForDeletion', 'deleteChapterPrimitive', 'deleteScenePrimitive', 'already-deleted']) {
  if (!service.includes(token)) fail(`missing deletion service behavior ${token}`);
}
const binding = read('src/host/scene-outline-binding-service.ts');
if (!binding.includes('cleanupForDeletion') || !binding.includes('current.document.bindings.filter')) fail('binding-first cleanup seam missing');
const clientFiles = ['src/client/mount-registry.ts', 'src/client/layers/chapters.ts', 'src/client/ops/chapters-management.ts'];
for (const path of clientFiles) {
  const source = read(path);
  if (!source.includes('textDeletion') && !source.includes('data-novel-deletion')) fail(`Client deletion wiring missing: ${path}`);
}
if (!read('src/client/layers/chapters.ts').includes('data-novel-chapters-empty')) fail('empty chapter/scene guide missing');

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/core/schema/text-deletion.test.ts',
  'src/host/text-deletion-service.test.ts',
  'src/client-chapters.test.ts',
  'src/remote-binder.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp' } });
if (focused.status !== 0) fail(`focused suites failed (exit ${focused.status}):\n${focused.output.slice(0, 4000)}`);

const artifact = {
  iteration: 'I106',
  requirement: 'R18-1c',
  remoteMethods: { novelTextDeletion: ['impact', 'propose', 'apply', 'reject'] },
  clientAnchors: ['data-novel-chapter-management', 'data-novel-scene-outline-binding', 'data-novel-deletion', 'data-novel-deletion-impact', 'data-novel-deletion-pending', 'data-novel-chapters-empty'],
  deletionSemantics: ['impact-only-zero-write', 'I11-pending-before-apply', 'blocked-and-stale-zero-write', 'binding-first-C5-second', 'already-deleted-retry', 'binding-cleared-C5-retry'],
  contractLock: { descriptorCount: lock.descriptorIds.length, resultSchemaCount: lock.resultSchemaIds.length, preservedPrefix: { descriptorCount: 122, resultSchemaCount: 28, descriptorBodiesSha256: sha256(JSON.stringify(prefixDescriptors)), resultBodiesSha256: sha256(JSON.stringify(prefixResults)) } },
  explicitNonGoals: ['deletion-saga', 'deletion-journal', 'deletion-audit', 'reservation', 'recovery-barrier', 'trash', 'rich-text', 'cross-process-safety'],
  focusedSuites: 'passed',
};
const artifactPath = resolve(repoRoot, 'artifacts/i106-chapter-management-e2e.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
console.log(`I106 smoke: ${lock.descriptorIds.length} descriptors / ${lock.resultSchemaIds.length} result schemas; deletion binder, Host service, Client state and empty-state fixtures passed`);
