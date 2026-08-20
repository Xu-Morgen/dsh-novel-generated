import { Context } from '@deepseek-ai/cordis';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { apply } from '../index.js';
import type { NovelStyleService } from './style-service.js';

describe('I10 Host style service consumer', () => {
  it('supplies a constant B4 segment and forbidden expressions through the Host contract', async () => {
    const rootPath = await mkdtemp(join(tmpdir(), 'novel-style-i10-'));
    const root = new Context();
    const fiber = await root.plugin(apply, { projectsRoot: rootPath });
    const service = root.get('novelStyle') as NovelStyleService;

    await service.open('consumer');
    await service.save('consumer', {
      id: 'harbor-style', name: 'Harbor noir', person: 'third-limited', tense: 'past', povScope: 'single',
      tone: 'restrained', proseStyle: 'precise sensory detail',
      chapterFormat: 'scene break with a location dateline',
      dialogueConventions: 'Use Chinese quotation marks.',
      forbidden: ['突然之间', '命运的齿轮'],
    });

    expect(await service.forbiddenExpressions('consumer')).toEqual(['突然之间', '命运的齿轮']);
    expect(await service.constantSegment('consumer')).toMatchObject({
      profile: { id: 'harbor-style', person: 'third-limited', tense: 'past', povScope: 'single' },
      forbidden: ['突然之间', '命运的齿轮'],
    });

    await fiber.dispose();
    expect(root.get('novelStyle', false)).toBeUndefined();
    await rm(rootPath, { recursive: true, force: true });
  });
});
