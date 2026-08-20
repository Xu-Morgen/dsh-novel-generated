import { Context } from '@deepseek-ai/cordis';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { apply } from '../index.js';
import type { NovelCharacterService } from './character-service.js';

describe('I9 Host character service consumer', () => {
  it('supplies character cores and filters scene characters through the Host contract', async () => {
    const rootPath = await mkdtemp(join(tmpdir(), 'novel-character-i9-'));
    const root = new Context();
    const fiber = await root.plugin(apply, { projectsRoot: rootPath });
    const service = root.get('novelCharacter') as NovelCharacterService;

    await service.open('consumer');
    await service.create('consumer', {
      id: 'mara', name: 'Mara', aliases: ['the Wind'], kind: 'protagonist',
      personality: 'Quiet and watchful.', background: 'Fisher who lost her boat.',
      motivation: 'Take back her name.', goals: ['clear her debt'],
      flaws: ['withdrawn'], abilities: ['navigation'],
      speechStyle: 'short sentences', staticTraits: ['stubborn'],
      arc: {
        startingPoint: 'nameless deckhand',
        desiredEnd: 'trusted captain',
        keyBeats: ['take the helm'],
      },
      relationships: [], knowledgeIds: [],
    });
    await service.create('consumer', {
      id: 'otto', name: 'Otto', aliases: [], kind: 'extra',
      personality: 'Boisterous.', background: 'A dockhand.',
      motivation: 'A warm meal.', goals: [],
      flaws: [], abilities: [],
      speechStyle: 'loud', staticTraits: [],
      arc: { startingPoint: 'dockhand', desiredEnd: 'dockhand', keyBeats: [] },
      relationships: [], knowledgeIds: [],
    });

    const scene = await service.listForScene('consumer', ['otto', 'mara']);
    expect(scene.map((view) => view.name)).toEqual(['Mara', 'Otto']);
    expect(scene.map((view) => view.kind)).toEqual(['protagonist', 'extra']);

    const protagonists = await service.listByKind('consumer', 'protagonist');
    expect(protagonists.map((character) => character.id)).toEqual(['mara']);

    await fiber.dispose();
    expect(root.get('novelCharacter', false)).toBeUndefined();
    await rm(rootPath, { recursive: true, force: true });
  });
});
