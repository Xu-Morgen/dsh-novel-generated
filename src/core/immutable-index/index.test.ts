import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ImmutableSettingsIndex } from './index.js';

const rule = (immutable: boolean, statement = '不可越过海关。') => ({ version: 1, scope: 'global', kind: 'taboo', statement, priority: 1, immutable, examples: [], active: true });
const world = (mutable: boolean, content = '北境由旧王统治。') => ({ version: 1, kind: 'history', title: '北境史', content, keywords: ['北境'], triggerMode: 'constant', weight: 1, parent: null, mutable, status: 'active', supersededBy: null });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'novel-i40-'));
  await (await import('node:fs/promises')).mkdir(join(root, 'rules'));
  await (await import('node:fs/promises')).mkdir(join(root, 'worldview'));
  const { writeYaml } = await import('../io/yaml.js');
  await writeYaml(join(root, 'rules', 'law.yaml'), { ...rule(true), id: 'law' });
  await writeYaml(join(root, 'rules', 'soft.yaml'), { ...rule(false), id: 'soft' });
  await writeYaml(join(root, 'worldview', 'north.yaml'), { ...world(false), id: 'north' });
  await writeYaml(join(root, 'worldview', 'town.yaml'), { ...world(true), id: 'town' });
  return root;
}

describe('I40 immutable SQLite index', () => {
  it('indexes only immutable B1/fixed B2 and serves exact consumer queries', async () => {
    const root = await fixture();
    try {
      const index = new ImmutableSettingsIndex(root); await index.open();
      expect(await index.sync()).toMatchObject({ added: 2, total: 2 });
      expect(index.query({ sourceLayer: 'B1' }).map((item) => item.sourceId)).toEqual(['law']);
      expect(index.query({ tag: '北境' })[0]?.content).toBe('北境由旧王统治。');
      index.close();
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('rebuilds after database loss and incrementally updates/deletes YAML projections', async () => {
    const root = await fixture();
    try {
      const first = new ImmutableSettingsIndex(root); await first.open(); await first.sync(); first.close();
      const { writeYaml } = await import('../io/yaml.js');
      await writeYaml(join(root, 'rules', 'law.yaml'), { ...rule(true, '不可打开王门。'), id: 'law', version: 2 });
      await rm(join(root, 'worldview', 'north.yaml'));
      const second = new ImmutableSettingsIndex(root); await second.open();
      expect(await second.sync()).toMatchObject({ updated: 1, removed: 1, total: 1 });
      expect(second.query()[0]?.content).toBe('不可打开王门。'); second.close();
      await writeFile(join(root, 'settings-index.sqlite'), 'not sqlite');
      const rebuilt = new ImmutableSettingsIndex(root); await rebuilt.open();
      expect(await rebuilt.sync()).toMatchObject({ added: 1, total: 1 });
      rebuilt.close();
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('fails closed on malformed authoritative YAML', async () => {
    const root = await fixture();
    try {
      await writeFile(join(root, 'rules', 'law.yaml'), 'immutable: [broken');
      const index = new ImmutableSettingsIndex(root); await index.open();
      await expect(index.sync()).rejects.toThrow(/Invalid YAML|Invalid input/);
      index.close();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
