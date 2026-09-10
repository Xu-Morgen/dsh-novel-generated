import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConfirmationService } from './confirmation-service.js';
import { createChapterFinalizationService, chapterManuscript } from './chapter-finalization-service.js';
import { LLM_BACKEND_MARKER, type GenerationRequest } from '../llm/port/index.js';
import type { Chapter } from '../core/schema/text.js';
import { createStateService } from './state-service.js';
import { createCanonService } from './canon-service.js';

function fixture() {
  const chapter: Chapter = { id: 'chapter', index: 1, title: 'Chapter', pov: 'hero', status: 'draft', scenes: [
    { id: 'last', index: 2, content: 'The last paragraph.', summary: 'Not prose', beats: [], canonEvents: [], notes: '', branches: [] },
    { id: 'empty', index: 0, content: '', summary: 'Empty placeholder', beats: [], canonEvents: [], notes: '', branches: [] },
    { id: 'first', index: 1, content: 'The first paragraph.\n\nA continuation.', summary: 'Not prose', beats: [], canonEvents: [], notes: '', branches: [] },
  ] };
  const state = { id: 'state', version: 1, seq: 0, storyTime: 'day-1', scene: { location: 'gate', timeOfDay: 'morning', weather: 'clear', season: 'spring', atmosphere: 'quiet' }, characters: [] };
  return { chapter, state };
}

describe('I217 chapter finalization consumer', () => {
  it('real state/canon writers resume after a failed stage without replaying earlier changes; foreign and changed layers fail closed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'i217-writes-'));
    try {
      const confirmation = createConfirmationService(root);
      await confirmation.open('book');
      const fixtureData = fixture();
      const state = createStateService(root);
      await state.open('book', fixtureData.state);
      const canon = createCanonService(root);
      await canon.open('book');
      let fail = true;
      const deps: Parameters<typeof createChapterFinalizationService>[0] = {
        confirmation, state,
        canon: { ...canon, append: async (...args) => { if (fail) throw new Error('disk'); return canon.append(...args); } },
        relationship: { read: async () => [] } as never, knowledge: { read: async () => ({ entries: [], states: [] }) } as never,
        worldview: { list: async () => [] } as never,
        text: { open: async () => {}, readChapter: async () => structuredClone(fixtureData.chapter), listChapters: async () => [fixtureData.chapter], projectFingerprint: async () => 'a'.repeat(64),
          updateChapterMutation: async () => { fixtureData.chapter.status = 'canon'; return { chapter: fixtureData.chapter, fingerprint: 'b'.repeat(64) }; } } as never,
        llm: { [LLM_BACKEND_MARKER]: true, async *stream(request: GenerationRequest) {
          const ops = request.prompt.startsWith('你是小说世界状态解析器') ? [{ op: 'modify', target: 'scene', field: 'location', action: 'set', value: 'harbor', confidence: 'high' }]
            : request.prompt.startsWith('你是小说正史解析器') ? [{ op: 'append', event: { id: 'arrival', kind: 'event', storyTime: 'day-1', summary: 'Arrived', detail: '', participants: [], location: 'harbor', consequences: [], affectedLayers: [] }, confidence: 'high' }] : [];
          yield JSON.stringify({ ops });
        } },
        resolveSettings: async () => ({ modelRef: 'fake', credentialRef: 'fake' }),
      };
      let service = createChapterFinalizationService(deps);
      const prepared = await service.chapterAnalyze({ projectId: 'book', chapterId: 'chapter' });
      expect(prepared.changes.some(change => change.layer === 'c2')).toBe(true);
      expect(prepared.changes.some(change => change.layer === 'c4')).toBe(true);
      expect(state.current('book').scene.location).toBe('gate');
      expect(await service.chapterFinalize({ projectId: 'book', proposalId: prepared.proposalId, accept: true })).toMatchObject({ status: 'partial-failure' });
      expect(state.current('book').scene.location).toBe('harbor');
      const seq = state.current('book').seq;
      fail = false;
      await confirmation.open('book');
      service = createChapterFinalizationService(deps);
      expect(await service.chapterFinalize({ projectId: 'book', proposalId: prepared.proposalId, accept: true })).toMatchObject({ status: 'done', nextChapterId: null });
      expect(state.current('book').seq).toBe(seq);
      expect(canon.query('book')).toHaveLength(1);
      expect(await service.chapterFinalize({ projectId: 'book', proposalId: prepared.proposalId, accept: true })).toMatchObject({ status: 'done' });
      expect(canon.query('book')).toHaveLength(1);
      await state.transaction('book', draft => { draft.scene.location = 'elsewhere'; });
      expect(await service.chapterFinalize({ projectId: 'book', proposalId: prepared.proposalId, accept: true })).toMatchObject({ status: 'stale' });
      await expect(service.chapterFinalize({ projectId: 'other', proposalId: prepared.proposalId, accept: true })).rejects.toThrow();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('orders whole prose; hashes identities and empty scenes without replacing content with summaries', () => {
    const { chapter } = fixture();
    const read = chapterManuscript('book', chapter);
    expect(read.scenes.map(scene => scene.id)).toEqual(['empty', 'first', 'last']);
    expect(read.scenes[1].content).toBe(chapter.scenes[2].content);
    chapter.scenes[0].index = 0;
    expect(chapterManuscript('book', chapter).sourceHash).not.toBe(read.sourceHash);
  });

  it('full five-parser input, cancel, stale, reopen, retry and idempotent chapter completion', async () => {
    const root = await mkdtemp(join(tmpdir(), 'i217-'));
    try {
      const confirmation = createConfirmationService(root);
      await confirmation.open('book');
      const { chapter, state } = fixture();
      const prompts: string[] = [];
      let writes = 0;
      let failMetadata = false;
      const deps: Parameters<typeof createChapterFinalizationService>[0] = {
        confirmation,
        text: { open: async () => {}, readChapter: async () => structuredClone(chapter), listChapters: async () => [chapter, { ...chapter, id: 'next', index: 2 }], projectFingerprint: async () => 'a'.repeat(64),
          updateChapterMutation: async () => { if (failMetadata) throw new Error('disk'); writes++; chapter.status = 'canon'; return { chapter, fingerprint: 'b'.repeat(64) }; } } as never,
        state: { current: () => structuredClone(state) } as never,
        relationship: { read: async () => [] } as never, knowledge: { read: async () => ({ entries: [], states: [] }) } as never,
        canon: { query: () => [] } as never, worldview: { list: async () => [] } as never,
        llm: { [LLM_BACKEND_MARKER]: true, async *stream(request: GenerationRequest) { prompts.push(request.prompt); yield JSON.stringify({ ops: [] }); } },
        resolveSettings: async () => ({ modelRef: 'fake', credentialRef: 'fake' }),
      };
      let service = createChapterFinalizationService(deps);
      const target = { projectId: 'book', chapterId: 'chapter' };
      const analysis = await service.chapterAnalyze(target);
      expect(analysis).toMatchObject({ sceneCount: 2, emptySceneCount: 1, changes: [] });
      expect(prompts).toHaveLength(5);
      for (const prompt of prompts) {
        expect(prompt).toContain('The first paragraph.');
        expect(prompt).toContain('A continuation.');
        expect(prompt).toContain('The last paragraph.');
        expect(prompt.indexOf('The first paragraph.')).toBeLessThan(prompt.indexOf('The last paragraph.'));
        expect(prompt).not.toContain('Not prose');
      }
      expect(writes).toBe(0);
      await service.chapterFinalize({ projectId: 'book', proposalId: analysis.proposalId, accept: false });
      expect(writes).toBe(0);
      await expect(service.chapterFinalize({ projectId: 'book', proposalId: analysis.proposalId, accept: true })).rejects.toThrow();
      const stale = await service.chapterAnalyze(target);
      chapter.scenes[0].content += ' external edit';
      expect(await service.chapterFinalize({ projectId: 'book', proposalId: stale.proposalId, accept: true })).toMatchObject({ status: 'stale' });
      expect(confirmation.get('book', stale.proposalId).status).toBe('pending');
      expect(writes).toBe(0);
      const ready = await service.chapterAnalyze(target);
      // Recreate the Main owner and reload Gate from disk: no candidate session is required.
      await confirmation.open('book');
      service = createChapterFinalizationService(deps);
      failMetadata = true;
      expect(await service.chapterFinalize({ projectId: 'book', proposalId: ready.proposalId, accept: true })).toMatchObject({ status: 'partial-failure' });
      failMetadata = false;
      expect(await service.chapterFinalize({ projectId: 'book', proposalId: ready.proposalId, accept: true })).toMatchObject({ status: 'done', nextChapterId: 'next' });
      expect(await service.chapterFinalize({ projectId: 'book', proposalId: ready.proposalId, accept: true })).toMatchObject({ status: 'done' });
      expect(writes).toBe(1);
      expect(chapter.scenes[2].content).toBe('The first paragraph.\n\nA continuation.');
      chapter.scenes.forEach(scene => { scene.content = ''; });
      const calls = prompts.length;
      await expect(service.chapterAnalyze(target)).rejects.toThrow('暂无');
      expect(prompts).toHaveLength(calls);
      await expect(service.chapterManuscript({ ...target, extra: true } as never)).rejects.toThrow();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
