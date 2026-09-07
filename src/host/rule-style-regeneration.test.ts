import { mkdtemp, rm, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import { ProjectRepository } from '../core/project/index.js';
import { RuleRepository } from '../core/rules/index.js';
import { writeYaml } from '../core/io/yaml.js';
import { createRuleService } from './rule-service.js';
import { createStyleService } from './style-service.js';
import { createConfirmationService } from './confirmation-service.js';
import { createImportInterpretationSessionService } from './import-interpretation-session-service.js';
import { createRuleStyleImportInitializationService } from './rule-style-import-initialization-service.js';
import type { RuleStyleImportCandidate, RuleStyleImportProjection } from '../core/schema/rule-style-import-initialization.js';

const candidate: RuleStyleImportCandidate = {
  rules: [{ id: 'new-rule', scope: 'global', kind: 'magic', statement: '新规则', priority: 10, immutable: false, examples: [], active: true }],
  style: { id: 'new-style', name: '新文风', person: 'third-limited', tense: 'past', povScope: 'single', tone: '克制', proseStyle: '简洁', chapterFormat: '分章', dialogueConventions: '引号', forbidden: [] },
};
const settings = { modelRef: 'test/model', credentialRef: 'test/key' };
async function fixture(empty = false) {
  const root = await mkdtemp(join(tmpdir(), 'novel-i201-'));
  await new ProjectRepository(root).createProject({ projectId: 'book', name: 'Book' });
  const rules = createRuleService(root), style = createStyleService(root), confirmation = createConfirmationService(root), sessions = createImportInterpretationSessionService(root);
  await Promise.all([rules.open('book'), style.open('book'), confirmation.open('book')]);
  if (!empty) { await rules.create('book', { ...candidate.rules[0], id: 'old-rule', statement: '旧规则', immutable: true }); await style.save('book', { ...candidate.style, id: 'old-style', name: '旧文风' }); }
  const input = { projectId: 'book', sourceHash: 'a'.repeat(64), intent: { sourceRole: 'idea' as const, treatment: 'expand-outline' as const }, paragraphDecisions: [{ paragraphId: 'p1', role: 'plot-plan' as const, decision: 'accepted' as const, summary: '来源' }] };
  for (let i = 0; i < 2; i++) { const session = await sessions.create(input); await sessions.confirm({ ...input, importSessionId: session.importSessionId }); }
  const current = await sessions.create(input); await sessions.confirm({ ...input, importSessionId: current.importSessionId });
  const identity = { projectId: 'book', sourceHash: input.sourceHash, importSessionId: current.importSessionId };
  let calls = 0, fail = false;
  const llm = { async *stream() { calls++; if (fail) throw new Error('test model unavailable'); yield { type: 'text-delta' as const, text: JSON.stringify(candidate) }; yield { type: 'finish' as const, reason: { kind: 'stop' as const } }; } };
  const deps = { rules, style, confirmation, sessions, analysis: { source: () => '已确认来源' } as never, isProjectEmpty: async () => false };
  const service = createRuleStyleImportInitializationService(llm, root, deps);
  const generate = async () => { const p = await service.prepareRegeneration(identity); return service.regenerate({ ...identity, authorizationId: p.authorizationId }, settings, { waitForCompletion: true }); };
  const propose = (value: RuleStyleImportProjection) => service.propose({ ...identity, expectedFingerprint: value.candidateFingerprint!, candidate: value.candidate! });
  return { root, rules, style, confirmation, sessions, identity, service, deps, llm, generate, propose, calls: () => calls, fail: () => { fail = true; }, close: async () => { service.dispose(); sessions.dispose(); vi.restoreAllMocks(); await rm(root, { recursive: true, force: true }); } };
}
describe('I201 confirmed rule/style replacement', () => {
  it('permits later imports only after Gate acceptance, preserves old data until candidate acceptance and replays once', async () => {
    const f = await fixture(); try {
      await expect(f.service.begin(f.identity, settings)).rejects.toThrow(/first controlled import/);
      const proposal = await f.service.prepareRegeneration(f.identity);
      expect(proposal).toMatchObject({ status: 'pending', ruleCount: 1, styleName: '旧文风' });
      expect(await f.service.prepareRegeneration(f.identity)).toEqual(proposal);
      expect(f.calls()).toBe(0);
      const request = { ...f.identity, authorizationId: proposal.authorizationId };
      const [generated] = await Promise.all([f.service.regenerate(request, settings, { waitForCompletion: true }), f.service.regenerate(request, settings)]);
      expect(generated.status).toBe('succeeded'); expect(f.calls()).toBe(1);
      expect((await f.rules.list('book'))[0].id).toBe('old-rule'); expect((await f.style.read('book')).name).toBe('旧文风');
      const proposed = await f.propose(generated);
      const decision = { ...f.identity, expectedFingerprint: proposed.candidateFingerprint! };
      expect((await f.service.accept(decision)).status).toBe('applied');
      expect((await f.rules.list('book')).map(rule => rule.id)).toEqual(['new-rule']);
      expect(await f.style.read('book')).toMatchObject({ id: 'new-style', version: 2 });
      expect((await f.service.accept(decision)).status).toBe('applied');
      await f.service.regenerate(request, settings); expect(f.calls()).toBe(1);
      const next = await f.generate(); expect(next.candidateFingerprint).not.toBe(generated.candidateFingerprint);
      await f.propose(next); await expect(f.service.accept(decision)).rejects.toThrow(/stale/);
    } finally { await f.close(); }
  });
  it('rejection and model failure preserve old data and never authorize an unconfirmed request', async () => {
    const f = await fixture(); try {
      const p = await f.service.prepareRegeneration(f.identity); const request = { ...f.identity, authorizationId: p.authorizationId };
      await f.service.rejectRegeneration(request);
      await expect(f.service.regenerate(request, settings)).rejects.toThrow(/rejected/);
      await expect(f.service.regenerate({ ...request, authorizationId: 'fake' }, settings)).rejects.toThrow(); expect(f.calls()).toBe(0);
      f.fail(); expect((await f.generate()).status).toBe('failed');
      expect((await f.rules.list('book'))[0].id).toBe('old-rule'); expect((await f.style.read('book')).name).toBe('旧文风');
    } finally { await f.close(); }
  });
  it('rejects baseline edits before generation and before final acceptance', async () => {
    const f = await fixture(); try {
      const p = await f.service.prepareRegeneration(f.identity);
      await f.style.save('book', { ...candidate.style, name: '作者修改' });
      await expect(f.service.regenerate({ ...f.identity, authorizationId: p.authorizationId }, settings)).rejects.toThrow(/stale/); expect(f.calls()).toBe(0);
      const generated = await f.generate(); const proposed = await f.propose(generated);
      await f.style.save('book', { ...candidate.style, name: '更新编辑' });
      await expect(f.service.accept({ ...f.identity, expectedFingerprint: proposed.candidateFingerprint! })).rejects.toThrow(/stale/);
      expect((await f.style.read('book')).name).toBe('更新编辑');
    } finally { await f.close(); }
  });
  it('compensates a failed B4 write and recovers the same accepted candidate on retry', async () => {
    const f = await fixture(); try {
      const p = await f.propose(await f.generate());
      const request = { ...f.identity, expectedFingerprint: p.candidateFingerprint! };
      vi.spyOn(f.style, 'replace').mockRejectedValueOnce(new Error('injected disk failure'));
      await expect(f.service.accept(request)).rejects.toThrow(/disk failure/);
      expect((await f.rules.list('book'))[0].id).toBe('old-rule'); expect((await f.style.read('book')).name).toBe('旧文风');
      expect((await f.service.accept(request)).status).toBe('applied'); expect(f.calls()).toBe(1);
      const reopenedRules = createRuleService(f.root); const reopenedStyle = createStyleService(f.root);
      await Promise.all([reopenedRules.open('book'), reopenedStyle.open('book')]);
      expect((await reopenedRules.list('book'))[0].id).toBe('new-rule'); expect((await reopenedStyle.read('book')).name).toBe('新文风');
    } finally { await f.close(); }
  });
  it('handles an empty later-import project and rejects cross-source authorization', async () => {
    const f = await fixture(true); try {
      const p = await f.service.prepareRegeneration(f.identity);
      await expect(f.service.regenerate({ ...f.identity, sourceHash: 'b'.repeat(64), authorizationId: p.authorizationId }, settings)).rejects.toThrow(/hash mismatch/);
      const generated = await f.generate(); const proposed = await f.propose(generated);
      expect((await f.service.accept({ ...f.identity, expectedFingerprint: proposed.candidateFingerprint! })).status).toBe('applied');
    } finally { await f.close(); }
  });
  it('resumes a partially written accepted replacement after recreating the service', async () => {
    const f = await fixture(); try {
      const p = await f.propose(await f.generate()); const request = { ...f.identity, expectedFingerprint: p.candidateFingerprint! };
      const replaceRules = f.rules.replaceAll.bind(f.rules);
      vi.spyOn(f.rules, 'replaceAll').mockImplementationOnce(replaceRules).mockRejectedValueOnce(new Error('rollback interrupted'));
      vi.spyOn(f.style, 'replace').mockRejectedValueOnce(new Error('style interrupted'));
      await expect(f.service.accept(request)).rejects.toThrow(/rollback interrupted/);
      expect((await f.rules.list('book'))[0].id).toBe('new-rule');
      vi.restoreAllMocks(); f.service.dispose();
      const resumed = createRuleStyleImportInitializationService(f.llm, f.root, { ...f.deps, rules: createRuleService(f.root), style: createStyleService(f.root) });
      expect((await resumed.accept(request)).status).toBe('applied'); expect(f.calls()).toBe(1); resumed.dispose();
    } finally { await f.close(); }
  });
  it('rolls an interrupted rule-file batch back from its durable journal on open', async () => {
    const f = await fixture(); try {
      const before = await f.rules.list('book');
      await writeYaml(join(f.root, 'book', 'rules', '.replacement-journal'), before);
      await unlink(join(f.root, 'book', 'rules', 'old-rule.yaml'));
      await writeYaml(join(f.root, 'book', 'rules', 'new-rule.yaml'), { ...candidate.rules[0], version: 1 });
      const reopened = new RuleRepository(join(f.root, 'book')); await reopened.open();
      expect(await reopened.list()).toEqual(before);
    } finally { await f.close(); }
  });
});
