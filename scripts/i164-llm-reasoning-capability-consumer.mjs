import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Context } from '@deepseek-ai/cordis';
import { LlmError, LlmRuntime, ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import { Config as PiAiConfig, apply as applyPiAi } from '@deepseek-ai/dsh-llm-pi-ai';
import { load } from 'js-yaml';

import { NOVEL_LLM_PROVIDER_ID } from '../lib/core/schema/llm-config.js';
import { createLlmConfigService } from '../lib/host/llm-config-service.js';

const input = {
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash',
  apiKey: 'sk-consumer-fixture',
  maxTokens: 32768,
  thinking: 'enabled',
  reasoningEffort: 'high',
};

const configuredCredentials = {
  describe: async () => ({ configured: true, source: 'file', writable: true }),
  set: async () => {},
};

async function withPiAi(rawSection, run) {
  const ctx = new Context();
  const llm = new LlmRuntime(ctx);
  try {
    // Consume the same public rc.2 Config/apply surface used by the DSH bundle.
    applyPiAi(ctx, PiAiConfig(rawSection));
    await run(llm);
  } finally {
    await ctx.fiber.dispose();
  }
}

// Negative reproduction: the pre-I164 `{ id }` hand-declared model has no
// reasoning catalog, so DSH rejects `high` before any provider I/O.
await withPiAi({
  providers: {
    [NOVEL_LLM_PROVIDER_ID]: {
      apiKeyEnv: 'NOVEL_CUSTOM_API_KEY',
      api: 'openai-completions',
      baseURL: input.baseUrl,
      models: [{ id: input.model }],
    },
  },
}, async (llm) => {
  await assert.rejects(
    () => llm.resolveCallConfig({
      provider: NOVEL_LLM_PROVIDER_ID,
      model: input.model,
      reasoningEffort: ReasoningEffortId('high'),
    }),
    (error) => error instanceof LlmError
      && error.code === 'UNSUPPORTED_REASONING_EFFORT'
      && /does not support reasoning effort "high"/.test(error.message),
  );
});

// Consumer fixture: save through the production owner, parse the emitted YAML,
// then let the real rc.2 adapter/runtime resolve its model and call capability.
const dshHome = await mkdtemp(join(tmpdir(), 'novel-i164-dsh-'));
const settingsRoot = await mkdtemp(join(tmpdir(), 'novel-i164-a2-'));
try {
  const service = createLlmConfigService(configuredCredentials, dshHome, settingsRoot);
  await service.save(input);
  const document = load(await readFile(join(dshHome, 'settings.yaml'), 'utf8'));

  await withPiAi(document['llm-pi-ai'], async (llm) => {
    const info = await llm.resolveModelInfo(NOVEL_LLM_PROVIDER_ID, input.model);
    assert.deepEqual(info.reasoning?.efforts.map((effort) => effort.id), ['off', 'low', 'high', 'max']);

    for (const effort of ['low', 'high', 'max']) {
      const resolved = await llm.resolveCallConfig({
        provider: NOVEL_LLM_PROVIDER_ID,
        model: input.model,
        reasoningEffort: ReasoningEffortId(effort),
      });
      assert.equal(resolved.reasoningEffort, effort);
    }
  });
} finally {
  await rm(dshHome, { recursive: true, force: true });
  await rm(settingsRoot, { recursive: true, force: true });
}

// Invalid declarations are rejected while the adapter materializes the route;
// none can survive into a later provider request.
for (const reasoningEfforts of [
  {},
  { off: null },
  { off: null, high: '' },
]) {
  await assert.rejects(
    () => withPiAi({
      providers: {
        [NOVEL_LLM_PROVIDER_ID]: {
          api: 'openai-completions',
          baseURL: input.baseUrl,
          models: [{ id: input.model, reasoningEfforts }],
        },
      },
    }, async () => {}),
    /reasoningEfforts/,
  );
}

process.stdout.write('I164 consumer: legacy rejection, real rc.2 capability resolution, and invalid metadata rejection passed\n');
