import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CanonLedger, type CanonEventView } from '../../core/canon/index.js';
import { ConfirmationGate } from '../../core/confirm/index.js';
import {
  applyC4CanonOperations,
  buildC4CanonParserPrompt,
  parseC4CanonFromNarrative,
  parseC4CanonParserOutput,
  proposeC4CanonOperations,
} from './canon.js';

const settings = { modelRef: 'dsh/default', credentialRef: 'dsh/managed' };
const roots: string[] = [];
async function root() { const path = await mkdtemp(join(tmpdir(), 'novel-i26-')); roots.push(path); return path; }
afterEach(async () => Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))));
function backendReturning(response: unknown) { return { async *stream() { yield JSON.stringify(response); } }; }

const arrival = {
  id: 'evt-arrival', storyTime: 'day 1 dawn', kind: 'event' as const,
  summary: '林舟抵达外城门', detail: '黎明时林舟抵达外城门。', participants: ['lin'], location: '外城门', consequences: [], affectedLayers: ['state'],
};
async function seededLedger(): Promise<CanonLedger> {
  const ledger = await CanonLedger.open(await root());
  await ledger.append(arrival);
  return ledger;
}

interface CorpusCase { id: string; prose: string; current: CanonEventView[]; expected: unknown; }
interface Corpus { iteration: string; immutable: boolean; threshold: number; canonicalCaseIds: string[]; heldOutCaseIds: string[]; cases: CorpusCase[]; }
async function corpus(): Promise<Corpus> {
  return JSON.parse(await readFile(resolve(process.cwd(), 'samples/i26/cases.json'), 'utf8')) as Corpus;
}

describe('I26 C4 Canon parser', () => {
  it('limits the prompt to C4 and produces validated proposals without writing the ledger', async () => {
    const ledger = await seededLedger();
    const canon = ledger.query();
    const prompt = buildC4CanonParserPrompt({ prose: '米拉决定保留铜钥匙。', canon });
    expect(prompt).toContain('你是小说正史解析器');
    expect(prompt).toContain('不得更新、删除或重写旧正史行');
    expect(prompt).toContain('"evt-arrival"');
    expect(prompt).not.toMatch(/\b[BC][1-6]\b/);
    const result = await parseC4CanonFromNarrative(backendReturning({ ops: [{
      op: 'append', event: { ...arrival, id: 'evt-decision', kind: 'decision', summary: '米拉决定保留铜钥匙', detail: '米拉决定保留铜钥匙。', participants: ['mira'] }, confidence: 'high',
    }] }), { prose: '米拉决定保留铜钥匙。', canon }, settings);
    expect(result.ops).toHaveLength(1);
    expect(ledger.count()).toBe(1);
    expect(ledger.get(0).summary).toBe('林舟抵达外城门');
  });

  it('mechanically appends validated medium/high facts through CanonLedger without rewriting retained lines', async () => {
    const ledger = await seededLedger();
    const applied = await applyC4CanonOperations(ledger, { ops: [{
      op: 'append', event: { ...arrival, id: 'evt-decision', kind: 'decision', summary: '米拉决定保留铜钥匙', detail: '米拉决定保留铜钥匙。', participants: ['mira'] }, confidence: 'high',
    }, {
      op: 'append', event: { ...arrival, id: 'evt-dialogue', kind: 'dialogue', summary: '林舟与米拉约定会面', detail: '两人约定钟楼会面。', participants: ['lin', 'mira'] }, confidence: 'medium',
    }] });
    expect(applied.map((event) => event.seq)).toEqual([1, 2]);
    expect(ledger.query().map((event) => event.id)).toEqual(['evt-arrival', 'evt-decision', 'evt-dialogue']);
    expect(ledger.get(0)).toMatchObject({ ...arrival, seq: 0, immutable: true, supersededBy: null });
  });

  it('accepts retained correction rows in the C4-only current-ledger projection', async () => {
    const ledger = await seededLedger();
    const current: CanonEventView[] = [{ ...ledger.get(0), supersededBy: 'evt-arrival-fix' }, {
      id: 'evt-arrival-fix', seq: 1, storyTime: 'day 1 dawn', kind: 'correction', summary: '林舟抵达内城门', detail: '更正地点。', participants: ['lin'], location: '内城门', consequences: [], affectedLayers: ['state'], immutable: true, supersedes: 'evt-arrival', supersededBy: null,
    }];
    await expect(parseC4CanonFromNarrative(backendReturning({ ops: [] }), { prose: '没有新的正史事实。', canon: current }, settings)).resolves.toEqual({ ops: [] });
  });

  it('fails closed for invalid JSON, undisclosed mutation shapes, duplicate ids, bad correction targets, and unavailable LLM', async () => {
    expect(() => parseC4CanonParserOutput('not json')).toThrow(/valid JSON/);
    expect(() => parseC4CanonParserOutput(JSON.stringify({ ops: [{ op: 'update', targetId: 'evt-arrival', confidence: 'high' }] }))).toThrow();
    const ledger = await seededLedger();
    const canon = ledger.query();
    await expect(parseC4CanonFromNarrative(backendReturning({ ops: [{ op: 'append', event: { ...arrival }, confidence: 'high' }] }), { prose: 'x', canon }, settings)).rejects.toThrow(/Duplicate C4 canon event id/);
    await expect(parseC4CanonFromNarrative(backendReturning({ ops: [{ op: 'supersede', targetId: 'missing', correction: { id: 'evt-fix', storyTime: arrival.storyTime, summary: '更正地点', detail: '更正地点。', participants: arrival.participants, location: arrival.location, consequences: [], affectedLayers: ['state'] }, confidence: 'high' }] }), { prose: 'x', canon }, settings)).rejects.toThrow(/Unknown or superseded/);
    await expect(parseC4CanonFromNarrative(undefined, { prose: 'x', canon }, settings)).rejects.toThrow(/unavailable/);
  });

  it('keeps low-confidence append and every correction pending, so rejection leaves the append-only ledger unchanged', async () => {
    const project = await root();
    const ledger = await CanonLedger.open(join(project, 'canon'));
    await ledger.append(arrival);
    const gate = await ConfirmationGate.open(project);
    const low = { ops: [{ op: 'append' as const, event: { ...arrival, id: 'evt-low', summary: '疑似目击', detail: '疑似目击。' }, confidence: 'low' as const }] };
    await expect(applyC4CanonOperations(ledger, low)).rejects.toThrow(/require ConfirmationGate/);
    const lowProposal = await proposeC4CanonOperations(gate, 'proposal-i26-low', ledger.query(), low);
    expect(lowProposal.status).toBe('pending');
    await gate.reject(lowProposal.id);
    expect(ledger.query().map((event) => event.id)).toEqual(['evt-arrival']);

    const correction = { ops: [{ op: 'supersede' as const, targetId: 'evt-arrival', correction: { id: 'evt-arrival-fix', storyTime: 'day 1 dawn', summary: '林舟抵达内城门', detail: '更正地点。', participants: ['lin'], location: '内城门', consequences: [], affectedLayers: ['state'] }, confidence: 'high' as const }] };
    await expect(applyC4CanonOperations(ledger, correction)).rejects.toThrow(/require ConfirmationGate/);
    const correctionProposal = await proposeC4CanonOperations(gate, 'proposal-i26-correction', ledger.query(), correction);
    expect(correctionProposal.status).toBe('pending');
    await gate.reject(correctionProposal.id);
    expect(ledger.query().map((event) => event.id)).toEqual(['evt-arrival']);
    expect(ledger.get(0).supersededBy).toBeNull();
  });

  it('regresses the frozen corpus including held-out cases at threshold', async () => {
    const loaded = await corpus();
    expect(loaded.iteration).toBe('I26');
    expect(loaded.immutable).toBe(true);
    const results = [] as Array<{ id: string; matched: boolean; canonical: boolean; heldOut: boolean }>;
    for (const sample of loaded.cases) {
      const output = await parseC4CanonFromNarrative(backendReturning(sample.expected), { prose: sample.prose, canon: sample.current }, settings);
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
