import {
  detectKnowledgeLeakHardConstraints,
  type KnowledgeLeakDetectionResult,
} from '../llm/validate/knowledge.js';
import { asLlmBackend } from '../llm/port/index.js';

/** Host-only I22 facade for C3 POV-leak checks through `ctx.llm`. */
export interface NovelKnowledgeLeakDetectionService {
  detectKnowledgeLeak(input: unknown, settings: unknown, signal?: AbortSignal): Promise<KnowledgeLeakDetectionResult>;
}

/**
 * Own in-flight detector cancellation in the plugin Fiber. This facade exposes
 * no C3 write, parser, credential, endpoint, or Client operation (plan I22).
 */
export function createKnowledgeLeakDetectionService(
  llm: unknown,
  onDispose?: (dispose: () => void) => void,
): NovelKnowledgeLeakDetectionService {
  const backend = asLlmBackend(llm);
  const active = new Set<AbortController>();
  const dispose = () => {
    for (const controller of active) controller.abort();
    active.clear();
  };
  onDispose?.(dispose);
  return Object.freeze({
    async detectKnowledgeLeak(input: unknown, settings: unknown, signal?: AbortSignal) {
      const controller = new AbortController();
      active.add(controller);
      const forwardAbort = () => controller.abort();
      signal?.addEventListener('abort', forwardAbort, { once: true });
      try {
        return await detectKnowledgeLeakHardConstraints(backend, input, settings, controller.signal);
      } finally {
        signal?.removeEventListener('abort', forwardAbort);
        active.delete(controller);
      }
    },
  });
}
