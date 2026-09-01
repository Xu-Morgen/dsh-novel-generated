import { defineRemote } from './remote/shared.js';
import { outlineDetailGenerationInvocations } from './remote/outline-detail-generation.js';
import type { NovelOutlineDetailGenerationService } from './outline-detail-generation-service.js';
import type { GenerationSettings } from '../llm/port/index.js';

/** Descriptor-derived adapter: all candidate mutations remain session/Host-owned. */
export function createOutlineDetailGenerationRemote(service: NovelOutlineDetailGenerationService, resolveSettings: (input: unknown) => Promise<GenerationSettings>) {
  return defineRemote('novelOutlineDetailGeneration', 'novelOutlineDetailGeneration', service, [
    { method: 'generate', call: async (projectId: string, input: Parameters<NovelOutlineDetailGenerationService['generate']>[1], settings?: Parameters<NovelOutlineDetailGenerationService['generate']>[2]) => service.generate(projectId, input, await resolveSettings(settings)) },
    { method: 'read', call: (projectId: string, candidateId: string) => service.read(projectId, candidateId) },
    { method: 'edit', call: (projectId: string, input: Parameters<NovelOutlineDetailGenerationService['edit']>[1]) => service.edit(projectId, input) },
    { method: 'regenerate', call: async (projectId: string, input: Parameters<NovelOutlineDetailGenerationService['regenerate']>[1], settings?: Parameters<NovelOutlineDetailGenerationService['regenerate']>[2]) => service.regenerate(projectId, input, await resolveSettings(settings)) },
    { method: 'skip', call: (projectId: string, input: Parameters<NovelOutlineDetailGenerationService['skip']>[1]) => service.skip(projectId, input) },
    { method: 'propose', call: (projectId: string, input: Parameters<NovelOutlineDetailGenerationService['propose']>[1]) => service.propose(projectId, input) },
    { method: 'accept', call: (projectId: string, proposalId: string) => service.accept(projectId, proposalId) },
    { method: 'reject', call: (projectId: string, proposalId: string) => service.reject(projectId, proposalId) },
    { method: 'cancel', call: (projectId: string, candidateId: string) => service.cancel(projectId, candidateId) },
    { method: 'append', call: async (projectId: string, input: Parameters<NovelOutlineDetailGenerationService['append']>[1], settings?: Parameters<NovelOutlineDetailGenerationService['append']>[2]) => service.append(projectId, input, await resolveSettings(settings)) },
    { method: 'select', call: (projectId: string, input: Parameters<NovelOutlineDetailGenerationService['select']>[1]) => service.select(projectId, input) },
  ], outlineDetailGenerationInvocations);
}
