import { Context } from '@deepseek-ai/cordis';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { apply } from '../index.js';
import type { NovelWorldviewService } from './worldview-service.js';

describe('I8 Host worldview service consumer', () => {
  it('supplies world entries, trigger matching, and rewrites through the Host contract', async () => {
    const rootPath = await mkdtemp(join(tmpdir(), 'novel-world-i8-'));
    const root = new Context();
    const fiber = await root.plugin(apply, { projectsRoot: rootPath });
    const service = root.get('novelWorldview') as NovelWorldviewService;

    await service.open('consumer');
    await service.create('consumer', {
      id: 'realm', kind: 'geography', title: 'The Realm',
      content: 'A vast continent.', keywords: [], triggerMode: 'constant',
      weight: 0, parent: null, mutable: false, status: 'active', supersededBy: null,
    });
    await service.create('consumer', {
      id: 'river-delta', kind: 'geography', title: 'River Delta',
      content: 'Where the river meets the sea.', keywords: ['delta'], triggerMode: 'keyword',
      weight: 1, parent: 'realm', mutable: false, status: 'active', supersededBy: null,
    });

    const hits = await service.matchTriggers('consumer', ['we crossed the delta'], []);
    expect(hits.map((hit) => hit.entryId)).toEqual(['realm', 'river-delta']);
    expect(hits.find((hit) => hit.entryId === 'river-delta')?.ancestors).toEqual(['realm']);

    const rewrite = await service.rewrite('consumer', 'river-delta', {
      id: 'sunken-delta', kind: 'geography', title: 'Sunken Delta',
      content: 'Now drowned by the sea.', keywords: ['delta'], triggerMode: 'keyword',
      weight: 1, parent: 'realm', mutable: true, status: 'active', supersededBy: null,
    });
    expect(rewrite.superseded.status).toBe('rewritten');
    expect(rewrite.superseded.supersededBy).toBe('sunken-delta');

    await fiber.dispose();
    expect(root.get('novelWorldview', false)).toBeUndefined();
    await rm(rootPath, { recursive: true, force: true });
  });
});
