import { homedir } from 'node:os';
import { join } from 'node:path';
import { ConfirmationGate } from '../core/confirm/index.js';
import type { ConfirmationProposalInput, ConfirmationRecord } from '../core/schema/confirm.js';
import { projectDirectory, validateProjectId } from '../core/io/path.js';

/** Host-only consumer contract for the I11 shared confirmation primitive. */
export interface NovelConfirmationService {
  open(projectId: string): Promise<void>;
  propose(projectId: string, input: ConfirmationProposalInput): Promise<ConfirmationRecord>;
  accept(projectId: string, id: string): Promise<ConfirmationRecord>;
  reject(projectId: string, id: string): Promise<ConfirmationRecord>;
  get(projectId: string, id: string): ConfirmationRecord;
  pending(projectId: string): ConfirmationRecord[];
  /** 全部持久化裁决（含已接受/已拒绝），按插入顺序 —— I68 审计记录消费者（design §14.10「刷新与审计记录」/ R14-3）。 */
  list(projectId: string): ConfirmationRecord[];
}

/**
 * Host facade over project-local ConfirmationGate records.
 * Business proposal interpretation and application remain with the future caller.
 */
export function createConfirmationService(
  projectsRoot = join(homedir(), '.dsh', 'novel-projects'),
): NovelConfirmationService {
  const gates = new Map<string, ConfirmationGate>();
  const get = (projectId: string): ConfirmationGate => {
    const gate = gates.get(projectId);
    if (!gate) throw new Error(`Confirmation project is not open: ${projectId}`);
    return gate;
  };
  return {
    async open(projectId) {
      validateProjectId(projectId);
      gates.set(projectId, await ConfirmationGate.open(projectDirectory(projectsRoot, projectId)));
    },
    propose: (projectId, input) => get(projectId).propose(input),
    accept: (projectId, id) => get(projectId).accept(id),
    reject: (projectId, id) => get(projectId).reject(id),
    get: (projectId, id) => get(projectId).get(id),
    pending: (projectId) => get(projectId).pending(),
    list: (projectId) => get(projectId).list(),
  };
}
