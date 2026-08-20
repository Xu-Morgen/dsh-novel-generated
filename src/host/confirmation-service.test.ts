import { Context } from '@deepseek-ai/cordis';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { apply } from '../index.js';
import type { NovelConfirmationService } from './confirmation-service.js';

describe('I11 Host confirmation service consumer', () => {
  it('offers only guarded proposal and resolution operations through the Host service', async () => {
    const rootPath = await mkdtemp(join(tmpdir(), 'novel-confirm-i11-'));
    const root = new Context();
    const fiber = await root.plugin(apply, { projectsRoot: rootPath });
    const service = root.get('novelConfirmation') as NovelConfirmationService;

    await service.open('consumer');
    await service.propose('consumer', { id: 'proposal-1', kind: 'future-write', payload: { value: 1 } });
    expect(service.pending('consumer')).toHaveLength(1);
    expect((await service.accept('consumer', 'proposal-1')).status).toBe('accepted');
    expect(service.pending('consumer')).toEqual([]);

    await fiber.dispose();
    expect(root.get('novelConfirmation', false)).toBeUndefined();
    await rm(rootPath, { recursive: true, force: true });
  });
});
