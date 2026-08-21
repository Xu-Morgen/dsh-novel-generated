import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfirmationGate } from '../../core/confirm/index.js';
import { RelationshipRepository, type Relationship } from '../../core/relationship/index.js';
import {
  applyC1RelationshipOperations,
  buildC1RelationshipParserPrompt,
  parseC1RelationshipParserOutput,
  parseC1RelationshipsFromNarrative,
  proposeLowConfidenceC1RelationshipOperations,
} from './relationship.js';

const settings = { modelRef: 'dsh/default', credentialRef: 'dsh/managed' };
const roots: string[] = [];
async function root() { const path = await mkdtemp(join(tmpdir(), 'novel-i27-')); roots.push(path); return path; }
afterEach(async () => Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))));
function backendReturning(response: unknown) { return { async *stream() { yield JSON.stringify(response); } }; }

const friendship: Relationship = {
  id: 'lin-mira', version: 1, from: 'lin', to: 'mira', type: 'friendship',
  affinity: 30, trust: 40, status: 'uneasy alliance', milestones: ['evt-meeting'], knownTo: ['lin', 'mira'],
};

interface CorpusCase { id: string; prose: string; current: Relationship[]; expected: unknown; }
interface Corpus { iteration: string; immutable: boolean; threshold: number; canonicalCaseIds: string[]; heldOutCaseIds: string[]; cases: CorpusCase[]; }
async function corpus(): Promise<Corpus> {
  return JSON.parse(await readFile(resolve(process.cwd(), 'samples/i27/cases.json'), 'utf8')) as Corpus;
}

describe('I27 C1 relationship parser', () => {
  it('limits the prompt to C1 and produces validated proposals without writing C1', async () => {
    const repository = new RelationshipRepository(await root());
    await repository.open();
    const prompt = buildC1RelationshipParserPrompt({ prose: '林舟与米拉结为盟友。', current: [friendship] });
    expect(prompt).toContain('不得输出状态、知情、正史、世界观、大纲、风格或正文改写');
    expect(prompt).toContain('knownTo 只表示关系公开性');
    const result = await parseC1RelationshipsFromNarrative(backendReturning({ ops: [{
      op: 'modify', targetId: 'lin-mira', field: 'trust', action: 'set', value: 70, confidence: 'high',
    }] }), { prose: '林舟终于相信米拉。', current: [friendship] }, settings);
    expect(result.ops).toHaveLength(1);
    await expect(repository.read()).rejects.toThrow();
  });

  it('mechanically writes a complete validated batch through RelationshipRepository once', async () => {
    const repository = new RelationshipRepository(await root());
    await repository.open();
    const { version: _version, ...newRelationship } = friendship;
    const created = await applyC1RelationshipOperations(repository, [], { ops: [{
      op: 'create', relationship: newRelationship, confidence: 'high',
    }] });
    expect(created).toEqual([friendship]);
    const changed = await applyC1RelationshipOperations(repository, created, { ops: [
      { op: 'modify', targetId: 'lin-mira', field: 'affinity', action: 'set', value: 65, confidence: 'high' },
      { op: 'modify', targetId: 'lin-mira', field: 'status', action: 'set', value: 'trusted allies', confidence: 'medium' },
    ] });
    expect(changed).toEqual([{ ...friendship, affinity: 65, status: 'trusted allies' }]);
    expect(await repository.read()).toEqual(changed);
  });

  it('fails closed for invalid JSON, undeclared operations, immutable identity changes, unknown targets, and C1 invariant violations', async () => {
    expect(() => parseC1RelationshipParserOutput('not json')).toThrow(/valid JSON/);
    expect(() => parseC1RelationshipParserOutput(JSON.stringify({ ops: [{ op: 'delete', targetId: 'lin-mira', confidence: 'high' }] }))).toThrow();
    await expect(parseC1RelationshipsFromNarrative(backendReturning({ ops: [{
      op: 'modify', targetId: 'lin-mira', field: 'from', action: 'set', value: 'mira', confidence: 'high',
    }] }), { prose: 'x', current: [friendship] }, settings)).rejects.toThrow();
    await expect(parseC1RelationshipsFromNarrative(backendReturning({ ops: [{
      op: 'modify', targetId: 'missing', field: 'trust', action: 'set', value: 50, confidence: 'high',
    }] }), { prose: 'x', current: [friendship] }, settings)).rejects.toThrow(/Unknown C1 relationship target/);
    await expect(parseC1RelationshipsFromNarrative(backendReturning({ ops: [{
      op: 'modify', targetId: 'lin-mira', field: 'affinity', action: 'set', value: 101, confidence: 'high',
    }] }), { prose: 'x', current: [friendship] }, settings)).rejects.toThrow();
    const { version: _version, ...selfRelationship } = friendship;
    await expect(parseC1RelationshipsFromNarrative(backendReturning({ ops: [{
      op: 'create', relationship: { ...selfRelationship, from: 'lin', to: 'lin' }, confidence: 'high',
    }] }), { prose: 'x', current: [] }, settings)).rejects.toThrow(/endpoints/);
    await expect(parseC1RelationshipsFromNarrative(undefined, { prose: 'x', current: [friendship] }, settings)).rejects.toThrow(/unavailable/);
  });

  it('keeps low-confidence relationship changes pending, so rejection leaves C1 unchanged', async () => {
    const project = await root();
    const repository = new RelationshipRepository(join(project, 'relationships'));
    await repository.open();
    await repository.saveAll([friendship]);
    const gate = await ConfirmationGate.open(project);
    const low = { ops: [{ op: 'modify' as const, targetId: 'lin-mira', field: 'status' as const, action: 'set' as const, value: 'possible distance', confidence: 'low' as const }] };
    await expect(applyC1RelationshipOperations(repository, [friendship], low)).rejects.toThrow(/require ConfirmationGate/);
    const proposal = await proposeLowConfidenceC1RelationshipOperations(gate, 'proposal-i27-low', [friendship], low);
    expect(proposal.status).toBe('pending');
    await gate.reject(proposal.id);
    expect(await repository.read()).toEqual([friendship]);
  });

  it('regresses the frozen corpus including held-out cases at threshold', async () => {
    const loaded = await corpus();
    expect(loaded.iteration).toBe('I27');
    expect(loaded.immutable).toBe(true);
    const results = [] as Array<{ id: string; matched: boolean; canonical: boolean; heldOut: boolean }>;
    for (const sample of loaded.cases) {
      const output = await parseC1RelationshipsFromNarrative(backendReturning(sample.expected), { prose: sample.prose, current: sample.current }, settings);
      results.push({ id: sample.id, matched: JSON.stringify(output) === JSON.stringify(sample.expected), canonical: loaded.canonicalCaseIds.includes(sample.id), heldOut: loaded.heldOutCaseIds.includes(sample.id) });
    }
    const accuracy = results.filter((result) => result.matched).length / results.length;
    const heldOut = results.filter((result) => result.heldOut);
    expect(results.length).toBeGreaterThanOrEqual(10);
    expect(accuracy).toBeGreaterThanOrEqual(loaded.threshold);
    expect(results.filter((result) => result.canonical)).toHaveLength(3);
    expect(heldOut).toHaveLength(3);
    expect(heldOut.every((result) => result.matched)).toBe(true);
    expect(new Set(loaded.canonicalCaseIds).size).toBe(loaded.canonicalCaseIds.length);
    expect(loaded.heldOutCaseIds.every((id) => !loaded.canonicalCaseIds.includes(id))).toBe(true);
  });
});
