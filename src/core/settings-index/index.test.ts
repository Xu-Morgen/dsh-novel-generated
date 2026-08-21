import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { A2SettingsSchema, SettingsIndex, resolveA2GenerationConfig, toA2SettingsView } from './index.js';

const config = {
  version: 1,
  backends: [{ id: 'draft', modelRef: 'dsh/draft-model', secretRef: 'DRAFT_API_KEY', sampling: { temperature: 0.3, maxTokens: 900 } }],
  templates: [{ id: 'chapter', backendRef: 'draft', roleHeaders: { system: 'SYSTEM', user: 'USER', assistant: 'ASSISTANT' }, sectionOrder: ['state', 'outline'], stopSequences: ['<END>'] }],
  presets: [{ id: 'safe', backendRef: 'draft', systemPrompt: 'Write in Chinese.', jailbreak: 'Stay in canon.', activationRegex: '^chapter$' }],
  active: { backendId: 'draft', templateId: 'chapter', presetId: 'safe' },
};

describe('I31 A2 settings index', () => {
  it('persists template order and preset, then resolves only controlled Host settings', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-i31-settings-'));
    try {
      const index = new SettingsIndex(root);
      await index.save(config);
      await expect(index.load()).resolves.toEqual(config);
      expect(resolveA2GenerationConfig(config)).toEqual({
        settings: { modelRef: 'dsh/draft-model', credentialRef: 'DRAFT_API_KEY', temperature: 0.3, maxTokens: 900, stopSequences: ['<END>'] },
        template: config.templates[0], preset: config.presets[0],
      });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('does not serialize secret refs or jailbreak text into its safe view', () => {
    const view = toA2SettingsView(config);
    expect(JSON.stringify(view)).not.toContain('DRAFT_API_KEY');
    expect(JSON.stringify(view)).not.toContain('Stay in canon.');
    expect(view.backends[0]).toEqual({ id: 'draft', modelRef: 'dsh/draft-model', sampling: { temperature: 0.3, maxTokens: 900 } });
  });

  it('fails closed for raw routes, duplicate sections, or incompatible active references', () => {
    expect(() => A2SettingsSchema.parse({ ...config, backends: [{ ...config.backends[0], modelRef: 'https://example.test/v1' }] })).toThrow(/provider\/model/);
    expect(() => A2SettingsSchema.parse({ ...config, backends: [{ ...config.backends[0], secretRef: 'sk-raw-key' }] })).toThrow(/DSH credential environment reference/);
    expect(() => A2SettingsSchema.parse({ ...config, templates: [{ ...config.templates[0], sectionOrder: ['state', 'state'] }] })).toThrow(/must not contain duplicates/);
    expect(() => A2SettingsSchema.parse({ ...config, active: { ...config.active, backendId: 'missing' } })).toThrow(/Active backend is unknown/);
  });
});
