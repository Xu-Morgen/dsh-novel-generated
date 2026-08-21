import { parseC2StateFromNarrative, type C2StateParserOutput } from '../llm/parse/state.js';
import { asLlmBackend } from '../llm/port/index.js';

/** Host-only I25 facade for C2 recognition through the injected `ctx.llm` route. */
export interface NovelStateParserService {
  parseC2State(input: unknown, settings: unknown, signal?: AbortSignal): Promise<C2StateParserOutput>;
}

/**
 * Own in-flight parser cancellation in the current Fiber. This facade only
 * recognizes C2 ops; StateEngine and ConfirmationGate retain write authority.
 */
export function createStateParserService(
  llm: unknown,
  onDispose?: (dispose: () => void) => void,
): NovelStateParserService {
  const backend = asLlmBackend(llm);
  const active = new Set<AbortController>();
  onDispose?.(() => {
    for (const controller of active) controller.abort();
    active.clear();
  });
  return Object.freeze({
    async parseC2State(input: unknown, settings: unknown, signal?: AbortSignal) {
      const controller = new AbortController();
      active.add(controller);
      const forwardAbort = () => controller.abort();
      signal?.addEventListener('abort', forwardAbort, { once: true });
      try {
        return await parseC2StateFromNarrative(backend, input, settings, controller.signal);
      } finally {
        signal?.removeEventListener('abort', forwardAbort);
        active.delete(controller);
      }
    },
  });
}
