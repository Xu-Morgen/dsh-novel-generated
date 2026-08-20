import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { StyleRepository } from './index.js';

const roots: string[] = [];
async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'novel-i10-'));
  roots.push(root);
  return root;
}
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const profile = (id = 'harbor-style', over: Record<string, unknown> = {}) => ({
  id,
  name: 'Harbor noir',
  person: 'third-limited' as const,
  tense: 'past' as const,
  povScope: 'single' as const,
  tone: 'restrained and salt-stained',
  proseStyle: 'precise sensory detail',
  chapterFormat: 'scene break with a location dateline',
  dialogueConventions: 'Use Chinese quotation marks; avoid dialogue tags when clear.',
  forbidden: ['突然之间', '命运的齿轮'],
  ...over,
});

describe('I10 StyleRepository', () => {
  it('round-trips a complete StyleProfile through the single style.yaml after reopening', async () => {
    const root = await temporaryRoot();
    const repository = new StyleRepository(root);
    await repository.open();
    await repository.save(profile());

    const reopened = new StyleRepository(root);
    await reopened.open();
    expect(await reopened.read()).toEqual({ ...profile(), version: 1 });
  });

  it('rejects illegal person, tense, povScope, and blank forbidden expressions', async () => {
    const repository = new StyleRepository(await temporaryRoot());
    await repository.open();

    await expect(repository.save(profile('bad-person', { person: 'fourth' }))).rejects.toThrow();
    await expect(repository.save(profile('bad-tense', { tense: 'future' }))).rejects.toThrow();
    await expect(repository.save(profile('bad-pov', { povScope: 'all' }))).rejects.toThrow();
    await expect(repository.save(profile('blank-forbidden', { forbidden: ['  '] }))).rejects.toThrow();
    // No invalid profile is persisted; the still-absent document must fail loudly.
    await expect(repository.read()).rejects.toThrow();
  });

  it('queries forbidden expressions independently and produces a complete constant style segment', async () => {
    const repository = new StyleRepository(await temporaryRoot());
    await repository.open();
    await repository.save(profile());

    expect(await repository.forbiddenExpressions()).toEqual(['突然之间', '命运的齿轮']);
    const segment = await repository.constantSegment();
    expect(segment.forbidden).toEqual(['突然之间', '命运的齿轮']);
    expect(segment.profile).toMatchObject({
      person: 'third-limited', tense: 'past', povScope: 'single',
      proseStyle: 'precise sensory detail', chapterFormat: 'scene break with a location dateline',
    });

    // Returned data is consumer-owned: mutating it cannot alter the YAML source.
    (segment.forbidden as string[]).push('new phrase');
    expect(await repository.forbiddenExpressions()).toEqual(['突然之间', '命运的齿轮']);
  });

  it('fails loudly when the canonical style.yaml is malformed or incomplete', async () => {
    const root = await temporaryRoot();
    const repository = new StyleRepository(root);
    await repository.open();
    await writeFile(join(root, 'style.yaml'), 'id: broken\nname: Incomplete\n', 'utf8');

    await expect(repository.read()).rejects.toThrow(/Invalid style profile document/);
  });
});
