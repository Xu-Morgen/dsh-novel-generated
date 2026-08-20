import { Context } from '@deepseek-ai/cordis';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { apply } from '../index.js';
import type { NovelTextService } from './text-service.js';

describe('I6 Host text service consumer', () => {
  it('reads a complete chapter through the Host service contract', async () => {
    const rootPath = await mkdtemp(join(tmpdir(), 'novel-text-i6-'));
    const root = new Context();
    const fiber = await root.plugin(apply, { projectsRoot: rootPath });
    const service = root.get('novelText') as NovelTextService;

    await service.open('consumer');
    await service.createChapter('consumer', { id: 'chapter-1', index: 1, title: 'Gate', pov: 'lin', status: 'draft' });
    await service.appendScene('consumer', 'chapter-1', {
      id: 'scene-1', content: '# Opening', summary: 'Opening', beats: [], canonEvents: [], notes: '',
    });
    await service.appendScene('consumer', 'chapter-1', {
      id: 'scene-2', content: 'The gate opened.', summary: 'Gate opens', beats: ['open-gate'], canonEvents: [], notes: '',
    });

    expect(await service.readCompleteChapter('consumer', 'chapter-1')).toBe('# Opening\n\nThe gate opened.');
    await fiber.dispose();
    expect(root.get('novelText', false)).toBeUndefined();
    await rm(rootPath, { recursive: true, force: true });
  });
});
