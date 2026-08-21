import { parseB2WorldviewFromNarrative, type B2WorldviewParserOutput } from '../llm/parse/worldview.js';
import { asLlmBackend } from '../llm/port/index.js';

/** Host-only I29 facade for B2 supersede recognition through the injected `ctx.llm` route. */
export interface NovelWorldviewParserService {
  parseB2Worldview(input: unknown, settings: unknown, signal?: AbortSignal): Promise<B2WorldviewParserOutput>;
}

/**
 * Own in-flight parser cancellation in the current Fiber. This facade only
 * recognizes B2 proposals; I11 and WorldRepository retain write authority.
 */
export function createWorldviewParserService(
  llm: unknown,
  onDispose?: (dispose: () => void) => void,
): NovelWorldviewParserService {
  const backend = asLlmBackend(llm);
  const active = new Set<AbortController>();
  onDispose?.(() => {
    for (const controller of active) controller.abort();
    active.clear();
  });
  return Object.freeze({
    async parseB2Worldview(input: unknown, settings: unknown, signal?: AbortSignal) {
      const controller = new AbortController();
      active.add(controller);
      const forwardAbort = () => controller.abort();
      signal?.addEventListener('abort', forwardAbort, { once: true });
      try {
        return await parseB2WorldviewFromNarrative(backend, input, settings, controller.signal);
      } finally {
        signal?.removeEventListener('abort', forwardAbort);
        active.delete(controller);
      }
    },
  });
}
