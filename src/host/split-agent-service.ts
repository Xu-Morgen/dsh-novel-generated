import { splitImportedText, type SplitAgentInput, type SplitAgentOutput } from '../llm/parse/split.js';
import { asLlmBackend } from '../llm/port/index.js';

/** Host-only I38 facade; it recognizes import structure but owns no Client LLM path. */
export interface NovelSplitAgentService {
  split(input: SplitAgentInput, settings: unknown, signal?: AbortSignal): Promise<SplitAgentOutput>;
}

/** Fiber disposal cancels every in-flight split request. */
export function createSplitAgentService(
  llm: unknown,
  onDispose?: (dispose: () => void) => void,
): NovelSplitAgentService {
  const backend = asLlmBackend(llm);
  const active = new Set<AbortController>();
  onDispose?.(() => {
    for (const controller of active) controller.abort();
    active.clear();
  });
  return Object.freeze({
    async split(input: SplitAgentInput, settings: unknown, signal?: AbortSignal) {
      const controller = new AbortController();
      active.add(controller);
      const forwardAbort = () => controller.abort();
      signal?.addEventListener('abort', forwardAbort, { once: true });
      try {
        return await splitImportedText(backend, input, settings, controller.signal);
      } finally {
        signal?.removeEventListener('abort', forwardAbort);
        active.delete(controller);
      }
    },
  });
}
