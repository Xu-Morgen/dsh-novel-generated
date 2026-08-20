import { Context } from '@deepseek-ai/cordis';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { apply } from '../index.js';
import type { NovelRuleService } from './rule-service.js';

describe('I7 Host rule service consumer', () => {
  it('supplies active rules and queries through the Host service contract', async () => {
    const rootPath = await mkdtemp(join(tmpdir(), 'novel-rule-i7-'));
    const root = new Context();
    const fiber = await root.plugin(apply, { projectsRoot: rootPath });
    const service = root.get('novelRule') as NovelRuleService;

    await service.open('consumer');
    await service.create('consumer', {
      id: 'hard-rule', scope: 'global', kind: 'taboo', statement: 'No resurrection.',
      priority: 100, immutable: true, examples: [], active: true,
    });
    await service.create('consumer', {
      id: 'soft-rule', scope: 'character', kind: 'genre', statement: 'Heroes monologue sparingly.',
      priority: 1, immutable: false, examples: [], active: true,
    });

    const active = await service.listActive('consumer');
    expect(active.map((item) => item.rule.id)).toEqual(['hard-rule', 'soft-rule']);
    expect((await service.query('consumer', { immutable: true })).map((item) => item.id)).toEqual(['hard-rule']);

    await fiber.dispose();
    expect(root.get('novelRule', false)).toBeUndefined();
    await rm(rootPath, { recursive: true, force: true });
  });
});
