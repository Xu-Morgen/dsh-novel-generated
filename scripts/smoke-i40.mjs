import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeYaml } from '../lib/core/io/yaml.js';
import { ImmutableSettingsIndex } from '../lib/core/immutable-index/index.js';

const root = await mkdtemp(join(tmpdir(), 'novel-smoke-i40-'));
try {
  await mkdir(join(root, 'rules')); await mkdir(join(root, 'worldview'));
  await writeYaml(join(root, 'rules', 'law.yaml'), { id: 'law', version: 1, scope: 'global', kind: 'taboo', statement: '不可越过海关。', priority: 1, immutable: true, examples: [], active: true });
  await writeYaml(join(root, 'worldview', 'north.yaml'), { id: 'north', version: 1, kind: 'history', title: '北境史', content: '北境由旧王统治。', keywords: ['北境'], triggerMode: 'constant', weight: 1, parent: null, mutable: false, status: 'active', supersededBy: null });
  const index = new ImmutableSettingsIndex(root); await index.open();
  const result = await index.sync();
  if (result.total !== 2 || index.query({ tag: '北境' }).length !== 1) throw new Error('I40 exact index assertion failed');
  index.close(); await rm(join(root, 'settings-index.sqlite')); const rebuilt = new ImmutableSettingsIndex(root); await rebuilt.open();
  if ((await rebuilt.sync()).total !== 2) throw new Error('I40 rebuild assertion failed');
  rebuilt.close(); console.log('I40 smoke: exact immutable index, rebuild, and YAML authority passed');
} finally { await rm(root, { recursive: true, force: true }); }
