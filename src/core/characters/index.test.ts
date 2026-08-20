import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CharacterRepository } from './index.js';
import { characterCoreSchema } from '../schema/characters.js';
import { characterStateSchema } from '../schema/state.js';

const roots: string[] = [];
async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'novel-i9-'));
  roots.push(root);
  return root;
}
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const character = (id: string, over: Partial<Parameters<typeof CharacterRepository.prototype.create>[0]> = {}) => ({
  id,
  name: `${id} name`,
  aliases: [],
  kind: 'supporting' as const,
  personality: 'Calm.',
  background: 'Raised in a port town.',
  motivation: 'Repay a debt.',
  goals: ['survive'],
  flaws: ['reckless'],
  abilities: ['sailing'],
  speechStyle: 'terse',
  staticTraits: ['loyal'],
  arc: { startingPoint: 'unknown', desiredEnd: 'captain', keyBeats: ['take the helm'] },
  relationships: [] as string[],
  knowledgeIds: [] as string[],
  ...over,
});

describe('I9 CharacterRepository', () => {
  it('round-trips every CharacterCore field (core/arc/keyBeats) across reopening', async () => {
    const root = await temporaryRoot();
    const repository = new CharacterRepository(root);
    await repository.open();
    await repository.create({
      id: 'mara', name: 'Mara', aliases: ['the Wind'], kind: 'protagonist',
      personality: 'Quiet and watchful.', background: 'Fisher who lost her boat.',
      motivation: 'Take back her name.', goals: ['clear her debt', 'find her brother'],
      flaws: ['withdrawn'], abilities: ['navigation', 'bargaining'],
      speechStyle: 'short sentences', staticTraits: ['stubborn'],
      arc: {
        startingPoint: 'nameless deckhand',
        desiredEnd: 'trusted captain',
        keyBeats: ['take the helm', 'forgive the harbor master'],
      },
      relationships: ['rel-mara-lyn'], knowledgeIds: ['k-secret-parentage'],
    });

    const reopened = new CharacterRepository(root);
    await reopened.open();
    expect(await reopened.read('mara')).toEqual({
      id: 'mara', name: 'Mara', aliases: ['the Wind'], kind: 'protagonist',
      personality: 'Quiet and watchful.', background: 'Fisher who lost her boat.',
      motivation: 'Take back her name.', goals: ['clear her debt', 'find her brother'],
      flaws: ['withdrawn'], abilities: ['navigation', 'bargaining'],
      speechStyle: 'short sentences', staticTraits: ['stubborn'],
      arc: {
        startingPoint: 'nameless deckhand',
        desiredEnd: 'trusted captain',
        keyBeats: ['take the helm', 'forgive the harbor master'],
      },
      relationships: ['rel-mara-lyn'], knowledgeIds: ['k-secret-parentage'],
      version: 1,
    });
  });

  it('snapshot proves no C2 mutable field is aliased (R1-B3 separation)', () => {
    const coreKeys = Object.keys(characterCoreSchema.shape);
    const mutableKeys = new Set([
      ...Object.keys(characterStateSchema.shape),
      ...['currentGoal', 'flags', 'inventory', 'condition', 'mood', 'health', 'alive', 'location'],
    ]);
    const leaked = [...coreKeys].filter((key) => mutableKeys.has(key));
    expect(leaked).toEqual([]);
  });

  it('rejects illegal kind, blank name, and stray C2 mutable fields', async () => {
    const repository = new CharacterRepository(await temporaryRoot());
    await repository.open();
    await expect(repository.create(character('bad-kind', { kind: 'nonsense' as never }))).rejects.toThrow();
    await expect(repository.create(character('no-name', { name: '   ' }))).rejects.toThrow();
    // A C2 mutable field smuggled into the input must fail the strict schema.
    await expect(
      repository.create(character('leaked', { mood: 'happy' } as never)),
    ).rejects.toThrow(/Unrecognized key/);
    expect(await repository.list()).toHaveLength(0);
  });

  it('rejects duplicate ids and path-escape ids while preserving valid ids', async () => {
    const repository = new CharacterRepository(await temporaryRoot());
    await repository.open();
    await repository.create(character('only-once'));
    await expect(repository.create(character('only-once'))).rejects.toThrow(/already exists/);
    await expect(repository.read('../escape')).rejects.toThrow(/Invalid project ID/);
    expect((await repository.list()).map((item) => item.id)).toEqual(['only-once']);
  });

  it('filters scene characters deterministically and rejects unknown references', async () => {
    const repository = new CharacterRepository(await temporaryRoot());
    await repository.open();
    await repository.create(character('mara', { name: 'Mara', kind: 'protagonist' }));
    await repository.create(character('lyn', { name: 'Lyn', kind: 'pov' }));
    await repository.create(character('otto', { name: 'Otto', kind: 'extra' }));

    const scene = await repository.listForScene(['otto', 'mara']);
    expect(scene.map((view) => view.name)).toEqual(['Mara', 'Otto']);
    expect(scene.map((view) => view.kind)).toEqual(['protagonist', 'extra']);
    expect(scene.find((view) => view.name === 'Lyn')).toBeUndefined();
    // pov flag is derived from kind, not a separate stored field.
    const pov = await repository.listForScene(['lyn']);
    expect(pov[0].pov).toBe(true);

    await expect(repository.listForScene(['mara', 'ghost'])).rejects.toThrow(/Unknown character reference: ghost/);
  });

  it('updates a character core immutably, bumping version and preserving id', async () => {
    const repository = new CharacterRepository(await temporaryRoot());
    await repository.open();
    await repository.create(character('mara', { name: 'Mara' }));
    const updated = await repository.update('mara', {
      ...character('mara', { name: 'Mara', speechStyle: 'warm' }),
    });
    expect(updated.version).toBe(2);
    expect(updated.id).toBe('mara');
    expect(updated.speechStyle).toBe('warm');
    expect((await repository.read('mara')).version).toBe(2);
  });

  it('fails loudly when a persisted document is invalid', async () => {
    const root = await temporaryRoot();
    const repository = new CharacterRepository(root);
    await repository.open();
    await repository.create(character('corrupt-me'));
    await writeFile(join(root, 'characters', 'corrupt-me.yaml'), 'id: corrupt-me\nkind: protagonist\n', 'utf8');
    await expect(repository.read('corrupt-me')).rejects.toThrow(/Invalid character document/);
    await expect(repository.list()).rejects.toThrow(/Invalid character document/);
  });

  it('writes YAML a fresh repository re-parses identically', async () => {
    const root = await temporaryRoot();
    const repository = new CharacterRepository(root);
    await repository.open();
    await repository.create({
      id: 'mara', name: 'Mara', aliases: ['the Wind'], kind: 'protagonist',
      personality: 'Quiet.', background: 'Lost her boat.', motivation: 'Her name.',
      goals: [], flaws: [], abilities: [], speechStyle: 'short', staticTraits: [],
      arc: { startingPoint: 'deckhand', desiredEnd: 'captain', keyBeats: ['helm'] },
      relationships: [], knowledgeIds: [],
    });
    const raw = await readFile(join(root, 'characters', 'mara.yaml'), 'utf8');
    expect(raw).toContain('kind: protagonist');

    const reopened = new CharacterRepository(root);
    await reopened.open();
    expect(await reopened.read('mara')).toMatchObject({
      id: 'mara', name: 'Mara', kind: 'protagonist',
      arc: { startingPoint: 'deckhand', desiredEnd: 'captain', keyBeats: ['helm'] },
    });
  });
});
