import { readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MOCK_GENERATION_CHUNKS,
  runMockGeneration,
} from '../src/index.ts';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const configuredProjectRoot = process.env.NOVEL_PROJECT_ROOT;
const projectRoot = configuredProjectRoot
  ? resolve(configuredProjectRoot)
  : resolve(repositoryRoot, 'projects/demo');
const chapterPath = 'text/chapter-001.md';
const outputPath = resolve(projectRoot, chapterPath);
const expected = MOCK_GENERATION_CHUNKS.join('');

// The smoke is repeatable while appendText itself retains append semantics.
await rm(outputPath, { force: true });
await runMockGeneration({
  projectRoot,
  chapterPath,
  input: '写一个雨夜抵达旧城的开篇。',
});

const persisted = await readFile(outputPath, 'utf8');
if (persisted !== expected) {
  throw new Error('I1a smoke output did not match the deterministic mock text');
}

process.stdout.write(`I1a smoke wrote ${outputPath}\n`);
