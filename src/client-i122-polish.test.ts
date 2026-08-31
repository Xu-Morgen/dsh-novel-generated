import { afterEach, describe, expect, it } from 'vitest';

import {
  cleanupClientTestEnv,
  collect,
  flush,
  mount,
  READY_MODEL,
  type FakeNode,
} from './client/test-harness.js';
import {
  completePolishScene,
  freshPolishSession,
  orderPolishScenes,
  selectNextPolishScene,
  startPolishSession,
  stopPolishSession,
} from './client/polish-session.js';

afterEach(cleanupClientTestEnv);

describe('I122 章节润色逐场景会话', () => {
  it('按 scene.index 确定顺序，且只允许在当前场景完成后推进', () => {
    expect(orderPolishScenes([
      { id: 'scene-late', index: 2 },
      { id: 'scene-tie-b', index: 0 },
      { id: 'scene-tie-a', index: 0 },
    ]).map((scene) => scene.id)).toEqual(['scene-tie-a', 'scene-tie-b', 'scene-late']);

    const started = startPolishSession({
      projectId: 'demo', chapterId: 'chapter-1', mode: 'language', navigationRevision: 4,
      scenes: [{ id: 'scene-1', index: 0 }, { id: 'scene-2', index: 1 }],
    });
    expect(started).toMatchObject({ status: 'running', currentSceneId: 'scene-1', completedCount: 0 });
    expect(() => selectNextPolishScene(started, 5)).toThrow(/仍有待裁决/);

    const completed = completePolishScene(started, 'scene-1');
    const next = selectNextPolishScene(completed, 5);
    expect(next).toMatchObject({ status: 'running', currentSceneId: 'scene-2', completedCount: 1, navigationRevision: 5 });
    expect(stopPolishSession(next)).toMatchObject({ status: 'stopped', currentSceneId: 'scene-2' });
    expect(startPolishSession({
      projectId: 'demo', chapterId: 'chapter-1', mode: 'expand', navigationRevision: 0,
      scenes: [{ id: 'scene-1', index: 0 }],
    })).toMatchObject({ mode: 'expand' });
    expect(() => startPolishSession({
      projectId: 'demo', chapterId: 'chapter-1', mode: 'language', navigationRevision: 0, scenes: [],
    })).toThrow(/没有可润色/);
    expect(freshPolishSession()).toMatchObject({ status: 'idle', completedCount: 0, sceneIds: [] });
  });

  const chapterList = [{ id: 'chapter-1', index: 1, title: '第一章', pov: 'mira', status: 'draft', sceneCount: 3 }];
  const chapterRead = {
    ok: true,
    value: {
      id: 'chapter-1', index: 1, title: '第一章', pov: 'mira', status: 'draft',
      // 故意不是顺序排列：章节润色必须由 scene.index 选择，而不是当前数组位置。
      scenes: [
        { id: 'scene-late', index: 2, summary: '结尾' },
        { id: 'scene-first', index: 0, summary: '开场' },
        { id: 'scene-middle', index: 1, summary: '转折' },
      ],
    },
  };

  function sceneRead(sceneId: string) {
    return {
      ok: true,
      value: {
        chapter: { id: 'chapter-1', index: 1, title: '第一章', pov: 'mira' },
        scene: {
          id: sceneId, index: sceneId === 'scene-first' ? 0 : sceneId === 'scene-middle' ? 1 : 2,
          summary: '', content: `原文-${sceneId}`, beats: [], canonEvents: [], notes: '',
        },
      },
    };
  }

  function polishReview(candidateId: string, sceneId: string) {
    return {
      ok: true,
      value: {
        candidateId, intent: 'rewrite',
        target: { projectId: 'fixture-project', chapterId: 'chapter-1', sceneId, sourceHash: 'a'.repeat(64) },
        text: `润色-${sceneId}`,
        diff: { kind: 'replace', before: `原文-${sceneId}`, after: `润色-${sceneId}` },
        validation: { status: 'pass', violations: [] },
        trace: {
          intent: 'rewrite', pov: 'mira', sections: [], triggers: [],
          totals: { characterCount: 0, budget: 0, truncatedSectionCount: 0 },
          rewritePromptCharacters: 0, knowledgeVisibleCount: 0,
        },
      },
    };
  }

  async function openChapter() {
    const proposals: Array<{ sceneId: string; polishMode: string; candidateId: string }> = [];
    const adjudications: string[] = [];
    const writing = {
      propose: async (_projectId: string, rawInput: unknown) => {
        const input = rawInput as { sceneId: string; polishMode: string };
        const candidateId = `candidate-${input.sceneId}`;
        proposals.push({ sceneId: input.sceneId, polishMode: input.polishMode, candidateId });
        return { ok: true, value: { candidate: { id: candidateId } } };
      },
      preview: async (candidateId: string) => polishReview(candidateId, candidateId.replace('candidate-', '')),
      previewLayers: async (candidateId: string) => ({
        ok: true,
        value: {
          candidateId, sourceHash: 'a'.repeat(64), generationBaseline: { kind: 'no-outline-baseline' },
          changes: [], validation: { status: 'pass', violations: [] },
        },
      }),
      adjudicate: async (candidateId: string, decision: string) => {
        adjudications.push(`${candidateId}:${decision}`);
        const sceneId = candidateId.replace('candidate-', '');
        return {
          ok: true,
          value: decision === 'reject'
            ? { status: 'rejected', candidateId }
            : { status: 'written', candidateId, scene: { chapterId: 'chapter-1', sceneId, index: sceneId === 'scene-first' ? 0 : sceneId === 'scene-middle' ? 1 : 2, content: `润色-${sceneId}` }, layers: ['c2', 'c1', 'c3', 'c4', 'b2'] },
        };
      },
    };
    const mounted = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }), {
      chapterList: async () => chapterList,
      chapterRead: async () => chapterRead,
      sceneRead: async (_projectId, _chapterId, sceneId) => sceneRead(sceneId),
    }, { writing });
    await flush();
    const render = () => mounted.registrations['shell.overlay'][0].component() as FakeNode;
    const click = (anchor: string, value?: string) => {
      const node = collect(render(), 'button').find((item) => value === undefined
        ? item.props?.[anchor] !== undefined
        : item.props?.[anchor] === value);
      (node?.props?.onClick as (() => void) | undefined)?.();
    };
    click('data-novel-view', 'chapters');
    await flush();
    click('data-novel-chapter-item', 'chapter-1');
    await flush();
    return { mounted, render, click, proposals, adjudications };
  }

  it('真实 Client 消费者按顺序逐个提交 rewrite + polishMode，接受后保留会话并可启动下一场景', async () => {
    const { render, click, proposals, adjudications } = await openChapter();
    click('data-novel-polish-start');
    await flush();
    expect(proposals).toEqual([{ sceneId: 'scene-first', polishMode: 'language', candidateId: 'candidate-scene-first' }]);
    expect(collect(render(), 'div').find((node) => node.props?.['data-novel-polish-session'] !== undefined)?.props?.['data-novel-polish-state']).toBe('running');
    expect(JSON.stringify(render())).toContain('正在处理 scene-first');

    click('data-novel-chapter-mode', 'candidate');
    await flush();
    click('data-novel-candidate-accept');
    await flush();
    expect(adjudications).toEqual(['candidate-scene-first:accept']);
    expect(proposals).toHaveLength(1);
    expect(JSON.stringify(render())).toContain('已完成 1/3 个场景');
    expect(collect(render(), 'button').some((node) => node.props?.['data-novel-polish-next'] !== undefined)).toBe(true);

    click('data-novel-polish-next');
    await flush();
    expect(proposals[1]).toMatchObject({ sceneId: 'scene-middle', polishMode: 'language' });
    expect(proposals).toHaveLength(2);
  });

  it('停止当前会话后，晚到的候选结果不会启动预览或下一个 scene', async () => {
    let resolveProposal: ((value: unknown) => void) | undefined;
    let previewCalls = 0;
    const writing = {
      propose: async () => new Promise((resolve) => { resolveProposal = resolve; }),
      preview: async () => { previewCalls += 1; return polishReview('late', 'scene-first'); },
    };
    const mounted = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }), {
      chapterList: async () => chapterList,
      chapterRead: async () => chapterRead,
      sceneRead: async (_projectId, _chapterId, sceneId) => sceneRead(sceneId),
    }, { writing });
    await flush();
    const render = () => mounted.registrations['shell.overlay'][0].component() as FakeNode;
    const click = (anchor: string, value?: string) => {
      const node = collect(render(), 'button').find((item) => value === undefined
        ? item.props?.[anchor] !== undefined
        : item.props?.[anchor] === value);
      (node?.props?.onClick as (() => void) | undefined)?.();
    };
    click('data-novel-view', 'chapters');
    await flush();
    click('data-novel-chapter-item', 'chapter-1');
    await flush();
    click('data-novel-polish-start');
    await flush();
    click('data-novel-polish-stop');
    await flush();
    expect(collect(render(), 'div').find((node) => node.props?.['data-novel-polish-session'] !== undefined)?.props?.['data-novel-polish-state']).toBe('stopped');
    resolveProposal?.({ ok: true, value: { candidate: { id: 'late-candidate' } } });
    await flush();
    expect(previewCalls).toBe(0);
    expect(collect(render(), 'button').some((node) => node.props?.['data-novel-polish-next'] !== undefined)).toBe(false);
  });
});
