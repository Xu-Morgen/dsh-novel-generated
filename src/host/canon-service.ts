import { homedir } from 'node:os';
import { join } from 'node:path';
import { CanonLedger, type CanonEventView, type CanonQuery } from '../core/canon/index.js';
import type { CanonCorrectionInput, CanonEvent, CanonEventInput } from '../core/schema/canon.js';
import { projectDirectory, validateProjectId } from '../core/io/path.js';

export interface NovelCanonService {
  open(projectId: string): Promise<void>;
  append(projectId: string, input: CanonEventInput): Promise<CanonEvent>;
  supersede(projectId: string, targetId: string, correction: CanonCorrectionInput): Promise<CanonEvent>;
  query(projectId: string, filter?: CanonQuery): CanonEventView[];
}

/** Host facade for the I5 C4 consumer; the append-only jsonl file remains source of truth. */
export function createCanonService(projectsRoot = join(homedir(), '.dsh', 'novel-projects')): NovelCanonService {
  const ledgers = new Map<string, CanonLedger>();
  const get = (projectId: string): CanonLedger => {
    const ledger = ledgers.get(projectId);
    if (!ledger) throw new Error(`Canon project is not open: ${projectId}`);
    return ledger;
  };
  return {
    async open(projectId) {
      validateProjectId(projectId);
      ledgers.set(projectId, await CanonLedger.open(join(projectDirectory(projectsRoot, projectId), 'canon')));
    },
    append: (projectId, input) => get(projectId).append(input),
    supersede: (projectId, targetId, correction) => get(projectId).supersede(targetId, correction),
    query: (projectId, filter) => get(projectId).query(filter),
  };
}
