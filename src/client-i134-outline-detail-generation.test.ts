/** I134 范围细纲候选面板：逐卡编辑/跳过/确认，B5 写回只由 Host Gate 负责。 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanupClientTestEnv, collect, flush, layerButtons, makeWorkspace, mount, READY_MODEL, type FakeNode } from './client/test-harness.js';

afterEach(cleanupClientTestEnv);

const candidate = {
  candidateId: 'odg-candidate', projectId: 'fixture-project', scope: { kind: 'all' },
  scopeFingerprint: 'a'.repeat(64), b5ContentFingerprint: 'b'.repeat(64),
  items: [{ actId: 'act-one', beatId: 'beat-one', detailBeatId: 'detail-one', position: 0, origin: 'generated',
    after: { id: 'detail-one', title: '雨夜入港', summary: '主角抵达旧港并发现异常。', pov: 'mira', wordTarget: 800, points: ['抵达', '发现线索'], status: 'planned' },
    choice: 'keep', rationale: '范围内补缺。' }],
  generatedDetailBeatCount: 1, revision: 1, status: 'ready', rationale: '只补缺失卡。',
  createdAt: '2026-08-31T00:00:00.000Z', updatedAt: '2026-08-31T00:00:00.000Z',
};

describe('I134 范围细纲候选面板', () => {
  it('生成后逐卡操作并进入 I11 确认门；生成与提案阶段不保存 B5', async () => {
    const calls: Array<{ method: string; input?: unknown }> = [];
    let saves = 0;
    const result = (value: unknown) => Promise.resolve({ ok: true, value });
    const outlineGeneration = {
      generate: async (_projectId: string, input: unknown) => { calls.push({ method: 'generate', input }); return result(candidate); },
      read: async () => result(candidate),
      edit: async (_projectId: string, input: unknown) => { calls.push({ method: 'edit', input }); return result({ ...candidate, revision: 2, items: [{ ...candidate.items[0], choice: 'edit' }] }); },
      regenerate: async (_projectId: string, input: unknown) => { calls.push({ method: 'regenerate', input }); return result(candidate); },
      skip: async (_projectId: string, input: unknown) => { calls.push({ method: 'skip', input }); return result({ ...candidate, revision: 2, items: [{ ...candidate.items[0], choice: 'skip' }] }); },
      select: async (_projectId: string, input: unknown) => { calls.push({ method: 'select', input }); return result({ ...candidate, revision: 2, items: [{ ...candidate.items[0], choice: 'skip' }] }); },
      propose: async (_projectId: string, input: unknown) => { calls.push({ method: 'propose', input }); return result({ projectId: 'fixture-project', candidateId: candidate.candidateId, proposalId: 'odg-proposal', status: 'pending' }); },
      accept: async (_projectId: string, proposalId: string) => { calls.push({ method: 'accept', input: proposalId }); return result({ projectId: 'fixture-project', candidateId: candidate.candidateId, proposalId, status: 'accepted', appliedDetailBeatIds: ['detail-one'], skippedDetailBeatIds: [], b5ContentFingerprint: 'c'.repeat(64) }); },
      reject: async (_projectId: string, proposalId: string) => { calls.push({ method: 'reject', input: proposalId }); return result({ projectId: 'fixture-project', candidateId: candidate.candidateId, proposalId, status: 'rejected' }); },
      cancel: async (_projectId: string, candidateId: string) => { calls.push({ method: 'cancel', input: candidateId }); return result({ projectId: 'fixture-project', candidateId, status: 'cancelled' }); },
    };
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      { outlineRead: async () => ({ id: 'outline', structure: 'free', logline: '旧港', themes: [], acts: [], foreshadowing: [], endings: [] }), outlineSave: async () => { saves += 1; return {}; } },
      { outlineDetailGeneration: outlineGeneration },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    const tree = render();
    const outlineButton = layerButtons(tree).find((button) => button.props?.['data-novel-layer'] === 'outline');
    (outlineButton?.props?.onClick as () => void)();
    await flush();
    const panel = () => render();
    const generate = collect(panel(), 'button').find((node) => node.props?.['data-novel-outline-detail-generate'] === '');
    (generate?.props?.onClick as () => void)();
    await flush();
    expect(calls[0]).toMatchObject({ method: 'generate', input: { scope: { kind: 'all' } } });
    expect(collect(panel(), 'article').some((node) => node.props?.['data-novel-outline-detail-item'] === 'detail-one')).toBe(true);
    expect(collect(panel(), 'button').some((node) => node.props?.['data-novel-outline-detail-regenerate'] === 'detail-one' && node.props.disabled === true)).toBe(true);
    (collect(panel(), 'button').find((node) => node.props?.['data-novel-outline-detail-keep'] === 'detail-one')?.props?.onClick as () => void)();
    await flush();
    expect(calls.some((call) => call.method === 'select')).toBe(true);
    (collect(panel(), 'button').find((node) => node.props?.['data-novel-outline-detail-propose'] === candidate.candidateId)?.props?.onClick as () => void)();
    await flush();
    expect(collect(panel(), 'button').some((node) => node.props?.['data-novel-outline-detail-accept'] === 'odg-proposal')).toBe(true);
    (collect(panel(), 'button').find((node) => node.props?.['data-novel-outline-detail-accept'] === 'odg-proposal')?.props?.onClick as () => void)();
    await flush();
    expect(calls.some((call) => call.method === 'accept')).toBe(true);
    expect(saves).toBe(0);
  });
});
