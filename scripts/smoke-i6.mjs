import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TextRepository } from '../lib/core/text/index.js';

const root = await mkdtemp(join(tmpdir(), 'novel-smoke-i6-'));
try {
  const repository = new TextRepository(root);
  await repository.open();
  await repository.createChapter({ id: 'chapter-1', index: 1, title: 'The Gate', pov: 'lin', status: 'draft' });
  await repository.appendScene('chapter-1', {
    id: 'scene-1', content: 'Opening line.', summary: 'Opening', beats: [], canonEvents: [], notes: '',
  });
  await repository.appendScene('chapter-1', {
    id: 'scene-2', content: 'The gate opened.', summary: 'Gate opens', beats: ['open-gate'], canonEvents: [], notes: '',
  });
  const reopened = new TextRepository(root);
  await reopened.open();
  const chapter = await reopened.readChapter('chapter-1');
  if (chapter.scenes.length !== 2 || chapter.scenes[1].index !== 1) throw new Error('Chapter scenes are not ordered');
  const changed = await reopened.replaceRange('chapter-1', 'scene-2', { start: 4, end: 8 }, 'door');
  if (changed.content !== 'The door opened.') throw new Error('Range replacement was not exact');
  const complete = await reopened.readCompleteChapter('chapter-1');
  if (complete !== 'Opening line.\n\nThe door opened.') throw new Error('Complete chapter export is incomplete');
  await reopened.readChapter('chapter-1');
  console.log('I6 smoke: chapter metadata round-trip, ordered append, exact range replacement, and complete export passed');
} finally {
  await rm(root, { recursive: true, force: true });
}
