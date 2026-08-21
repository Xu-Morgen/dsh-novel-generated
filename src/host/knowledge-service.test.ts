import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createKnowledgeService } from './knowledge-service.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

function input() {
  return {
    id: 'secret', fact: 'The harbor gate is open.', kind: 'secret' as const, holders: ['mira'],
    revealPlan: { revealTo: ['lin'], revealAt: 'act-2' }, status: 'hidden' as const,
  };
}

describe('I18 novelKnowledge Host service', () => {
  it('keeps file ownership on Host and exposes only deterministic POV knowledge views', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-i18-host-'));
    roots.push(root);
    const service = createKnowledgeService(root);
    await service.open('harbor');
    await service.saveEntry('harbor', input(), [{ characterId: 'mira', knows: ['secret'] }, { characterId: 'lin', knows: [] }]);

    expect((await service.forPov('harbor', 'mira')).entries.map((entry) => entry.fact)).toEqual(['The harbor gate is open.']);
    expect((await service.forPov('harbor', 'lin')).entries).toEqual([]);
    expect(() => service.read('closed')).toThrow(/not open/);
  });
});
