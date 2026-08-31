import { defineRemote } from './remote/shared.js';
import { outlineGenerationScopeInvocations } from './remote/outline-generation-scope.js';
import type { NovelOutlineGenerationScopeService } from './outline-generation-scope-service.js';

/** Descriptor-derived Host adapter for the I133 read-only scope contract. */
export function createOutlineGenerationScopeRemote(service: NovelOutlineGenerationScopeService) {
  return defineRemote('novelOutlineGenerationScope', 'novelOutlineGenerationScope', service, [
    { method: 'resolve', call: (projectId: string, input: Parameters<NovelOutlineGenerationScopeService['resolve']>[1]) => service.resolve(projectId, input) },
  ], outlineGenerationScopeInvocations);
}
