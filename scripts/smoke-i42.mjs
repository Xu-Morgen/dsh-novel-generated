import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TextRepository } from '../lib/core/text/index.js';
import { ConfirmationGate } from '../lib/core/confirm/index.js';
import { createLocalizedEditService } from '../lib/host/edit-service.js';

const root = await mkdtemp(join(tmpdir(), 'novel-smoke-i42-'));
const projectsRoot = join(root, 'projects');
try {
  const repository = new TextRepository(join(projectsRoot, 'demo'));
  await repository.open();
  await repository.createChapter({ id: 'chapter-1', index: 1, title: 'Smoke', pov: 'lin', status: 'draft' });
  await repository.appendScene('chapter-1', { id: 'scene-1', content: 'before TARGET after', summary: 'smoke', beats: [], canonEvents: [], notes: '' });
  const service = createLocalizedEditService({ async *stream() { yield { type: 'text-delta', text: 'rewritten' }; yield { type: 'finish', reason: { kind: 'stop' } }; } }, projectsRoot);
  await service.open('demo');
  const edited = await service.edit('demo', 'chapter-1', 'scene-1', { start: 7, end: 13 }, 'edited');
  if (edited.scene.content !== 'before edited after' || edited.evidence.unchangedPrefix !== 'before ') throw new Error('exact edit smoke failed');
  const rejected = await service.rewrite('demo', 'chapter-1', 'scene-1', { start: 7, end: 13 }, 'rewrite', { modelRef: 'dsh/default', credentialRef: 'dsh/managed' }, 'reject');
  if (rejected.applied) throw new Error('reject rewrite smoke failed');
  const calls = [];
  const request = { id: 'reparse-smoke', projectId: 'demo', chapterId: 'chapter-1', sceneId: 'scene-1', range: { start: 7, end: 12 }, replacement: 'parsed', parsers: Object.fromEntries(['c2', 'c1', 'c3', 'c4', 'b2'].map((stage) => [stage, async () => { calls.push(`parse:${stage}`); return stage; }])), writers: Object.fromEntries(['c2', 'c1', 'c3', 'c4', 'b2'].map((stage) => [stage, async () => { calls.push(`write:${stage}`); }])) };
  const pending = await service.proposeReparse(request);
  if (pending.status !== 'pending') throw new Error('reparse must start pending');
  if (calls.length !== 0) throw new Error('parser ran before Gate');
  await (await ConfirmationGate.open(join(projectsRoot, 'demo'))).accept('reparse-smoke');
  await service.applyAcceptedReparse(request);
  if (calls.join(',') !== 'parse:c2,parse:c1,parse:c3,parse:c4,parse:b2,write:c2,write:c1,write:c3,write:c4,write:b2') throw new Error('reparse fan-out smoke failed');
  console.log('I42 smoke: exact edit, rejected rewrite, Gate-first reparse passed');
} finally { await rm(root, { recursive: true, force: true }); }
