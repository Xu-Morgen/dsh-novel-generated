import { afterEach, describe, expect, it } from 'vitest';
import { cleanupClientTestEnv, collect, fakeReact, flush, mount, READY_MODEL, type FakeNode } from './client/test-harness.js';
import { entityMultiSelect, entitySelect } from './client/entity-selectors.js';

afterEach(cleanupClientTestEnv);

const h = (tag: string, props?: Record<string, unknown> | null, ...children: unknown[]): FakeNode =>
  fakeReact.createElement(tag, props ?? null, ...children);

const AUDIT_RECORDS = [
  {
    recordId: 'audit-c1', projectId: 'fixture-project', operationId: 'op-1',
    source: { kind: 'candidate-accept', candidateId: 'candidate-1', status: 'accepted' },
    targets: [{ owner: 'c1', entityId: 'rel-1', field: 'status', beforeHash: 'a'.repeat(64), afterHash: 'b'.repeat(64) }],
    status: 'applied', attempt: 1, createdAt: '2026-08-31T00:00:00.000Z', updatedAt: '2026-08-31T00:00:01.000Z',
  },
  {
    recordId: 'audit-c3', projectId: 'fixture-project', operationId: 'op-2',
    source: { kind: 'reparse-accept', proposalId: 'proposal-1', status: 'accepted' },
    targets: [{ owner: 'c3', entityId: 'deleted-fact', field: 'holders', afterHash: 'c'.repeat(64) }],
    status: 'failed', attempt: 2, error: '目标实体已删除', createdAt: '2026-08-31T00:00:02.000Z', updatedAt: '2026-08-31T00:00:03.000Z',
  },
];

describe('I117 引用更新审查 UI', () => {
  it('从 Host audit 读取后按层筛选、标记错误，且标记不产生叙事层写入', async () => {
    const calls: Array<{ projectId: string; input: unknown }> = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        referenceAudit: {
          list: async (projectId, input) => {
            calls.push({ projectId, input });
            return { ok: true, value: { projectId, records: AUDIT_RECORDS, nextCursor: null } };
          },
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    const nav = collect(render(), 'button').find((node) => node.props?.['data-novel-view'] === 'review');
    (nav?.props?.onClick as () => void)();
    await flush();

    const refresh = collect(render(), 'button').find((node) => node.props?.['data-novel-reference-audit-refresh'] !== undefined);
    (refresh?.props?.onClick as () => void)();
    await flush();
    expect(calls).toEqual([{ projectId: 'fixture-project', input: {} }]);
    expect(collect(render(), 'article').map((node) => node.props?.['data-novel-reference-audit-record'])).toEqual(['audit-c1', 'audit-c3']);
    expect(collect(render(), 'li').some((node) => String(node.children?.[0] ?? '').includes('deleted-fact'))).toBe(true);

    const ownerFilter = collect(render(), 'select').find((node) => node.props?.['data-novel-reference-audit-owner-filter'] !== undefined);
    (ownerFilter?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'c3' } });
    await flush();
    expect(collect(render(), 'article').map((node) => node.props?.['data-novel-reference-audit-record'])).toEqual(['audit-c3']);

    const mark = collect(render(), 'button').find((node) => node.props?.['data-novel-reference-audit-mark-error'] === 'audit-c3');
    (mark?.props?.onClick as () => void)();
    await flush();
    const marked = collect(render(), 'button').find((node) => node.props?.['data-novel-reference-audit-mark-error'] === 'audit-c3');
    expect(marked?.props?.['aria-pressed']).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('命名选择器保留未知/已删除 ID，并提供可访问标签；不存在手填 ID 控件', () => {
    const single = entitySelect(h, '关系起点', 'deleted-character', [{ id: 'char-1', label: '林舟' }], () => {}, 'test-single');
    const singleSelect = collect(single, 'select')[0];
    expect(singleSelect.props?.['data-novel-entity-select']).toBe('test-single');
    expect(collect(single, 'option').some((node) => node.props?.['data-novel-entity-unknown'] === '')).toBe(true);

    const multi = entityMultiSelect(h, '参与角色', ['deleted-character'], [{ id: 'char-1', label: '林舟' }], () => {}, 'test-multi');
    const group = collect(multi, 'fieldset')[0];
    expect(group.props?.['aria-label']).toBe('参与角色');
    expect(collect(multi, 'input').some((node) => node.props?.['data-novel-entity-option-id'] === 'deleted-character')).toBe(true);
    expect(collect(single, 'textarea')).toHaveLength(0);
    expect(collect(multi, 'textarea')).toHaveLength(0);
  });
});
