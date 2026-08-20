import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { RuleRepository } from './index.js';

const roots: string[] = [];
async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'novel-i7-'));
  roots.push(root);
  return root;
}
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const rule = (id: string, over: Partial<Parameters<typeof RuleRepository.prototype.create>[0]> = {}) => ({
  id,
  scope: 'global' as const,
  kind: 'physics' as const,
  statement: `${id} statement`,
  priority: 0,
  immutable: false,
  examples: [],
  active: true,
  ...over,
});

describe('I7 RuleRepository', () => {
  it('round-trips every rule field across reopening', async () => {
    const root = await temporaryRoot();
    const repository = new RuleRepository(root);
    await repository.open();
    await repository.create({
      id: 'rule-no-gods',
      scope: 'global',
      kind: 'taboo',
      statement: 'Gods may not directly intervene.',
      priority: 10,
      immutable: true,
      examples: ['A god cannot strike a mortal.'],
      active: true,
    });

    const reopened = new RuleRepository(root);
    await reopened.open();
    expect(await reopened.read('rule-no-gods')).toEqual({
      id: 'rule-no-gods',
      scope: 'global',
      kind: 'taboo',
      statement: 'Gods may not directly intervene.',
      priority: 10,
      immutable: true,
      examples: ['A god cannot strike a mortal.'],
      active: true,
      version: 1,
    });
  });

  it('supplies active rules ordered by priority then id for the consumer fixture', async () => {
    const repository = new RuleRepository(await temporaryRoot());
    await repository.open();
    await repository.create(rule('low', { priority: 1 }));
    await repository.create(rule('high', { priority: 9, immutable: true }));
    await repository.create(rule('mid-a', { priority: 5 }));
    await repository.create(rule('mid-b', { priority: 5 }));
    await repository.create(rule('inactive', { priority: 99, active: false }));

    const active = await repository.listActive();
    expect(active.map((item) => item.rule.id)).toEqual(['high', 'mid-a', 'mid-b', 'low']);
    expect(active[0].priority).toBe(9);
    expect(active[0].immutable).toBe(true);
    expect(active.every((item) => item.rule.active)).toBe(true);
  });

  it('queries by scope, kind, and immutable deterministically', async () => {
    const repository = new RuleRepository(await temporaryRoot());
    await repository.open();
    await repository.create(rule('p-global', { kind: 'physics', priority: 2, immutable: true }));
    await repository.create(rule('m-global', { kind: 'magic', priority: 7 }));
    await repository.create(rule('p-char', { scope: 'character', kind: 'physics', priority: 4, immutable: true }));

    expect((await repository.query({ kind: 'physics' })).map((item) => item.id)).toEqual(['p-char', 'p-global']);
    expect((await repository.query({ scope: 'character' })).map((item) => item.id)).toEqual(['p-char']);
    expect((await repository.query({ immutable: true })).map((item) => item.id)).toEqual(['p-char', 'p-global']);
    expect((await repository.query({ scope: 'character', immutable: true })).map((item) => item.id)).toEqual(['p-char']);
    expect(await repository.query()).toHaveLength(3);
  });

  it('rejects illegal kind, scope, and missing statement at the storage boundary', async () => {
    const repository = new RuleRepository(await temporaryRoot());
    await repository.open();
    await expect(repository.create(rule('bad-kind', { kind: 'nonsense' as never }))).rejects.toThrow();
    await expect(repository.create(rule('bad-scope', { scope: 'nonsense' as never }))).rejects.toThrow();
    await expect(repository.create(rule('no-statement', { statement: '   ' }))).rejects.toThrow();
    expect(await repository.list()).toHaveLength(0);
  });

  it('rejects duplicate ids and path-escape ids without touching the store', async () => {
    const repository = new RuleRepository(await temporaryRoot());
    await repository.open();
    await repository.create(rule('only-once'));
    await expect(repository.create(rule('only-once'))).rejects.toThrow(/already exists/);
    await expect(repository.read('../escape')).rejects.toThrow(/Invalid project ID/);
    expect((await repository.list()).map((item) => item.id)).toEqual(['only-once']);
  });

  it('updates a non-immutable rule with a version increment but refuses immutable rules', async () => {
    const repository = new RuleRepository(await temporaryRoot());
    await repository.open();
    await repository.create(rule('mutable', { priority: 1 }));
    await repository.create(rule('fixed', { immutable: true, priority: 1 }));

    const updated = await repository.update('mutable', { ...rule('mutable'), priority: 8 });
    expect(updated.version).toBe(2);
    expect(updated.priority).toBe(8);

    await expect(repository.update('fixed', { ...rule('fixed'), priority: 9 })).rejects.toThrow(/Immutable rule/);
    expect((await repository.read('fixed')).priority).toBe(1);
    expect((await repository.read('fixed')).version).toBe(1);
  });

  it('fails loudly when a persisted document is invalid', async () => {
    const root = await temporaryRoot();
    const repository = new RuleRepository(root);
    await repository.open();
    await repository.create(rule('corrupt-me'));
    await writeFile(join(root, 'rules', 'corrupt-me.yaml'), 'id: corrupt-me\nscope: global\n', 'utf8');
    await expect(repository.read('corrupt-me')).rejects.toThrow(/Invalid rule document/);
    await expect(repository.list()).rejects.toThrow(/Invalid rule document/);
  });

  it('writes a YAML document that a fresh repository can re-parse identically', async () => {
    const root = await temporaryRoot();
    const repository = new RuleRepository(root);
    await repository.open();
    await repository.create({
      id: 'roundtrip',
      scope: 'location',
      kind: 'magic',
      statement: 'Magic is strongest at dusk, "when shadows grow long".',
      priority: -3,
      immutable: false,
      examples: ['Example one', 'Example two, with a comma'],
      active: true,
    });
    const raw = await readFile(join(root, 'rules', 'roundtrip.yaml'), 'utf8');
    expect(raw).toContain('scope: location');

    const reopened = new RuleRepository(root);
    await reopened.open();
    expect(await reopened.read('roundtrip')).toMatchObject({
      id: 'roundtrip',
      scope: 'location',
      kind: 'magic',
      statement: 'Magic is strongest at dusk, "when shadows grow long".',
      priority: -3,
      examples: ['Example one', 'Example two, with a comma'],
    });
  });
});
