import { collectCandidate, resolveGenerationSettings, type GenerationCandidate, type GenerationRequest, asLlmBackend } from '../llm/port/index.js';

/** Host facade for I17 generation. It exposes no endpoint, key, or Client handle. */
export interface NovelGenerationService {
  generate(prompt: string, settings: unknown, signal?: AbortSignal): Promise<GenerationCandidate>;
}

export function createGenerationService(llm: unknown, onDispose?: (dispose: () => void) => void): NovelGenerationService {
  const backend = asLlmBackend(llm);
  const active = new Set<AbortController>();
  const dispose = () => {
    for (const controller of active) controller.abort();
    active.clear();
  };
  onDispose?.(dispose);
  return {
    async generate(prompt, settings, signal) {
      if (typeof prompt !== 'string' || prompt.length === 0) throw new Error('Generation prompt must be non-empty');
      const controller = new AbortController();
      active.add(controller);
      const forwardAbort = () => controller.abort();
      signal?.addEventListener('abort', forwardAbort, { once: true });
      try {
        const request: GenerationRequest = { prompt, settings: resolveGenerationSettings(settings), signal: controller.signal };
        return await collectCandidate(backend, request);
      } finally {
        signal?.removeEventListener('abort', forwardAbort);
        active.delete(controller);
      }
    },
  };
}
