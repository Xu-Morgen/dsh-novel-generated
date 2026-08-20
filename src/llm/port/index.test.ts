import { describe, expect, it } from 'vitest';
import { GenerationError, collectCandidate, resolveGenerationSettings } from './index.js';
import { createGenerationService } from '../../host/generation-service.js';

const settings = { modelRef: 'route/default', credentialRef: 'secret/ref', temperature: 0.4 };

describe('I17 Host-only LLM port', () => {
  it('locks request settings and collects ordered stream chunks', async () => {
    let request: unknown;
    const result = await collectCandidate({
      async *stream(input) {
        request = input;
        yield { text: '夜色' };
        yield '沉下来';
        yield { done: true };
      },
    }, { prompt: 'continue', settings });
    expect(result).toEqual({ text: '夜色沉下来', chunks: 3 });
    expect(request).toMatchObject({ prompt: 'continue', settings });
  });

  it('rejects raw endpoint and credential values', () => {
    expect(() => resolveGenerationSettings({ modelRef: 'x', credentialRef: 'x', endpoint: 'https://api.openai.com' })).toThrow(/Invalid generation settings/);
    expect(() => resolveGenerationSettings({ modelRef: '', credentialRef: 'x' })).toThrow(/Invalid generation settings/);
  });

  it('normalizes backend failures and cancellation', async () => {
    await expect(collectCandidate({ async *stream() { throw new Error('provider down'); } }, { prompt: 'x', settings }))
      .rejects.toMatchObject({ code: 'backend' });
    const controller = new AbortController();
    controller.abort();
    await expect(collectCandidate({ async *stream() { yield 'never'; } }, { prompt: 'x', settings, signal: controller.signal }))
      .rejects.toMatchObject({ code: 'cancelled' });
  });

  it('does not expose a backend when ctx.llm is absent', async () => {
    await expect(createGenerationService(undefined).generate('x', settings))
      .rejects.toBeInstanceOf(GenerationError);
  });
});
