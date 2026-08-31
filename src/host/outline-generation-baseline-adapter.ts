import { defineRemote } from './remote/shared.js';
import { outlineGenerationBaselineInvocations } from './remote/outline-generation-baseline.js';
import type { NovelOutlineGenerationBaselineService } from './outline-generation-baseline-service.js';

/** Descriptor-derived adapter for the Host-owned immutable generation baseline. */
export function createOutlineGenerationBaselineRemote(service: NovelOutlineGenerationBaselineService) {
  return defineRemote('novelOutlineGenerationBaseline', 'novelOutlineGenerationBaseline', service, [
    { method: 'create', call: (projectId: string, input: Parameters<NovelOutlineGenerationBaselineService['create']>[1]) => service.create(projectId, input) },
    { method: 'read', call: (projectId: string, baselineId: string) => service.read(projectId, baselineId) },
    { method: 'current', call: (projectId: string, input: Parameters<NovelOutlineGenerationBaselineService['current']>[1]) => service.current(projectId, input) },
    { method: 'attachGenerated', call: (projectId: string, input: Parameters<NovelOutlineGenerationBaselineService['attachGenerated']>[1]) => service.attachGenerated(projectId, input) },
  ], outlineGenerationBaselineInvocations);
}
