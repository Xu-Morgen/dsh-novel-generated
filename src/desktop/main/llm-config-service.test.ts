import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { CredentialStore } from '../../app/credentials.js';
import { desktopIpcRegistry } from '../../platform/desktop-ipc-registry.js';
import { createDesktopLlmConfigHandlers, createLlmConfigService } from './llm-config-service.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe('desktop LLM config IPC handlers', () => {
  it('saves and reloads configuration through the canonical IPC registry without returning the key', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-llm-config-'));
    roots.push(root);
    const secrets = new Map<string, string>();
    const credentials: CredentialStore = {
      describe: async (ref) => ({ ref, configured: secrets.has(ref) }),
      set: async (ref, secret) => { secrets.set(ref, secret); },
      delete: async (ref) => { secrets.delete(ref); },
    };
    const service = createLlmConfigService(credentials, root);
    const handlers = createDesktopLlmConfigHandlers(service);
    const input = {
      baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash', apiKey: 'secret-value',
      maxTokens: 65536 as const, thinking: 'enabled' as const, reasoningEffort: 'high' as const,
    };

    const saved = await desktopIpcRegistry.invoke('novel-creation-tool/novelLlmConfig/save', [input], handlers.get('novel-creation-tool/novelLlmConfig/save'));
    expect(saved).toEqual({ ok: true, value: { ok: true, modelRef: 'novel-custom/deepseek-v4-flash' } });
    const loaded = await desktopIpcRegistry.invoke('novel-creation-tool/novelLlmConfig/load', [], handlers.get('novel-creation-tool/novelLlmConfig/load'));
    expect(loaded).toMatchObject({ ok: true, value: { baseUrl: input.baseUrl, model: input.model, hasKey: true, maxTokens: 65536 } });
    expect(JSON.stringify({ saved, loaded })).not.toContain(input.apiKey);
    expect(await readFile(join(root, 'llm-config.yaml'), 'utf8')).not.toContain(input.apiKey);
  });

  it('keeps malformed settings outside the service and exposes no accidental handler aliases', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-llm-config-negative-'));
    roots.push(root);
    const credentials: CredentialStore = {
      describe: async (ref) => ({ ref, configured: false }), set: async () => undefined, delete: async () => undefined,
    };
    const handlers = createDesktopLlmConfigHandlers(createLlmConfigService(credentials, root));
    expect([...handlers.keys()]).toEqual([
      'novel-creation-tool/novelLlmConfig/load',
      'novel-creation-tool/novelLlmConfig/save',
    ]);
    await expect(desktopIpcRegistry.invoke('novel-creation-tool/novelLlmConfig/save', [{ baseUrl: 'not-a-url' }], handlers.get('novel-creation-tool/novelLlmConfig/save')))
      .resolves.toMatchObject({ ok: false, error: { code: 'invalid-arguments' } });
  });
});
