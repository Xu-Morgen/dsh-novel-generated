import { parseC1RelationshipsFromNarrative, type C1RelationshipParserOutput } from '../llm/parse/relationship.js';
import { asLlmBackend } from '../llm/port/index.js';

/** Host-only I27 facade for C1 recognition through the injected `ctx.llm` route. */
export interface NovelRelationshipParserService {
  parseC1Relationships(input: unknown, settings: unknown, signal?: AbortSignal): Promise<C1RelationshipParserOutput>;
}

/**
 * Own in-flight parser cancellation in the current Fiber. This facade only
 * recognizes C1 ops; RelationshipRepository retains all C1 write authority.
 */
export function createRelationshipParserService(
  llm: unknown,
  onDispose?: (dispose: () => void) => void,
): NovelRelationshipParserService {
  const backend = asLlmBackend(llm);
  const active = new Set<AbortController>();
  onDispose?.(() => {
    for (const controller of active) controller.abort();
    active.clear();
  });
  return Object.freeze({
    async parseC1Relationships(input: unknown, settings: unknown, signal?: AbortSignal) {
      const controller = new AbortController();
      active.add(controller);
      const forwardAbort = () => controller.abort();
      signal?.addEventListener('abort', forwardAbort, { once: true });
      try {
        return await parseC1RelationshipsFromNarrative(backend, input, settings, controller.signal);
      } finally {
        signal?.removeEventListener('abort', forwardAbort);
        active.delete(controller);
      }
    },
  });
}
