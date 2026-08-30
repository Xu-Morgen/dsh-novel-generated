import { defineRemote } from './remote/shared.js';
import { sceneOutlineBindingInvocations } from './remote/scene-outline-binding.js';
import type { NovelSceneOutlineBindingService } from './scene-outline-binding-service.js';

/** Descriptor-derived Domain→wire adapter for the independent binding owner. */
export function createSceneOutlineBindingRemote(service: NovelSceneOutlineBindingService) {
  return defineRemote('novelSceneOutlineBinding', 'novelSceneOutlineBinding', service, [
    { method: 'read', call: (projectId: string) => service.read(projectId) },
    { method: 'save', call: (projectId: string, input: Parameters<NovelSceneOutlineBindingService['save']>[1]) => service.save(projectId, input) },
    { method: 'rebind', call: (projectId: string, input: Parameters<NovelSceneOutlineBindingService['rebind']>[1]) => service.rebind(projectId, input) },
    { method: 'unbind', call: (projectId: string, input: Parameters<NovelSceneOutlineBindingService['unbind']>[1]) => service.unbind(projectId, input) },
    { method: 'impact', call: (projectId: string, input: Parameters<NovelSceneOutlineBindingService['impact']>[1]) => service.impact(projectId, input) },
  ], sceneOutlineBindingInvocations);
}
