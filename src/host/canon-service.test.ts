import { Context } from '@deepseek-ai/cordis';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { apply } from '../index.js';
import type { NovelCanonService } from './canon-service.js';

describe('I5 Host canon service consumer', () => {
  it('appends, queries, and supersedes through the Host service contract only', async () => {
    const rootPath = await mkdtemp(join(tmpdir(), 'novel-canon-i5-'));
    const root = new Context();
    const fiber = await root.plugin(apply, { projectsRoot: rootPath });
    const service = root.get('novelCanon') as NovelCanonService;

    await service.open('consumer');
    await service.append('consumer', {
      id: 'evt-1', storyTime: 'day 1', kind: 'event', summary: 'Lin reached the gate',
      detail: 'At dawn.', participants: ['lin'], location: 'gate', consequences: [], affectedLayers: ['state'],
    });
    const correction = await service.supersede('consumer', 'evt-1', {
      id: 'evt-1-fix', storyTime: 'day 1', summary: 'Lin reached the inner gate',
      detail: 'Correction.', participants: ['lin'], location: 'gate', consequences: [], affectedLayers: ['state'],
    });

    expect(correction.supersedes).toBe('evt-1');
    expect(service.query('consumer', { participant: 'lin' }).map((e) => e.id)).toEqual(['evt-1', 'evt-1-fix']);
    expect(service.query('consumer', { superseded: 'active' }).map((e) => e.id)).toEqual(['evt-1-fix']);

    await fiber.dispose();
    expect(root.get('novelCanon', false)).toBeUndefined();
    await rm(rootPath, { recursive: true, force: true });
  });
});
