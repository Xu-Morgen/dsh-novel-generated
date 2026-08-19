import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';

import {
  MOCK_GENERATION_CHUNKS,
  runMockGeneration,
} from '../../index.js';
import { appendText } from './append-text.js';

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'novel-i1a-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('appendText', () => {
  it('appends chunks in iteration order', async () => {
    const projectRoot = await createTemporaryDirectory();

    await appendText(projectRoot, 'text/chapter-001.md', ['甲', '乙', '丙']);
    await appendText(projectRoot, 'text/chapter-001.md', ['丁']);

    await expect(
      readFile(join(projectRoot, 'text/chapter-001.md'), 'utf8'),
    ).resolves.toBe('甲乙丙丁');
  });

  it('persists text after the writer process exits', async () => {
    const projectRoot = await createTemporaryDirectory();
    const moduleUrl = new URL('./append-text.ts', import.meta.url).href;
    const childScript = [
      `import { appendText } from ${JSON.stringify(moduleUrl)};`,
      `await appendText(${JSON.stringify(projectRoot)}, 'text/chapter-001.md', ['跨进程持久化']);`,
    ].join('\n');

    await runChildProcess([
      '--import',
      'tsx',
      '--input-type=module',
      '--eval',
      childScript,
    ]);

    await expect(
      readFile(join(projectRoot, 'text/chapter-001.md'), 'utf8'),
    ).resolves.toBe('跨进程持久化');
  });

  it('rejects absolute and traversal paths without writing outside the project', async () => {
    const parent = await createTemporaryDirectory();
    const projectRoot = join(parent, 'project');
    const traversalTarget = join(parent, 'outside.md');
    const absoluteTarget = join(parent, 'absolute.md');

    await expect(
      appendText(projectRoot, '../outside.md', ['越界']),
    ).rejects.toThrow('inside the project directory');
    await expect(
      appendText(projectRoot, absoluteTarget, ['越界']),
    ).rejects.toThrow('relative path');

    await expect(readFile(traversalTarget, 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(readFile(absoluteTarget, 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('supports the downstream mock generation consumer', async () => {
    const projectRoot = await createTemporaryDirectory();

    await runMockGeneration({
      projectRoot,
      chapterPath: 'text/chapter-001.md',
      input: '消费者夹具输入',
    });

    await expect(
      readFile(join(projectRoot, 'text/chapter-001.md'), 'utf8'),
    ).resolves.toBe(MOCK_GENERATION_CHUNKS.join(''));
  });
});

async function runChildProcess(arguments_: string[]): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, arguments_, { stdio: 'ignore' });

    child.once('error', rejectPromise);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(
        new Error(`Child process failed with code ${code} and signal ${signal}`),
      );
    });
  });
}
