import {
  detectRelationshipAndStyleSoftConstraints,
  type RelationshipStyleDetectionResult,
} from '../llm/validate/relationship-style.js';
import { asLlmBackend } from '../llm/port/index.js';

/** Host-only I24 facade for C1/B4 semantic soft checks through `ctx.llm`. */
export interface NovelRelationshipStyleDetectionService {
  detectRelationshipAndStyle(input: unknown, settings: unknown, signal?: AbortSignal): Promise<RelationshipStyleDetectionResult>;
}

/**
 * Own in-flight semantic-check cancellation in the plugin Fiber. This facade
 * exposes no parser, writeback, persistence, Client, endpoint, or hard
 * decision; I20 remains the only pass/warn/reject owner (plan I24).
 */
export function createRelationshipStyleDetectionService(
  llm: unknown,
  onDispose?: (dispose: () => void) => void,
): NovelRelationshipStyleDetectionService {
  const backend = asLlmBackend(llm);
  const active = new Set<AbortController>();
  const dispose = () => {
    for (const controller of active) controller.abort();
    active.clear();
  };
  onDispose?.(dispose);
  return Object.freeze({
    async detectRelationshipAndStyle(input: unknown, settings: unknown, signal?: AbortSignal) {
      const controller = new AbortController();
      active.add(controller);
      const forwardAbort = () => controller.abort();
      signal?.addEventListener('abort', forwardAbort, { once: true });
      try {
        return await detectRelationshipAndStyleSoftConstraints(backend, input, settings, controller.signal);
      } finally {
        signal?.removeEventListener('abort', forwardAbort);
        active.delete(controller);
      }
    },
  });
}
