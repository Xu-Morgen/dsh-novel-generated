import { Context } from '@deepseek-ai/cordis';
import { credentialKey, credentialRef } from '@deepseek-ai/dsh-credentials';
import LocalCredentialProvider, { parseCredentialsDocument } from '@deepseek-ai/dsh-credentials-local';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it, vi } from 'vitest';

import { createLlmConfigService, type NovelLlmCredentialService } from './llm-config-service.js';
import { A2_SETTINGS_FILE, resolveA2GenerationConfig } from '../core/settings-index/index.js';
import { NOVEL_LLM_CREDENTIAL_REF, NOVEL_LLM_PROVIDER_ID } from '../core/schema/llm-config.js';

const SAVE_INPUT = {
  baseUrl: 'https://api.example.com/v1',
  model: 'gpt-4o',
  apiKey: 'sk-abcdef1234567890',
  maxTokens: 32768,
  thinking: 'enabled',
  reasoningEffort: 'high',
} as const;
const VIEW_DEFAULTS = { maxTokens: 32768, thinking: 'enabled' as const, reasoningEffort: 'high' as const };

async function makeHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'novel-llm-config-'));
}

function fakeCredentials(initiallyConfigured = false): NovelLlmCredentialService & {
  describe: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
} {
  let configured = initiallyConfigured;
  return {
    describe: vi.fn(async () => ({ configured, ...(configured ? { source: 'file' } : {}), writable: true })),
    set: vi.fn(async () => { configured = true; }),
  };
}

describe('I152 novel LLM config service (DSH credentials seam + settings/A2)', () => {
  it('persists key, provider route and A2 active backend, and load never returns the key', async () => {
    const dshHome = await makeHome();
    const settingsRoot = await makeHome();
    const credentials = fakeCredentials();
    const service = createLlmConfigService(credentials, dshHome, settingsRoot);

    await expect(service.load()).resolves.toEqual({ providerId: NOVEL_LLM_PROVIDER_ID, baseUrl: '', model: '', hasKey: false, ...VIEW_DEFAULTS });

    const saved = await service.save(SAVE_INPUT);
    expect(saved).toEqual({ ok: true, modelRef: `${NOVEL_LLM_PROVIDER_ID}/gpt-4o` });

    // 1. Key 只交给 DSH credentials seam；配置服务不拥有凭据文件格式。
    expect(credentials.set).toHaveBeenCalledWith(credentialRef(NOVEL_LLM_CREDENTIAL_REF), SAVE_INPUT.apiKey);
    // 2. settings.yaml 注册 OpenAI 兼容 provider。
    const settings = load(await readFile(join(dshHome, 'settings.yaml'), 'utf8')) as {
      'llm-pi-ai'?: {
        providers?: Record<string, {
          apiKeyEnv?: string;
          api?: string;
          baseURL?: string;
          models?: Array<{ id?: string; reasoningEfforts?: Record<string, string | null> }>;
        }>;
      };
    };
    const provider = settings['llm-pi-ai']!.providers![NOVEL_LLM_PROVIDER_ID];
    expect(provider).toMatchObject({ apiKeyEnv: NOVEL_LLM_CREDENTIAL_REF, api: 'openai-completions', baseURL: SAVE_INPUT.baseUrl });
    expect(provider.models).toEqual([{
      id: 'gpt-4o',
      reasoningEfforts: { off: null, low: 'low', high: 'high', max: 'max' },
    }]);
    // 3. A2 活动 backend 指向自定义路由。
    const a2 = await import('../core/settings-index/index.js').then((m) => new m.SettingsIndex(settingsRoot).load());
    const config = resolveA2GenerationConfig(a2);
    expect(config.settings.modelRef).toBe(`${NOVEL_LLM_PROVIDER_ID}/gpt-4o`);
    expect(config.settings.credentialRef).toBe(NOVEL_LLM_CREDENTIAL_REF);
    expect(a2.active.backendId).toBe(NOVEL_LLM_PROVIDER_ID);

    // load 回显 URL/模型/hasKey，但绝不含 key。
    const view = await service.load();
    expect(view).toEqual({ providerId: NOVEL_LLM_PROVIDER_ID, baseUrl: SAVE_INPUT.baseUrl, model: 'gpt-4o', hasKey: true, ...VIEW_DEFAULTS });
    expect(JSON.stringify(view)).not.toContain(SAVE_INPUT.apiKey);

    await rm(dshHome, { recursive: true, force: true });
    await rm(settingsRoot, { recursive: true, force: true });
  });

  it('persists maxTokens and thinking controls into A2 sampling and resolves them into generation settings', async () => {
    const dshHome = await makeHome();
    const settingsRoot = await makeHome();
    const service = createLlmConfigService(fakeCredentials(), dshHome, settingsRoot);

    await service.save({ ...SAVE_INPUT, maxTokens: 131072, thinking: 'disabled', reasoningEffort: 'low' });

    const a2 = await new (await import('../core/settings-index/index.js')).SettingsIndex(settingsRoot).load();
    const backend = a2.backends.find((item) => item.id === NOVEL_LLM_PROVIDER_ID)!;
    expect(backend.sampling).toEqual({ maxTokens: 131072, reasoning: 'off' });

    const config = resolveA2GenerationConfig(a2);
    expect(config.settings.maxTokens).toBe(131072);
    expect(config.settings.reasoning).toBe('off');

    // load 回显：thinking disabled → effort 返回官方默认（low 仅在启用时生效）。
    const view = await service.load();
    expect(view).toMatchObject({ maxTokens: 131072, thinking: 'disabled', reasoningEffort: 'high' });

    // 启用思维链 + max effort → sampling.reasoning = 'max'。
    await service.save({ ...SAVE_INPUT, maxTokens: 65536, thinking: 'enabled', reasoningEffort: 'max' });
    const a2b = await new (await import('../core/settings-index/index.js')).SettingsIndex(settingsRoot).load();
    expect(a2b.backends.find((item) => item.id === NOVEL_LLM_PROVIDER_ID)!.sampling).toEqual({ maxTokens: 65536, reasoning: 'max' });
    expect((await service.load()).reasoningEffort).toBe('max');

    // I164：重复保存不得丢失 rc.2 hand-declared model 的 reasoning capability。
    const settings = load(await readFile(join(dshHome, 'settings.yaml'), 'utf8')) as {
      'llm-pi-ai': { providers: Record<string, { models: Array<{ reasoningEfforts?: unknown }> }> };
    };
    expect(settings['llm-pi-ai'].providers[NOVEL_LLM_PROVIDER_ID]!.models[0]!.reasoningEfforts)
      .toEqual({ off: null, low: 'low', high: 'high', max: 'max' });

    await rm(dshHome, { recursive: true, force: true });
    await rm(settingsRoot, { recursive: true, force: true });
  });

  it('merges without clobbering existing DSH providers or credentials', async () => {
    const dshHome = await makeHome();
    const settingsRoot = await makeHome();
    const credentials = fakeCredentials();
    await writeFile(join(dshHome, 'settings.yaml'), [
      'llm-pi-ai:',
      '  providers:',
      '    codex5:',
      '      apiKeyEnv: CODEX5_API_KEY',
      '      api: openai-responses',
      '      baseURL: https://www.codex5.net/v1',
      '      models:',
      '        - id: gpt-5.6-sol',
      '',
    ].join('\n'));
    const service = createLlmConfigService(credentials, dshHome, settingsRoot);
    await service.save(SAVE_INPUT);

    const settings = load(await readFile(join(dshHome, 'settings.yaml'), 'utf8')) as Record<string, unknown>;
    const providers = (settings['llm-pi-ai'] as { providers: Record<string, unknown> }).providers;
    expect(providers['codex5']).toBeDefined();
    expect(providers[NOVEL_LLM_PROVIDER_ID]).toBeDefined();
    expect(credentials.set).toHaveBeenCalledWith(credentialRef(NOVEL_LLM_CREDENTIAL_REF), SAVE_INPUT.apiKey);

    await rm(dshHome, { recursive: true, force: true });
    await rm(settingsRoot, { recursive: true, force: true });
  });

  it('uses the real rc.2 LocalCredentialProvider and preserves its versioned refs/records document', async () => {
    const dshHome = await makeHome();
    const settingsRoot = await makeHome();
    const ctx = new Context();
    await ctx.plugin(LocalCredentialProvider, { dshHome, watch: false });
    try {
      const existingRef = credentialRef('EXISTING_API_KEY');
      const existingRecord = credentialKey('llm-pi-ai', 'existing-route');
      await ctx.credentials.set(existingRef, 'sk-existing-value');
      await ctx.credentials.modifyRecord(existingRecord, async () => ({ kind: 'api-key', key: 'sk-record-value' }));

      const service = createLlmConfigService(ctx.credentials, dshHome, settingsRoot);
      await service.save(SAVE_INPUT);

      const filename = join(dshHome, '.credentials.yaml');
      const raw = await readFile(filename, 'utf8');
      const document = parseCredentialsDocument(raw, filename);
      expect(document.refs.get('EXISTING_API_KEY')).toBe('sk-existing-value');
      expect(document.refs.get(NOVEL_LLM_CREDENTIAL_REF)).toBe(SAVE_INPUT.apiKey);
      expect(document.records.get(existingRecord)).toEqual({ kind: 'api-key', key: 'sk-record-value' });
      expect(load(raw)).toMatchObject({ version: 1, refs: { EXISTING_API_KEY: 'sk-existing-value', [NOVEL_LLM_CREDENTIAL_REF]: SAVE_INPUT.apiKey } });
      await expect(ctx.credentials.resolve(credentialRef(NOVEL_LLM_CREDENTIAL_REF))).resolves.toEqual({ value: SAVE_INPUT.apiKey, source: 'file' });
    } finally {
      await ctx.fiber.dispose();
      await rm(dshHome, { recursive: true, force: true });
      await rm(settingsRoot, { recursive: true, force: true });
    }
  });

  it('fails closed before settings/A2 writes when the credentials seam is absent or rejects a write', async () => {
    const dshHome = await makeHome();
    const settingsRoot = await makeHome();
    const unavailable = createLlmConfigService(undefined, dshHome, settingsRoot);
    await expect(unavailable.load()).rejects.toThrow(/credentials service is unavailable/);
    await expect(unavailable.save(SAVE_INPUT)).rejects.toThrow(/credentials service is unavailable/);

    const rejecting: NovelLlmCredentialService = {
      describe: async () => ({ configured: true, source: 'env', writable: false }),
      set: async () => { throw new Error('credential is supplied read-only by the launching environment'); },
    };
    const service = createLlmConfigService(rejecting, dshHome, settingsRoot);
    await expect(service.save(SAVE_INPUT)).rejects.toThrow(/read-only/);
    await expect(readFile(join(dshHome, 'settings.yaml'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(join(settingsRoot, A2_SETTINGS_FILE), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });

    await rm(dshHome, { recursive: true, force: true });
    await rm(settingsRoot, { recursive: true, force: true });
  });

  it('rejects invalid baseUrl, empty model or short key', async () => {
    const dshHome = await makeHome();
    const service = createLlmConfigService(fakeCredentials(), dshHome);
    await expect(service.save({ ...SAVE_INPUT, baseUrl: 'not-a-url' })).rejects.toThrow(/API URL/);
    await expect(service.save({ ...SAVE_INPUT, model: '' })).rejects.toThrow(/模型名称/);
    await expect(service.save({ ...SAVE_INPUT, model: 'a/b' })).rejects.toThrow(/模型名称/);
    await expect(service.save({ ...SAVE_INPUT, apiKey: 'short' })).rejects.toThrow(/API Key/);
    await rm(dshHome, { recursive: true, force: true });
  });

  it('keeps the stored key when save passes an empty key, and rejects an empty key with none stored', async () => {
    const dshHome = await makeHome();
    const settingsRoot = await makeHome();
    const credentials = fakeCredentials();
    const service = createLlmConfigService(credentials, dshHome, settingsRoot);

    await expect(service.save({ ...SAVE_INPUT, apiKey: '' })).rejects.toThrow(/API Key/);

    await service.save(SAVE_INPUT);
    await service.save({ baseUrl: 'https://new.example.com/v1', model: 'gpt-5', apiKey: '', maxTokens: 65536, thinking: 'disabled', reasoningEffort: 'low' });
    expect(credentials.set).toHaveBeenCalledTimes(1);
    const view = await service.load();
    expect(view).toMatchObject({ baseUrl: 'https://new.example.com/v1', model: 'gpt-5', hasKey: true, maxTokens: 65536, thinking: 'disabled' });

    await rm(dshHome, { recursive: true, force: true });
    await rm(settingsRoot, { recursive: true, force: true });
  });

  it('persists the A2 file path listed in the error surface', async () => {
    const dshHome = await makeHome();
    const settingsRoot = await makeHome();
    const service = createLlmConfigService(fakeCredentials(), dshHome, settingsRoot);
    await service.save(SAVE_INPUT);
    await expect(readFile(join(settingsRoot, A2_SETTINGS_FILE), 'utf8')).resolves.toContain(NOVEL_LLM_PROVIDER_ID);
    await rm(dshHome, { recursive: true, force: true });
    await rm(settingsRoot, { recursive: true, force: true });
  });
});
