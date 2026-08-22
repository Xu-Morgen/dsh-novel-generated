import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeYaml } from '../core/io/yaml.js';
import { ConfirmationGate } from '../core/confirm/index.js';
import { createClassifierService } from './classifier-service.js';

const output = { candidates: [{ entry: { id: 'north-fact', sourceLayer: 'B2' as const, sourceId: 'north', title: '北境史', content: '北境由旧王统治。', tags: ['history'], immutable: true as const, version: 1 }, sourceIds: ['north'], sourceEvidence: [{ sourceId: 'north', quote: '北境由旧王统治。' }] }] };

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'novel-i41-service-'));
  await writeYaml(join(root, 'worldview.yaml'), {});
  await (await import('node:fs/promises')).mkdir(join(root, 'worldview'), { recursive: true });
  await writeYaml(join(root, 'worldview', 'north.yaml'), { id: 'north', version: 1, kind: 'history', title: '北境史', content: '北境由旧王统治。', keywords: ['北境'], triggerMode: 'constant', weight: 1, parent: null, mutable: false, status: 'active', supersededBy: null });
  return root;
}

describe('I41 classifier Host service', () => {
  it('does not write pending or rejected proposals and rejects dangling sources', async () => {
    const projectsRoot = await mkdtemp(join(tmpdir(), 'novel-i41-projects-'));
    try {
      const service = createClassifierService(undefined, projectsRoot);
      const projectRoot = join(projectsRoot, 'demo'); const sourceRoot = await fixture();
      await (await import('node:fs/promises')).cp(sourceRoot, projectRoot, { recursive: true }); await rm(sourceRoot, { recursive: true, force: true });
      const record = await service.propose('demo', 'reject-me', output); const gate = await ConfirmationGate.open(projectRoot); await gate.reject(record.id);
      await expect(service.applyAccepted('demo', record.id)).rejects.toThrow(/accepted ConfirmationGate/);
      await expect(service.propose('demo', 'dangling', { candidates: [{ ...output.candidates[0], entry: { ...output.candidates[0].entry, sourceId: 'missing' }, sourceIds: ['missing'], sourceEvidence: [{ sourceId: 'missing', quote: 'x' }] }] })).resolves.toBeDefined();
      const accepted = await service.propose('demo', 'dangling-apply', { candidates: [{ ...output.candidates[0], entry: { ...output.candidates[0].entry, id: 'missing-fact', sourceId: 'missing' }, sourceIds: ['missing'], sourceEvidence: [{ sourceId: 'missing', quote: 'x' }] }] });
      await gate.accept(accepted.id); await expect(service.applyAccepted('demo', accepted.id)).rejects.toThrow(/Dangling classifier sourceId/);
      await expect(readFile(join(projectRoot, 'classified-settings.yaml'))).rejects.toMatchObject({ code: 'ENOENT' });
    } finally { await rm(projectsRoot, { recursive: true, force: true }); }
  });
});
