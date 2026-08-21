import {
  detectRuleAndCanonHardConstraints,
  type RuleCanonDetectionResult,
} from '../llm/validate/index.js';
import { asLlmBackend } from '../llm/port/index.js';

/**
 * Host-only I21 facade for semantic B1/C4 checks through `ctx.llm`.
 * Its cancellation controllers are Fiber-owned via the supplied disposer; the
 * facade exposes no endpoint, credential, parser, or persistence operation.
 */
export interface NovelConsistencyDetectionService {
  detectRuleAndCanon(input: unknown, settings: unknown, signal?: AbortSignal): Promise<RuleCanonDetectionResult>;
}

export function createConsistencyDetectionService(
  llm: unknown,
  onDispose?: (dispose: () => void) => void,
): NovelConsistencyDetectionService {
  const backend = asLlmBackend(llm);
  const active = new Set<AbortController>();
  const dispose = () => {
    for (const controller of active) controller.abort();
    active.clear();
  };
  onDispose?.(dispose);
  return Object.freeze({
    async detectRuleAndCanon(input: unknown, settings: unknown, signal?: AbortSignal) {
      const controller = new AbortController();
      active.add(controller);
      const forwardAbort = () => controller.abort();
      signal?.addEventListener('abort', forwardAbort, { once: true });
      try {
        return await detectRuleAndCanonHardConstraints(backend, input, settings, controller.signal);
      } finally {
        signal?.removeEventListener('abort', forwardAbort);
        active.delete(controller);
      }
    },
  });
}
