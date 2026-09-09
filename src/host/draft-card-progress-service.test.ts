import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createOutlineService } from './outline-service.js';
import { createConfirmationService } from './confirmation-service.js';
import { createDraftCardProgressService } from './draft-card-progress-service.js';
import type { NovelWritingAdjudicationService } from './writing-adjudication-service.js';
import type { NovelSceneOutlineBindingService } from './scene-outline-binding-service.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture(last = false) {
  const root = await mkdtemp(join(tmpdir(), 'novel-i216-')); roots.push(root);
  const outline = createOutlineService(root); const confirmation = createConfirmationService(root);
  await outline.open('book');
  await outline.save('book', { id: 'outline', structure: 'free', logline: '故事', themes: [], foreshadowing: [], endings: [], acts: [{ id: 'act', index: 0, title: '幕', goal: '目标', beats: [{ id: 'beat', title: '节', description: '描述', conflictType: 'external', charactersInvolved: [], prerequisites: [], optional: false, detailBeats: [
    { id: 'current', title: '当前卡', summary: '当前卡内容', pov: 'hero', wordTarget: 500, points: ['当前要点'], status: 'writing' },
    ...last ? [] : [{ id: 'next', title: '下一卡', summary: '下一卡完整内容', pov: 'hero', wordTarget: 900, points: ['下一要点'], status: 'planned' as const }],
  ] }] }] });
  const card = (await outline.read('book')).acts[0].beats[0].detailBeats[0];
  const flags = { failAdoption: false, failSave: false, failBind: false, adopted: false, writes: 0 };
  const rows: Array<{ sceneId: string; detailBeatId: string }> = [];
  const writing = {
    sceneCardDraftSource: () => ({ projectId: 'book', card }),
    adoptDraft: async () => {
      if (flags.failAdoption) throw new Error('adoption failed');
      if (!flags.adopted) { flags.adopted = true; flags.writes++; }
      return { projectId: 'book', candidateId: 'candidate', chapterId: 'chapter', sceneId: 'scene', status: 'adopted' as const, sourceHash: 'a'.repeat(64), projectFingerprint: 'b'.repeat(64) };
    },
  } as unknown as NovelWritingAdjudicationService;
  const binding = { read: async () => ({ manual: rows, effective: [], fingerprint: 'c'.repeat(64) }), save: async (_id: string, input: { sceneId: string; detailBeatId: string }) => { if (flags.failBind) throw new Error('binding failed'); rows.push({ sceneId: input.sceneId, detailBeatId: input.detailBeatId }); } } as unknown as NovelSceneOutlineBindingService;
  const service = createDraftCardProgressService({ writing, confirmation, binding, outline: { ...outline, saveIfFingerprint: async (...args) => { if (flags.failSave) throw new Error('save failed'); return outline.saveIfFingerprint!(...args); } } });
  return { service, outline, confirmation, flags, rows };
}

it.each([true, false])('I216 adopted source is completed and bound; next I11 decision %s is explicit and idempotent', async accept => {
  const { service, outline, confirmation, flags, rows } = await fixture();
  const result = await service.sceneCardDraftAdopt({ candidateId: 'candidate' });
  expect(result.completion).toBe('done');
  expect(result.next?.card).toMatchObject({ id: 'next', title: '下一卡', summary: '下一卡完整内容', points: ['下一要点'] });
  expect((await outline.read('book')).acts[0].beats[0].detailBeats.map(card => card.status)).toEqual(['done', 'planned']);
  expect(rows).toEqual([{ sceneId: 'scene', detailBeatId: 'current' }]);
  await service.sceneCardDraftAdopt({ candidateId: 'candidate' });
  expect(flags.writes).toBe(1); expect(rows).toHaveLength(1);
  const input = { projectId: 'book', proposalId: result.next!.proposalId, accept };
  await service.sceneCardNextDecide(input); await service.sceneCardNextDecide(input);
  expect((await outline.read('book')).acts[0].beats[0].detailBeats[1].status).toBe(accept ? 'writing' : 'planned');
  expect(confirmation.get('book', input.proposalId).status).toBe(accept ? 'accepted' : 'rejected');
  expect((await service.sceneCardDraftAdopt({ candidateId: 'candidate' })).next).toBeNull();
});

it('I216 failure before C5 is zero B5 write; failures after C5 retry completion and binding without duplicate prose', async () => {
  const { service, outline, flags, rows } = await fixture();
  const before = await outline.read('book'); flags.failAdoption = true;
  await expect(service.sceneCardDraftAdopt({ candidateId: 'candidate' })).rejects.toThrow('adoption failed');
  expect(await outline.read('book')).toEqual(before); expect(rows).toEqual([]);
  flags.failAdoption = false; flags.failSave = true;
  expect((await service.sceneCardDraftAdopt({ candidateId: 'candidate' })).completion).toBe('pending');
  flags.failSave = false; flags.failBind = true;
  expect((await service.sceneCardDraftAdopt({ candidateId: 'candidate' })).completion).toBe('pending');
  flags.failBind = false;
  expect((await service.sceneCardDraftAdopt({ candidateId: 'candidate' })).completion).toBe('done');
  expect(flags.writes).toBe(1); expect(rows).toHaveLength(1);
});

it('I216 changed next-card content is never overwritten; last card has no next proposal', async () => {
  const { service, outline } = await fixture();
  const result = await service.sceneCardDraftAdopt({ candidateId: 'candidate' });
  const updated = await outline.read('book'); updated.acts[0].beats[0].detailBeats[1].summary = '作者刚修改';
  await outline.save('book', updated);
  await expect(service.sceneCardNextDecide({ projectId: 'book', proposalId: result.next!.proposalId, accept: true })).rejects.toThrow('已变化');
  expect(await outline.read('book')).toEqual(updated);
  const last = await fixture(true);
  expect(await last.service.sceneCardDraftAdopt({ candidateId: 'candidate' })).toMatchObject({ completion: 'done', next: null });
});

it('I216 accepted Gate retries a failed status write without a second decision', async () => {
  const { service, outline, flags } = await fixture();
  const result = await service.sceneCardDraftAdopt({ candidateId: 'candidate' });
  const input = { projectId: 'book', proposalId: result.next!.proposalId, accept: true };
  flags.failSave = true; await expect(service.sceneCardNextDecide(input)).rejects.toThrow('save failed');
  flags.failSave = false; await service.sceneCardNextDecide(input);
  expect((await outline.read('book')).acts[0].beats[0].detailBeats[1].status).toBe('writing');
});
