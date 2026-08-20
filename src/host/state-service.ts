import { homedir } from 'node:os';
import { join } from 'node:path';
import { StateEngine, type StateDiff, type StateMutator } from '../core/state/index.js';
import type { WorldState } from '../core/schema/state.js';
import { projectDirectory, validateProjectId } from '../core/io/path.js';

export interface NovelStateService {
  open(projectId: string, initial: Omit<WorldState, 'seq'>): Promise<void>;
  current(projectId: string): WorldState;
  transaction(projectId: string, mutator: StateMutator): Promise<WorldState>;
  rollback(projectId: string, seq: number): Promise<WorldState>;
  diff(projectId: string, fromSeq: number, toSeq: number): StateDiff;
}

/** Host facade for the I4 C2 state consumer; project files remain the source of truth. */
export function createStateService(projectsRoot = join(homedir(), '.dsh', 'novel-projects')): NovelStateService {
  const engines = new Map<string, StateEngine>();
  const get = (projectId: string): StateEngine => {
    const engine = engines.get(projectId);
    if (!engine) throw new Error(`State project is not open: ${projectId}`);
    return engine;
  };
  return {
    async open(projectId, initial) {
      validateProjectId(projectId);
      engines.set(projectId, await StateEngine.open(join(projectDirectory(projectsRoot, projectId), 'state'), initial));
    },
    current: (projectId) => get(projectId).current(),
    transaction: (projectId, mutator) => get(projectId).transaction(mutator),
    rollback: (projectId, seq) => get(projectId).rollback(seq),
    diff: (projectId, fromSeq, toSeq) => get(projectId).diff(fromSeq, toSeq),
  };
}
