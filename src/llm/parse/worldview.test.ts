import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfirmationGate } from '../../core/confirm/index.js';
import { WorldRepository } from '../../core/worldview/index.js';
import {
  applyAcceptedB2WorldviewSupersedeOperations,
  buildB2WorldviewParserPrompt,
  parseB2WorldviewFromNarrative,
  parseB2WorldviewParserOutput,
  proposeB2WorldviewSupersedeOperations,
} from './worldview.js';

const settings = { modelRef: 'dsh/default', credentialRef: 'dsh/managed' };
const roots: string[] = [];
async function root() { const path = await mkdtemp(join(tmpdir(), 'novel-i29-')); roots.push(path); return path; }
afterEach(async () => Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))));
function backendReturning(response: unknown) { return { async *stream() { yield JSON.stringify(response); } }; }

const current = [{
  id: 'north-kingdom', version: 1, kind: 'faction' as const, title: '北境王国', content: '北境由延续千年的王国统治。',
  keywords: ['北境', '王国'], triggerMode: 'keyword' as const, weight: 3, parent: null, mutable: true, status: 'active' as const, supersededBy: null,
}];
const operation = {
  op: 'supersede' as const, targetId: 'north-kingdom',
  replacement: { id: 'fallen-north-kingdom', kind: 'faction' as const, title: '北境废墟', content: '北境王国已在战役后覆灭。', keywords: ['北境', '废墟'], triggerMode: 'keyword' as const, weight: 3, parent: null, mutable: true },
  confidence: 'high' as const,
};

interface CorpusCase { id: string; prose: string; current: typeof current; expected: unknown; }
interface Corpus { iteration: string; immutable: boolean; threshold: number; canonicalCaseIds: string[]; heldOutCaseIds: string[]; cases: CorpusCase[]; }
async function corpus(): Promise<Corpus> {
  return JSON.parse(await readFile(resolve(process.cwd(), 'samples/i29/cases.json'), 'utf8')) as Corpus;
}

describe('I29 B2 worldview supersede parser', () => {
  it('limits the prompt to B2 and returns validated proposals without writing B2', async () => {
    const repository = new WorldRepository(await root());
    await repository.open();
    await repository.create(current[0]);
    const prompt = buildB2WorldviewParserPrompt({ prose: '王国覆灭。', current });
    expect(prompt).toContain('不得输出状态、关系、知情、正史、大纲、角色、风格或正文改写');
    expect(prompt).toContain('不得原地更新、删除或直接创建条目');
    const output = await parseB2WorldviewFromNarrative(backendReturning({ ops: [operation] }), { prose: '王国覆灭。', current }, settings);
    expect(output.ops).toEqual([operation]);
    expect(await repository.read('north-kingdom')).toEqual(current[0]);
  });

  it('applies only an accepted proposal through WorldRepository, preserving rewritten history and replay idempotency', async () => {
    const project = await root();
    const repository = new WorldRepository(join(project, 'worldview'));
    await repository.open();
    await repository.create(current[0]);
    const gate = await ConfirmationGate.open(project);
    const output = { ops: [operation] };
    const proposal = await proposeB2WorldviewSupersedeOperations(gate, 'proposal-i29-accepted', current, output);
    await expect(applyAcceptedB2WorldviewSupersedeOperations(gate, proposal.id, repository)).rejects.toThrow(/requires accepted/);
    await gate.accept(proposal.id);
    const applied = await applyAcceptedB2WorldviewSupersedeOperations(gate, proposal.id, repository);
    expect(applied[0].superseded).toMatchObject({ id: 'north-kingdom', status: 'rewritten', supersededBy: 'fallen-north-kingdom', version: 2 });
    expect(applied[0].replacement).toMatchObject({ id: 'fallen-north-kingdom', status: 'active', supersededBy: null, version: 1 });
    await expect(applyAcceptedB2WorldviewSupersedeOperations(gate, proposal.id, repository)).resolves.toEqual(applied);
  });

  it('fails closed for invalid JSON, undisclosed operation shapes, immutable or rewritten targets, duplicate replacements, parent changes, and unavailable LLM', async () => {
    expect(() => parseB2WorldviewParserOutput('not json')).toThrow(/valid JSON/);
    expect(() => parseB2WorldviewParserOutput(JSON.stringify({ ops: [{ op: 'update', targetId: 'north-kingdom', confidence: 'high' }] }))).toThrow();
    await expect(parseB2WorldviewFromNarrative(backendReturning({ ops: [{ ...operation, targetId: 'missing' }] }), { prose: 'x', current }, settings)).rejects.toThrow(/Unknown or non-active/);
    await expect(parseB2WorldviewFromNarrative(backendReturning({ ops: [operation] }), { prose: 'x', current: [{ ...current[0], mutable: false }] }, settings)).rejects.toThrow(/Immutable/);
    await expect(parseB2WorldviewFromNarrative(backendReturning({ ops: [operation] }), { prose: 'x', current: [{ ...current[0], status: 'rewritten', supersededBy: 'already-new' }] }, settings)).rejects.toThrow(/Unknown or non-active/);
    await expect(parseB2WorldviewFromNarrative(backendReturning({ ops: [{ ...operation, replacement: { ...operation.replacement, id: 'north-kingdom' } }] }), { prose: 'x', current }, settings)).rejects.toThrow(/Duplicate or invalid/);
    await expect(parseB2WorldviewFromNarrative(backendReturning({ ops: [{ ...operation, replacement: { ...operation.replacement, parent: 'other' } }] }), { prose: 'x', current }, settings)).rejects.toThrow(/retain parent/);
    await expect(parseB2WorldviewFromNarrative(undefined, { prose: 'x', current }, settings)).rejects.toThrow(/unavailable/);
  });

  it('keeps every B2 supersede pending, so rejection leaves both old and replacement entries unchanged', async () => {
    const project = await root();
    const repository = new WorldRepository(join(project, 'worldview'));
    await repository.open();
    await repository.create(current[0]);
    const gate = await ConfirmationGate.open(project);
    const proposal = await proposeB2WorldviewSupersedeOperations(gate, 'proposal-i29-rejected', current, { ops: [operation] });
    expect(proposal.status).toBe('pending');
    await gate.reject(proposal.id);
    await expect(applyAcceptedB2WorldviewSupersedeOperations(gate, proposal.id, repository)).rejects.toThrow(/requires accepted/);
    expect(await repository.list()).toEqual(current);
  });

  it('regresses the frozen corpus including held-out cases at threshold', async () => {
    const loaded = await corpus();
    expect(loaded.iteration).toBe('I29');
    expect(loaded.immutable).toBe(true);
    const results = [] as Array<{ id: string; matched: boolean; canonical: boolean; heldOut: boolean }>;
    for (const sample of loaded.cases) {
      const output = await parseB2WorldviewFromNarrative(backendReturning(sample.expected), { prose: sample.prose, current: sample.current }, settings);
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
