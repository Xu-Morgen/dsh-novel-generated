import { parseC3KnowledgeFromNarrative, type C3KnowledgeParserOutput } from '../llm/parse/knowledge.js';
import { asLlmBackend } from '../llm/port/index.js';

/** Host-only I28 facade for C3 recognition through the injected `ctx.llm` route. */
export interface NovelKnowledgeParserService {
  parseC3Knowledge(input: unknown, settings: unknown, signal?: AbortSignal): Promise<C3KnowledgeParserOutput>;
}

/**
 * Own in-flight parser cancellation in the current Fiber. This facade only
 * recognizes C3 forward operations; KnowledgeRepository and I11 retain write authority.
 */
export function createKnowledgeParserService(
  llm: unknown,
  onDispose?: (dispose: () => void) => void,
): NovelKnowledgeParserService {
  const backend = asLlmBackend(llm);
  const active = new Set<AbortController>();
  onDispose?.(() => {
    for (const controller of active) controller.abort();
    active.clear();
  });
  return Object.freeze({
    async parseC3Knowledge(input: unknown, settings: unknown, signal?: AbortSignal) {
      const controller = new AbortController();
      active.add(controller);
      const forwardAbort = () => controller.abort();
      signal?.addEventListener('abort', forwardAbort, { once: true });
      try {
        return await parseC3KnowledgeFromNarrative(backend, input, settings, controller.signal);
      } finally {
        signal?.removeEventListener('abort', forwardAbort);
        active.delete(controller);
      }
    },
  });
}
