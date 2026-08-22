import { homedir } from 'node:os';
import { join } from 'node:path';
import { projectDirectory, validateProjectId } from '../core/io/path.js';
import { ConfirmationGate } from '../core/confirm/index.js';
import { ImmutableSettingsIndex } from '../core/immutable-index/index.js';
import { classifySettings } from '../llm/parse/classifier.js';
import { asLlmBackend } from '../llm/port/index.js';
import { classifierOutputSchema, type ClassifierOutput } from '../core/schema/classifier.js';
import type { ConfirmationRecord } from '../core/schema/confirm.js';

/** Host-only I41 classifier. Candidates are proposals; Gate and the index own persistence. */
export interface NovelClassifierService {
  classify(projectId: string, input: unknown, settings: unknown, signal?: AbortSignal): Promise<ClassifierOutput>;
  propose(projectId: string, proposalId: string, output: ClassifierOutput): Promise<ConfirmationRecord>;
  applyAccepted(projectId: string, proposalId: string): Promise<{ added: number; updated: number; removed: number; total: number }>;
}

/** Every request is Fiber-cancellable; no classifier path writes before accepted Gate state. */
export function createClassifierService(
  llm: unknown,
  projectsRoot?: string,
  onDispose?: (dispose: () => void) => void,
): NovelClassifierService {
  const backend = asLlmBackend(llm);
  const active = new Set<AbortController>();
  onDispose?.(() => { for (const controller of active) controller.abort(); active.clear(); });
  const root = projectsRoot ?? join(homedir(), '.dsh', 'novel-projects');
  const rootFor = (projectId: string) => { validateProjectId(projectId); return projectDirectory(root, projectId); };
  return Object.freeze({
    async classify(projectId: string, input: unknown, settings: unknown, signal?: AbortSignal) {
      rootFor(projectId);
      const controller = new AbortController(); active.add(controller);
      const forwardAbort = () => controller.abort(); signal?.addEventListener('abort', forwardAbort, { once: true });
      try { return await classifySettings(backend, input, settings, controller.signal); }
      finally { signal?.removeEventListener('abort', forwardAbort); active.delete(controller); }
    },
    async propose(projectId: string, proposalId: string, output: ClassifierOutput) {
      rootFor(projectId);
      const parsed = classifierOutputSchema.parse(output);
      const gate = await ConfirmationGate.open(rootFor(projectId));
      return gate.propose({ id: proposalId, kind: 'i41-setting-classification', payload: parsed });
    },
    async applyAccepted(projectId: string, proposalId: string) {
      const root = rootFor(projectId);
      const gate = await ConfirmationGate.open(root);
      const record = gate.get(proposalId);
      if (record.kind !== 'i41-setting-classification') throw new Error(`Unexpected classifier proposal kind: ${record.kind}`);
      if (record.status !== 'accepted') throw new Error('Classifier proposal requires accepted ConfirmationGate decision');
      const output = classifierOutputSchema.parse(record.payload);
      const index = new ImmutableSettingsIndex(root); await index.open();
      try {
        await index.writeClassified(output.candidates);
        return await index.sync();
      } finally { index.close(); }
    },
  });
}
