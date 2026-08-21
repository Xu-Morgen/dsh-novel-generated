import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createSettingsService } from './settings-service.js';

const config = {
  version: 1,
  backends: [
    { id: 'draft', modelRef: 'dsh/draft-model', secretRef: 'DRAFT_API_KEY', sampling: { temperature: 0.2 } },
    { id: 'final', modelRef: 'dsh/final-model', secretRef: 'FINAL_API_KEY', sampling: { temperature: 0.6, maxTokens: 1200 } },
  ],
  templates: [
    { id: 'chapter', backendRef: 'draft', roleHeaders: { system: 'SYSTEM', user: 'USER', assistant: 'ASSISTANT' }, sectionOrder: ['state', 'outline'], stopSequences: ['<END>'] },
    { id: 'revision', backendRef: 'final', roleHeaders: { system: 'SYSTEM', user: 'USER', assistant: 'ASSISTANT' }, sectionOrder: ['outline', 'state'], stopSequences: [] },
  ],
  presets: [{ id: 'draft-preset', backendRef: 'draft', systemPrompt: '草稿。' }, { id: 'final-preset', backendRef: 'final', systemPrompt: '定稿。' }],
  active: { backendId: 'draft', templateId: 'chapter', presetId: 'draft-preset' },
};

describe('I31 Host settings service', () => {
  it('switches persisted route/sampling/template without changing the generation caller', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-i31-host-'));
    const seen: unknown[] = [];
    const resolved: string[] = [];
    const llm = { async *stream(input: unknown) { seen.push(input); yield { type: 'text-delta', text: '候选' }; yield { type: 'finish', reason: { kind: 'stop' } }; } };
    const credentials = { async resolve(ref: string) { resolved.push(ref); return { value: 'never-exposed' }; } };
    try {
      const service = createSettingsService(llm, root, credentials);
      await service.save(config);
      const first = await service.generate({ sections: [{ id: 'outline', text: 'OUTLINE' }, { id: 'state', text: 'STATE' }], userPrompt: '继续。' });
      expect(first.prompt).toContain('STATE\n\nOUTLINE');
      expect(seen[0]).toMatchObject({ provider: 'dsh', model: 'draft-model', temperature: 0.2, stop: ['<END>'] });
      expect(resolved).toEqual(['DRAFT_API_KEY']);

      await service.save({ ...config, active: { backendId: 'final', templateId: 'revision', presetId: 'final-preset' } });
      const second = await service.generate({ sections: [{ id: 'outline', text: 'OUTLINE' }, { id: 'state', text: 'STATE' }], userPrompt: '继续。' });
      expect(second.prompt).toContain('OUTLINE\n\nSTATE');
      expect(seen[1]).toMatchObject({ provider: 'dsh', model: 'final-model', temperature: 0.6, maxTokens: 1200 });
      expect(resolved).toEqual(['DRAFT_API_KEY', 'FINAL_API_KEY']);
      expect(JSON.stringify(await service.load())).not.toContain('API_KEY');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('fails closed when the Host credential seam cannot resolve the selected reference', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-i31-credential-'));
    try {
      const service = createSettingsService({ async *stream() { yield { type: 'finish', reason: { kind: 'stop' } }; } }, root, { async resolve() { return undefined; } });
      await service.save(config);
      await expect(service.generate({ sections: [{ id: 'state', text: 'STATE' }, { id: 'outline', text: 'OUTLINE' }], userPrompt: '继续。' })).rejects.toThrow(/credential is unavailable/);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
