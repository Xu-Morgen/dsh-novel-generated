import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProjectRepository } from '../core/project/index.js';
import { createConfirmationService } from './confirmation-service.js';
import { createRuleService } from './rule-service.js';
import { createStyleService } from './style-service.js';
import { createRuleStyleImportInitializationService } from './rule-style-import-initialization-service.js';
import type { RuleStyleImportCandidate } from '../core/schema/rule-style-import-initialization.js';

const sourceHash = 'a'.repeat(64);
const identity = { projectId: 'demo', importSessionId: 'import-first', sourceHash };
const intent = { sourceRole: 'synopsis' as const, treatment: 'expand-outline' as const };
const candidate: RuleStyleImportCandidate = {
  rules: [{ id: 'rule-one', scope: 'global', kind: 'magic', statement: '潮汐钟每天只能倒转一次。', priority: 80, immutable: false, examples: [], active: true }],
  style: { id: 'style-imported', name: '导入文风', person: 'third-limited', tense: 'past', povScope: 'single', tone: '克制', proseStyle: '紧贴角色感知', chapterFormat: '按调查节点分章', dialogueConventions: '对白简洁', forbidden: ['提前揭示答案'] },
};
const settings = { modelRef: 'dsh/fake', credentialRef: 'dsh/test' };
const waitFor = async (service: ReturnType<typeof createRuleStyleImportInitializationService>, status: string) => {
  for (let index = 0; index < 100; index += 1) {
    const current = await service.status(identity);
    if (current.status === status) return current;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${status}`);
};

describe('I151 RuleStyleImportInitializationService', () => {
  it('calls LLM exactly once, writes nothing before I11, then round-trips rules/style after accept', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-i151-'));
    try {
      await new ProjectRepository(root).createProject({ projectId: 'demo', name: 'Demo' });
      const rules = createRuleService(root); const style = createStyleService(root); const confirmation = createConfirmationService(root);
      await Promise.all([rules.open('demo'), style.open('demo'), confirmation.open('demo')]);
      let calls = 0;
      const llm = { async *stream() { calls += 1; yield { type: 'text-delta' as const, text: JSON.stringify(candidate) }; yield { type: 'finish' as const, reason: { kind: 'stop' } }; } };
      const sessions = { firstConfirmed: async () => ({ ...identity, intent, paragraphDecisions: [], status: 'confirmed' as const, createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() }) };
      const analysis = { source: () => '规范化首次导入文本' };
      const service = createRuleStyleImportInitializationService(llm, root, {
        sessions: sessions as never, analysis: analysis as never, confirmation, rules, style, isProjectEmpty: async () => true,
      });
      await Promise.all([service.begin(identity, settings), service.begin(identity, settings)]);
      const generated = await waitFor(service, 'succeeded');
      expect(calls).toBe(1);
      expect(await rules.list('demo')).toEqual([]);
      await expect(style.read('demo')).rejects.toThrow(/Invalid style/);
      const proposed = await service.propose({ ...identity, expectedFingerprint: generated.candidateFingerprint!, candidate: generated.candidate! });
      expect(confirmation.pending('demo')).toHaveLength(1);
      expect(await rules.list('demo')).toEqual([]);
      const applied = await service.accept({ ...identity, expectedFingerprint: proposed.candidateFingerprint! });
      expect(applied.status).toBe('applied');
      expect((await rules.list('demo'))[0]).toMatchObject({ id: 'rule-one', immutable: false, version: 1 });
      expect(await style.read('demo')).toMatchObject({ id: 'style-imported', version: 1 });
      expect(await service.accept({ ...identity, expectedFingerprint: proposed.candidateFingerprint! })).toEqual(applied);
      expect(calls).toBe(1);
      expect(await readFile(join(root, 'demo', 'rules', 'rule-one.yaml'), 'utf8')).toContain('immutable: false');
      expect(await readFile(join(root, 'demo', 'style.yaml'), 'utf8')).toContain('style-imported');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('fails closed on later import, stale identity, reject, existing B1/B4, and writer failure', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-i151-negative-'));
    try {
      await new ProjectRepository(root).createProject({ projectId: 'demo', name: 'Demo' });
      const rules = createRuleService(root); const style = createStyleService(root); const confirmation = createConfirmationService(root);
      await Promise.all([rules.open('demo'), style.open('demo'), confirmation.open('demo')]);
      const sessions = { firstConfirmed: async (value: typeof identity) => { if (value.importSessionId !== identity.importSessionId) throw new Error('only first controlled import'); return { ...identity, intent, paragraphDecisions: [], status: 'confirmed', createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() }; } };
      const service = createRuleStyleImportInitializationService({ async *stream() { yield { type: 'text-delta' as const, text: JSON.stringify(candidate) }; } }, root, {
        sessions: sessions as never, analysis: { source: () => 'text' } as never, confirmation, rules, style, isProjectEmpty: async () => true,
      });
      await service.begin(identity, settings); const generated = await waitFor(service, 'succeeded');
      await expect(service.status({ ...identity, sourceHash: 'b'.repeat(64) })).rejects.toThrow(/source hash mismatch/);
      const proposed = await service.propose({ ...identity, expectedFingerprint: generated.candidateFingerprint!, candidate: generated.candidate! });
      const rejected = await service.reject({ ...identity, expectedFingerprint: proposed.candidateFingerprint! });
      expect(rejected.status).toBe('rejected');
      expect(await rules.list('demo')).toEqual([]);
      await expect(service.begin({ ...identity, importSessionId: 'import-later' }, settings)).rejects.toThrow(/another import session/);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('compensates B4 when the B1 writer fails and never reports applied', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-i151-writer-failure-'));
    try {
      await new ProjectRepository(root).createProject({ projectId: 'demo', name: 'Demo' });
      const rules = createRuleService(root); const style = createStyleService(root); const confirmation = createConfirmationService(root);
      await Promise.all([rules.open('demo'), style.open('demo'), confirmation.open('demo')]);
      const failingRules = { ...rules, initialize: async () => { throw new Error('injected B1 writer failure'); } };
      const sessions = { firstConfirmed: async () => ({ ...identity, intent, paragraphDecisions: [], status: 'confirmed', createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() }) };
      const service = createRuleStyleImportInitializationService({ async *stream() { yield { type: 'text-delta' as const, text: JSON.stringify(candidate) }; } }, root, {
        sessions: sessions as never, analysis: { source: () => 'text' } as never, confirmation, rules: failingRules, style, isProjectEmpty: async () => true,
      });
      await service.begin(identity, settings); const generated = await waitFor(service, 'succeeded');
      const proposed = await service.propose({ ...identity, expectedFingerprint: generated.candidateFingerprint!, candidate: generated.candidate! });
      await expect(service.accept({ ...identity, expectedFingerprint: proposed.candidateFingerprint! })).rejects.toThrow(/injected B1 writer failure/);
      expect(await rules.list('demo')).toEqual([]);
      expect(await style.isInitialized('demo')).toBe(false);
      expect((await service.status(identity)).status).toBe('failed');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
