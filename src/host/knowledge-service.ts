import { homedir } from 'node:os';
import { join } from 'node:path';
import { projectDirectory, validateProjectId } from '../core/io/path.js';
import { KnowledgeRepository } from '../core/knowledge/index.js';
import { filterKnowledge, type FilteredKnowledge } from '../core/knowledge/filter.js';
import type { KnowledgeDocument, KnowledgeEntry, KnowledgeEntryInput, KnowledgeState } from '../core/schema/knowledge.js';

/** Host facade for C3 storage and deterministic POV filtering. */
export interface NovelKnowledgeService {
  open(projectId: string): Promise<void>;
  read(projectId: string): Promise<KnowledgeDocument>;
  saveAll(projectId: string, entries: readonly KnowledgeEntry[], states: readonly KnowledgeState[]): Promise<KnowledgeDocument>;
  /** Host-only exact snapshot restore used by a failed cross-layer UoW. */
  restoreForCompensation(projectId: string, entries: readonly KnowledgeEntry[], states: readonly KnowledgeState[]): Promise<void>;
  saveEntry(projectId: string, entry: KnowledgeEntryInput, states: readonly KnowledgeState[]): Promise<KnowledgeEntry>;
  forPov(projectId: string, pov: string): Promise<FilteredKnowledge>;
}

export function createKnowledgeService(
  projectsRoot = join(homedir(), '.dsh', 'novel-projects'),
): NovelKnowledgeService {
  const repositories = new Map<string, KnowledgeRepository>();
  const get = (projectId: string): KnowledgeRepository => {
    validateProjectId(projectId);
    const repository = repositories.get(projectId);
    if (!repository) throw new Error(`Knowledge project is not open: ${projectId}`);
    return repository;
  };
  return {
    async open(projectId) {
      validateProjectId(projectId);
      const repository = new KnowledgeRepository(projectDirectory(projectsRoot, projectId));
      await repository.open();
      repositories.set(projectId, repository);
    },
    read: (projectId) => get(projectId).read(),
    saveAll: (projectId, entries, states) => get(projectId).saveAll(entries, states),
    restoreForCompensation: (projectId, entries, states) => get(projectId).restoreForCompensation(entries, states),
    saveEntry: (projectId, entry, states) => get(projectId).saveEntry(entry, states),
    async forPov(projectId, pov) {
      const document = await get(projectId).read();
      return filterKnowledge(pov, document.entries, document.states);
    },
  };
}
