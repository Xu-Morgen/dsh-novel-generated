import { defineRemote } from './remote/shared.js';
import { textDeletionInvocations } from './remote/text-deletion.js';
import type { TextDeletionTarget } from '../core/schema/text-deletion.js';
import type { NovelTextDeletionService } from './text-deletion-service.js';

/** Explicit Domain→wire adapter for I106's four-method deletion surface. */
export function createTextDeletionRemote(service: NovelTextDeletionService) {
  return defineRemote('novelTextDeletion', 'novelTextDeletion', service, [
    { method: 'impact', call: (projectId: string, target: TextDeletionTarget) => service.impact(projectId, target) },
    { method: 'propose', call: (projectId: string, target: TextDeletionTarget, expectedImpactFingerprint: string) => service.propose(projectId, { target, expectedImpactFingerprint }) },
    { method: 'apply', call: (projectId: string, proposalId: string) => service.apply(projectId, proposalId) },
    { method: 'reject', call: (projectId: string, proposalId: string) => service.reject(projectId, proposalId) },
  ], textDeletionInvocations);
}
