import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeYaml } from '../lib/core/io/yaml.js';
import { ConfirmationGate } from '../lib/core/confirm/index.js';
import { ImmutableSettingsIndex } from '../lib/core/immutable-index/index.js';
import { createClassifierService } from '../lib/host/classifier-service.js';

const root = await mkdtemp(join(tmpdir(), 'novel-smoke-i41-'));
const projectsRoot = join(root, 'projects'); const projectRoot = join(projectsRoot, 'demo');
try {
  await mkdir(join(projectRoot, 'rules'), { recursive: true }); await mkdir(join(projectRoot, 'worldview'), { recursive: true });
  await writeYaml(join(projectRoot, 'rules', 'law.yaml'), { id: 'law', version: 1, scope: 'global', kind: 'taboo', statement: '不可越过海关。', priority: 1, immutable: true, examples: [], active: true });
  await writeYaml(join(projectRoot, 'worldview', 'north.yaml'), { id: 'north', version: 1, kind: 'history', title: '北境史', content: '北境由旧王统治。', keywords: ['北境'], triggerMode: 'constant', weight: 1, parent: null, mutable: false, status: 'active', supersededBy: null });
  const output = { candidates: [{ entry: { id: 'north-fact', sourceLayer: 'B2', sourceId: 'north', title: '北境史', content: '北境由旧王统治。', tags: ['history'], immutable: true, version: 1 }, sourceIds: ['north'], sourceEvidence: [{ sourceId: 'north', quote: '北境由旧王统治。' }] }] };
  const classifier = createClassifierService(undefined, projectsRoot);
  const pending = await classifier.propose('demo', 'proposal-pending', output);
  const before = await readFile(join(projectRoot, 'confirmations.yaml'), 'utf8');
  if (pending.status !== 'pending') throw new Error('pending Gate assertion failed');
  await expectReject(classifier.applyAccepted('demo', 'proposal-pending'));
  if (await readFile(join(projectRoot, 'confirmations.yaml'), 'utf8') !== before) throw new Error('rejected/pending path changed files');
  const gate = await ConfirmationGate.open(projectRoot); await gate.accept('proposal-pending');
  const result = await classifier.applyAccepted('demo', 'proposal-pending');
  const index = new ImmutableSettingsIndex(projectRoot); await index.open();
  if (result.total !== 3 || index.query({ sourceId: 'north' }).length !== 2) throw new Error('accepted index assertion failed');
  index.close(); console.log('I41 smoke: pending gate, accepted write, provenance index passed');
} finally { await rm(root, { recursive: true, force: true }); }

async function expectReject(promise) { try { await promise; throw new Error('expected rejection'); } catch (error) { if (!/accepted ConfirmationGate/.test(error.message)) throw error; } }
