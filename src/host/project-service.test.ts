import { Context } from '@deepseek-ai/cordis';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { apply } from '../index.js';
import type { NovelProjectService } from './project-service.js';

describe('I3 Host project service consumer', () => {
  it('creates and loads through the Host service contract only', async () => {
    const rootPath = await mkdtemp(join(tmpdir(), 'novel-service-i3-'));
    const root = new Context();
    const fiber = await root.plugin(apply, { projectsRoot: rootPath });
    const service = root.get('novelProject') as NovelProjectService;
    const created = await service.createProject({ projectId: 'consumer', name: '消费者夹具' });
    expect(await service.loadProject('consumer')).toEqual(created);
    await fiber.dispose();
    expect(root.get('novelProject', false)).toBeUndefined();
    await rm(rootPath, { recursive: true, force: true });
  });
});
