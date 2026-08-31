import { homedir } from 'node:os';
import { join } from 'node:path';
import { projectDirectory, validateProjectId } from '../core/io/path.js';
import { ReferenceAuditJournal } from '../core/reference-audit/journal.js';
import {
  referenceAuditListInputSchema,
  type ReferenceAuditListInput,
  type ReferenceAuditListResult,
} from '../core/schema/reference-audit.js';

/**
 * Host-owned read projection for the I116 operational journal. `retry` and
 * `journalFor` are Host seams for the coordinator; neither is a Client Remote
 * method, so the browser cannot mutate audit state or narrative owners.
 */
export interface NovelReferenceAuditService {
  list(projectId: string, input?: ReferenceAuditListInput): Promise<ReferenceAuditListResult>;
  retry(projectId: string, operationId: string): Promise<import('../core/schema/reference-audit.js').ReferenceAuditRecord>;
  journalFor(projectId: string): Promise<ReferenceAuditJournal>;
}

/** Create one project-isolated journal cache owned by the current Host Fiber. */
export function createReferenceAuditService(
  projectsRoot = join(homedir(), '.dsh', 'novel-projects'),
  onFiberDispose?: (dispose: () => void) => void,
): NovelReferenceAuditService {
  const journals = new Map<string, Promise<ReferenceAuditJournal>>();
  let disposed = false;

  const journalFor = async (projectId: string): Promise<ReferenceAuditJournal> => {
    validateProjectId(projectId);
    if (disposed) throw new Error('Reference audit service is disposed');
    const existing = journals.get(projectId);
    if (existing !== undefined) return existing;
    const opening = ReferenceAuditJournal.open(projectDirectory(projectsRoot, projectId));
    journals.set(projectId, opening);
    try {
      return await opening;
    } catch (error) {
      if (journals.get(projectId) === opening) journals.delete(projectId);
      throw error;
    }
  };

  onFiberDispose?.(() => {
    disposed = true;
    journals.clear();
  });

  return Object.freeze({
    list: async (projectId: string, input?: ReferenceAuditListInput): Promise<ReferenceAuditListResult> => {
      const options = referenceAuditListInputSchema.parse(input ?? {});
      return (await journalFor(projectId)).list(projectId, options);
    },
    retry: async (projectId: string, operationId: string) => (await journalFor(projectId)).retry(projectId, operationId),
    journalFor,
  });
}
