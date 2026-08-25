import { describe, expect, it } from 'vitest';
import { asLlmBackend, GenerationError, collectCandidate, resolveGenerationSettings } from './index.js';
import { createGenerationService } from '../../host/generation-service.js';

const settings = { modelRef: 'route/default', credentialRef: 'secret/ref', temperature: 0.4, stopSequences: ['<END>'] };

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

  it('adapts the current DSH GenerateOptions and terminal stream protocol', async () => {
    let options: unknown;
    const backend = asLlmBackend({
      async *stream(input: unknown) {
        options = input;
        yield { type: 'block-start', index: 0, blockType: 'text' };
        yield { type: 'text-delta', index: 0, text: '夜色' };
        yield { type: 'text-delta', index: 0, text: '沉下来' };
        yield { type: 'finish', reason: { kind: 'stop' } };
      },
    });
    await expect(collectCandidate(backend, { prompt: 'continue', settings })).resolves.toEqual({ text: '夜色沉下来', chunks: 3 });
    expect(options).toMatchObject({
      provider: 'route', model: 'default', temperature: 0.4,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'continue' }], source: { kind: 'plugin', plugin: 'novel-creation-tool' } }],
    });
    // The current DSH `llm.stream` contract rejects `GenerateOptions.stop`;
    // `stopSequences` must never be forwarded, and undefined knobs are omitted.
    expect(options).not.toHaveProperty('stop');
    expect(options).not.toHaveProperty('maxTokens');
  });

  it('fails closed for invalid model routes and DSH error finishes', async () => {
    const backend = asLlmBackend({ async *stream() { yield { type: 'finish', reason: { kind: 'error', failure: { message: 'provider down' } } }; } });
    await expect(collectCandidate(backend, { prompt: 'x', settings: { ...settings, modelRef: 'invalid' } })).rejects.toMatchObject({ code: 'backend' });
    await expect(collectCandidate(backend, { prompt: 'x', settings })).rejects.toMatchObject({ code: 'backend' });
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
