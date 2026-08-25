import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

import { createLlmConfigService } from './llm-config-service.js';
import { A2_SETTINGS_FILE, resolveA2GenerationConfig } from '../core/settings-index/index.js';
import { NOVEL_LLM_CREDENTIAL_REF, NOVEL_LLM_PROVIDER_ID } from '../core/schema/llm-config.js';

const SAVE_INPUT = { baseUrl: 'https://api.example.com/v1', model: 'gpt-4o', apiKey: 'sk-abcdef1234567890' };

async function makeHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'novel-llm-config-'));
}

describe('I-novel LLM config service (本地 DSH 三处文件持久化)', () => {
  it('persists key, provider route and A2 active backend, and load never returns the key', async () => {
    const dshHome = await makeHome();
    const settingsRoot = await makeHome();
    const service = createLlmConfigService(dshHome, settingsRoot);

    await expect(service.load()).resolves.toEqual({ providerId: NOVEL_LLM_PROVIDER_ID, baseUrl: '', model: '', hasKey: false });

    const saved = await service.save(SAVE_INPUT);
    expect(saved).toEqual({ ok: true, modelRef: `${NOVEL_LLM_PROVIDER_ID}/gpt-4o` });

    // 1. credentials.yaml 只多一个引用键，值即用户 key。
    const credentials = load(await readFile(join(dshHome, '.credentials.yaml'), 'utf8')) as Record<string, unknown>;
    expect(credentials[NOVEL_LLM_CREDENTIAL_REF]).toBe(SAVE_INPUT.apiKey);
    // 2. settings.yaml 注册 OpenAI 兼容 provider。
    const settings = load(await readFile(join(dshHome, 'settings.yaml'), 'utf8')) as {
      'llm-pi-ai'?: { providers?: Record<string, { apiKeyEnv?: string; api?: string; baseURL?: string; models?: Array<{ id?: string }> }> };
    };
    const provider = settings['llm-pi-ai']!.providers![NOVEL_LLM_PROVIDER_ID];
    expect(provider).toMatchObject({ apiKeyEnv: NOVEL_LLM_CREDENTIAL_REF, api: 'openai-completions', baseURL: SAVE_INPUT.baseUrl });
    expect(provider.models![0]!.id).toBe('gpt-4o');
    // 3. A2 活动 backend 指向自定义路由。
    const a2 = await import('../core/settings-index/index.js').then((m) => new m.SettingsIndex(settingsRoot).load());
    const config = resolveA2GenerationConfig(a2);
    expect(config.settings.modelRef).toBe(`${NOVEL_LLM_PROVIDER_ID}/gpt-4o`);
    expect(config.settings.credentialRef).toBe(NOVEL_LLM_CREDENTIAL_REF);
    expect(a2.active.backendId).toBe(NOVEL_LLM_PROVIDER_ID);

    // load 回显 URL/模型/hasKey，但绝不含 key。
    const view = await service.load();
    expect(view).toEqual({ providerId: NOVEL_LLM_PROVIDER_ID, baseUrl: SAVE_INPUT.baseUrl, model: 'gpt-4o', hasKey: true });
    expect(JSON.stringify(view)).not.toContain(SAVE_INPUT.apiKey);

    await rm(dshHome, { recursive: true, force: true });
    await rm(settingsRoot, { recursive: true, force: true });
  });

  it('merges without clobbering existing DSH providers or credentials', async () => {
    const dshHome = await makeHome();
    const settingsRoot = await makeHome();
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
    await writeFile(join(dshHome, '.credentials.yaml'), 'DEEPSEEK_API_KEY: sk-existing\n');

    const service = createLlmConfigService(dshHome, settingsRoot);
    await service.save(SAVE_INPUT);

    const settings = load(await readFile(join(dshHome, 'settings.yaml'), 'utf8')) as Record<string, unknown>;
    const providers = (settings['llm-pi-ai'] as { providers: Record<string, unknown> }).providers;
    expect(providers['codex5']).toBeDefined();
    expect(providers[NOVEL_LLM_PROVIDER_ID]).toBeDefined();
    const credentials = load(await readFile(join(dshHome, '.credentials.yaml'), 'utf8')) as Record<string, unknown>;
    expect(credentials['DEEPSEEK_API_KEY']).toBe('sk-existing');
    expect(credentials[NOVEL_LLM_CREDENTIAL_REF]).toBe(SAVE_INPUT.apiKey);

    await rm(dshHome, { recursive: true, force: true });
    await rm(settingsRoot, { recursive: true, force: true });
  });

  it('rejects invalid baseUrl, empty model or short key', async () => {
    const dshHome = await makeHome();
    const service = createLlmConfigService(dshHome);
    await expect(service.save({ ...SAVE_INPUT, baseUrl: 'not-a-url' })).rejects.toThrow(/API URL/);
    await expect(service.save({ ...SAVE_INPUT, model: '' })).rejects.toThrow(/模型名称/);
    await expect(service.save({ ...SAVE_INPUT, model: 'a/b' })).rejects.toThrow(/模型名称/);
    await expect(service.save({ ...SAVE_INPUT, apiKey: 'short' })).rejects.toThrow(/API Key/);
    await rm(dshHome, { recursive: true, force: true });
  });

  it('keeps the stored key when save passes an empty key, and rejects an empty key with none stored', async () => {
    const dshHome = await makeHome();
    const settingsRoot = await makeHome();
    const service = createLlmConfigService(dshHome, settingsRoot);

    await expect(service.save({ ...SAVE_INPUT, apiKey: '' })).rejects.toThrow(/API Key/);

    await service.save(SAVE_INPUT);
    await service.save({ baseUrl: 'https://new.example.com/v1', model: 'gpt-5', apiKey: '' });
    const credentials = load(await readFile(join(dshHome, '.credentials.yaml'), 'utf8')) as Record<string, unknown>;
    expect(credentials[NOVEL_LLM_CREDENTIAL_REF]).toBe(SAVE_INPUT.apiKey);
    const view = await service.load();
    expect(view).toMatchObject({ baseUrl: 'https://new.example.com/v1', model: 'gpt-5', hasKey: true });

    await rm(dshHome, { recursive: true, force: true });
    await rm(settingsRoot, { recursive: true, force: true });
  });

  it('persists the A2 file path listed in the error surface', async () => {
    const dshHome = await makeHome();
    const settingsRoot = await makeHome();
    const service = createLlmConfigService(dshHome, settingsRoot);
    await service.save(SAVE_INPUT);
    await expect(readFile(join(settingsRoot, A2_SETTINGS_FILE), 'utf8')).resolves.toContain(NOVEL_LLM_PROVIDER_ID);
    await rm(dshHome, { recursive: true, force: true });
    await rm(settingsRoot, { recursive: true, force: true });
  });
});
