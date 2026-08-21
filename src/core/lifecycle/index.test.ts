import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { executeLifecycle, LifecycleJournal, type LifecycleStage } from './index.js';

const roots: string[] = [];
async function root() { const path = await mkdtemp(join(tmpdir(), 'novel-i30-')); roots.push(path); return path; }
afterEach(async () => Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))));
const stages: LifecycleStage[] = ['c2', 'c1', 'c3', 'c4', 'b2'];

function parsers(calls: string[]) {
  return Object.fromEntries(stages.map((stage) => [stage, async () => { calls.push(`parse:${stage}`); return { stage }; }])) as never;
}
function writers(calls: string[], fail?: LifecycleStage) {
  return Object.fromEntries(stages.map((stage) => [stage, async () => { calls.push(`write:${stage}`); if (stage === fail) throw new Error(`failed ${stage}`); }])) as never;
}

/** I30 consumer fixture: acceptance gates parsers and serial layer persistence. */
describe('I30 full lifecycle saga', () => {
  it('hard-rejects before decision, parser fan-out, journal, or writeback', async () => {
    const calls: string[] = [];
    const journal = await LifecycleJournal.open(await root());
    const result = await executeLifecycle({ id: 'hard-reject', decision: 'accept', afterGenerationViolations: [{ kind: 'canon', severity: 'hard', message: 'contradiction', references: ['evt-1'] }], beforeWritebackViolations: [], parsers: parsers(calls), writers: writers(calls), journal });
    expect(result.status).toBe('generation-rejected');
    expect(calls).toEqual([]);
    expect(journal.list()).toEqual([]);
  });

  it('reject/rewrite/branch decisions perform zero parser and layer writes', async () => {
    for (const decision of ['reject', 'rewrite', 'branch'] as const) {
      const calls: string[] = [];
      const result = await executeLifecycle({ id: `decision-${decision}`, decision, afterGenerationViolations: [], beforeWritebackViolations: [], parsers: parsers(calls), writers: writers(calls), journal: await LifecycleJournal.open(await root()) });
      expect(result.status).toBe('decision-rejected');
      expect(calls).toEqual([]);
    }
  });

  it('fans out isolated parsers, runs the second gate, then commits layer owners in serial order', async () => {
    const calls: string[] = [];
    const journal = await LifecycleJournal.open(await root());
    const result = await executeLifecycle({ id: 'full-accept', decision: 'accept', afterGenerationViolations: [{ kind: 'style', severity: 'soft', message: 'warning', references: ['tone'] }], beforeWritebackViolations: [], parsers: parsers(calls), writers: writers(calls), journal });
    expect(result.status).toBe('written');
    expect(calls.filter((call) => call.startsWith('parse:'))).toHaveLength(5);
    expect(calls.filter((call) => call.startsWith('write:'))).toEqual(stages.map((stage) => `write:${stage}`));
    expect(journal.list()).toEqual([{ id: 'full-accept', status: 'written', committedStages: stages }]);
  });

  it('records a durable pending-compensation receipt instead of hiding a partial write', async () => {
    const directory = await root();
    const calls: string[] = [];
    const journal = await LifecycleJournal.open(directory);
    const result = await executeLifecycle({ id: 'c4-failure', decision: 'accept', afterGenerationViolations: [], beforeWritebackViolations: [], parsers: parsers(calls), writers: writers(calls, 'c4'), journal });
    expect(result.status).toBe('pending-compensation');
    expect(result.status === 'pending-compensation' && result.failedStage).toBe('c4');
    expect(calls.filter((call) => call.startsWith('write:'))).toEqual(['write:c2', 'write:c1', 'write:c3', 'write:c4']);
    expect((await LifecycleJournal.open(directory)).list()).toEqual([{ id: 'c4-failure', status: 'pending-compensation', committedStages: ['c2', 'c1', 'c3'], failedStage: 'c4', error: 'failed c4' }]);
  });

  it('keeps the frozen corpus and held-out lifecycle outcome regression at threshold', async () => {
    const corpus = JSON.parse(await readFile(resolve(process.cwd(), 'samples/i30/cases.json'), 'utf8')) as { immutable: boolean; threshold: number; heldOutCaseIds: string[]; cases: Array<{ id: string; decision: 'accept' | 'reject' | 'rewrite' | 'branch'; afterGeneration: 'pass' | 'warn' | 'reject'; beforeWriteback: 'pass' | 'warn' | 'reject'; expected: string }> };
    expect(corpus.immutable).toBe(true);
    const results: Array<{ id: string; matched: boolean; heldOut: boolean }> = [];
    for (const sample of corpus.cases) {
      const rootPath = await root();
      const violations = (status: string) => status === 'reject' ? [{ kind: 'hard', severity: 'hard', message: 'blocked', references: ['x'] }] : status === 'warn' ? [{ kind: 'soft', severity: 'soft', message: 'warn', references: ['x'] }] : [];
      const result = await executeLifecycle({ id: sample.id, decision: sample.decision, afterGenerationViolations: violations(sample.afterGeneration), beforeWritebackViolations: violations(sample.beforeWriteback), parsers: parsers([]), writers: writers([], sample.expected === 'pending-compensation' ? 'c4' : undefined), journal: await LifecycleJournal.open(rootPath) });
      results.push({ id: sample.id, matched: result.status === sample.expected, heldOut: corpus.heldOutCaseIds.includes(sample.id) });
    }
    expect(results.filter((result) => result.matched).length / results.length).toBeGreaterThanOrEqual(corpus.threshold);
    expect(results.filter((result) => result.heldOut).every((result) => result.matched)).toBe(true);
  });
});
