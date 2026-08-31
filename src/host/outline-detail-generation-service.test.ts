import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { outlineContentFingerprint } from '../core/outline/index.js';
import type { DetailBeat, Outline } from '../core/schema/outline.js';
import { createConfirmationService } from './confirmation-service.js';
import { createOutlineDetailGenerationService } from './outline-detail-generation-service.js';
import { createOutlineGenerationScopeService } from './outline-generation-scope-service.js';
import { createOutlineService } from './outline-service.js';
import { createTextService } from './text-service.js';

const roots: string[] = [];
const settings = { modelRef: 'dsh/fake', credentialRef: 'dsh/test' };
async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'novel-outline-detail-generation-'));
  roots.push(root);
  return root;
}
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

function card(id: string, title = id): DetailBeat {
  return { id, title, summary: `${title} summary`, pov: 'hero', wordTarget: 500, points: [title], status: 'planned' };
}

function outlineFixture(): Outline {
  return {
    id: 'outline', version: 1, structure: 'free', logline: '生成细纲。', themes: [], foreshadowing: [], endings: [], acts: [{
      id: 'act-a', index: 0, title: '第一幕', goal: '开始', beats: [
        { id: 'beat-existing', title: '已有节拍', description: '保留已有卡。', charactersInvolved: [], conflictType: 'external', prerequisites: [], optional: false, detailBeats: [card('detail-existing', '旧卡')] },
        { id: 'beat-empty', title: '缺失节拍', description: '需要补齐一张细纲卡。', charactersInvolved: [], conflictType: 'external', prerequisites: [], optional: false, detailBeats: [] },
      ],
    }],
  };
}

function llmFixture() {
  return {
    async *stream(request: { prompt: string }) {
      const regeneration = request.prompt.includes('已有细纲：');
      const output = regeneration
        ? { detailBeats: [{ title: '重生成卡', summary: '保留身份的重生成摘要。', pov: 'hero', wordTarget: 600, points: ['重生成'] }], rationale: '只替换作者明确选择的已有卡。' }
        : { detailBeats: [{ title: '补齐卡', summary: '模型补齐缺失节拍的摘要。', pov: 'hero', wordTarget: 550, points: ['补齐'] }], rationale: '为缺失节拍增加一张可执行场景卡。' };
      yield { type: 'text-delta' as const, text: JSON.stringify(output) };
      yield { type: 'finish' as const, reason: { kind: 'stop' as const } };
    },
  };
}

async function realFixture() {
  const root = await temporaryRoot();
  const text = createTextService(root);
  const outline = createOutlineService(root);
  await text.open('project');
  await outline.open('project');
  await text.createChapter('project', { id: 'chapter-a', index: 1, title: '第一章', pov: 'hero', status: 'draft' });
  await outline.save('project', outlineFixture());
  const confirmation = createConfirmationService(root);
  await confirmation.open('project');
  const binding = { read: async () => ({ manual: [], effective: [], fingerprint: 'a'.repeat(64) }) };
  const scope = createOutlineGenerationScopeService({ text, outline, binding });
  let saveCalls = 0;
  const outlinePort = {
    read: (projectId: string) => outline.read(projectId),
    contentFingerprint: (projectId: string) => outline.contentFingerprint(projectId),
    save: async (projectId: string, value: Outline) => { saveCalls += 1; return outline.save(projectId, value); },
  };
  const service = createOutlineDetailGenerationService({ llm: llmFixture(), scope, outline: outlinePort, confirmation });
  return { root, text, outline, confirmation, scope, service, outlinePort, get saveCalls() { return saveCalls; } };
}

describe('I134 OutlineDetailGenerationService', () => {
  it('默认只补缺失卡，已有卡不调用模型；编辑/重生成/跳过只改变会话候选', async () => {
    const fixture = await realFixture();
    const candidate = await fixture.service.generate('project', { scope: { kind: 'all' } }, settings);
    expect(candidate.items.map((item) => [item.detailBeatId, item.origin, item.choice])).toEqual([
      ['detail-existing', 'existing', 'keep'], [expect.stringMatching(/^odg-/), 'generated', 'keep'],
    ]);
    expect(candidate.generatedDetailBeatCount).toBe(1);
    expect(fixture.saveCalls).toBe(0);
    const edited = await fixture.service.edit('project', { candidateId: candidate.candidateId, detailBeatId: candidate.items[1].detailBeatId, value: { ...candidate.items[1].after, title: '作者编辑卡' } });
    expect(edited.items[1]).toMatchObject({ choice: 'edit', after: { title: '作者编辑卡' } });
    const regenerated = await fixture.service.regenerate('project', { candidateId: candidate.candidateId, detailBeatId: 'detail-existing' }, settings);
    expect(regenerated.items[0]).toMatchObject({ choice: 'regenerate', detailBeatId: 'detail-existing', after: { title: '重生成卡' } });
    const skipped = await fixture.service.skip('project', { candidateId: candidate.candidateId, detailBeatId: 'detail-existing' });
    expect(skipped.items[0].choice).toBe('skip');
    expect(await fixture.outline.read('project')).toEqual(outlineFixture());
    await expect(fixture.service.regenerate('project', { candidateId: candidate.candidateId, detailBeatId: candidate.items[1].detailBeatId }, settings)).rejects.toThrow(/existing scoped card/);
  });

  it('接受前零写，混合编辑/跳过经一次 I11 proposal 应用且重复接受幂等', async () => {
    const fixture = await realFixture();
    const candidate = await fixture.service.generate('project', { scope: { kind: 'all' } }, settings);
    const edited = await fixture.service.edit('project', { candidateId: candidate.candidateId, detailBeatId: candidate.items[1].detailBeatId, value: { ...candidate.items[1].after, title: '作者确认卡' } });
    await fixture.service.skip('project', { candidateId: edited.candidateId, detailBeatId: 'detail-existing' });
    const proposal = await fixture.service.propose('project', { candidateId: candidate.candidateId });
    expect(proposal.status).toBe('pending');
    expect(fixture.saveCalls).toBe(0);
    expect(await fixture.outline.read('project')).toEqual(outlineFixture());
    const accepted = await fixture.service.accept('project', proposal.proposalId);
    expect(accepted.status).toBe('accepted');
    expect(accepted.appliedDetailBeatIds).toHaveLength(1);
    expect(accepted.skippedDetailBeatIds).toEqual(['detail-existing']);
    expect(fixture.saveCalls).toBe(1);
    const applied = await fixture.outline.read('project');
    expect(applied.acts[0].beats[0].detailBeats).toEqual([card('detail-existing', '旧卡')]);
    expect(applied.acts[0].beats[1].detailBeats[0]).toMatchObject({ id: edited.items[1].detailBeatId, title: '作者确认卡', status: 'planned' });
    expect(await fixture.service.accept('project', proposal.proposalId)).toMatchObject({ status: 'already-accepted' });
    expect(fixture.saveCalls).toBe(1);
  });

  it('拒绝、取消、解析失败和 B5 stale 均零写；Gate payload 可在新 service 实例重开后继续接受', async () => {
    const fixture = await realFixture();
    const candidate = await fixture.service.generate('project', { scope: { kind: 'all' } }, settings);
    const proposal = await fixture.service.propose('project', { candidateId: candidate.candidateId });
    expect(await fixture.service.reject('project', proposal.proposalId)).toMatchObject({ status: 'rejected' });
    expect(fixture.saveCalls).toBe(0);
    const cancelled = await fixture.service.cancel('project', candidate.candidateId);
    expect(cancelled.status).toBe('cancelled');
    expect(fixture.saveCalls).toBe(0);

    const staleCandidate = await fixture.service.generate('project', { scope: { kind: 'all' } }, settings);
    const changed = await fixture.outline.read('project');
    await fixture.outline.save('project', { ...changed, logline: 'B5 已变化。' });
    await expect(fixture.service.propose('project', { candidateId: staleCandidate.candidateId })).rejects.toThrow(/Stale outline detail generation/);
    expect(fixture.saveCalls).toBe(0);

    const invalid = createOutlineDetailGenerationService({ llm: { async *stream() { yield { type: 'text-delta' as const, text: '{bad' }; } }, scope: fixture.scope, outline: fixture.outlinePort, confirmation: fixture.confirmation });
    await expect(invalid.generate('project', { scope: { kind: 'all' } }, settings)).rejects.toThrow(/valid JSON/);
    expect(fixture.saveCalls).toBe(0);

    const restartFixture = await realFixture();
    const restartCandidate = await restartFixture.service.generate('project', { scope: { kind: 'all' } }, settings);
    const restartProposal = await restartFixture.service.propose('project', { candidateId: restartCandidate.candidateId });
    const restarted = createOutlineDetailGenerationService({ llm: llmFixture(), scope: restartFixture.scope, outline: restartFixture.outlinePort, confirmation: restartFixture.confirmation });
    expect(await restarted.accept('project', restartProposal.proposalId)).toMatchObject({ status: 'accepted' });
    expect(restartFixture.saveCalls).toBe(1);
  });
});
