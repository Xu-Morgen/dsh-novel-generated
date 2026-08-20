import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WorldRepository } from './index.js';

const roots: string[] = [];
async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'novel-i8-'));
  roots.push(root);
  return root;
}
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const entry = (id: string, over: Partial<Parameters<typeof WorldRepository.prototype.create>[0]> = {}) => ({
  id,
  kind: 'concept' as const,
  title: `${id} title`,
  content: `${id} content`,
  keywords: [id],
  triggerMode: 'keyword' as const,
  weight: 0,
  parent: null as string | null,
  mutable: false,
  status: 'active' as const,
  supersededBy: null as string | null,
  ...over,
});

describe('I8 WorldRepository', () => {
  it('round-trips every WorldEntry field across reopening', async () => {
    const root = await temporaryRoot();
    const repository = new WorldRepository(root);
    await repository.open();
    await repository.create({
      id: 'magic-system', kind: 'concept', title: 'The Weave',
      content: 'Magic flows from a single deep source.',
      keywords: ['weave', 'mana'], triggerMode: 'keyword', weight: 3,
      parent: null, mutable: false, status: 'active', supersededBy: null,
    });

    const reopened = new WorldRepository(root);
    await reopened.open();
    expect(await reopened.read('magic-system')).toEqual({
      id: 'magic-system', kind: 'concept', title: 'The Weave',
      content: 'Magic flows from a single deep source.',
      keywords: ['weave', 'mana'], triggerMode: 'keyword', weight: 3,
      parent: null, mutable: false, status: 'active', supersededBy: null,
      version: 1,
    });
  });

  it('walks parent ancestry deterministically for matched entries', async () => {
    const repository = new WorldRepository(await temporaryRoot());
    await repository.open();
    await repository.create(entry('continent', { kind: 'geography', keywords: [] }));
    await repository.create(entry('kingdom', { kind: 'geography', parent: 'continent', keywords: [] }));
    await repository.create(entry('city', { kind: 'geography', parent: 'kingdom', keywords: ['city-name'] }));

    const hits = await repository.matchTriggers(['the city-name sprawled'], []);
    expect(hits.map((hit) => hit.entryId)).toEqual(['city']);
    expect(hits[0].ancestors).toEqual(['continent', 'kingdom']);
    expect(hits[0].level).toBe(2);
  });

  it('matches constant, keyword, and regex trigger modes independently', async () => {
    const repository = new WorldRepository(await temporaryRoot());
    await repository.open();
    await repository.create(entry('always-on', { triggerMode: 'constant', keywords: [] }));
    await repository.create(entry('keyword-hit', { keywords: ['harbor'] }));
    await repository.create(entry('keyword-miss', { keywords: ['mountain'] }));
    await repository.create(entry('regex-hit', { triggerMode: 'regex', keywords: ['^The .* king'] }));

    const hits = await repository.matchTriggers(['The harbor at dawn'], ['The old king rode']);
    expect(hits.map((hit) => hit.entryId)).toEqual(['always-on', 'keyword-hit', 'regex-hit']);
  });

  it('rewrites immutably: old entry marked rewritten and pointed at the new id', async () => {
    const repository = new WorldRepository(await temporaryRoot());
    await repository.open();
    await repository.create(entry('old-kingdom', { kind: 'faction', mutable: true }));
    await repository.rewrite('old-kingdom', {
      ...entry('new-kingdom', { kind: 'faction', mutable: true }),
      title: 'The Fallen Realm',
    });

    const old = await repository.read('old-kingdom');
    expect(old.status).toBe('rewritten');
    expect(old.supersededBy).toBe('new-kingdom');
    expect(old.version).toBe(2);

    const replacement = await repository.read('new-kingdom');
    expect(replacement.id).toBe('new-kingdom');
    expect(replacement.version).toBe(1);
    expect(replacement.status).toBe('active');
    expect(replacement.supersededBy).toBeNull();
  });

  it('rejects illegal kind, trigger mode, vector mode, and empty title/content', async () => {
    const repository = new WorldRepository(await temporaryRoot());
    await repository.open();
    await expect(repository.create(entry('bad-kind', { kind: 'nonsense' as never }))).rejects.toThrow();
    await expect(repository.create(entry('bad-mode', { triggerMode: 'nonsense' as never }))).rejects.toThrow();
    await expect(repository.create(entry('vector-mode', { triggerMode: 'vector' as never }))).rejects.toThrow();
    await expect(repository.create(entry('no-title', { title: '   ' }))).rejects.toThrow();
    await expect(repository.create(entry('no-content', { content: '' }))).rejects.toThrow();
    expect(await repository.list()).toHaveLength(0);
  });

  it('rejects parent cycles and self-reference while preserving valid acyclic chains', async () => {
    const repository = new WorldRepository(await temporaryRoot());
    await repository.open();
    await repository.create(entry('a'));
    await repository.create(entry('b', { parent: 'a' }));

    await expect(repository.create(entry('a-self', { parent: 'a-self' }))).rejects.toThrow(/Self-referential/);
    // making `a`'s parent `b` would close a->b->a.
    await expect(repository.create(entry('a2', { parent: 'b', id: 'a' }))).rejects.toThrow();
    expect((await repository.list()).map((item) => item.id).sort()).toEqual(['a', 'b']);
  });

  it('rejects duplicate ids, missing parents, and path-escape ids', async () => {
    const repository = new WorldRepository(await temporaryRoot());
    await repository.open();
    await repository.create(entry('only-once'));
    await expect(repository.create(entry('only-once'))).rejects.toThrow(/already exists/);
    await expect(repository.create(entry('orphan', { parent: 'missing-parent' }))).rejects.toThrow(/Parent reference is missing/);
    await expect(repository.read('../escape')).rejects.toThrow(/Invalid project ID/);
    expect((await repository.list()).map((item) => item.id)).toEqual(['only-once']);
  });

  it('fails loudly when a persisted document is invalid', async () => {
    const root = await temporaryRoot();
    const repository = new WorldRepository(root);
    await repository.open();
    await repository.create(entry('corrupt-me'));
    await writeFile(join(root, 'worldview', 'corrupt-me.yaml'), 'id: corrupt-me\nkind: concept\n', 'utf8');
    await expect(repository.read('corrupt-me')).rejects.toThrow(/Invalid world entry document/);
    await expect(repository.list()).rejects.toThrow(/Invalid world entry document/);
  });

  it('writes YAML a fresh repository re-parses identically', async () => {
    const root = await temporaryRoot();
    const repository = new WorldRepository(root);
    await repository.open();
    await repository.create({
      id: 'roundtrip', kind: 'history', title: 'The Long War',
      content: 'It ended, "at last", after forty years.',
      keywords: ['war', 'peace'], triggerMode: 'keyword', weight: -2,
      parent: null, mutable: true, status: 'active', supersededBy: null,
    });
    const raw = await readFile(join(root, 'worldview', 'roundtrip.yaml'), 'utf8');
    expect(raw).toContain('kind: history');

    const reopened = new WorldRepository(root);
    await reopened.open();
    expect(await reopened.read('roundtrip')).toMatchObject({
      id: 'roundtrip', kind: 'history', title: 'The Long War',
      content: 'It ended, "at last", after forty years.',
      keywords: ['war', 'peace'], triggerMode: 'keyword', weight: -2,
      mutable: true, status: 'active', supersededBy: null,
    });
  });
});
