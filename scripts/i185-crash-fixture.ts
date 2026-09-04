import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { ChapterWriteQueue } from '../src/core/text/index.js';

/**
 * I185 process-crash fixture for the durable C5 project journal. The crash is
 * intentionally after the prepared journal is renamed and before the first
 * truth-file apply, so a fresh queue instance must restore the old JSON.
 */
const projectDirectory = process.argv[2];
const mode = process.argv[3] ?? 'crash';
if (projectDirectory === undefined) throw new Error('I185 fixture requires a project directory');

const chapter = {
  id: 'chapter-1',
  index: 1,
  title: 'I185 crash fixture',
  pov: 'mira',
  status: 'draft' as const,
  scenes: [{
    id: 'scene-1',
    index: 0,
    content: 'after-crash',
    summary: 'crash boundary',
    beats: [],
    canonEvents: [],
    notes: '',
    branches: [],
  }],
};

if (mode === 'crash') {
  const queue = new ChapterWriteQueue(projectDirectory, {
    beforeProjectCommitStep: (_step, _chapterId, phase) => {
      if (phase !== 'apply') return;
      process.kill(process.pid, 'SIGKILL');
      return new Promise<void>(() => undefined);
    },
  });
  await queue.commitProject([chapter]);
  throw new Error('I185 crash fixture unexpectedly completed');
}

if (mode !== 'recover') throw new Error(`I185 fixture mode is invalid: ${mode}`);
const queue = new ChapterWriteQueue(projectDirectory);
await queue.open();
const raw = await queue.readChapterFile('chapter-1');
const files = (await readdir(join(projectDirectory, 'text'))).sort();
process.stdout.write(JSON.stringify({ raw, files }));
