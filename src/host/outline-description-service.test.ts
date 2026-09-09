import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createOutlineService } from './outline-service.js';
import { createConfirmationService } from './confirmation-service.js';
import { createOutlineDescriptionService } from './outline-description-service.js';
import { descriptionOutputSchema, type DescriptionTarget } from '../app/outline-description-contract.js';

const corpus = JSON.parse(readFileSync(new URL('../../samples/i212/cases.json', import.meta.url), 'utf8'));
it('I212 frozen dev/held-out two-level candidates use I11, reject without writes, accept once, reject stale sources', async () => {
  const root = await mkdtemp(join(tmpdir(), 'i212-'));
  try {
    expect(corpus.immutable).toBe(true); expect(corpus.threshold).toBe(1);
    const scores = [];
    for (const sample of corpus.cases) {
      const outline = createOutlineService(root); const confirmation = createConfirmationService(root);
      await outline.open(sample.id);
      await outline.save(sample.id, { id: 'outline', structure: 'free', logline: '调查', themes: [], foreshadowing: [], endings: [], acts: [{ id: 'act', index: 0, title: '第一幕', goal: '旧幕目标', beats: [{ id: 'beat', title: '第一节', description: sample.source, charactersInvolved: [], conflictType: 'external', prerequisites: [], optional: false, detailBeats: [{ id: 'card', title: sample.source, summary: sample.source, pov: 'hero', points: ['既有事实'], wordTarget: 500, status: 'planned' }] }] }] });
      const before = await outline.read(sample.id); const prompts: string[] = [];
      const service = createOutlineDescriptionService({ outline, confirmation, settings: async () => ({ modelRef: 'fake', credentialRef: 'test' }), llm: { async *stream(request) { prompts.push(request.prompt); yield { text: JSON.stringify({ description: sample.description }) }; } } });
      const target = { projectId: sample.id, kind: sample.kind, actId: 'act', ...(sample.kind === 'beat' ? { beatId: 'beat' } : {}) } as DescriptionTarget;
      const rejected = await service.descriptionGenerate(target);
      expect(await outline.read(sample.id)).toEqual(before);
      expect(prompts[0]).toContain(sample.source);
      expect(prompts[0]).not.toContain(sample.kind === 'act' ? '既有事实' : '旧幕目标');
      await service.descriptionDecide({ projectId: sample.id, proposalId: rejected.proposalId, accept: false });
      expect(await outline.read(sample.id)).toEqual(before);
      await expect(service.descriptionDecide({ projectId: sample.id, proposalId: rejected.proposalId, accept: true })).rejects.toThrow();
      const accepted = await service.descriptionGenerate(target);
      await service.descriptionDecide({ projectId: sample.id, proposalId: accepted.proposalId, accept: true });
      const saved = await outline.read(sample.id);
      expect(sample.kind === 'act' ? saved.acts[0].goal : saved.acts[0].beats[0].description).toBe(sample.description);
      expect(saved.acts[0].beats[0].detailBeats).toEqual(before.acts[0].beats[0].detailBeats);
      await service.descriptionDecide({ projectId: sample.id, proposalId: accepted.proposalId, accept: true });
      expect(await outline.read(sample.id)).toEqual(saved);
      const stale = await service.descriptionGenerate(target);
      await outline.save(sample.id, { ...saved, logline: '已变化' });
      await expect(service.descriptionDecide({ projectId: sample.id, proposalId: stale.proposalId, accept: true })).rejects.toThrow('已变化');
      const empty = structuredClone(saved);
      if (sample.kind === 'act') empty.acts[0].beats = []; else empty.acts[0].beats[0].detailBeats = [];
      await outline.save(sample.id, empty);
      const callsBeforeEmpty = prompts.length;
      await expect(service.descriptionGenerate(target)).rejects.toThrow('没有');
      expect(prompts).toHaveLength(callsBeforeEmpty);
      scores.push({ split: sample.split, passed: accepted.after === sample.description });
    }
    for (const split of ['dev', 'held-out']) { const subset = scores.filter(score => score.split === split); expect(subset).toHaveLength(2); expect(subset.filter(score => score.passed).length / subset.length).toBe(corpus.threshold); }
    expect(descriptionOutputSchema.safeParse({ description: '更新', extra: true }).success).toBe(false);
    expect(descriptionOutputSchema.safeParse({ description: ' ' }).success).toBe(false);
    expect(descriptionOutputSchema.safeParse({ description: '字'.repeat(1001) }).success).toBe(false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
