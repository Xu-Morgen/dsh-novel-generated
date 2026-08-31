import { afterEach, describe, expect, it } from 'vitest';
import { cleanupClientTestEnv, collect, flush, mount, READY_MODEL, type FakeNode } from './client/test-harness.js';

afterEach(cleanupClientTestEnv);

const AUDIT = {
  recordId: 'audit-c1', projectId: 'fixture-project', operationId: 'op-1',
  source: { kind: 'candidate-accept', candidateId: 'candidate-1', status: 'accepted' },
  targets: [{ owner: 'c1', entityId: 'rel-1', field: 'relationship', beforeHash: 'a'.repeat(64), afterHash: 'b'.repeat(64) }],
  status: 'applied', attempt: 1, createdAt: '2026-08-31T00:00:00.000Z', updatedAt: '2026-08-31T00:00:01.000Z',
};

const CANDIDATE = {
  candidateId: 'ref-correction-1', projectId: 'fixture-project', sourceRecordIds: ['audit-c1'], instruction: '把关系改为紧张。',
  base: { c1: { version: 1, fingerprint: 'a'.repeat(64) }, c3: { version: 0, fingerprint: 'b'.repeat(64) }, c4: { version: 0, fingerprint: 'c'.repeat(64) } },
  confidence: 'high',
  operations: [{ owner: 'c1', entityId: 'rel-1', field: 'status', action: 'set', value: '紧张' }],
  preview: [{ owner: 'c1', entityId: 'rel-1', field: 'status', before: 'close', after: '紧张' }],
  rationale: '作者指令明确。',
};

describe('I118 引用修正候选 UI', () => {
  it('提交标记与作者指令生成候选，并只能经 Gate accept/reject 操作', async () => {
    const calls: { input?: unknown; accepted?: string; rejected?: string } = {};
    const { registrations } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }), {}, {
      referenceAudit: { list: async () => ({ ok: true, value: { projectId: 'fixture-project', records: [AUDIT], nextCursor: null } }) },
      referenceCorrection: {
        pending: async () => ({ ok: true, value: [] }),
        propose: async (_projectId, input) => { calls.input = input; return { ok: true, value: { projectId: 'fixture-project', proposalId: CANDIDATE.candidateId, status: 'pending', candidate: CANDIDATE } }; },
        accept: async (_projectId, proposalId) => { calls.accepted = proposalId; return { ok: true, value: { projectId: 'fixture-project', proposalId, status: 'applied', changedOwners: ['c1'] } }; },
        reject: async (_projectId, proposalId) => { calls.rejected = proposalId; return { ok: true, value: { projectId: 'fixture-project', proposalId, status: 'rejected' } }; },
      },
    });
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    const nav = collect(render(), 'button').find((node) => node.props?.['data-novel-view'] === 'review');
    (nav?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-reference-audit-refresh'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-reference-audit-mark-error'] === 'audit-c1')?.props?.onClick as () => void)();
    const instruction = collect(render(), 'textarea').find((node) => node.props?.['data-novel-reference-correction-instruction'] !== undefined);
    (instruction?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '把关系改为紧张。' } });
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-reference-correction-propose'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    expect(calls.input).toEqual({ recordIds: ['audit-c1'], instruction: '把关系改为紧张。' });
    expect(collect(render(), 'article').some((node) => node.props?.['data-novel-reference-correction-candidate'] === CANDIDATE.candidateId)).toBe(true);

    (collect(render(), 'button').find((node) => node.props?.['data-novel-reference-correction-accept'] === CANDIDATE.candidateId)?.props?.onClick as () => void)();
    await flush();
    expect(calls.accepted).toBe(CANDIDATE.candidateId);
    expect(collect(render(), 'article').some((node) => node.props?.['data-novel-reference-correction-candidate'] === CANDIDATE.candidateId)).toBe(false);
  });
});
