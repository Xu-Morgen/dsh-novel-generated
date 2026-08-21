import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfirmationGate } from '../../core/confirm/index.js';
import { KnowledgeRepository, type KnowledgeDocument } from '../../core/knowledge/index.js';
import { filterKnowledge } from '../../core/knowledge/filter.js';
import {
  applyC3KnowledgeOperations,
  buildC3KnowledgeParserPrompt,
  parseC3KnowledgeFromNarrative,
  parseC3KnowledgeParserOutput,
  proposeLowConfidenceC3KnowledgeOperations,
} from './knowledge.js';

const settings = { modelRef: 'dsh/default', credentialRef: 'dsh/managed' };
const roots: string[] = [];
async function root() { const path = await mkdtemp(join(tmpdir(), 'novel-i28-')); roots.push(path); return path; }
afterEach(async () => Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))));
function backendReturning(response: unknown) { return { async *stream() { yield JSON.stringify(response); } }; }

const current: KnowledgeDocument = {
  entries: [{
    id: 'harbor-secret', version: 1, fact: '暗门藏在灯塔地下。', kind: 'secret', holders: ['lin'],
    revealPlan: { revealTo: ['mira', 'aran'], revealAt: '钟楼对峙后' }, status: 'hidden',
  }],
  states: [{ characterId: 'lin', knows: ['harbor-secret'] }, { characterId: 'mira', knows: [] }, { characterId: 'aran', knows: [] }],
};

interface CorpusCase { id: string; prose: string; current: KnowledgeDocument; expected: unknown; }
interface Corpus { iteration: string; immutable: boolean; threshold: number; canonicalCaseIds: string[]; heldOutCaseIds: string[]; cases: CorpusCase[]; }
async function corpus(): Promise<Corpus> {
  return JSON.parse(await readFile(resolve(process.cwd(), 'samples/i28/cases.json'), 'utf8')) as Corpus;
}

describe('I28 C3 knowledge parser', () => {
  it('limits the prompt to C3 and produces validated forward proposals without writing C3', async () => {
    const repository = new KnowledgeRepository(await root());
    await repository.open();
    const prompt = buildC3KnowledgeParserPrompt({ prose: '米拉看见了暗门。', entries: [...current.entries], states: [...current.states] });
    expect(prompt).toContain('不得输出状态、关系、正史、世界观、大纲、风格或正文改写');
    expect(prompt).toContain('C1 knownTo 是关系公开性');
    const result = await parseC3KnowledgeFromNarrative(backendReturning({ ops: [{
      op: 'advance', targetId: 'harbor-secret', addHolders: ['mira'], status: 'partially-revealed', confidence: 'high',
    }] }), { prose: '米拉看见了暗门。', ...current }, settings);
    expect(result.ops).toHaveLength(1);
    await expect(repository.read()).rejects.toThrow();
  });

  it('mechanically writes a complete forward C3 batch through KnowledgeRepository and preserves the POV consumer invariant', async () => {
    const repository = new KnowledgeRepository(await root());
    await repository.open();
    await repository.saveAll(current.entries, current.states);
    const changed = await applyC3KnowledgeOperations(repository, current, { ops: [{
      op: 'advance', targetId: 'harbor-secret', addHolders: ['mira'], status: 'partially-revealed', confidence: 'high',
    }] });
    expect(changed.entries[0]).toMatchObject({ holders: ['lin', 'mira'], status: 'partially-revealed' });
    expect(changed.states.find((state) => state.characterId === 'mira')?.knows).toEqual(['harbor-secret']);
    expect(filterKnowledge('mira', changed.entries, changed.states).entries.map((entry) => entry.id)).toEqual(['harbor-secret']);
    expect(await repository.read()).toEqual(changed);
  });

  it('fails closed for invalid JSON, undeclared operations, unknown or repeated holders, missing states, reverse, and cross-level status changes', async () => {
    expect(() => parseC3KnowledgeParserOutput('not json')).toThrow(/valid JSON/);
    expect(() => parseC3KnowledgeParserOutput(JSON.stringify({ ops: [{ op: 'delete', targetId: 'harbor-secret', confidence: 'high' }] }))).toThrow();
    await expect(parseC3KnowledgeFromNarrative(backendReturning({ ops: [{
      op: 'advance', targetId: 'missing', addHolders: ['mira'], status: 'partially-revealed', confidence: 'high',
    }] }), { prose: 'x', ...current }, settings)).rejects.toThrow(/Unknown C3 knowledge target/);
    await expect(parseC3KnowledgeFromNarrative(backendReturning({ ops: [{
      op: 'advance', targetId: 'harbor-secret', addHolders: ['lin'], status: 'partially-revealed', confidence: 'high',
    }] }), { prose: 'x', ...current }, settings)).rejects.toThrow(/already knows/);
    await expect(parseC3KnowledgeFromNarrative(backendReturning({ ops: [{
      op: 'advance', targetId: 'harbor-secret', addHolders: ['ghost'], status: 'partially-revealed', confidence: 'high',
    }] }), { prose: 'x', entries: [{ ...current.entries[0], revealPlan: { ...current.entries[0].revealPlan, revealTo: ['ghost'] } }], states: [...current.states] }, settings)).rejects.toThrow(/Missing C3 knowledge state/);
    await expect(parseC3KnowledgeFromNarrative(backendReturning({ ops: [{
      op: 'advance', targetId: 'harbor-secret', addHolders: ['other'], status: 'partially-revealed', confidence: 'high',
    }] }), { prose: 'x', entries: [...current.entries], states: [...current.states, { characterId: 'other', knows: [] }] }, settings)).rejects.toThrow(/not a pending reveal target/);
    await expect(parseC3KnowledgeFromNarrative(backendReturning({ ops: [{
      op: 'advance', targetId: 'harbor-secret', addHolders: ['mira'], status: 'revealed', confidence: 'high',
    }] }), { prose: 'x', ...current }, settings)).rejects.toThrow(/Invalid C3 knowledge status transition/);
    const partial: KnowledgeDocument = { ...current, entries: [{ ...current.entries[0], status: 'partially-revealed' }] };
    await expect(parseC3KnowledgeFromNarrative(backendReturning({ ops: [{
      op: 'advance', targetId: 'harbor-secret', addHolders: ['mira'], status: 'hidden', confidence: 'high',
    }] }), { prose: 'x', ...partial }, settings)).rejects.toThrow(/Invalid C3 knowledge status transition/);
    await expect(parseC3KnowledgeFromNarrative(undefined, { prose: 'x', ...current }, settings)).rejects.toThrow(/unavailable/);
  });

  it('keeps low-confidence C3 changes pending, so rejection leaves knowledge unchanged', async () => {
    const project = await root();
    const repository = new KnowledgeRepository(join(project, 'knowledge'));
    await repository.open();
    await repository.saveAll(current.entries, current.states);
    const gate = await ConfirmationGate.open(project);
    const low = { ops: [{ op: 'advance' as const, targetId: 'harbor-secret', addHolders: ['mira'], status: 'partially-revealed' as const, confidence: 'low' as const }] };
    await expect(applyC3KnowledgeOperations(repository, current, low)).rejects.toThrow(/require ConfirmationGate/);
    const proposal = await proposeLowConfidenceC3KnowledgeOperations(gate, 'proposal-i28-low', current, low);
    expect(proposal.status).toBe('pending');
    await gate.reject(proposal.id);
    expect(await repository.read()).toEqual(current);
  });

  it('regresses the frozen corpus including held-out cases at threshold', async () => {
    const loaded = await corpus();
    expect(loaded.iteration).toBe('I28');
    expect(loaded.immutable).toBe(true);
    const results = [] as Array<{ id: string; matched: boolean; canonical: boolean; heldOut: boolean }>;
    for (const sample of loaded.cases) {
      const output = await parseC3KnowledgeFromNarrative(backendReturning(sample.expected), { prose: sample.prose, ...sample.current }, settings);
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
