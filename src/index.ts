import type { Context } from '@deepseek-ai/cordis';

/**
 * I1 Host plugin: proves the ordinary out-of-tree Cordis package contract.
 *
 * This module is the Host entry (`exports["."]`). It provides a minimal
 * read-only `novelCreation` status service for the lifetime of its Cordis
 * Fiber; the service disappears when the Fiber is disposed. No Client code,
 * Remote, Slot, LLM, or project data belongs here yet (design §0.1.3 I1).
 */
export const name = 'novel-creation-tool';

/** Minimal I1 status service, read-only and versioned for smoke assertions. */
export interface NovelCreationStatus {
  readonly version: '2.0.0';
  readonly ready: true;
}

export function apply(ctx: Context): void {
  const status: NovelCreationStatus = { version: '2.0.0', ready: true };
  // Service is owned by the current Fiber and removed on dispose.
  ctx.provide('novelCreation', status);
}
