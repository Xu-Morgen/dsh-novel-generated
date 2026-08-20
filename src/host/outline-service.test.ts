import { Context } from '@deepseek-ai/cordis';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { apply } from '../index.js';
import type { NovelOutlineService } from './outline-service.js';

describe('I14 Host outline service consumer', () => {
  it('opens, saves, reads, and enumerates nested scene cards through the Host contract', async () => {
    const rootPath = await mkdtemp(join(tmpdir(), 'novel-outline-i14-'));
    const root = new Context();
    const fiber = await root.plugin(apply, { projectsRoot: rootPath });
    const service = root.get('novelOutline') as NovelOutlineService;
    await service.open('consumer');
    await service.save('consumer', {
      id: 'outline', structure: 'free', logline: 'A test outline.', themes: ['trust'],
      acts: [{ id: 'act', index: 0, title: 'Act', goal: 'Begin.', beats: [{
        id: 'beat', title: 'Beat', description: 'Start.', charactersInvolved: ['hero'],
        conflictType: 'relational', prerequisites: [], optional: false, detailBeats: [{
          id: 'card', title: 'Card', summary: 'A scene card.', pov: 'hero', wordTarget: 500,
          points: ['meet'], status: 'writing',
        }],
      }] }],
      foreshadowing: [], endings: [],
    });
    expect((await service.read('consumer')).version).toBe(1);
    expect((await service.beatCards('consumer')).map((card) => card.detailBeat.id)).toEqual(['card']);
    await fiber.dispose();
    expect(root.get('novelOutline', false)).toBeUndefined();
    await rm(rootPath, { recursive: true, force: true });
  });

  it('persists C6 progress, returns navigation, and reconciles deviations via Host', async () => {
    const rootPath = await mkdtemp(join(tmpdir(), 'novel-outline-i15-'));
    const root = new Context();
    const fiber = await root.plugin(apply, { projectsRoot: rootPath });
    const service = root.get('novelOutline') as NovelOutlineService;
    await service.open('consumer');
    await service.save('consumer', {
      id: 'outline', structure: 'free', logline: 'A test outline.', themes: [],
      acts: [{ id: 'act', index: 0, title: 'Act', goal: 'Begin.', beats: [
        { id: 'first', title: 'First', description: 'Find the key.', charactersInvolved: [], conflictType: 'external', prerequisites: [], optional: false, detailBeats: [] },
        { id: 'second', title: 'Second', description: 'Open the door.', charactersInvolved: [], conflictType: 'world', prerequisites: ['first'], optional: false, detailBeats: [] },
      ] }], foreshadowing: [], endings: [],
    });
    await service.saveProgress('consumer', {
      outlineId: 'outline', currentAct: 'act', currentBeat: 'first', completedBeats: [], deviations: [], tensionLevel: 35,
    });
    expect((await service.navigate('consumer')).beatId).toBe('first');
    await service.recordDeviation('consumer', { id: 'drift', planned: 'Find key', actual: 'Leave', reason: 'Danger', reconciled: false });
    await service.reconcileDeviation('consumer', 'drift');
    expect((await service.readProgress('consumer')).deviations[0].reconciled).toBe(true);
    expect((await service.read('consumer')).acts[0].beats[0].title).toBe('First');
    await fiber.dispose();
    await rm(rootPath, { recursive: true, force: true });
  });
});
