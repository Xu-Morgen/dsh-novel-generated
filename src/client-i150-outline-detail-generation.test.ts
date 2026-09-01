import { afterEach, describe, expect, it } from 'vitest';
import { cleanupClientTestEnv, collect, flush, layerButtons, mount, READY_MODEL, type FakeNode } from './client/test-harness.js';

afterEach(cleanupClientTestEnv);

const outline = {
  id: 'outline', structure: 'three-act', logline: '旧港疑云', themes: [], foreshadowing: [], endings: [], acts: [{
    id: 'act-one', index: 0, title: '第一幕', goal: '发现异常', beats: [
      { id: 'beat-one', title: '雨夜入港', description: '主角抵达旧港。', charactersInvolved: [], conflictType: 'external', prerequisites: [], optional: false, detailBeats: [{ id: 'detail-old', title: '抵达', summary: '主角抵达。', pov: 'mira', wordTarget: 500, points: ['抵达'], status: 'planned' }] },
      { id: 'beat-two', title: '灯塔调查', description: '主角前往灯塔。', charactersInvolved: [], conflictType: 'internal', prerequisites: [], optional: false, detailBeats: [] },
    ],
  }],
};

const candidate = {
  candidateId: 'odg-append-candidate', projectId: 'fixture-project', scope: { kind: 'outline-beat', beatId: 'beat-one' },
  scopeFingerprint: 'a'.repeat(64), b5ContentFingerprint: 'b'.repeat(64),
  items: [{ actId: 'act-one', beatId: 'beat-one', detailBeatId: 'detail-new', position: 1, origin: 'generated',
    after: { id: 'detail-new', title: '检查脚印', summary: '主角检查新脚印。', pov: 'mira', wordTarget: 600, points: ['脚印'], status: 'planned' },
    choice: 'keep', rationale: '追加调查。' }],
  generatedDetailBeatCount: 1, revision: 1, status: 'ready', rationale: '追加调查。',
  createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
};

function text(node: FakeNode): string {
  return node.children.flatMap((child) => typeof child === 'string' ? [child] : child && typeof child === 'object' ? [text(child as FakeNode)] : []).join('');
}

describe('I150 大纲工作区 selected-beat append', () => {
  it('选中节自动接线、guidance 追加与逐卡保留；切节清空候选且脏草稿零请求', async () => {
    const calls: Array<{ method: string; input: unknown }> = [];
    let applied = false;
    const result = (value: unknown) => Promise.resolve({ ok: true, value });
    const remote = {
      append: async (_projectId: string, input: unknown) => { calls.push({ method: 'append', input }); return result(candidate); },
      select: async (_projectId: string, input: unknown) => { calls.push({ method: 'select', input }); const keep = (input as { keep: boolean }).keep; return result({ ...candidate, revision: 2, items: [{ ...candidate.items[0], choice: keep ? 'keep' : 'skip' }] }); },
      generate: async (_projectId: string, input: unknown) => { calls.push({ method: 'generate', input }); return result(candidate); },
      edit: async () => result(candidate), regenerate: async () => result(candidate), skip: async () => result(candidate),
      propose: async () => result({ projectId: 'fixture-project', candidateId: candidate.candidateId, proposalId: 'proposal', status: 'pending' }),
      accept: async () => { applied = true; return result({ projectId: 'fixture-project', candidateId: candidate.candidateId, proposalId: 'proposal', status: 'accepted', appliedDetailBeatIds: ['detail-new'], skippedDetailBeatIds: [], b5ContentFingerprint: 'c'.repeat(64) }); },
      reject: async () => result({ projectId: 'fixture-project', candidateId: candidate.candidateId, proposalId: 'proposal', status: 'rejected' }),
      cancel: async () => result({ projectId: 'fixture-project', candidateId: candidate.candidateId, status: 'cancelled' }),
      read: async () => result(candidate),
    };
    const appliedOutline = { ...outline, acts: [{ ...outline.acts[0], beats: [{ ...outline.acts[0].beats[0], detailBeats: [...outline.acts[0].beats[0].detailBeats, candidate.items[0].after] }, outline.acts[0].beats[1]] }] };
    const { registrations } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }), { outlineRead: async () => applied ? appliedOutline : outline }, { outlineDetailGeneration: remote });
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (layerButtons(render()).find((button) => button.props?.['data-novel-layer'] === 'outline')?.props?.onClick as () => void)();
    await flush();
    const beatOne = collect(render(), 'button').find((node) => node.props?.['data-novel-outline-beat'] === 'beat-one');
    (beatOne?.props?.onClick as () => void)();
    await flush();
    expect(collect(render(), 'input').some((node) => node.props?.value === 'beat-one' || node.props?.value === 'act-one')).toBe(false);
    const guidance = collect(render(), 'textarea').find((node) => node.props?.placeholder !== undefined);
    (guidance?.props?.onChange as (event: unknown) => void)({ target: { value: '增加一张检查新脚印的调查场景。' } });
    await flush();
    const append = collect(render(), 'button').find((node) => node.props?.['data-novel-outline-detail-append-generate'] === 'beat-one');
    expect(append?.props?.disabled).toBe(false);
    (append?.props?.onClick as () => void)();
    await flush();
    expect(calls[0]).toEqual({ method: 'append', input: { mode: 'append-to-selected-beat', beatId: 'beat-one', guidance: '增加一张检查新脚印的调查场景。' } });
    expect(collect(render(), 'article').some((node) => node.props?.['data-novel-outline-detail-item'] === 'detail-new')).toBe(true);
    (collect(render(), 'button').find((node) => node.props?.['data-novel-outline-detail-keep'] === 'detail-new')?.props?.onClick as () => void)();
    await flush();
    expect(calls[1]).toEqual({ method: 'select', input: { candidateId: candidate.candidateId, detailBeatId: 'detail-new', keep: false } });
    (collect(render(), 'button').find((node) => node.props?.['data-novel-outline-detail-keep'] === 'detail-new')?.props?.onClick as () => void)();
    await flush();
    expect(calls[2]).toEqual({ method: 'select', input: { candidateId: candidate.candidateId, detailBeatId: 'detail-new', keep: true } });
    (collect(render(), 'button').find((node) => node.props?.['data-novel-outline-detail-propose'] === candidate.candidateId)?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-outline-detail-accept'] === 'proposal')?.props?.onClick as () => void)();
    await flush();
    expect(collect(render(), 'button').some((node) => node.props?.['data-novel-detail-card'] === 'detail-new')).toBe(true);

    (collect(render(), 'button').find((node) => node.props?.['data-novel-outline-beat'] === 'beat-two')?.props?.onClick as () => void)();
    await flush();
    expect(collect(render(), 'article')).toHaveLength(0);
    expect(collect(render(), 'p').some((node) => text(node).includes('灯塔调查'))).toBe(true);
    (collect(render(), 'button').find((node) => node.props?.['data-novel-outline-add-detail'] === '')?.props?.onClick as () => void)();
    await flush();
    const callsBeforeDirtyAppend = calls.length;
    const dirtyAppend = collect(render(), 'button').find((node) => node.props?.['data-novel-outline-detail-append-generate'] === 'beat-two');
    expect(dirtyAppend?.props?.disabled).toBe(true);
    (dirtyAppend?.props?.onClick as (() => void) | undefined)?.();
    await flush();
    expect(calls).toHaveLength(callsBeforeDirtyAppend);
    expect(collect(render(), 'p').some((node) => node.props?.['data-novel-outline-detail-dirty'] === '')).toBe(true);
  });

  it('结构、冲突、状态与生成范围下拉框显示中文，提交值保持 canonical 英文枚举', async () => {
    const { registrations } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }), { outlineRead: async () => outline });
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (layerButtons(render()).find((button) => button.props?.['data-novel-layer'] === 'outline')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-outline-beat'] === 'beat-one')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-detail-card'] === 'detail-old')?.props?.onClick as () => void)();
    await flush();
    const labels = new Map(collect(render(), 'option').map((option) => [option.props?.value, text(option)]));
    expect(labels.get('three-act')).toBe('三幕式');
    expect(labels.get('hero-journey')).toBe('英雄之旅');
    expect(labels.get('external')).toBe('外部冲突');
    expect(labels.get('internal')).toBe('内心冲突');
    expect(labels.get('planned')).toBe('待写');
    expect(labels.get('writing')).toBe('写作中');
    expect(labels.get('outline-beat')).toBe('当前节');
    expect(labels.get('bound-chapter')).toBe('绑定章节');
    expect(labels.get('all')).toBe('整份大纲');
    const structureSelect = collect(render(), 'select').find((node) => node.props?.value === 'three-act');
    (structureSelect?.props?.onChange as (event: unknown) => void)({ target: { value: 'hero-journey' } });
    await flush();
    expect(collect(render(), 'select').some((node) => node.props?.value === 'hero-journey')).toBe(true);
  });
});
