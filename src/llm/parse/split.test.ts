import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, afterEach } from 'vitest';
import { ConfirmationGate } from '../../core/confirm/index.js';
import { OutlineRepository } from '../../core/outline/index.js';
import { WorldRepository } from '../../core/worldview/index.js';
import { parseSplitAgentOutput, splitImportedText, proposeSplitCandidates, applyAcceptedSplitCandidates, assertSplitCandidates, type SplitAgentInput, type SplitAgentOutput } from './split.js';

const settings = { modelRef: 'dsh/default', credentialRef: 'dsh/managed' };
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

function outlineValue(suffix = 'a') {
  return {
    id: `outline-${suffix}`, structure: 'free' as const, logline: '一名旅人追查港口秘密。', themes: ['选择'],
    acts: [{ id: `act-${suffix}`, index: 0, title: '第一幕', goal: '找到线索', beats: [{
      id: `beat-${suffix}`, title: '港口线索', description: '发现线索', charactersInvolved: [], conflictType: 'external' as const,
      prerequisites: [], optional: false, detailBeats: [{ id: `detail-${suffix}`, title: '雨夜调查', summary: '调查码头', pov: 'lin', wordTarget: 500, points: ['发现钥匙'], status: 'planned' as const }],
    }] }], foreshadowing: [], endings: [],
  };
}

function output(suffix = 'a'): SplitAgentOutput {
  return { candidates: [
    { id: `outline-candidate-${suffix}`, kind: 'outline', sourceChunkIndex: 0, confidence: 'high', value: outlineValue(suffix) },
    { id: `world-candidate-${suffix}`, kind: 'worldview', sourceChunkIndex: 1, confidence: 'low', value: { id: `harbor-${suffix}`, kind: 'geography', title: '北港', content: '北港位于内海。', keywords: ['北港'], triggerMode: 'keyword', weight: 1, parent: null, mutable: true } },
  ] };
}

function backendReturning(value: unknown) {
  return { async *stream() { yield { text: JSON.stringify(value) }; } };
}

describe('I38 split agent contract', () => {
  it.each(Array.from({ length: 10 }, (_, index) => index))('accepts held-out-shaped sample %i', (index) => {
    const parsed = parseSplitAgentOutput(JSON.stringify(output(String(index))));
    expect(parsed.candidates).toHaveLength(2);
    expect(parsed.candidates[1].confidence).toBe('low');
  });

  it('uses the Host LLM seam and exposes only B5/B2/detail-beat candidates', async () => {
    const result = await splitImportedText(backendReturning(output()), { chunks: [{ index: 0, text: '正文' }, { index: 1, text: '设定' }] }, settings);
    expect(result.candidates.map((candidate) => candidate.kind)).toEqual(['outline', 'worldview']);
    expect(JSON.stringify(result)).not.toMatch(/state|canon|relationship|knowledge/i);
  });

  it('rejects malformed, duplicate, out-of-range, and C-layer output', () => {
    expect(() => parseSplitAgentOutput('{"candidates": [{"kind":"outline"}]}')).toThrow();
    const duplicate = { candidates: [output().candidates[0], output().candidates[0]] };
    const input: SplitAgentInput = { chunks: [{ index: 0, text: '正文' }, { index: 1, text: '设定' }] };
    expect(() => assertSplitCandidates(input, duplicate)).toThrow();
    expect(() => assertSplitCandidates(input, { candidates: [{ ...output().candidates[0], sourceChunkIndex: 9 }] })).toThrow(/Unknown import chunk/);
    expect(() => parseSplitAgentOutput(JSON.stringify({ candidates: [{ ...output().candidates[0], value: { ...output().candidates[0].value, canon: [] } }] }))).toThrow();
  });

  it('keeps every candidate pending, rejects without writes, and writes accepted B5/B2 through stores', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-i38-'));
    roots.push(root);
    const gate = await ConfirmationGate.open(root);
    const outline = new OutlineRepository(root);
    const worldview = new WorldRepository(root);
    await outline.open();
    await worldview.open();
    const input: SplitAgentInput = { chunks: [{ index: 0, text: '正文' }, { index: 1, text: '设定' }] };
    const proposal = await proposeSplitCandidates(gate, 'split-proposal', input, output());
    expect(proposal.status).toBe('pending');
    await gate.reject('split-proposal');
    expect(await worldview.list()).toEqual([]);
    await expect(outline.read()).rejects.toThrow();

    const acceptedGate = await ConfirmationGate.open(join(root, 'accepted'));
    const acceptedOutline = new OutlineRepository(join(root, 'accepted'));
    const acceptedWorldview = new WorldRepository(join(root, 'accepted'));
    await acceptedOutline.open();
    await acceptedWorldview.open();
    await proposeSplitCandidates(acceptedGate, 'accepted-proposal', input, output());
    await acceptedGate.accept('accepted-proposal');
    const applied = await applyAcceptedSplitCandidates(acceptedGate, 'accepted-proposal', acceptedOutline, acceptedWorldview);
    expect(applied.outline?.id).toBe('outline-a');
    expect(applied.worldview).toHaveLength(1);
    expect((await acceptedOutline.read()).acts[0].beats[0].detailBeats).toHaveLength(1);
  });

  it('I93 rejects a mid-batch detail-beat failure before any write (UoW prepare)', async () => {
    const project = await mkdtemp(join(tmpdir(), 'novel-i93-prepare-'));
    roots.push(project);
    const gate = await ConfirmationGate.open(project);
    const outline = new OutlineRepository(project);
    const worldview = new WorldRepository(project);
    await outline.open();
    await worldview.open();
    const input: SplitAgentInput = { chunks: [{ index: 0, text: '正文' }, { index: 1, text: '设定' }] };
    const withBadBeat: SplitAgentOutput = {
      candidates: [
        output().candidates[0],
        {
          id: 'detail-candidate-1', kind: 'detail-beat', sourceChunkIndex: 0, confidence: 'high',
          value: { actId: 'act-a', beatId: 'beat-missing', detailBeat: { id: 'detail-new', title: 'x', summary: 'y', pov: 'lin', wordTarget: 500, points: [], status: 'planned' } },
        },
        output().candidates[1],
      ],
    };
    await proposeSplitCandidates(gate, 'bad-proposal', input, withBadBeat);
    await gate.accept('bad-proposal');
    await expect(applyAcceptedSplitCandidates(gate, 'bad-proposal', outline, worldview)).rejects.toThrow(/Unknown outline beat/);
    await expect(outline.read()).rejects.toThrow();
    expect(await worldview.list()).toEqual([]);
  });

  it('I93 retries an accepted split proposal idempotently (full replay)', async () => {
    const project = await mkdtemp(join(tmpdir(), 'novel-i93-retry-'));
    roots.push(project);
    const gate = await ConfirmationGate.open(project);
    const outline = new OutlineRepository(project);
    const worldview = new WorldRepository(project);
    await outline.open();
    await worldview.open();
    const input: SplitAgentInput = { chunks: [{ index: 0, text: '正文' }, { index: 1, text: '设定' }] };
    await proposeSplitCandidates(gate, 'retry-proposal', input, output());
    await gate.accept('retry-proposal');
    const applied1 = await applyAcceptedSplitCandidates(gate, 'retry-proposal', outline, worldview);
    const applied2 = await applyAcceptedSplitCandidates(gate, 'retry-proposal', outline, worldview);
    expect(applied2).toEqual(applied1);
    expect(applied2.outline?.id).toBe('outline-a');
    expect(applied2.worldview).toHaveLength(1);
    expect((await outline.read()).acts[0].beats[0].detailBeats).toHaveLength(1);
  });

  it('I93 retries after a partial commit (outline already applied, worlds missing) without failing', async () => {
    const project = await mkdtemp(join(tmpdir(), 'novel-i93-partial-'));
    roots.push(project);
    const gate = await ConfirmationGate.open(project);
    const outline = new OutlineRepository(project);
    const worldview = new WorldRepository(project);
    await outline.open();
    await worldview.open();
    const input: SplitAgentInput = { chunks: [{ index: 0, text: '正文' }, { index: 1, text: '设定' }] };
    await proposeSplitCandidates(gate, 'partial-proposal', input, output());
    await gate.accept('partial-proposal');
    // 模拟首次提交只完成 outline：outline 已按提案落库、worldview 缺失。
    const outlineCandidate = output().candidates.find((candidate): candidate is Extract<SplitAgentOutput['candidates'][number], { kind: 'outline' }> => candidate.kind === 'outline');
    if (!outlineCandidate) throw new Error('fixture must include an outline candidate');
    await outline.save({ ...outlineCandidate.value, version: 1 });
    const applied = await applyAcceptedSplitCandidates(gate, 'partial-proposal', outline, worldview);
    expect(applied.outline?.id).toBe('outline-a');
    expect(applied.worldview).toHaveLength(1);
    expect((await outline.read()).acts[0].beats[0].detailBeats).toHaveLength(1);
  });
});
